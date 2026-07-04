// 한 카페 합성 + DB 저장 (배치·cron·에이전트 공용 단일 출처).
// PRINCIPLES §1·§3·§5·§7: raw 보존 → 재합성 시 API 재호출 없이 재현(쿼터 절약).
// 규칙 1차 + LLM 맥락 재판정(스마트). 검증/참고면 자동 공개, 부족하면 비공개(정직).
import { sql } from "./db";
import { fetchPlacesReviews } from "./placesCollector";
import { fetchWebReviews } from "./webSearchCollector";
import { fetchYouTubeReviews } from "./youtubeCollector";
import { collectAndSynthesize, type RawSource, type BorderlineItem, type CollectResult } from "./collectOrchestrator";
import { judgeReviews, hasJudgeKey } from "./reviewJudge";
import { isNonCafe, isFranchise, isGenericFoodName, isSnackStall } from "./discover";
import { nameCoherence, cleanCafeName } from "./reviewQuality";
import { loadLearnedTerms } from "./learnedTerms";

// 카페 지역어(시 + 동洞) — 동까지 넘겨야 reviewQuality가 '분당점=성남시' 같은 市단위 동명 지점 오인을 거른다.
async function areaTermsFor(id: number, area?: string | null): Promise<string[]> {
  const terms = area ? [area] : [];
  try { const r = (await sql`SELECT dong FROM cafes WHERE id=${id}`) as any[]; const d = r[0]?.dong; if (d && !terms.includes(d)) terms.push(d); } catch {}
  return terms;
}
// 카페 등록주소(도로명) — 리뷰 주소 불일치 검증용
async function addrFor(id: number): Promise<string> {
  try { const r = (await sql`SELECT address FROM cafes WHERE id=${id}`) as any[]; return r[0]?.address || ""; } catch { return ""; }
}

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
const CAFE_CTX = /(카페|커피|라떼|아메리카노|에스프레소|콜드브루|핸드드립|디저트|케이크|베이커리|메뉴|음료|원두|바리스타|좌석|매장|사장님|주문|브런치|로스팅|카공|빙수|스무디|에이드|방문|다녀|마셨|마시|들렀|시켰|먹었|cafe|coffee|latte|빵집?|빵|꽈배기|도넛|도나쓰|도나스|마카롱|과자|타르트|휘낭시에|쿠키|스콘|크루아상|크로플|베이글|찹쌀|꿀|크림|초코|티라미수|와플|토스트|샌드위치|간식|아인슈페너|플랫화이트|차\b|티\b|푸딩|젤라또|아이스크림|약과|디카페인|음식|맛있|존맛|JMT|먹스타|팥죽|단팥죽|쌍화탕|한방차|대추차|인삼차|유자차|생강차|오미자|다과|전통차|찻집|티하우스|한방|빙떡|경단)/i;
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
  name = cleanCafeName(name); // 매칭·게이트(coherence·generic·nonCafe·franchise)는 SEO 서술어 꼬리 뗀 진짜 상호로 — '구구커피 원두 핸드드립 로스팅' 오염 차단
  const { synth, collected, grade, charScores, evidenceReviews, allEvidence, reviewDates, quality, borderline } = result;
  const c = synth.coords;
  const basisLine = ["acidity", "body", "sweet"].filter((ax) => c[ax] != null)
    .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`).join(" / ");
  // 공개 가드: 등급 충족 + 비카페 아님 + 노이즈 게이트(후기가 실제 그 카페 얘기인지).
  //   노이즈: 공개건수(5+)인데 이름 일관성<40% → 오염 의심 → 공개 보류. 사용자에 garbage 안 나감.
  //   저건수도 적용('만조커피 9건'이 전부 동네 딴 가게였던 사례 차단). 전체이름 매칭은 nameCoherence가 보완.
  const loc = (await sql`SELECT area, dong FROM cafes WHERE id=${cafeId}`)[0] as any; // 지역어(시+동) — coherence가 지역어를 식별토큰서 빼게
  const coherence = nameCoherence(name, (evidenceReviews as any[]).map((r) => r?.quote || ""), [loc?.area, loc?.dong].filter(Boolean));
  const offctx = offctxRate(((allEvidence ?? evidenceReviews) as any[]).map((r) => r?.quote || "")); // 맥락없음 비율(관제탑 감시)
  // 🚨 비카페 업체 지배: 노출 리뷰가 '다른 업종 업체어'(킥복싱·냉삼·만두·미용실·펜션…)에 지배되면
  //   이름이 겹쳐 coherence가 속아도(라온=라온킥복싱, PLMM사가정=사가정 만두집) 오염 → 공개 차단.
  //   카페어보다 비카페어가 많고 다수 후기에 퍼져 있을 때만(근처 헬스장 한번 언급한 정상카페는 통과).
  const qz = (evidenceReviews as any[]).map((r) => String(r?.quote || ""));
  // ⚠️ 위치형 단어(병원·학원·공방·식물원)는 제외 — 'OO병원점' 같은 정상 카페·베이커리가 거기 위치한 경우 오탐.
  //   '그 가게가 곧 그 업종'인 정체성어만(킥복싱·냉삼·펜션·캠핑장·미용실 등).
  const NCE = /(킥복싱|복싱|헬스장|휘트니스|피트니스|필라테스|요가원|냉삼|삼겹살|족발|보쌈|곱창|막창|만두|국밥|칼국수|순대|감자탕|마라탕|쌈밥|미용실|네일샵|왁싱|펜션|모텔|민박|캠핑장|글램핑|오토캠핑|차박|낚시터|볼링장|당구장|찜질방|사우나|입실|퇴실|객실)/;
  const CFE = /(커피|카페|디저트|베이커리|브런치|라떼|아메리카노|에스프레소|원두|음료|케이크|스콘|베이글|빙수|로스팅|드립|티룸)/;
  const entN = qz.filter((q) => NCE.test(q)).length, cfeN = qz.filter((q) => CFE.test(q)).length;
  const entityPolluted = qz.length >= 4 && entN >= Math.ceil(qz.length * 0.4) && entN > cfeN;
  //   + 이름이 '일반 음식·메뉴어'(베이글·아메리카노 등)면 음식 리뷰가 전부 매칭돼 식별 불가 → 노이즈로 공개 차단.
  // 🎯 실시간 비카페·오프콘셉 차단 (합성 '그 순간' = 발견 즉시). autoCorrect 폴링·배치 전에 발행 자체를 막아 보드에 안 뜨게.
  //   ① 커피 정체성 0: 노출후기 3건+에 카페 정체성(커피·디저트·베이커리·차/찻집) 단어가 하나도 없으면 비카페(식당·김밥·소매·오염).
  //   ② 오프콘셉: 활동공간 업종명사(애견·키즈·만화·보드게임·룸·파티룸 등)가 카페 자기이름과 함께 우세(≥0.66) → 활동공간.
  const _belongsHit = qz.filter((q) => CAFE_BELONGS.test(q)).length;
  const noCafeIdentity = collected >= 3 && _belongsHit === 0;
  const _ob = offconceptBrand(name);
  const _offHit = qz.filter((q) => OFFCONCEPT_VENUE.test(q));
  const offConceptHit = _offHit.length >= 3 && _ob.length >= 2 && (_offHit.filter((q) => q.includes(_ob)).length / Math.max(qz.length, 1)) >= 0.66;
  const noisy = (collected >= 5 && coherence < 0.4) || isGenericFoodName(name) || entityPolluted || noCafeIdentity || offConceptHit;
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
  const excluded = pst === "excluded" || isSnackStall(name); // 콘셉트/업종/오염 '영구 제외'(비카페·식당·이름충돌·노점간식) — 어떤 자동복원도 안 풂. 사람만 해제.
  const held = pst === "held"; // 그라운딩 '근거0건' 확정 보류 — 재합성해도 비공개 고정
  const stuckNoise = pst === "noise" || noisy; // 노이즈(이름 오염) 한번 걸리면 영구 탈락
  const newPst = excluded ? "excluded" : held ? "held" : stuckNoise ? "noise" : inPipeline ? (ruleOk ? "pending" : "rejected") : pst;
  const publish = (excluded || held || stuckNoise || inPipeline) ? false : ruleOk; // 제외·held·노이즈·파이프라인은 비공개 고정

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

// 🚫 '절대 카페 아님' 카테고리 자동 비공개 — 발굴 후 카테고리 알려지기 전 먼저 공개됐던 그랜드파더 비카페
//   (건설·페인트·수목원·동물원·병원·미용·캠핑·서점체인 등)를 카테고리로 자동 솎는다. 더는 수기로 안 잡게.
//   ⚠️ 인천 사태 방지 가드: '커피가공(로스터리)·북카페' 등 애매한 건 카페 키워드(카테고리·이름)로 제외.
//   '카테고리 없음'으로는 절대 안 내림(누락 ≠ 비카페) — '명백한 비카페 카테고리가 박혀 있을 때'만.
export async function healNonCafeCategory(): Promise<{ held: number; names: string[] }> {
  const rows = (await sql`
    UPDATE cafes SET published = false, pipeline_status = 'excluded'
    WHERE published = true AND naver_category IS NOT NULL
      AND (
        naver_category ~ '(건설|미장|타일|방수|도배|식물원|수목원|동물원|자동차|정비소|주유|부동산|공인중개|병원|의원|약국|한의원|치과|동물병원|미용실|헤어샵|네일|왁싱|에스테틱|피부관리|펜션|모텔|캠핑,야영|글램핑|변호사|법무사|세무사|회계|보험|은행|증권|독서실|고시원|장례|예식장|웨딩홀|장소대여)'
        -- 음식점은 '명백한 식당 업종'만(양식·브런치·피자·이탈리아는 카페와 겹쳐 제외). 음식점>카페/디저트는 아래 카페 가드가 보존.
        OR naver_category ~ '음식점>(일식|한식|중식|분식|고기|육류|치킨|족발|보쌈|곱창|막창|횟집|>회|국밥|찌개|전골|샤브|뷔페|돼지|소고기|닭|오리|장어|해물|냉면|칼국수|쌈밥|백반|기사식당|순대|감자탕|마라)'
      )
      AND naver_category !~ '(카페|커피|로스터|디저트|베이커리|제과|브런치|찻집|티룸|티하우스)'
      AND name !~ '(카페|까페|커피|로스터|디저트|베이커리|제과|찻집|티하우스|북카페|coffee|cafe)'
    RETURNING name`) as any[];
  // 🐶 오프콘셉 '○○카페' — 업종에 '카페'가 들어가도, 커피·디저트 취향 큐레이션과 안 맞는 '활동 목적' 공간은 제외.
  //   애견·고양이·키즈·스터디·만화·룸·보드게임·방탈출·노래·찜질방 + 서점(소매). 이 서비스는 커피/디저트 카페만 다룬다.
  //   📚 북카페·도서관 — 책/독서가 메인, 커피는 부차 → CEO 지시(2026-06)로 제외. 갤러리·플라워카페는 커피가 메인이라 보존.
  //   카테고리(카페,디저트>북카페·교육,학문>도서관) + 이름(○○북카페) 양쪽으로 잡는다.
  const off = (await sql`
    UPDATE cafes SET published = false, pipeline_status = 'excluded'
    WHERE published = true AND naver_category IS NOT NULL
      AND naver_category ~ '(애견|애완|반려동물|펫카페|고양이카페|동물카페|키즈|실내놀이터|놀이방|스터디카페|독서실|만화방|만화카페|룸카페|멀티방|파티룸|방탈출|보드게임|보드카페|볼링|당구|스크린골프|골프연습|코인노래|노래방|찜질방|사우나|클라이밍|트램폴린|트램펄린|서점|북카페|도서관)'
    RETURNING name`) as any[];
  // 📚 북카페 — 카테고리가 일반(카페,디저트>카페)으로 붙어도 이름에 '북카페'면 책 메인 → 제외.
  const bookByName = (await sql`
    UPDATE cafes SET published = false, pipeline_status = 'excluded'
    WHERE published = true AND name ~ '북카페|북 ?카페'
    RETURNING name`) as any[];
  off.push(...bookByName);
  return { held: rows.length + off.length, names: [...rows.map((r) => r.name), ...off.map((r) => r.name)].slice(0, 12) };
}

// 🎯 노출리뷰 기반 오프콘셉 자동 비공개 — 네이버가 '카페,디저트'로 뭉뚱그려 카테고리 게이트를 통과하지만
//   실제론 애견·고양이·키즈·만화·보드게임·방탈출 같은 '활동공간'인 곳을 노출리뷰 내용으로 잡는다.
//   ⚠️ 오염(다른 업체 리뷰 섞임: '몬스터커피'에 '몬스터핸드 보드게임카페' 리뷰)을 실수로 죽이지 않도록,
//      '업종명사 + 카페 자기이름이 같은 리뷰에' 함께 나오는 비율(self-bound)이 강한 우세(≥0.66)일 때만 비공개.
//      self<우세 = 오염/2차 언급 → 손대지 않음(이름정합 healer가 따로 처리). 임계 0.66은 '카페 이스트↔디 이스트'
//      같은 짧은토큰 충돌 오탐을 배제하려 0.5가 아닌 0.66로 잡음(드라이런 검증).
// 전 오프콘셉 업종(카테고리 OFF 리스트와 동기화) — 네이버가 일반 '카페'로 분류해도 리뷰내용 self-bound로 잡는다.
const OFFCONCEPT_VENUE = /애견카페|애견\s*카페|고양이카페|고양이\s*카페|동물카페|반려동물\s*카페|키즈카페|키즈\s*카페|만화카페|만화\s*카페|만화방|보드게임카페|보드게임\s*카페|방탈출|룸익스케이프|멀티방|룸카페|파티룸|스터디카페|스터디\s*룸|독서실|코인노래|노래방|피씨방|pc방|볼링장|당구장|스크린골프|골프연습|찜질방|사우나|클라이밍/i;
function offconceptBrand(name: string): string {
  return (name || "").replace(/^카페\s+/, "").replace(/\s+\S*점$/, "").trim().split(/\s+/)[0] || "";
}
export async function healOffConceptByReview(): Promise<{ held: number; names: string[] }> {
  const cand = (await sql`
    SELECT id, name, synth_reviews FROM cafes
    WHERE published = true AND synth_reviews IS NOT NULL
      AND synth_reviews::text ~* '애견카페|고양이카페|동물카페|키즈카페|만화카페|만화방|보드게임카페|방탈출|룸익스케이프|멀티방|룸카페|파티룸|스터디카페|스터디룸|독서실|코인노래|노래방|피씨방|pc방|볼링장|당구장|스크린골프|골프연습|찜질방|사우나|클라이밍'`) as any[];
  const killIds: number[] = []; const killNames: string[] = [];
  for (const c of cand) {
    let sr: any = c.synth_reviews; try { sr = JSON.parse(sr); } catch { /* already obj */ }
    const arr = Array.isArray(sr) ? sr : (sr && Array.isArray(sr.quotes) ? sr.quotes : []);
    const texts = (arr as any[]).map((q) => typeof q === "string" ? q : (q?.text || q?.quote || "")).filter(Boolean);
    if (texts.length < 3) continue;
    const b = offconceptBrand(c.name); if (b.length < 2) continue;
    const hard = texts.filter((t) => OFFCONCEPT_VENUE.test(t));
    if (hard.length < 3) continue; // 최소 3건 우세
    const self = hard.filter((t) => t.includes(b) || t.includes(c.name));
    if (self.length / texts.length >= 0.66) { killIds.push(c.id); killNames.push(c.name); }
  }
  if (killIds.length) {
    await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded' WHERE id = ANY(${killIds})`;
  }
  return { held: killIds.length, names: killNames.slice(0, 12) };
}

