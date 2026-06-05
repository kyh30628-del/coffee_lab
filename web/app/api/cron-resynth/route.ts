import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { fetchPlacesReviews } from "@/lib/placesCollector";
import { fetchWebReviews } from "@/lib/webSearchCollector";
import { collectAndSynthesize, type RawSource } from "@/lib/collectOrchestrator";

export const runtime = "nodejs";
export const maxDuration = 60;

// 한 카페 합성 후 DB 반영
async function synthOne(cafe: { id: number; name: string; area: string }) {
  const sources: RawSource[] = [];
  const places = await fetchPlacesReviews(cafe.name, cafe.area ?? "");
  if (places.reviews.length) sources.push({ source: "google", texts: places.reviews });
  const web = await fetchWebReviews(cafe.name, cafe.area ?? "");
  if (web.snippets.length) sources.push({ source: "blog", texts: web.snippets });
  if (sources.length === 0) return { name: cafe.name, ok: false };

  const { synth, collected } = collectAndSynthesize(cafe.name, cafe.area ? [cafe.area] : [], sources);
  const c = synth.coords;
  const basisLine = ["acidity", "body", "sweet"]
    .filter((ax) => c[ax] != null)
    .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`)
    .join(" / ");
  await sql`
    UPDATE cafes SET
      synth_grade=${synth.grade}, synth_identity=${synth.identity},
      synth_basis=${basisLine}, synth_count=${collected},
      synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet},
      synth_updated=now()
    WHERE id=${cafe.id}`;
  return { name: cafe.name, ok: true, grade: synth.grade, collected };
}

// 자동 실행 진입점: 가장 오래 갱신 안 된 카페 몇 곳을 재수집
export async function GET(req: NextRequest) {
  try {
    // 보안: 아무나 이 주소를 호출해 비용을 쓰지 못하게 비밀키 확인
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await ensureSchema();
    // 한 번 실행에 3곳씩만 (비용·시간 보호). 매주 돌면 3곳씩 천천히 최신화.
    const targets = await sql`
      SELECT id, name, area FROM cafes
      WHERE published = true
      ORDER BY synth_updated ASC NULLS FIRST
      LIMIT 3
    ` as unknown as { id: number; name: string; area: string }[];

    const results = [];
    for (const cafe of targets) {
      try { results.push(await synthOne(cafe)); }
      catch (e) { results.push({ name: cafe.name, ok: false, error: String(e) }); }
      await new Promise((r) => setTimeout(r, 400));
    }
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
