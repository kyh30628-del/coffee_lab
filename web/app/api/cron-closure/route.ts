import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { naverExistsRobust } from "@/lib/discover";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";
export const maxDuration = 300;

// 🚪 폐업·이전 '의심' 감지 에이전트 (보수판). 닫힌 카페 노출도 문제지만, 멀쩡한 카페 오삭제는 더 큰 신뢰붕괴.
//   ⚠️ 자동 비공개 안 함. 네이버 지역검색은 5개·인기순이라 "안 나옴 ≠ 폐업"(흔한 이름 오탐). → 양성 신호만 신뢰.
//   동작: 다중쿼리(naverExistsRobust)로 찾으면 영업중 확정(misses 0). 못 찾으면 misses+1, 공개는 유지.
//   3회+ 지속 미발견 = '검토 대기'(suspect)로만 표시 → 사람이 정밀확인·승인 후 처리(자동삭제 없음).
//   쿼터/오류는 판단보류. 발굴과 쿼터 경쟁하므로 회당 소량.

const STALE_MONTHS = 15;   // 최신 리뷰가 이만큼 지난 카페만 재확인 대상(활발한 카페는 명백히 영업중 → 스킵)
const PER_RUN = 35;        // 회당 네이버 재확인 수(쿼터 절약)
// coord#266: 네이버 존재확인(misses)만으로는 "리스팅은 살아있지만 방문후기가 오래 끊긴" 사각지대를 못 잡음.
//   misses는 그대로 두고(의미 다름: 네이버 미발견 횟수), 증거노후는 보조지표로만 집계 — 자동 비공개·misses 반영 없음.
const STALE_EVIDENCE_MONTHS = 18;

// review_dates(캐시)는 raw_reviews보다 낡을 수 있어 폐업 오탐 유발 → raw_reviews(원본)의 날짜만 계산.
//   ⚠️ raw_reviews 전체를 JS로 끌어오면 64MB 초과(Neon 507)라, SQL에서 date 배열만 추출해 넘김(아래 쿼리).
const latestReviewMonths = (dates: any): number | null => {
  const arr: any[] = Array.isArray(dates) ? dates : [];
  const ts = arr.map((x) => new Date(String(x ?? "").replace(/\./g, "-")).getTime()).filter((t) => !isNaN(t));
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
    // ⚡ raw_reviews 전체(거대 jsonb) 대신 date 배열만 SQL에서 추출 — 64MB 초과(507) 방지 + 원본 신선도 유지.
    const rows = (await sql`SELECT id, name, area, dong, lat, lng,
        CASE WHEN jsonb_typeof(raw_reviews)='array'
             THEN (SELECT array_agg(r->>'date') FROM jsonb_array_elements(raw_reviews) r)
             ELSE NULL END AS raw_dates,
        COALESCE(closure_misses,0) misses
      FROM cafes WHERE published AND raw_reviews IS NOT NULL
      ORDER BY closure_checked_at ASC NULLS FIRST LIMIT 400`) as any[];

    let checked = 0, alive = 0, quotaStop = false, skippedFresh = 0, newSuspect = 0;
    const suspectNames: string[] = [];
    for (const c of rows) {
      const mo = latestReviewMonths(c.raw_dates);
      if (mo != null && mo < STALE_MONTHS) { // 활발 → 영업중 명백, 네이버 호출 없이 통과
        await sql`UPDATE cafes SET closure_checked_at = now(), closure_misses = 0 WHERE id = ${c.id}`.catch(() => {});
        skippedFresh++; continue;
      }
      if (checked >= PER_RUN) break; // 쿼터 절약: 회당 재확인 상한
      const exists = await naverExistsRobust(c.name, c.area ?? "", c.dong ?? "", c.lat, c.lng);
      if (exists === null) { quotaStop = true; break; } // 전 쿼리 쿼터/오류 → 이번 회차 중단(판단 보류)
      checked++;
      await sql`UPDATE cafes SET closure_checked_at = now() WHERE id = ${c.id}`.catch(() => {});
      if (exists) { // 어느 쿼리든 발견 = 영업중 확정 → 의심 해제
        alive++; if (c.misses > 0) await sql`UPDATE cafes SET closure_misses = 0 WHERE id = ${c.id}`.catch(() => {});
      } else { // 다중쿼리로도 미발견 = 의심 누적. ⚠️ 공개는 유지(자동 삭제 안 함). 사람이 검토.
        const misses = c.misses + 1;
        await sql`UPDATE cafes SET closure_misses = ${misses} WHERE id = ${c.id}`.catch(() => {});
        newSuspect++; if (suspectNames.length < 8) suspectNames.push(`${c.name}(${misses}회)`);
      }
      await new Promise((r) => setTimeout(r, 220)); // 네이버 레이트 매너
    }

    // 검토 대기 = 3회+ 지속 미발견 카페(여전히 공개 중). 사람이 정밀확인·승인 후에만 처리.
    const reviewQueue = (await sql`SELECT id, name, area, closure_misses FROM cafes WHERE published AND closure_misses >= 3 ORDER BY closure_misses DESC, closure_checked_at ASC LIMIT 30`) as any[];

    // coord#266 보조지표: misses=0(네이버는 여전히 발견됨)이라도 검증등급 근거의 최신 후기가 STALE_EVIDENCE_MONTHS+ 지난 카페.
    //   자동 비공개·misses 변경 없음(증거부재≠폐업) — 집계만 해서 selfaudit 정합성체크로 넘김(비중대·운영본부 관측용).
    const staleEvidenceCount = await sql`
      WITH x AS (
        SELECT id, (SELECT max(to_date(d, 'YYYY.MM.DD')) FROM jsonb_array_elements_text(review_dates) d) AS latest
        FROM cafes WHERE published AND synth_grade='검증' AND COALESCE(closure_misses,0)=0
      )
      SELECT count(*) c FROM x WHERE latest < now() - (${STALE_EVIDENCE_MONTHS}||' months')::interval
    `.then((r: any[]) => Number(r[0].c)).catch(() => 0);

    const detail = `재확인 ${checked} 영업중 ${alive} 의심+${newSuspect} 검토대기 ${reviewQueue.length} 활발스킵 ${skippedFresh} 증거노후${STALE_EVIDENCE_MONTHS}mo+ ${staleEvidenceCount}${quotaStop ? " 쿼터중단" : ""}`;
    await recordRun("cron-closure", true, detail, newSuspect);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), checked, alive, newSuspect, suspectNames, skippedFresh, quotaStop, staleEvidenceCount, reviewQueue: reviewQueue.map((r) => ({ id: r.id, name: r.name, area: r.area, misses: r.closure_misses })) });
  } catch (e) {
    await recordRun("cron-closure", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
