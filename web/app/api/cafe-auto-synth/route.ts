import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { fetchPlacesReviews } from "@/lib/placesCollector";
import { collectAndSynthesize, type RawSource } from "@/lib/collectOrchestrator";

export const runtime = "nodejs";

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

    const { name, area } = await req.json();
    if (!name) return NextResponse.json({ ok: false, error: "name 필요" }, { status: 400 });
    const areaStr = Array.isArray(area) ? area[0] : (area ?? "");
    const areaTerms = Array.isArray(area) ? area : area ? [area] : [];

    const { reviews, place, error, debug } = await fetchPlacesReviews(name, areaStr);
    if (error) return NextResponse.json({ ok: false, step: "collect", error, debug }, { status: 502 });
    if (reviews.length === 0) return NextResponse.json({ ok: false, error: "수집된 리뷰 없음", place, debug }, { status: 404 });

    const sources: RawSource[] = [{ source: "google", texts: reviews }];
    const { synth, collected } = collectAndSynthesize(name, areaTerms, sources);
    const c = synth.coords;
    const basisLine = ["acidity", "body", "sweet"]
      .filter((ax) => c[ax] != null)
      .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`)
      .join(" / ");

    // DB 매칭: 입력 name 또는 구글이 찾은 정규화 이름(place.name) 둘 다로 시도 + place_id 우선
    const placeName = place?.name ?? name;
    const placeId = place?.id ?? "";
    const r = await sql`
      UPDATE cafes SET
        synth_grade=${synth.grade}, synth_identity=${synth.identity},
        synth_basis=${basisLine}, synth_count=${collected},
        synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet},
        synth_updated=now()
      WHERE place_id=${placeId} OR name=${name} OR name=${placeName}
      RETURNING id, name`;
    if (r.length === 0) {
      return NextResponse.json({
        ok: false,
        error: `합성은 성공했으나 DB에서 카페를 못 찾음. 시도한 이름: '${name}', '${placeName}', place_id: '${placeId}'`,
        synth, place, collected,
      }, { status: 404 });
    }
    return NextResponse.json({ ok: true, applied: r[0], place, collected, synth });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
