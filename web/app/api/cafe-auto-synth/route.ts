import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { fetchPlacesReviews } from "@/lib/placesCollector";
import { fetchWebReviews } from "@/lib/webSearchCollector";
import { collectAndSynthesize, type RawSource } from "@/lib/collectOrchestrator";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const { name, area } = await req.json();
    if (!name) return NextResponse.json({ ok: false, error: "name 필요" }, { status: 400 });
    const areaStr = Array.isArray(area) ? area[0] : (area ?? "");
    const areaTerms = Array.isArray(area) ? area : area ? [area] : [];

    const sources: RawSource[] = [];
    const collectDebug: Record<string, unknown> = {};
    const places = await fetchPlacesReviews(name, areaStr);
    if (places.reviews.length) sources.push({ source: "google", texts: places.reviews.map((r) => ({ text: r.text, time: r.time })) });
    collectDebug.places = { count: places.reviews.length, error: places.error ?? null };
    const web = await fetchWebReviews(name, areaStr);
    if (web.snippets.length) sources.push({ source: "blog", texts: web.snippets });
    collectDebug.web = { count: web.snippets.length, error: web.error ?? null };

    if (sources.length === 0) return NextResponse.json({ ok: false, error: "수집된 데이터 없음", collectDebug }, { status: 404 });

    const { synth, collected, grade, charScores, perSource, evidenceReviews, reviewDates, quality } = collectAndSynthesize(name, areaTerms, sources);
    const c = synth.coords;
    const basisLine = ["acidity", "body", "sweet"].filter((ax) => c[ax] != null)
      .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`).join(" / ");

    const placeName = places.place?.name ?? name;
    const placeId = places.place?.id ?? "";
    const publish = grade === "검증" || grade === "참고";
    const r = await sql`
      UPDATE cafes SET
        synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine},
        synth_count=${collected}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet},
        synth_reviews=${JSON.stringify(evidenceReviews)}, char_scores=${JSON.stringify(charScores)},
        synth_quality=${JSON.stringify(quality)}, review_dates=${JSON.stringify(reviewDates)}, synth_updated=now(), published=${publish}
      WHERE place_id=${placeId} OR name=${name} OR name=${placeName}
      RETURNING id, name`;
    if (r.length === 0) return NextResponse.json({ ok: false, error: `DB 매칭 실패: '${name}'`, synth, perSource, collectDebug }, { status: 404 });
    return NextResponse.json({ ok: true, applied: r[0], collected, grade, quality, perSource, synth, charScores, evidenceReviews, collectDebug });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
