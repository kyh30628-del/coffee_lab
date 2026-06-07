// 한 카페 합성 + DB 저장 (배치·cron·에이전트 공용 단일 출처).
// PRINCIPLES §1·§7: 노이즈 제거 후 검증된 옥석 리뷰만으로 등급·정체성 산출.
// 검증/참고 등급(검증 리뷰 5+)이면 자동 공개, 부족하면 비공개 유지(정직).
import { sql } from "./db";
import { fetchPlacesReviews } from "./placesCollector";
import { fetchWebReviews } from "./webSearchCollector";
import { collectAndSynthesize, type RawSource } from "./collectOrchestrator";

export async function synthAndStore(cafe: { id: number; name: string; area: string }) {
  const sources: RawSource[] = [];
  const places = await fetchPlacesReviews(cafe.name, cafe.area ?? "");
  if (places.reviews.length) sources.push({ source: "google", texts: places.reviews.map((r) => ({ text: r.text, time: r.time })) });
  const web = await fetchWebReviews(cafe.name, cafe.area ?? "");
  if (web.snippets.length) sources.push({ source: "blog", texts: web.snippets });
  if (sources.length === 0) {
    // 수집되는 리뷰가 전혀 없음 → 발굴등급·비공개로 마킹해 큐에서 제외(무한 재시도 방지, 정직)
    await sql`UPDATE cafes SET synth_grade='발굴', synth_count=0, synth_updated=now(), published=false WHERE id=${cafe.id}`;
    return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 0", grade: "발굴", published: false };
  }

  const { synth, collected, grade, charScores, evidenceReviews, reviewDates, quality } = collectAndSynthesize(cafe.name, cafe.area ? [cafe.area] : [], sources);
  const c = synth.coords;
  const basisLine = ["acidity", "body", "sweet"].filter((ax) => c[ax] != null)
    .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`).join(" / ");
  const publish = grade === "검증" || grade === "참고";

  await sql`
    UPDATE cafes SET
      synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine},
      synth_count=${collected}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet},
      synth_reviews=${JSON.stringify(evidenceReviews)}, char_scores=${JSON.stringify(charScores)},
      synth_quality=${JSON.stringify(quality)}, review_dates=${JSON.stringify(reviewDates)}, synth_updated=now(),
      published=${publish}
    WHERE id=${cafe.id}`;
  return { id: cafe.id, name: cafe.name, ok: true, grade, collected, evidence: evidenceReviews.length, published: publish };
}
