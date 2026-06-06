import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { fetchPlacesReviews } from "@/lib/placesCollector";
import { fetchWebReviews } from "@/lib/webSearchCollector";
import { collectAndSynthesize, type RawSource } from "@/lib/collectOrchestrator";

export const runtime = "nodejs";
export const maxDuration = 60;

async function synthOne(cafe: { id: number; name: string; area: string }) {
  const sources: RawSource[] = [];
  const places = await fetchPlacesReviews(cafe.name, cafe.area ?? "");
  if (places.reviews.length) sources.push({ source: "google", texts: places.reviews.map((r) => ({ text: r.text, time: r.time })) });
  const web = await fetchWebReviews(cafe.name, cafe.area ?? "");
  if (web.snippets.length) sources.push({ source: "blog", texts: web.snippets });
  if (sources.length === 0) return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 0" };

  const { synth, collected, grade, charScores, evidenceReviews, reviewDates, quality } = collectAndSynthesize(cafe.name, cafe.area ? [cafe.area] : [], sources);
  const c = synth.coords;
  const basisLine = ["acidity", "body", "sweet"].filter((ax) => c[ax] != null)
    .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`).join(" / ");

  // 데이터 충분(검증/참고 등급 = 검증 리뷰 5+)하면 자동 공개, 부족하면 비공개 유지(헌법1: 정직)
  const publish = grade === "검증" || grade === "참고";
  await sql`
    UPDATE cafes SET
      synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine},
      synth_count=${collected}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet},
      synth_reviews=${JSON.stringify(evidenceReviews)}, char_scores=${JSON.stringify(charScores)},
      synth_quality=${JSON.stringify(quality)}, review_dates=${JSON.stringify(reviewDates)}, synth_updated=now(),
      published=${publish}
    WHERE id=${cafe.id}`;
  return { id: cafe.id, name: cafe.name, ok: true, grade, collected, evidence: evidenceReviews.length, quality, published: publish };
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_grade TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_identity TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_basis TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_count INT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_acidity REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_body REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_sweet REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_updated TIMESTAMPTZ`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_reviews JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS char_scores JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_quality JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS review_dates JSONB`;

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 50);

    const targets = await sql`
      SELECT id, name, area FROM cafes
      ORDER BY synth_updated ASC NULLS FIRST LIMIT ${limit}
    ` as unknown as { id: number; name: string; area: string }[];

    const results = [];
    for (const cafe of targets) {
      try { results.push(await synthOne(cafe)); }
      catch (e) { results.push({ id: cafe.id, name: cafe.name, ok: false, reason: String(e) }); }
      await new Promise((r) => setTimeout(r, 400));
    }
    const okN = results.filter((r) => r.ok).length;
    return NextResponse.json({ ok: true, processed: results.length, success: okN, failed: results.length - okN, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureSchema();
    const rows = await sql`SELECT name, area, synth_grade, synth_count, synth_updated FROM cafes WHERE published = true ORDER BY synth_updated ASC NULLS FIRST`;
    return NextResponse.json({ ok: true, cafes: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