// 🍽️ 식당 자동 비공개 — 카페와 겹쳐 카테고리 게이트가 안 거른 '음식점>' 계열(양식·이탈리·다이닝·바·아시안·퓨전 등)
//   중, 이름도 카페형이 아니고 노출리뷰에 커피 정체성(커피·라떼·원두·디저트·베이커리·브런치 등)이 전무하면 = 명백한 식당
//   (빌라드코스테스=빠에야 레스토랑 류) → 결정론적 비공개. 커피 정체성 하나라도 있으면(양식 브런치카페 37.5·노멀브런치) 보존.
//   ⚠️ '음식점>카페,디저트'(몬스터커피 등)는 카테고리에 '카페' 있어 제외. 리뷰 없으면 안 건드림(미검증 보호).
export async function healRestaurantByReview(): Promise<{ held: number; names: string[] }> {
  const cand = (await sql`
    SELECT id, name, COALESCE(synth_reviews::text, '') t FROM cafes
    WHERE published = true AND naver_category IS NOT NULL
      AND naver_category ~ '음식점>'
      AND naver_category !~ '카페|커피|디저트|베이커리|제과|브런치|찻집|티룸|티하우스'
      AND name !~ '카페|까페|커피|로스터|디저트|베이커리|제과|찻집|티하우스|coffee|cafe'`) as any[];
  const COFFEE_ID = /커피|라떼|아메리카노|원두|에스프레소|핸드드립|콜드브루|드립|카페|까페|디저트|베이커리|빵|브런치|케이크|스콘|크로플|마카롱|음료|티룸|찻집|로스터/;
  const kill: number[] = []; const names: string[] = [];
  for (const c of cand) { if (c.t && !COFFEE_ID.test(c.t)) { kill.push(c.id); names.push(c.name); } }
  if (kill.length) await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded' WHERE id = ANY(${kill})`;
  return { held: kill.length, names: names.slice(0, 12) };
}

