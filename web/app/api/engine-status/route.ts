import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 리뷰 검증 엔진 현황(공개 집계 — 비민감). raw 캐시 예열·AI 판정 커버리지.
export async function GET() {
  try {
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS raw_reviews JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS llm_judged_at TIMESTAMPTZ`;
    const r = (await sql`SELECT
      COUNT(*)::int total,
      COUNT(*) FILTER (WHERE published)::int published,
      COUNT(*) FILTER (WHERE raw_reviews IS NOT NULL)::int raw_cached,
      COUNT(*) FILTER (WHERE llm_judged_at IS NOT NULL)::int llm_judged
      FROM cafes`)[0];
    const pct = (n: number) => (r.total ? Math.round((n / r.total) * 100) : 0);
    return new Response(JSON.stringify({
      ok: true, total: r.total, published: r.published,
      rawCached: r.raw_cached, rawCachedPct: pct(r.raw_cached),
      llmJudged: r.llm_judged, llmJudgedPct: pct(r.llm_judged),
    }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
}
