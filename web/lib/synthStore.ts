// 한 카페 합성 + DB 저장 (배치·cron·에이전트 공용 단일 출처).
// PRINCIPLES §1·§3·§5·§7: raw 보존 → 재합성 시 API 재호출 없이 재현(쿼터 절약).
// 규칙 1차 + LLM 맥락 재판정(스마트). 검증/참고면 자동 공개, 부족하면 비공개(정직).
import { sql } from "./db";
import { fetchPlacesReviews } from "./placesCollector";
import { fetchWebReviews } from "./webSearchCollector";
import { fetchYouTubeReviews } from "./youtubeCollector";
import { collectAndSynthesize, type RawSource, type BorderlineItem, type CollectResult } from "./collectOrchestrator";
import { judgeReviews, hasJudgeKey } from "./reviewJudge";
import { isNonCafe, isFranchise } from "./discover";
import { nameCoherence } from "./reviewQuality";

type RawItem = { source: "google" | "blog" | "youtube"; text: string; title?: string; desc?: string; time?: number; link?: string; date?: string; srcName?: string };

// 🛡️ jsonb 안전 직렬화: 인용문이 이모지(서로게이트쌍) 중간에서 잘리면 짝 없는 서로게이트가 남고,
//   JSON.stringify는 이를 \udXXX 이스케이프로 내보내지만 PostgreSQL jsonb는 이를 거부한다
//   ("invalid input syntax for type json"). NUL(\u0000)도 jsonb 불가. → 저장 전 문자열에서 둘 다 제거.
function jsonbSafe<T>(v: T): T {
  if (typeof v === "string") {
    return v
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "") // 짝 없는 high 서로게이트
      .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "") // 짝 없는 low 서로게이트
      .replace(/\u0000/g, "") as unknown as T;            // NUL
  }
  if (Array.isArray(v)) return v.map(jsonbSafe) as unknown as T;
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k in v as Record<string, unknown>) o[k] = jsonbSafe((v as Record<string, unknown>)[k]);
    return o as unknown as T;
  }
  return v;
}
const safeJson = (obj: unknown): string => JSON.stringify(jsonbSafe(obj));

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
  await sql`UPDATE cafes SET raw_reviews=${safeJson(cleanRaw(raw))}, raw_collected_at=now() WHERE id=${cafe.id}`;
  return { raw, fromCache: false, apiFailed: false };
}