// 🎯 일반 비카페 자동 비공개 (유형 불문 단일 신호) — 카페면 노출리뷰에 '카페 정체성'(커피·디저트·베이커리·차)이
//   반드시 있다. 3건+ 노출리뷰에 그게 하나도 없으면 = 유형 불문 비카페(김밥집·음식점·냉장고매장·캠핑대리점·대학교
//   ·동명오염 등). 만화·식당·술집을 따로 코딩 안 해도 미래 어떤 유형이든 이 한 규칙으로 잡힌다.
//   ⚠️ FP 차단: BELONGS 그물을 매우 넓게(차/찻집 포함 — 한글 \b 안 먹혀 구체어 나열). '카페' 단어만 있어도 통과.
//      찻집(대추차·오미자차)이 안 죽게 차 계열 필수. 3건 미만(미검증)은 안 건드림.
const CAFE_BELONGS = /커피|라떼|라테|아메리카노|원두|에스프레소|핸드드립|콜드브루|드립|카페|까페|coffee|cafe|음료|스무디|에이드|찻집|차한잔|전통차|대추차|오미자|쌍화|유자차|생강차|한방차|꽃차|허브|녹차|말차|홍차|보이차|국화차|캐모마일|페퍼민트|루이보스|얼그레이|밀크티|버블티|아이스티|디저트|베이커리|제과|빵|식빵|소금빵|베이글|꽈배기|고로케|크로켓|핫도그|도넛|도너츠|케이크|케익|타르트|쿠키|마카롱|스콘|크로플|와플|파이|휘낭시에|마들렌|젤라또|아이스크림|빙수|푸딩|초콜릿|쇼콜라|아포가토|크림|우유|밀크|과자|전병|약과|한과|구움과자|샌드위치|브런치|토스트|크로와상|크루아상|프레첼/;
export async function healNonCafeByReview(): Promise<{ held: number; names: string[] }> {
  const cand = (await sql`SELECT id, name, synth_reviews FROM cafes WHERE published = true AND synth_reviews IS NOT NULL`) as any[];
  const kill: number[] = []; const names: string[] = [];
  for (const c of cand) {
    let sr: any = c.synth_reviews; try { sr = JSON.parse(sr); } catch { /* obj */ }
    const arr = Array.isArray(sr) ? sr : (sr && Array.isArray(sr.quotes) ? sr.quotes : []);
    const texts = (arr as any[]).map((q) => typeof q === "string" ? q : (q?.text || q?.quote || "")).filter(Boolean);
    if (texts.length < 3) continue;            // 미검증(노출리뷰<3) 보호
    if (texts.some((t) => CAFE_BELONGS.test(t))) continue; // 카페 정체성 1건이라도 있으면 보존
    kill.push(c.id); names.push(c.name);
  }
  if (kill.length) await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded' WHERE id = ANY(${kill})`;
  return { held: kill.length, names: names.slice(0, 12) };
}

