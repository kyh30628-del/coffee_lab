import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { reputationSignals } from "@/lib/enrich";
import { recordRun } from "@/lib/agentLog";

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
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS recent_ratio REAL`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS reputation_note TEXT`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ`.catch(() => {});

    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 400, 1), 1000);
    const rows = (await sql`SELECT id, name, synth_reviews, review_dates FROM cafes
      WHERE published AND synth_reviews IS NOT NULL
        AND (enriched_at IS NULL OR enriched_at < synth_updated)
      ORDER BY enriched_at ASC NULLS FIRST LIMIT ${limit}`) as any[];

    let processed = 0, declining = 0;
    const declineNames: string[] = [];
    const parse = (o: any): any[] => { let a = o; if (typeof a === "string") { try { a = JSON.parse(a); } catch { return []; } } return Array.isArray(a) ? a : (a && a.reviews) || []; };
    for (const c of rows) {
      // 평판·감성: 검증 노출본(옥석, 오염 적음)
      const verifiedQuotes = parse(c.synth_reviews).map((r: any) => (typeof r === "string" ? r : (r.quote || r.title || ""))).filter(Boolean);
      const rep = reputationSignals(verifiedQuotes, c.review_dates);

      if (rep.declineNote && rep.declineNote.startsWith("최근 평")) { declining++; if (declineNames.length < 8) declineNames.push(c.name); }

      await sql`UPDATE cafes SET
        recent_ratio = ${rep.recentRatio},
        reputation_note = ${rep.declineNote},
        enriched_at = now()
      WHERE id = ${c.id}`.catch(() => {});
      processed++;
    }

    const detail = `평판점검 ${processed} 평하락 ${declining}`;
    await recordRun("cron-enrich", true, detail, processed);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), processed, declining, declineNames, remaining: rows.length === limit });
  } catch (e) {
    await recordRun("cron-enrich", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
