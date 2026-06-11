// 한 카페 합성 + DB 저장 (배치·cron·에이전트 공용 단일 출처).
// PRINCIPLES §1·§3·§5·§7: raw 보존 → 재합성 시 API 재호출 없이 재현(쿼터 절약).
// 규칙 1차 + LLM 맥락 재판정(스마트). 검증/참고면 자동 공개, 부족하면 비공개(정직).
import { sql } from "./db";
import { fetchPlacesReviews } from "./placesCollector";
import { fetchWebReviews } from "./webSearchCollector";
import { fetchYouTubeReviews } from "./youtubeCollector";
import { collectAndSynthesize, type RawSource, type BorderlineItem, type CollectResult } from "./collectOrchestrator";
import { judgeReviews, hasJudgeKey } from "./reviewJudge";
import { isNonCafe } from "./discover";

type RawItem = { source: "google" | "blog" | "youtube"; text: string; title?: string; desc?: string; time?: number; link?: string; date?: string; srcName?: string };

let ensured = false;
async function ensureCols() {
  if (ensured) return;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS raw_reviews JSONB`;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS raw_collected_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS llm_judged_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS yt_checked_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS judge_decisions JSONB`; // 판정 AI 결정(key→keep/drop) 영구 보존 → 재합성해도 유지
  ensured = true;
}

// 저장된 판정 결정(영구). 재합성 시에도 동명/무관 제거가 유지되도록 모든 합성에 주입.
async function loadDecisions(cafeId: number): Promise<Record<string, boolean>> {
  const row = (await sql`SELECT judge_decisions FROM cafes WHERE id=${cafeId}`)[0];
  const d = row?.judge_decisions;
  return d && typeof d === "object" ? d : {};
}

// 짝 없는 유니코드 서로게이트 제거 → raw JSONB 저장 깨짐 방지(이모지 잘림 등, 모든 소스 공통)
const stripBad = (s: any) => typeof s === "string" ? s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "") : s;
const cleanRaw = (raw: RawItem[]): RawItem[] => raw.map((r) => ({ ...r, text: stripBad(r.text), title: stripBad(r.title), desc: stripBad(r.desc) }));