// 🗺️ 수도권 박스 밖(비수도권 동명업체) 자동 제외 — 어느 적재 경로(발굴·마이닝·상가·수집)로 들어왔든
//   2시간마다 일괄 정리. 공개 게이트가 노출은 이미 막지만, DB 청결 + 합성·임베딩 낭비 제거 + 미래 경로까지 커버하는 안전망.
export async function healOutOfBox(): Promise<{ excluded: number; names: string[] }> {
  // ① 좌표 박스 밖
  const rows = (await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded', updated_at = now()
    WHERE lat IS NOT NULL AND NOT (lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9)
      AND pipeline_status IS DISTINCT FROM 'excluded'
    RETURNING name`) as any[];
  // ② 주소 시·도가 비수도권 — 좌표가 박스에 걸쳐도(천안·당진·춘천 등 경계지역) 주소가 진짜 근거.
  //    area가 수도권 시로 잘못 붙는 경계 카페 방어. 주소 '접두'로만 판단(경기 광주시 오인 방지 위해 '광주광역시'만).
  const adr = (await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded', updated_at = now()
    WHERE address IS NOT NULL
      AND (address LIKE '충청%' OR address LIKE '충북%' OR address LIKE '충남%'
        OR address LIKE '강원%' OR address LIKE '전라%' OR address LIKE '전북%' OR address LIKE '전남%'
        OR address LIKE '경상%' OR address LIKE '경북%' OR address LIKE '경남%'
        OR address LIKE '대전%' OR address LIKE '대구%' OR address LIKE '부산%' OR address LIKE '울산%'
        OR address LIKE '광주광역시%' OR address LIKE '세종%' OR address LIKE '제주%')
      AND pipeline_status IS DISTINCT FROM 'excluded'
    RETURNING name`) as any[];
  const names = [...rows, ...adr].map((r) => r.name).slice(0, 8);
  return { excluded: rows.length + adr.length, names };
}

