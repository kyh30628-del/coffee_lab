// 한 카페 합성 + DB 저장 (배치·cron·에이전트 공용 단일 출처).
// PRINCIPLES §1·§5·§7: 노이즈 제거 후 옥석만으로 산출. 규칙 1차 + LLM 맥락 재판정(스마트).
// 검증/참고 등급(검증 리뷰 5+)이면 자동 공개, 부족하면 비공개(정직).
import { sql } from "./db";
import { fetchPlacesReviews } from "./placesCollector";
import { fetchWebReviews } from "./webSearchCollector";
import { collectAndSynthesize, type RawSource } from "./collectOrchestrator";
import { judgeReviews, hasJudgeKey } from "./reviewJudge";

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

  const area = cafe.area ? [cafe.area] : [];
  let result = collectAndSynthesize(cafe.name, area, sources);

  // ── 스마트 재판정: 카페명은 불명확하나 후기 맥락이 있는 '경계 리뷰'를 LLM이 읽고
  //    실제 그 카페의 양질 후기면 살려낸다(양질 후기 누락 방지). 실패/쿼터 시 1차 결과 유지.
  let rescued = 0;
  if (hasJudgeKey() && result.borderline.length > 0) {
    const items = result.borderline.slice(0, 35).map((b, i) => ({ i, title: b.title ?? "", body: b.body }));
    const verdicts = await judgeReviews(cafe.name, cafe.area ?? "", items);
    if (verdicts) {
      const whitelist = new Set<string>();
      for (const it of items) { const v = verdicts.get(it.i); if (v?.about && v.helpful) whitelist.add(result.borderline[it.i].key); }
      if (whitelist.size > 0) { result = collectAndSynthesize(cafe.name, area, sources, { whitelist }); rescued = whitelist.size; }
    }
  }

  const { synth, collected, grade, charScores, evidenceReviews, reviewDates, quality } = result;
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
  return { id: cafe.id, name: cafe.name, ok: true, grade, collected, evidence: evidenceReviews.length, rescued, published: publish };
}
