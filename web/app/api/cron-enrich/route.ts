import { NextRequest, NextResponse } from "next/server";
import { noteSilentFail } from "@/lib/silentFail";
import { bulkUpdateDerived } from "@/lib/neonWriter";
import { sql, ensureSchema } from "@/lib/db";
import { reputationSignals } from "@/lib/enrich";
import { recordRun } from "@/lib/agentLog";
import { startJobRun } from "@/lib/blobBudget";
import { openScope } from "@/lib/writeScope";
import { fingerprintOf } from "@/lib/runLedger";

export const runtime = "nodejs";
export const maxDuration = 300;

// ✨ 상세 강화 에이전트 — 검증 리뷰에서 평판 신선도·하락 감지(최근 평 갈림/노후).
//   메뉴·가격은 리뷰가 부정확한 소스라 추출 안 함 → 권위 원천(네이버 플레이스)으로 연결.
//   공개 게이트는 안 건드림. 토큰 0(규칙). enriched_at 커서로 전 공개카페 순환.

const authed = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return (!!s && req.headers.get("authorization") === `Bearer ${s}`) || !s;
};

export async function GET(req: NextRequest) {
  startJobRun("cron-enrich"); openScope("cron-enrich"); // 💰🔐 하네스 L1·L3 — 큰 컬럼 계량 + 쓰기 스코프
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS recent_ratio REAL`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS reputation_note TEXT`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ`.catch(() => {});

    // 📈 2026-08-29: 기본 400 → 800. 실측 — 하루 새 일감 1,365곳인데 처리는 800곳(400×2회)뿐이라
    //   적체가 **매일 565곳씩 늘고** 있었다(현재 4,034곳). 800×2=1,600 > 1,365 → 적체가 줄어든다.
    //   💰 비용: 카페당 읽는 양 1.5KB → 정상화 후 월 +0.02GB(전송량 340GB의 0.007%). 무시 가능.
    //   왕복은 오히려 준다(아래 묶음 UPDATE로 800회 → 2회).
    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 800, 1), 2000);
    const rows = (await sql`SELECT id, name, synth_reviews, review_dates FROM cafes
      WHERE published AND synth_reviews IS NOT NULL
        AND (enriched_at IS NULL OR enriched_at < synth_updated)
      ORDER BY enriched_at ASC NULLS FIRST LIMIT ${limit}`) as any[];

    let processed = 0, declining = 0;
    // ⚡ 카페마다 UPDATE 1회(=왕복 1회)를 돌던 것을 **한 방**으로 묶는다. 800곳 = 800왕복 → 2왕복.
    const out: { id: number; recent_ratio: number | null; reputation_note: string | null }[] = [];
    const declineNames: string[] = [];
    const parse = (o: any): any[] => { let a = o; if (typeof a === "string") { try { a = JSON.parse(a); } catch { return []; } } return Array.isArray(a) ? a : (a && a.reviews) || []; };
    for (const c of rows) {
      // 평판·감성: 검증 노출본(옥석, 오염 적음)
      const verifiedQuotes = parse(c.synth_reviews).map((r: any) => (typeof r === "string" ? r : (r.quote || r.title || ""))).filter(Boolean);
      const rep = reputationSignals(verifiedQuotes, c.review_dates);

      if (rep.declineNote && rep.declineNote.startsWith("최근 평")) { declining++; if (declineNames.length < 8) declineNames.push(c.name); }

      out.push({ id: Number(c.id), recent_ratio: rep.recentRatio ?? null, reputation_note: rep.declineNote ?? null });
      processed++;
    }

    // 일괄 반영 — 화이트리스트(derivedColumns) 강제 + UPDATE...FROM(VALUES)라 INSERT 불가.
    let written = 0;
    if (out.length) {
      try {
        const res = await bulkUpdateDerived(out.map((o) => ({ ...o, enriched_at: new Date().toISOString() })));
        written = res.updated;
      } catch (e) { await noteSilentFail("cron-enrich.bulk", e); }
    }

    const detail = `평판점검 ${processed}(반영 ${written}) 평하락 ${declining}`;
    // 📒 하네스 L5 — 지문은 **남은 일(백로그)** 기준. 할 일이 없으면(0) 지문을 안 남긴다 —
    //   "일이 없어 조용한 것"과 "일이 있는데 못 끝내는 것"을 구분해야 정체 탐지가 소음이 안 된다.
    await recordRun("cron-enrich", true, detail, processed, { fingerprint: (processed) > 0 ? fingerprintOf({ processed }) : undefined, metrics: { processed } });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), processed, declining, declineNames, remaining: rows.length === limit });
  } catch (e) {
    await recordRun("cron-enrich", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