// 합성 결과를 DB에 저장(공용). llmJudged=true면 llm_judged_at도 기록.
async function storeResult(cafeId: number, name: string, result: CollectResult, llmJudged: boolean) {
  const { synth, collected, grade, charScores, evidenceReviews, allEvidence, reviewDates, quality } = result;
  const c = synth.coords;
  const basisLine = ["acidity", "body", "sweet"].filter((ax) => c[ax] != null)
    .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`).join(" / ");
  // 공개 가드: 등급 충족 + 비카페 아님 + 노이즈 게이트(후기가 실제 그 카페 얘기인지).
  //   노이즈: 공개건수(5+)인데 이름 일관성<40% → 오염 의심 → 공개 보류. 사용자에 garbage 안 나감.
  //   저건수도 적용('만조커피 9건'이 전부 동네 딴 가게였던 사례 차단). 전체이름 매칭은 nameCoherence가 보완.
  const coherence = nameCoherence(name, (evidenceReviews as any[]).map((r) => r?.quote || ""));
  const noisy = collected >= 5 && coherence < 0.4;
  // 🔒 카테고리 필수 검증 — 카테고리 없이는 카페/비카페 구분 불가 → 공개 금지(검증된 카페만 노출). 정체성·신뢰의 핵심.
  const catRow = (await sql`SELECT naver_category FROM cafes WHERE id=${cafeId} LIMIT 1`)[0];
  const naverCat = (catRow?.naver_category || "").trim();
  const hasCategory = naverCat.length > 0;                 // 카테고리 존재 필수
  const isCafeCat = hasCategory && !isNonCafe(name, naverCat); // 카테고리가 카페·디저트류여야 통과(리프 기준)
  // 프랜차이즈 제외 + 카테고리 필수 + 비카페 차단 — 공개 게이트.
  const ruleOk = (grade === "검증" || grade === "참고") && isCafeCat && !isFranchise(name) && !noisy;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_reviews_all JSONB`.catch(() => {});
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS pipeline_status TEXT`.catch(() => {});
  const allEv = safeJson(allEvidence ?? evidenceReviews);

  // 🔒 진정한 자동화 게이트: 신규 카페(pipeline_status=new/pending/rejected)는 규칙 통과해도 즉시 공개하지 않는다.
  //   AI 판정·임베딩·검증을 다 통과한 뒤 finalizer가 'live'로 승격할 때만 공개.
  //   기존 카페(pipeline_status=NULL=grandfather, 또는 이미 live)는 현행대로 규칙 게이트로 공개.
  const cur = (await sql`SELECT pipeline_status FROM cafes WHERE id=${cafeId} LIMIT 1`)[0] as any;
  const pst: string | null = cur?.pipeline_status ?? null;
  const held = pst === "held"; // 그라운딩 '근거0건' 확정 보류 — 재합성해도 비공개 고정(규칙이 못 잡는 의미적 오염)
  const stuckNoise = pst === "noise" || noisy; // 노이즈(이름 오염)로 한번 걸리면 영구 탈락 — 재합성해도 비공개 고정(사장님: 제거된 노이즈는 항상 탈락)
  const inPipeline = pst === "new" || pst === "pending" || pst === "rejected";
  const newPst = held ? "held" : stuckNoise ? "noise" : inPipeline ? (ruleOk ? "pending" : "rejected") : pst;
  const publish = (held || stuckNoise || inPipeline) ? false : ruleOk; // held·노이즈·파이프라인은 비공개 고정, 나머지는 규칙대로

  if (llmJudged) {
    await sql`UPDATE cafes SET synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine}, synth_count=${collected}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet}, synth_reviews=${safeJson(evidenceReviews)}, synth_reviews_all=${allEv}, char_scores=${safeJson(charScores)}, synth_quality=${safeJson(quality)}, review_dates=${safeJson(reviewDates)}, pipeline_status=${newPst}, synth_updated=now(), llm_judged_at=now(), published=(${publish} AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9) WHERE id=${cafeId}`;
  } else {
    await sql`UPDATE cafes SET synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine}, synth_count=${collected}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet}, synth_reviews=${safeJson(evidenceReviews)}, synth_reviews_all=${allEv}, char_scores=${safeJson(charScores)}, synth_quality=${safeJson(quality)}, review_dates=${safeJson(reviewDates)}, pipeline_status=${newPst}, synth_updated=now(), published=(${publish} AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9) WHERE id=${cafeId}`;
  }
  return { grade, collected, published: publish, ruleOk, pipeline: newPst, evidence: evidenceReviews.length, coherence: Math.round(coherence * 100), noisy };
}

// 🧼 PII 자동 세척 — 공개 인용문에서 전화·이메일·핸들 제거(레드팀 pii_leak 자가치유).
//   레드팀 규칙으로 위반 카페만 골라 in-place 마스킹 → 토큰 0, 4시간마다 관제탑이 가동.
export async function scrubPublishedPII(): Promise<{ scrubbed: number; names: string[] }> {
  const { maskPII } = await import("./collectOrchestrator");
  // 레드팀과 동일 규칙으로 위반 카페만 선별(대용량 fetch 회피)
  const bad = (await sql`
    SELECT DISTINCT c.id, c.name FROM cafes c, jsonb_array_elements(c.synth_reviews) r
    WHERE c.published AND (r->>'quote' ~ '01[0-9][- ]?[0-9]{3,4}[- ]?[0-9]{4}'
      OR r->>'quote' ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
      OR r->>'quote' ~ '\\m0(2|[3-6][0-9])[-. ]?[0-9]{3,4}[-. ]?[0-9]{4}\\M')
    LIMIT 200`) as any[];
  const names: string[] = [];
  for (const c of bad) {
    const [row] = await sql`SELECT synth_reviews, synth_reviews_all FROM cafes WHERE id=${c.id}` as any[];
    const scrub = (arr: any[]) => Array.isArray(arr) ? arr.map((r) => ({ ...r, quote: maskPII(r?.quote || "") })) : arr;
    const sr = scrub(row?.synth_reviews);
    const sra = scrub(row?.synth_reviews_all);
    await sql`UPDATE cafes SET synth_reviews=${safeJson(sr)}, synth_reviews_all=${safeJson(sra)} WHERE id=${c.id}`;
    names.push(c.name);
  }
  return { scrubbed: bad.length, names: names.slice(0, 10) };
}

// 🚷 그라운딩 '근거 0건'(전부 다른 가게) 확정 카페 자동 보류(비공개). 진짜 근거 일부 있는 곳은 제외.
//   release: 재그라운딩에서 grounded=true로 바뀐 held 카페는 'live'로 복귀(데이터 개선 시 자동 복원).
export async function holdZeroEvidenceSuspects(): Promise<{ held: number; released: number; names: string[] }> {
  await sql`CREATE TABLE IF NOT EXISTS grounding_checks (cafe_id INT PRIMARY KEY, grounded BOOLEAN, issue TEXT, checked_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  // 보류: grounded=false + 이슈가 '진짜 근거 0건'임을 명시(전부 다른 가게 / 후기 0건 / 자체 없음).
  //   ⚠️ '모두 커피특성으로 재표현'(업종오인=코끼리베이글) 같은 건 제외 — 진짜 근거 있는 곳은 유지.
  const heldRows = (await sql`
    UPDATE cafes SET published = false, pipeline_status = 'held'
    WHERE pipeline_status IS DISTINCT FROM 'held'
      AND id IN (
        SELECT g.cafe_id FROM grounding_checks g
        WHERE g.grounded = false AND (
          g.issue ~ '(후기[^,.]{0,6}0건|커피 후기 0|후기[^,.]{0,4}자체 없|전부 다른 (가게|업체|점포)|전부 카페가 아|건 전부.{0,16}(다른|아님|아닌|카페가 아))'
        ))
    RETURNING name`) as any[];
  // 복귀: held였는데 재그라운딩에서 grounded=true → 다시 live(다음 재합성이 규칙대로 공개)
  const rel = (await sql`
    UPDATE cafes SET pipeline_status = 'live'
    WHERE pipeline_status = 'held'
      AND id IN (SELECT cafe_id FROM grounding_checks WHERE grounded = true)
    RETURNING name`) as any[];
  return { held: heldRows.length, released: rel.length, names: heldRows.map((r) => r.name).slice(0, 8) };
}

