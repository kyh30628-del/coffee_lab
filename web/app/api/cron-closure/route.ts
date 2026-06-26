import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { naverExists } from "@/lib/discover";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";
export const maxDuration = 300;

// 🚪 폐업·이전 감지 에이전트 (해자/신뢰). 닫힌 카페가 노출되면 큐레이션 신뢰 붕괴.
//   신호: 리뷰 키워드는 노이즈(영업'시간'종료·메뉴'사라짐'·'확장이전'=영업중)라 못 씀.
//   → 권위적 신호 = "네이버에 아직 존재하나". 장기 미활동(리뷰 끊김)을 우선순위로 재확인.
//   2회 연속 미발견 → 폐업 확정·비공개. 발견 → 유지(misses 리셋). 쿼터 오류 → 보류(판단 안 함).
//   이전(확장이전)은 네이버에 있어 true → 유지(주소 stale은 별개). 발굴과 쿼터 경쟁하므로 회당 소량.

const STALE_MONTHS = 15;   // 최신 리뷰가 이만큼 지난 카페만 재확인 대상(활발한 카페는 명백히 영업중 → 스킵)
const PER_RUN = 35;        // 회당 네이버 재확인 수(쿼터 절약)

const latestReviewMonths = (review_dates: any): number | null => {
  let d = review_dates;
  if (typeof d === "string") { try { d = JSON.parse(d); } catch { return null; } }
  let dates: string[] = Array.isArray(d) ? d : (d && typeof d === "object" ? Object.values(d).flat() as string[] : []);
  const ts = dates.map((x) => new Date(String(x).replace(/\./g, "-")).getTime()).filter((t) => !isNaN(t));
  if (!ts.length) return null;
  return (Date.now() - Math.max(...ts)) / (30 * 86400000);
};

const authed = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return (!!s && req.headers.get("authorization") === `Bearer ${s}`) || !s;
};

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS closure_checked_at TIMESTAMPTZ`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS closure_misses INT DEFAULT 0`.catch(() => {});

    // 오래 안 본 공개 카페부터 커서로 순회. 활발한(최근 리뷰) 카페는 재확인 스킵(checked_at만 갱신).
    const rows = (await sql`SELECT id, name, area, lat, lng, review_dates, COALESCE(closure_misses,0) misses
      FROM cafes WHERE published AND raw_reviews IS NOT NULL
      ORDER BY closure_checked_at ASC NULLS FIRST LIMIT 400`) as any[];

    let checked = 0, closed = 0, alive = 0, quotaStop = false, skippedFresh = 0;
    const closedNames: string[] = [], suspectNames: string[] = [];
    for (const c of rows) {
      const mo = latestReviewMonths(c.review_dates);
      if (mo != null && mo < STALE_MONTHS) { // 활발 → 영업중 명백, 네이버 호출 없이 통과
        await sql`UPDATE cafes SET closure_checked_at = now(), closure_misses = 0 WHERE id = ${c.id}`.catch(() => {});
        skippedFresh++; continue;
      }
      if (checked >= PER_RUN) break; // 쿼터 절약: 회당 재확인 상한
      const exists = await naverExists(c.name, c.area ?? "", c.lat, c.lng);
      if (exists === null) { quotaStop = true; break; } // 쿼터/오류 → 이번 회차 중단(판단 보류, 다음에 재시도)
      checked++;
      await sql`UPDATE cafes SET closure_checked_at = now() WHERE id = ${c.id}`.catch(() => {});
      if (exists) { alive++; if (c.misses > 0) await sql`UPDATE cafes SET closure_misses = 0 WHERE id = ${c.id}`.catch(() => {}); }
      else {
        const misses = c.misses + 1;
        if (misses >= 2) { // 2회 연속 미발견 = 폐업 확정
          await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded', closure_misses = ${misses} WHERE id = ${c.id}`.catch(() => {});
          closed++; if (closedNames.length < 8) closedNames.push(c.name);
        } else { // 1회 미발견 = 의심(다음 회차 재확인). 일시적 네이버 변동 오탐 방지.
          await sql`UPDATE cafes SET closure_misses = ${misses} WHERE id = ${c.id}`.catch(() => {});
          if (suspectNames.length < 8) suspectNames.push(c.name);
        }
      }
      await new Promise((r) => setTimeout(r, 220)); // 네이버 레이트 매너
    }
    if (closed > 0) try { await sql`DELETE FROM search_cache`; } catch {}

    const detail = `재확인 ${checked} 폐업 ${closed} 영업중 ${alive} 의심 ${suspectNames.length} 활발스킵 ${skippedFresh}${quotaStop ? " 쿼터중단" : ""}`;
    await recordRun("cron-closure", true, detail, closed);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), checked, closed, alive, closedNames, suspectNames, skippedFresh, quotaStop });
  } catch (e) {
    await recordRun("cron-closure", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
