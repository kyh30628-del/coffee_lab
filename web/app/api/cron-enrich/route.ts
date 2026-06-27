import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { extractMenu, extractPrice, reputationSignals } from "@/lib/enrich";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";
export const maxDuration = 300;

// ✨ 상세 강화 에이전트 — 검증 리뷰에서 ①메뉴·시그니처·가격대 추출(의사결정 정보) ②평판 신선도·하락 감지.
//   공개 게이트는 안 건드림(별도 보강). 토큰 0(규칙). enriched_at 커서로 전 공개카페 순환.

const authed = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return (!!s && req.headers.get("authorization") === `Bearer ${s}`) || !s;
};

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_menu JSONB`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS price_hint TEXT`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS recent_ratio REAL`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS reputation_note TEXT`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ`.catch(() => {});

    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 400, 1), 1000);
    const rows = (await sql`SELECT id, name, area, dong, synth_reviews, raw_reviews, review_dates FROM cafes
      WHERE published AND synth_reviews IS NOT NULL
        AND (enriched_at IS NULL OR enriched_at < synth_updated)
      ORDER BY enriched_at ASC NULLS FIRST LIMIT ${limit}`) as any[];

    let processed = 0, withMenu = 0, withPrice = 0, declining = 0;
    const declineNames: string[] = [];
    const parse = (o: any): any[] => { let a = o; if (typeof a === "string") { try { a = JSON.parse(a); } catch { return []; } } return Array.isArray(a) ? a : (a && a.reviews) || []; };
    for (const c of rows) {
      // 평판·감성: 검증 노출본(옥석, 오염 적음)
      const verifiedQuotes = parse(c.synth_reviews).map((r: any) => (typeof r === "string" ? r : (r.quote || r.title || ""))).filter(Boolean);
      // 메뉴·가격: 원본 본문(하이라이트엔 가격 없음 → raw 전문에서). 빈도기반이라 카페 실제 메뉴가 우세.
      const rawBodies = parse(c.raw_reviews).slice(0, 120).map((r: any) => String(r?.text || r?.desc || r?.title || "")).filter(Boolean);

      const menu = extractMenu(rawBodies.length ? rawBodies : verifiedQuotes, [c.area, c.dong].filter(Boolean));
      const price = extractPrice(rawBodies);
      const rep = reputationSignals(verifiedQuotes, c.review_dates);

      if (menu.items.length) withMenu++;
      if (price) withPrice++;
      if (rep.declineNote && rep.declineNote.startsWith("최근 평")) { declining++; if (declineNames.length < 8) declineNames.push(c.name); }

      await sql`UPDATE cafes SET
        synth_menu = ${JSON.stringify({ items: menu.items, signature: menu.signature })}::jsonb,
        price_hint = ${price},
        recent_ratio = ${rep.recentRatio},
        reputation_note = ${rep.declineNote},
        enriched_at = now()
      WHERE id = ${c.id}`.catch(() => {});
      processed++;
    }

    const detail = `보강 ${processed} 메뉴 ${withMenu} 가격 ${withPrice} 평하락 ${declining}`;
    await recordRun("cron-enrich", true, detail, processed);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), processed, withMenu, withPrice, declining, declineNames, remaining: rows.length === limit });
  } catch (e) {
    await recordRun("cron-enrich", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
