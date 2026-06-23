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
    // ⚠️ 값뿐 아니라 '키'도 짝없는 서로게이트 제거 — judge_decisions 키가 이모지 인용문에서 와
    //   서로게이트를 가지면 jsonb 거부(카페아리 무한루프 원인). 정제 후 키 충돌 시 마지막 값.
    for (const k in v as Record<string, unknown>) {
      const ck = k.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
      o[ck] = jsonbSafe((v as Record<string, unknown>)[k]);
    }
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
  // raw_checked_at: 재수집을 '시도'한 시각(커서 전용). raw_collected_at(=내용이 실제 바뀐 시각, 판정 큐 트리거)과 분리.
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS raw_checked_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS llm_judged_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS yt_checked_at TIMESTAMPTZ`;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS judge_decisions JSONB`; // 판정 AI 결정(key→keep/drop) 영구 보존 → 재합성해도 유지
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_coherence REAL`; // 근거후기 이름일관성(0~1) — 그라운딩을 '애매한 곳'에만 돌리는 효율 게이트용
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS offctx_rate REAL`; // 표시 리뷰 중 '카페 맥락어 없는 비율'(0~1) — 규칙-사각 오염(딴업종·문구이름) 관제탑 감시 지표
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS offctx_ok BOOLEAN DEFAULT false`; // 사람이 '진짜 카페'로 확인한 화이트리스트 → offctx 점검목록서 제외(프록시 오탐 반복 방지)
  ensured = true;
}
// 카페·식음료 맥락어 — 검증 리뷰가 '실제로 카페 얘기'인지 가늠. 없는 비율↑ = 딴 업종/콘텐츠 오염 의심.
const CAFE_CTX = /(카페|커피|라떼|아메리카노|에스프레소|콜드브루|핸드드립|디저트|케이크|베이커리|메뉴|음료|원두|바리스타|좌석|매장|사장님|주문|브런치|로스팅|카공|빙수|스무디|에이드|방문|다녀|마셨|마시|들렀|시켰|먹었|cafe|coffee|latte|빵집?|빵|꽈배기|도넛|도나쓰|도나스|마카롱|과자|타르트|휘낭시에|쿠키|스콘|크루아상|크로플|베이글|찹쌀|꿀|크림|초코|티라미수|와플|토스트|샌드위치|간식|아인슈페너|플랫화이트|차\b|티\b|푸딩|젤라또|아이스크림|약과|디카페인|음식|맛있|존맛|JMT|먹스타)/i;
function offctxRate(quotes: string[]): number {
  const qs = (quotes || []).filter(Boolean);
  if (qs.length < 8) return 0; // 표본 적으면 신뢰 낮음 → 0
  return qs.filter((q) => !CAFE_CTX.test(q)).length / qs.length;
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
  // 내용 비교: 재수집했는데 후기가 그대로면 raw_collected_at을 건드리지 않는다(= 재판정 큐에 다시 안 올라감).
  // raw_checked_at만 갱신 → 커서는 계속 순환하되, 헛 재판정(토큰 낭비)·관제탑 숫자 들쭉날쭉이 사라진다.
  const cleaned = cleanRaw(raw);
  const sig = (a: RawItem[]) => a.map((r) => `${r.source}${r.text || ""}${r.title || ""}${r.desc || ""}`).sort().join("");
  let changed = true;
  try { const prev = await loadRaw(cafe.id); if (prev.length === cleaned.length && sig(prev) === sig(cleaned)) changed = false; } catch { /* 비교 실패 시 안전하게 변경으로 간주 */ }
  if (changed) {
    await sql`UPDATE cafes SET raw_reviews=${safeJson(cleaned)}, raw_collected_at=now(), raw_checked_at=now() WHERE id=${cafe.id}`;
  } else {
    await sql`UPDATE cafes SET raw_checked_at=now() WHERE id=${cafe.id}`;
  }
  return { raw, fromCache: false, apiFailed: false };
}

// 합성 결과를 DB에 저장(공용). llmJudged=true면 llm_judged_at도 기록.
async function storeResult(cafeId: number, name: string, result: CollectResult, llmJudged: boolean) {
  const { synth, collected, grade, charScores, evidenceReviews, allEvidence, reviewDates, quality, borderline } = result;
  const c = synth.coords;
  const basisLine = ["acidity", "body", "sweet"].filter((ax) => c[ax] != null)
    .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`).join(" / ");
  // 공개 가드: 등급 충족 + 비카페 아님 + 노이즈 게이트(후기가 실제 그 카페 얘기인지).
  //   노이즈: 공개건수(5+)인데 이름 일관성<40% → 오염 의심 → 공개 보류. 사용자에 garbage 안 나감.
  //   저건수도 적용('만조커피 9건'이 전부 동네 딴 가게였던 사례 차단). 전체이름 매칭은 nameCoherence가 보완.
  const coherence = nameCoherence(name, (evidenceReviews as any[]).map((r) => r?.quote || ""));
  const offctx = offctxRate(((allEvidence ?? evidenceReviews) as any[]).map((r) => r?.quote || "")); // 맥락없음 비율(관제탑 감시)
  const noisy = collected >= 5 && coherence < 0.4;
  // 🔀 판정 분기 신호: 진짜 '맥락판단'이 필요한 경우만 LLM으로(규칙 우선 극대화).
  //   ⚠️ 경계후기 존재만으로 LLM 보내지 않음 — 경계후기는 어차피 합성서 제외되어 공개 내용에 안 들어가고,
  //      이미 '깨끗한 후기'로 검증/참고 등급이 난 카페는 규칙으로 공개해도 안전(품질 위험 0).
  //   LLM 필요 = ① 근거 자체가 애매(이름일관성<0.55 OR 맥락오염≥0.5)  또는
  //             ② '후보'등급(깨끗한 후기 부족)인데 경계후기를 살리면 등급이 오를 여지 있음(LLM이 복원).
  const ambiguousEvidence = coherence < 0.55 || offctx >= 0.5;
  const blCount = borderline?.length ?? 0; // 경계후기 수(노출 제외·LLM 보강 대기) — 관제탑 가시화용
  const recoverableEdge = grade === "후보" && blCount > 0;
  const needsLLM = ambiguousEvidence || recoverableEdge;
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_reviews_all JSONB`.catch(() => {});
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS pipeline_status TEXT`.catch(() => {});
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS needs_llm BOOLEAN`.catch(() => {});
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS borderline_count INT`.catch(() => {});
  const allEv = safeJson(allEvidence ?? evidenceReviews);
  // 현재 상태(파이프라인 단계·카테고리·이전 합성값) 먼저 — 카테고리 게이트 분기에 pst 필요.
  const cur = (await sql`SELECT pipeline_status, naver_category, synth_identity, synth_count, synth_updated, jsonb_array_length(COALESCE(synth_reviews,'[]'::jsonb)) prev_ev FROM cafes WHERE id=${cafeId} LIMIT 1`)[0] as any;
  const pst: string | null = cur?.pipeline_status ?? null;
  const inPipeline = pst === "new" || pst === "pending" || pst === "rejected"; // 신규 카페(공개 전 게이트)

  // 🔒 카테고리·비카페 게이트.
  //   신규(파이프라인) 카페: 카테고리 필수 — 카테고리 없이는 카페/비카페 구분 불가 → 공개 금지.
  //   기존 공개(grandfather/live) 카페: '카테고리 없음'만으로 내리지 않는다 — 카테고리 없음 ≠ 비카페(인천 사태 방지).
  //     이름 기반 비카페 판정만 적용(식당·정육·병원 등 명백한 비카페는 카테고리 없어도 제외, 정상 카페는 유지).
  const naverCat = (cur?.naver_category || "").trim();
  const hasCategory = naverCat.length > 0;
  //   신규 카페: 카테고리 필수 + 카테고리 기반 비카페 차단(엄격).
  //   기존 공개(grandfather/live) 카페: 카테고리 재분류로 내리지 않는다 — 검증 후기(일치율·등급)가 곧 카페 증명.
  //     이름 기반 비카페('식당·정육·병원' 등 명백한 것)만 적용. ('쇼핑,유통>차,커피' 소매카페·카테고리 누락 오비공개 방지)
  const isCafeCat = inPipeline ? (hasCategory && !isNonCafe(name, naverCat)) : !isNonCafe(name, "");
  // 프랜차이즈 제외 + 카페 카테고리 + 노이즈 아님 — 공개 게이트.
  const ruleOk = (grade === "검증" || grade === "참고") && isCafeCat && !isFranchise(name) && !noisy;

  // 🔒 진정한 자동화 게이트: 신규 카페는 규칙 통과해도 즉시 공개 안 함 — AI 판정·임베딩·검증 통과 후 finalizer가 'live'로 승격할 때만.
  //   기존 카페(grandfather/live)는 규칙 게이트로 공개.
  // 🔁 재합성 결과가 이전과 사실상 동일하면 synth_updated 유지 → 그라운딩 무효화·재검 순환 방지.
  const unchanged = !!(cur?.synth_updated && cur.synth_identity === synth.identity && Number(cur.synth_count) === collected && Number(cur.prev_ev) === (evidenceReviews as any[]).length);
  const synthTs = unchanged ? cur.synth_updated : new Date();
  const held = pst === "held"; // 그라운딩 '근거0건' 확정 보류 — 재합성해도 비공개 고정
  const stuckNoise = pst === "noise" || noisy; // 노이즈(이름 오염) 한번 걸리면 영구 탈락
  const newPst = held ? "held" : stuckNoise ? "noise" : inPipeline ? (ruleOk ? "pending" : "rejected") : pst;
  const publish = (held || stuckNoise || inPipeline) ? false : ruleOk; // held·노이즈·파이프라인은 비공개 고정, 나머지는 규칙대로

  if (llmJudged) {
    await sql`UPDATE cafes SET synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine}, synth_count=${collected}, synth_coherence=${coherence}, offctx_rate=${offctx}, needs_llm=${needsLLM}, borderline_count=${blCount}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet}, synth_reviews=${safeJson(evidenceReviews)}, synth_reviews_all=${allEv}, char_scores=${safeJson(charScores)}, synth_quality=${safeJson(quality)}, review_dates=${safeJson(reviewDates)}, pipeline_status=${newPst}, synth_updated=${synthTs}, llm_judged_at=now(), published=(${publish} AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9) WHERE id=${cafeId}`;
  } else {
    await sql`UPDATE cafes SET synth_grade=${grade}, synth_identity=${synth.identity}, synth_basis=${basisLine}, synth_count=${collected}, synth_coherence=${coherence}, offctx_rate=${offctx}, needs_llm=${needsLLM}, borderline_count=${blCount}, synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet}, synth_reviews=${safeJson(evidenceReviews)}, synth_reviews_all=${allEv}, char_scores=${safeJson(charScores)}, synth_quality=${safeJson(quality)}, review_dates=${safeJson(reviewDates)}, pipeline_status=${newPst}, synth_updated=${synthTs}, published=(${publish} AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9) WHERE id=${cafeId}`;
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

// 🚦 파이프라인 finalizer — 게이트 통과한 신규 카페를 공개로 승격.
//   공통 게이트: ① 규칙 합성 통과(pending=규칙OK) ② 임베딩 완료 ③ 등급 검증/참고
//               ④ 좌표 수도권 ⑤ 미해결 오염플래그 없음.
//   ⑥ 판정 분기(의사결정 틀 ①규칙먼저 ③LLM은 애매할 때만):
//      · 규칙으로 '명확'(근거후기 이름일관성↑·맥락오염↓·경계후기 없음) → LLM 없이 규칙으로 공개.
//      · '애매'(경계후기 있음·일관성↓·오염↑) → LLM 판정(llm_judged_at) 통과해야만 공개(심화 검증 보류).
//   needs_llm: 신규 합성분은 정확 신호 저장. 기존분(NULL)은 coherence·offctx 프록시로 판단.
export async function finalizePipeline(): Promise<{ promoted: number; names: string[]; pending: number; stuck: any }> {
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS pipeline_status TEXT`.catch(() => {});
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS needs_llm BOOLEAN`.catch(() => {});
  const promoted = (await sql`
    UPDATE cafes SET published = true, pipeline_status = 'live'
    WHERE pipeline_status = 'pending'
      AND embedding IS NOT NULL
      AND synth_grade IN ('검증','참고')
      AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9
      AND NOT EXISTS (SELECT 1 FROM audit_flags af WHERE af.cafe_id = cafes.id AND NOT af.resolved)
      AND (
        llm_judged_at IS NOT NULL                                                          -- LLM 판정 완료(애매했던 것도 통과)
        OR needs_llm = false                                                               -- 규칙으로 명확(신규 저장분)
        OR (needs_llm IS NULL AND COALESCE(synth_coherence,0) >= 0.55 AND COALESCE(offctx_rate,0) < 0.5)  -- 기존분 프록시
      )
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
    await sql`UPDATE cafes SET synth_grade='후보', synth_count=0, synth_updated=now(), published=false WHERE id=${cafe.id}`;
    return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 0", grade: "후보", published: false, fromCache };
  }

  const area = cafe.area ? [cafe.area] : [];
  const decisions = await loadDecisions(cafe.id); // 과거 판정 AI 결정 유지(동명/무관 제거 영구)
  let result = collectAndSynthesize(cafe.name, area, sources, { decisions });

  // 서버측 보조 LLM 재판정. ⚠️ 기본 OFF — 실시간 API($1/$5)는 비싸므로 안 씀(INLINE_JUDGE=1일 때만).
  //   판정은 cron-batch-judge(Batches 50%할인) + 로컬 구독 드레인이 담당. 여기선 규칙+과거결정만 적용,
  //   경계 리뷰는 llm_judged_at NULL로 남겨 배치 판정 큐로 보냄(드리프트·중복과금 0).
  let rescued = 0;
  if (process.env.INLINE_JUDGE === "1" && hasJudgeKey() && result.borderline.length > 0) {
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

// 🛡️ 통합 자가치유: 공개 카페를 커서로 순환하며 '현재의 모든 게이트'로 재검증·교정.
//   재합성(synthAndStore)은 비카페·프랜차이즈·광고·동명오염·노이즈·등급·좌표 게이트를 전부 다시 적용한다.
//   → 규칙을 고치면(coreTokens·숫자토큰 등) 기존 공개 데이터도 며칠 안에 자동으로 따라온다(드리프트 치유).
//   audit_checked_at 커서로 전 공개카페를 ~며칠 주기로 1회씩 재검. 재합성으로 비공개되면 그게 곧 교정.
//   교정 후에도 근거가 카페명과 안 맞으면 audit_flags(근거오염)로 레드팀에 남긴다.
//   🚨 안전장치: 한 회차 비공개가 unpubCap 초과 = 규칙 회귀(인천 사태) 의심 → 즉시 중단·경보(대량삭제 차단).
export async function healPublishedAudit(limit = 600, unpubCap = 120): Promise<{ scanned: number; unpublished: number; flagged: number; regression: boolean; names: string[] }> {
  await ensureCols();
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS audit_checked_at TIMESTAMPTZ`.catch(() => {});
  const rows = (await sql`SELECT id, name, area FROM cafes
    WHERE published AND raw_reviews IS NOT NULL
    ORDER BY audit_checked_at ASC NULLS FIRST LIMIT ${limit}`) as unknown as any[];
  let scanned = 0, unpublished = 0, flagged = 0; const names: string[] = []; let regression = false;
  for (const r of rows) {
    const before = (await sql`SELECT published FROM cafes WHERE id=${r.id}`)[0] as any;
    try { await synthAndStore({ id: r.id, name: r.name, area: r.area }, { refresh: false }); } catch { continue; }
    await sql`UPDATE cafes SET audit_checked_at=now() WHERE id=${r.id}`.catch(() => {});
    scanned++;
    const after = (await sql`SELECT published, synth_reviews FROM cafes WHERE id=${r.id}`)[0] as any;
    if (before?.published && !after?.published) {
      unpublished++; names.push(r.name);
      if (unpublished > unpubCap) { regression = true; break; } // 대량 비공개 = 규칙 회귀 의심 → 중단
      continue;
    }
    if (after?.published) {
      const q = (after.synth_reviews || []).map((e: any) => e?.quote || "").filter(Boolean);
      const coh = q.length >= 3 ? nameCoherence(r.name, q) : 1;
      if (coh < 0.4) {
        flagged++;
        await sql`INSERT INTO audit_flags (cafe_id, cafe_name, issue, detail, resolved)
          SELECT ${r.id}, ${r.name}, ${"근거오염"}, ${`재합성후에도 카페명 일치율 ${Math.round(coh * 100)}%`}, false
          WHERE NOT EXISTS (SELECT 1 FROM audit_flags WHERE cafe_id=${r.id} AND issue=${"근거오염"} AND NOT resolved)`.catch(() => {});
      } else {
        await sql`UPDATE audit_flags SET resolved=true WHERE cafe_id=${r.id} AND issue=${"근거오염"} AND NOT resolved`.catch(() => {});
      }
    }
  }
  return { scanned, unpublished, flagged, regression, names: names.slice(0, 8) };
}
