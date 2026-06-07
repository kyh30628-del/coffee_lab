// 한 카페 합성 + DB 저장 (배치·cron·에이전트 공용 단일 출처).
// PRINCIPLES §1·§3·§5·§7: raw 보존 → 재합성 시 API 재호출 없이 재현(쿼터 절약).
// 규칙 1차 + LLM 맥락 재판정(스마트). 검증/참고면 자동 공개, 부족하면 비공개(정직).
import { sql } from "./db";
import { fetchPlacesReviews } from "./placesCollector";
import { fetchWebReviews } from "./webSearchCollector";
import { collectAndSynthesize, type RawSource } from "./collectOrchestrator";
import { judgeReviews, hasJudgeKey } from "./reviewJudge";

type RawItem = { source: "google" | "blog"; text: string; title?: string; desc?: string; time?: number; link?: string; date?: string; srcName?: string };

let ensured = false;
async function ensureCols() {
  if (ensured) return;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS raw_reviews JSONB`;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS raw_collected_at TIMESTAMPTZ`;
  ensured = true;
}

// 원본 수집: 저장된 raw가 있고 refresh가 아니면 재사용(무료·재현). 아니면 새로 수집해 저장.
// apiFailed: 수집 0인데 네이버 API 오류/쿼터인 경우 → 진짜 0건과 구분(기존 데이터 보존용).
async function gatherRaw(cafe: { id: number; name: string; area: string }, refresh: boolean): Promise<{ raw: RawItem[]; fromCache: boolean; apiFailed: boolean }> {
  if (!refresh) {
    const row = (await sql`SELECT raw_reviews FROM cafes WHERE id=${cafe.id}`)[0];
    const cached = row?.raw_reviews;
    if (Array.isArray(cached) && cached.length) return { raw: cached as RawItem[], fromCache: true, apiFailed: false };
  }
  const raw: RawItem[] = [];
  const places = await fetchPlacesReviews(cafe.name, cafe.area ?? "");
  for (const r of places.reviews) raw.push({ source: "google", text: r.text, time: r.time });
  const web = await fetchWebReviews(cafe.name, cafe.area ?? "");
  for (const s of web.snippets) raw.push({ source: "blog", text: s.text, title: s.title, desc: s.desc, time: s.time, link: s.link, date: s.date, srcName: s.source });
  // 네이버 쿼터/오류로 아무것도 못 받음 → 저장·갱신하지 않고 보존(나중에 재시도)
  if (raw.length === 0 && web.apiError) return { raw: [], fromCache: false, apiFailed: true };
  await sql`UPDATE cafes SET raw_reviews=${JSON.stringify(raw)}, raw_collected_at=now() WHERE id=${cafe.id}`;
  return { raw, fromCache: false, apiFailed: false };
}

function rawToSources(raw: RawItem[]): RawSource[] {
  const g = raw.filter((r) => r.source === "google").map((r) => ({ text: r.text, time: r.time }));
  const b = raw.filter((r) => r.source === "blog").map((r) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
  const sources: RawSource[] = [];
  if (g.length) sources.push({ source: "google", texts: g });
  if (b.length) sources.push({ source: "blog", texts: b });
  return sources;
}

// opts.refresh=true면 새로 수집(최신성·주간 cron). 기본은 캐시 재사용(재판정·쿼터 절약).
export async function synthAndStore(cafe: { id: number; name: string; area: string }, opts?: { refresh?: boolean }) {
  await ensureCols();
  const { raw, fromCache, apiFailed } = await gatherRaw(cafe, !!opts?.refresh);
  // 쿼터/오류로 수집 실패 → DB 미변경(기존 데이터 보존). 다음 회차 재시도.
  if (apiFailed) return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 API 오류/쿼터 — 보존", skipped: true };
  const sources = rawToSources(raw);
  if (sources.length === 0) {
    await sql`UPDATE cafes SET synth_grade='발굴', synth_count=0, synth_updated=now(), published=false WHERE id=${cafe.id}`;
    return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 0", grade: "발굴", published: false, fromCache };
  }

  const area = cafe.area ? [cafe.area] : [];
  let result = collectAndSynthesize(cafe.name, area, sources);

  // 스마트 재판정: 경계 리뷰를 LLM이 읽어 양질 후기만 살림(실패/쿼터 시 1차 결과 유지).
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
  return { id: cafe.id, name: cafe.name, ok: true, grade, collected, evidence: evidenceReviews.length, rescued, fromCache, published: publish };
}