// 🩺 LLM 그라운딩 의심(업체혼동·환각) 자가치유 — 재합성으로 교정(개선엔진: 오염제거·로스팅환각 차단).
//   아직 교정 안 된 것(synth_updated <= 그라운딩 검사시각)만 재합성 → 로컬 그라운딩이 재검사해 플래그 해소.
export async function healGroundingSuspects(): Promise<{ resynthed: number; names: string[]; suspects: number }> {
  await sql`CREATE TABLE IF NOT EXISTS grounding_checks (cafe_id INT PRIMARY KEY, grounded BOOLEAN, issue TEXT, checked_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  const bad = (await sql`
    SELECT c.id, c.name, c.area FROM grounding_checks g JOIN cafes c ON c.id = g.cafe_id
    WHERE g.grounded = false AND c.published = true
      AND (c.synth_updated IS NULL OR c.synth_updated <= g.checked_at)
    ORDER BY g.checked_at ASC LIMIT 15`) as any[];
  const names: string[] = [];
  for (const c of bad) { try { await synthAndStore({ id: c.id, name: c.name, area: c.area }, { refresh: false }); names.push(c.name); } catch {} }
  const [s] = await sql`SELECT COUNT(*)::int n FROM grounding_checks WHERE grounded = false` as any[];
  return { resynthed: bad.length, names: names.slice(0, 8), suspects: s.n };
}

// 🚦 파이프라인 finalizer — 모든 게이트 통과한 신규 카페만 공개로 승격.
//   게이트: ① 규칙 합성 통과(pending = 이미 규칙OK) ② AI 판정 완료 ③ 임베딩 완료
//           ④ 등급 검증/참고 ⑤ 좌표 수도권 ⑥ 미해결 오염플래그 없음.
//   하나라도 미충족이면 pending 유지(절대 노출 안 됨). 한치의 오차 없이 전 에이전트 통과 시에만 live.
export async function finalizePipeline(): Promise<{ promoted: number; names: string[]; pending: number; stuck: any }> {
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS pipeline_status TEXT`.catch(() => {});
  const promoted = (await sql`
    UPDATE cafes SET published = true, pipeline_status = 'live'
    WHERE pipeline_status = 'pending'
      AND llm_judged_at IS NOT NULL
      AND embedding IS NOT NULL
      AND synth_grade IN ('검증','참고')
      AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9
      AND NOT EXISTS (SELECT 1 FROM audit_flags af WHERE af.cafe_id = cafes.id AND NOT af.resolved)
    RETURNING name`) as any[];
  // 남은 pending이 어느 게이트에서 막혔는지 진단(관제용)
  const [p] = await sql`SELECT
    COUNT(*) FILTER (WHERE pipeline_status='pending')::int pending,
    COUNT(*) FILTER (WHERE pipeline_status='pending' AND llm_judged_at IS NULL)::int wait_judge,
    COUNT(*) FILTER (WHERE pipeline_status='pending' AND llm_judged_at IS NOT NULL AND embedding IS NULL)::int wait_embed,
    COUNT(*) FILTER (WHERE pipeline_status='new')::int wait_synth,
    COUNT(*) FILTER (WHERE pipeline_status='rejected')::int rejected
    FROM cafes` as any[];
  return { promoted: promoted.length, names: promoted.map((r) => r.name).slice(0, 10), pending: p.pending, stuck: { wait_synth: p.wait_synth, wait_judge: p.wait_judge, wait_embed: p.wait_embed, rejected: p.rejected } };
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
  // 토큰 최적화: AI에는 '경계(규칙이 애매)'만 보냄(70~90% 절감). 명확한 검증·참고는 규칙 신뢰.
  return { candidates: result.borderline, hasRaw: true };
}