// 🏷️ area 라벨 교정 — 발굴 당시 검색지역으로 area가 붙어 실제 주소 도시와 어긋나는 문제(경기 시/군·서울 구).
//   검색·필터·SEO·폐업체크 오염 + closure 오탐 유발. 주소에서 진짜 도시를 파싱해 교정(2시간마다 안전망).
export async function healAreaLabel(): Promise<{ fixed: number; names: string[] }> {
  // 서울: 주소 구 ≠ area 구 (인천 제외). substring으로 주소의 첫 구 토큰 추출.
  const seoul = (await sql`UPDATE cafes SET area = substring(address from '서울[^ ]* ([가-힣]+구)'), closure_misses = 0, updated_at = now()
    WHERE address LIKE '서울%' AND area LIKE '%구' AND area NOT LIKE '인천%'
      AND substring(address from '서울[^ ]* ([가-힣]+구)') IS NOT NULL
      AND substring(address from '서울[^ ]* ([가-힣]+구)') <> area
    RETURNING name`) as any[];
  // 경기: 주소 시/군 ≠ area 시/군.
  const gg = (await sql`UPDATE cafes SET area = substring(address from '경기[^ ]* ([가-힣]+[시군])'), closure_misses = 0, updated_at = now()
    WHERE address LIKE '경기%' AND (area LIKE '%시' OR area LIKE '%군')
      AND substring(address from '경기[^ ]* ([가-힣]+[시군])') IS NOT NULL
      AND substring(address from '경기[^ ]* ([가-힣]+[시군])') <> area
    RETURNING name`) as any[];
  const names = [...seoul, ...gg].map((r) => r.name).slice(0, 8);
  return { fixed: seoul.length + gg.length, names };
}