function rawToSources(raw: RawItem[]): RawSource[] {
  const g = raw.filter((r) => r.source === "google").map((r) => ({ text: r.text, time: r.time }));
  const b = raw.filter((r) => r.source === "blog").map((r) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
  const y = raw.filter((r) => r.source === "youtube").map((r) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
  const sources: RawSource[] = [];
  if (g.length) sources.push({ source: "google", texts: g });
  if (b.length) sources.push({ source: "blog", texts: b });
  if (y.length) sources.push({ source: "youtube", texts: y });
  return sources;
}

async function loadRaw(cafeId: number): Promise<RawItem[]> {
  const row = (await sql`SELECT raw_reviews FROM cafes WHERE id=${cafeId}`)[0];
  const r = row?.raw_reviews;
  return Array.isArray(r) ? (r as RawItem[]) : [];
}

// 원본 수집: 저장된 raw가 있고 refresh가 아니면 재사용(무료·재현). apiFailed면 보존(미변경).
async function gatherRaw(cafe: { id: number; name: string; area: string }, refresh: boolean): Promise<{ raw: RawItem[]; fromCache: boolean; apiFailed: boolean }> {
  if (!refresh) {
    const cached = await loadRaw(cafe.id);
    if (cached.length) return { raw: cached, fromCache: true, apiFailed: false };
  }
  const raw: RawItem[] = [];
  const places = await fetchPlacesReviews(cafe.name, cafe.area ?? "");
  for (const r of places.reviews) raw.push({ source: "google", text: r.text, time: r.time });
  const web = await fetchWebReviews(cafe.name, cafe.area ?? "");
  for (const s of web.snippets) raw.push({ source: "blog", text: s.text, title: s.title, desc: s.desc, time: s.time, link: s.link, date: s.date, srcName: s.source });
  // 유튜브는 쿼터가 빡빡해 기본 OFF — 전용 백필(youtube-backfill)이 통제 수집. 인라인은 ENABLE_YOUTUBE_INLINE=1일 때만.
  let ytErr = false;
  if (process.env.ENABLE_YOUTUBE_INLINE === "1") {
    const yt = await fetchYouTubeReviews(cafe.name, cafe.area ?? "");
    for (const s of yt.snippets) raw.push({ source: "youtube", text: s.text, title: s.title, desc: s.desc, time: s.time, link: s.link, date: s.date, srcName: s.source });
    ytErr = !!yt.apiError;
  }
  if (raw.length === 0 && (web.apiError || ytErr)) return { raw: [], fromCache: false, apiFailed: true };
  await sql`UPDATE cafes SET raw_reviews=${JSON.stringify(cleanRaw(raw))}, raw_collected_at=now() WHERE id=${cafe.id}`;
  return { raw, fromCache: false, apiFailed: false };
}

// 합성 결과를 DB에 저장(공용). llmJudged=true면 llm_judged_at도 기록.
async function storeResult(cafeId: number, name: string, result: CollectResult, llmJudged: boolean) {
  const { synth, collected, grade, charScores, evidenceReviews, reviewDates, quality } = result;
  const c = synth.coords;
  const basisLine = ["acidity", "body", "sweet"].filter((ax) => c[ax] != null)
    .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`).join(" / ");
  // 공개 가드: 등급 충족 + 비카페(교회·도서관·고로케 등) 아님. 재합성 때도 비카페는 영구 비공개.
  const publish = (grade === "검증" || grade === "참고") && !isNonCafe(name, "");
  if (llmJudged) {
    await sql`UPDATE cafes SET synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine}, synth_count=${collected}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet}, synth_reviews=${JSON.stringify(evidenceReviews)}, char_scores=${JSON.stringify(charScores)}, synth_quality=${JSON.stringify(quality)}, review_dates=${JSON.stringify(reviewDates)}, synth_updated=now(), llm_judged_at=now(), published=(${publish} AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9) WHERE id=${cafeId}`;
  } else {
    await sql`UPDATE cafes SET synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine}, synth_count=${collected}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet}, synth_reviews=${JSON.stringify(evidenceReviews)}, char_scores=${JSON.stringify(charScores)}, synth_quality=${JSON.stringify(quality)}, review_dates=${JSON.stringify(reviewDates)}, synth_updated=now(), published=(${publish} AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9) WHERE id=${cafeId}`;
  }
  return { grade, collected, published: publish, evidence: evidenceReviews.length };
}

// opts.refresh=true면 새로 수집(최신성). 기본은 캐시 재사용(쿼터 절약).
export async function synthAndStore(cafe: { id: number; name: string; area: string }, opts?: { refresh?: boolean }) {
  await ensureCols();
  const { raw, fromCache, apiFailed } = await gatherRaw(cafe, !!opts?.refresh);
  if (apiFailed) return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 API 오류/쿼터 — 보존", skipped: true };
  const sources = rawToSources(raw);
  if (sources.length === 0) {
    await sql`UPDATE cafes SET synth_grade='발굴', synth_count=0, synth_updated=now(), published=false WHERE id=${cafe.id}`;
    return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 0", grade: "발굴", published: false, fromCache };
  }

  const area = cafe.area ? [cafe.area] : [];
  const decisions = await loadDecisions(cafe.id); // 과거 판정 AI 결정 유지(동명/무관 제거 영구)
  let result = collectAndSynthesize(cafe.name, area, sources, { decisions });

  // 서버측 보조 LLM 재판정(키 있을 때만). 품질 본판정은 로컬 Sonnet 배치(judge-candidates/apply)가 담당.
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
  const stored = await storeResult(cafe.id, cafe.name, result, false);
  return { id: cafe.id, name: cafe.name, ok: true, ...stored, rescued, fromCache };
}

// ── 로컬 Sonnet 배치용 ───────────────────────────────────────────────
// 캐시된 raw로 '규칙상 on-topic 후보 전체'를 추출(서버, LLM 없음). Sonnet이 최종 심사.
// raw 없으면 hasRaw:false.
export async function getAuditCandidates(cafe: { id: number; name: string; area: string }): Promise<{ candidates: BorderlineItem[]; hasRaw: boolean }> {
  await ensureCols();
  const raw = await loadRaw(cafe.id);
  if (!raw.length) return { candidates: [], hasRaw: false };
  const result = collectAndSynthesize(cafe.name, cafe.area ? [cafe.area] : [], rawToSources(raw));
  return { candidates: result.auditItems, hasRaw: true };
}

// Sonnet 최종 결정(key→keep/drop)을 적용해 재합성·저장 + llm_judged_at 기록.
export async function applyDecisions(cafe: { id: number; name: string; area: string }, decisions: Record<string, boolean>) {
  await ensureCols();
  const raw = await loadRaw(cafe.id);
  if (!raw.length) { await sql`UPDATE cafes SET llm_judged_at=now() WHERE id=${cafe.id}`; return { id: cafe.id, approved: 0, grade: null, published: false, reason: "raw 없음" }; }
  // 기존 결정과 병합 → 영구 저장(재합성해도 유지). 새 판정이 우선.
  const merged = { ...(await loadDecisions(cafe.id)), ...decisions };
  const result = collectAndSynthesize(cafe.name, cafe.area ? [cafe.area] : [], rawToSources(raw), { decisions: merged });
  await sql`UPDATE cafes SET judge_decisions=${JSON.stringify(merged)} WHERE id=${cafe.id}`;
  const stored = await storeResult(cafe.id, cafe.name, result, true);
  const approved = Object.values(merged).filter(Boolean).length;
  return { id: cafe.id, name: cafe.name, approved, judged: Object.keys(decisions).length, ...stored };
}

// 유튜브 백필: 이미 raw 캐시된 카페에 유튜브만 추가 수집 → 재합성. 쿼터 소진 시 "quota".
export async function backfillYouTube(cafe: { id: number; name: string; area: string }): Promise<"added" | "none" | "has" | "quota" | "norow"> {
  await ensureCols();
  const raw = await loadRaw(cafe.id);
  if (!raw.length) return "norow";
  if (raw.some((r) => r.source === "youtube")) { await sql`UPDATE cafes SET yt_checked_at=now() WHERE id=${cafe.id}`; return "has"; }
  const yt = await fetchYouTubeReviews(cafe.name, cafe.area ?? "");
  if (yt.apiError) return "quota"; // 쿼터/오류 → 마킹 안 함(다음에 재시도)
  await sql`UPDATE cafes SET yt_checked_at=now() WHERE id=${cafe.id}`;
  if (!yt.snippets.length) return "none";
  for (const s of yt.snippets) raw.push({ source: "youtube", text: s.text, title: s.title, desc: s.desc, time: s.time, link: s.link, date: s.date, srcName: s.source });
  await sql`UPDATE cafes SET raw_reviews=${JSON.stringify(cleanRaw(raw))}, raw_collected_at=now() WHERE id=${cafe.id}`;
  const result = collectAndSynthesize(cafe.name, cafe.area ? [cafe.area] : [], rawToSources(raw));
  await storeResult(cafe.id, cafe.name, result, false);
  return "added";
}

// 경계 리뷰 없는 카페는 LLM 불필요 → 판정완료로 마킹(커서 전진).
export async function markJudged(cafeId: number) {
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS llm_judged_at TIMESTAMPTZ`;
  await sql`UPDATE cafes SET llm_judged_at=now() WHERE id=${cafeId}`;
}