// Sonnet 최종 결정(key→keep/drop)을 적용해 재합성·저장 + llm_judged_at 기록.
export async function applyDecisions(cafe: { id: number; name: string; area: string }, decisions: Record<string, boolean>) {
  await ensureCols();
  const raw = await loadRaw(cafe.id);
  if (!raw.length) { await sql`UPDATE cafes SET llm_judged_at=now() WHERE id=${cafe.id}`; return { id: cafe.id, approved: 0, grade: null, published: false, reason: "raw 없음" }; }
  // 기존 결정과 병합 → 영구 저장(재합성해도 유지). 새 판정이 우선.
  const merged = { ...(await loadDecisions(cafe.id)), ...decisions };
  const result = collectAndSynthesize(cafe.name, cafe.area ? [cafe.area] : [], rawToSources(raw), { decisions: merged });
  await sql`UPDATE cafes SET judge_decisions=${safeJson(merged)} WHERE id=${cafe.id}`;
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
  await sql`UPDATE cafes SET raw_reviews=${safeJson(cleanRaw(raw))}, raw_collected_at=now() WHERE id=${cafe.id}`;
  const result = collectAndSynthesize(cafe.name, cafe.area ? [cafe.area] : [], rawToSources(raw));
  await storeResult(cafe.id, cafe.name, result, false);
  return "added";
}

// 경계 리뷰 없는 카페는 LLM 불필요 → 판정완료로 마킹(커서 전진).
export async function markJudged(cafeId: number) {
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS llm_judged_at TIMESTAMPTZ`;
  await sql`UPDATE cafes SET llm_judged_at=now() WHERE id=${cafeId}`;
}