// 🔁 명백 중복 자동 해소 — 정규화 이름 동일 + 좌표 ~55m(같은 자리 같은 이름=같은 카페). 후기 많은 쪽만 남김(보수).
const normNameForDup = (s: string) => (s || "").replace(/\s/g, "").replace(/(\d+호?점|본점|지점)$/, "").toLowerCase();
export async function healExactDuplicates(): Promise<{ resolved: number; pairs: string[] }> {
  const rows = (await sql`SELECT id, name, lat, lng, COALESCE(synth_count,0) sc FROM cafes WHERE published AND lat IS NOT NULL`) as any[];
  const grp: Record<string, any[]> = {};
  for (const r of rows) {
    const k = normNameForDup(r.name) + "@" + Math.round(r.lat * 2000) + "_" + Math.round(r.lng * 2000);
    (grp[k] = grp[k] || []).push(r);
  }
  const pairs: string[] = [];
  let resolved = 0;
  for (const g of Object.values(grp)) {
    if (g.length < 2) continue;
    g.sort((a, b) => b.sc - a.sc || a.id - b.id);
    for (const loser of g.slice(1)) {
      await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded', updated_at = now() WHERE id = ${loser.id}`.catch(() => {});
      resolved++;
      if (pairs.length < 6) pairs.push(`${loser.name} → ${g[0].name}(유지)`);
    }
  }
  return { resolved, pairs };
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
  await loadLearnedTerms(); // 학습된 규칙 사전 캐시 갱신(TTL 60s — 핫패스 비용 0)
  const { raw, fromCache, apiFailed } = await gatherRaw(cafe, !!opts?.refresh);
  if (apiFailed) return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 API 오류/쿼터 — 보존", skipped: true };
  const sources = rawToSources(raw);
  if (sources.length === 0) {
    await sql`UPDATE cafes SET synth_grade='후보', synth_count=0, synth_updated=now(), published=false WHERE id=${cafe.id}`;
    return { id: cafe.id, name: cafe.name, ok: false, reason: "수집 0", grade: "후보", published: false, fromCache };
  }

  const area = await areaTermsFor(cafe.id, cafe.area);
  const addr = await addrFor(cafe.id);
  const decisions = await loadDecisions(cafe.id); // 과거 판정 AI 결정 유지(동명/무관 제거 영구)
  let result = collectAndSynthesize(cleanCafeName(cafe.name), area, sources, { decisions, address: addr });

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
      if (whitelist.size > 0) { result = collectAndSynthesize(cleanCafeName(cafe.name), area, sources, { whitelist, address: addr }); rescued = whitelist.size; }
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
  const result = collectAndSynthesize(cleanCafeName(cafe.name), await areaTermsFor(cafe.id, cafe.area), rawToSources(raw), { address: await addrFor(cafe.id) });
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
  const result = collectAndSynthesize(cleanCafeName(cafe.name), await areaTermsFor(cafe.id, cafe.area), rawToSources(raw), { decisions: merged, address: await addrFor(cafe.id) });
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
  const result = collectAndSynthesize(cleanCafeName(cafe.name), await areaTermsFor(cafe.id, cafe.area), rawToSources(raw), { address: await addrFor(cafe.id) });
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
      const coh = q.length >= 3 ? nameCoherence(cleanCafeName(r.name), q, [r.area]) : 1; // ★ storeResult와 동일하게 정제이름 사용 — '교동89 카페'·'토팡가 커피 로스터스' 같은 서술어 상호를 오염으로 오탐하던 버그 차단
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
