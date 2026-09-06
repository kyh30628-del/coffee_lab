import { NextRequest, NextResponse } from "next/server";
import { SIDO_GU, regionKeyFor, areaMatchesRegion } from "@/lib/regionList";
import { visitorBadges } from "@/lib/visitorMix";
import { sql, ensureSchema, ensureOnce } from "@/lib/db";
import { embedQuery, toVectorLiteral, hasEmbedKey } from "@/lib/embed";
import { hasSearchLLM, rerankWithClaude, lastRerankError, type SearchCand } from "@/lib/searchAgent";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";
import { loadCriteriaLists, getListSync } from "@/lib/criteriaLists";
import { parseQuery, loadGeoIndex, detectRegion, isCoreArea } from "@/lib/searchQuery";
import { isFranchise } from "@/lib/discover";
export const runtime = "nodejs";
export const maxDuration = 30;

// 자연어 카페 검색 (PRINCIPLES §1·§5): "떠오르는 느낌"으로도 찾게 한다.
// - 시맨틱: 임베딩(text-embedding-004) 코사인 유사도 — 사전에 없는 표현도 의미로 매칭.
// - exact/개념: 질의 토큰을 카페 텍스트·검증 리뷰에서 직접 매칭 + 느낌→신호 가산(근거 노출).
// 키 없으면 키워드 기반으로 자동 폴백. 점수는 DB 실제값만 사용(환각 금지).

// 서비스 범위(서울·경기·인천·강원·충북·충남·대전·세종) 밖 지역 키워드 — query 또는 region에 포함 시 미서비스 안내.
//   ⚠️ 범위를 늘리면 lib/criteriaListsBase.ts의 search.out_of_coverage와 DB 오버레이를 **둘 다** 손봐야 한다(2026-09-01 사고).
//   사전은 lib/criteriaLists.ts("search.out_of_coverage")가 단일출처(무배포 편집). 폴백=현재값.
//   감사수리: bare "광주"는 서비스 지역인 경기 광주시에 오경보 → 명시형만 유지.

function detectOutOfCoverage(q: string, region: string): string | null {
  const text = (q + " " + region).toLowerCase();
  for (const kw of getListSync("search.out_of_coverage")) {
    if (text.includes(kw)) {
      return `현재 동네 커피 노트는 서울·경기·인천·강원·충청(대전·세종)·부산·경남을 서비스합니다. '${kw}' 지역 카페는 아직 포함되어 있지 않아요.`;
    }
  }
  return null;
}

// 검색 개념 트리거 — 트리거 리스트는 lib/criteriaLists.ts("concept.*.triggers")가 단일출처(무배포 편집).
//   여기엔 개념 구조(축·용도·라벨)와 리터럴 사전키(triggersKey)만 둔다. c.triggers는 getter로 매 접근시 getListSync(폴백=현재값).
const CONCEPTS_BASE: { id: string; triggersKey: string; axis?: string; taste?: string; uses?: string[]; label: string }[] = [
  { id: "quiet", triggersKey: "concept.quiet.triggers", axis: "quiet", uses: ["혼자"], label: "조용·혼자" },
  { id: "work", triggersKey: "concept.work.triggers", axis: "work", uses: ["작업"], label: "작업·공부" },
  { id: "mood", triggersKey: "concept.mood.triggers", axis: "mood", uses: ["사진"], label: "분위기·감성" },
  { id: "dessert", triggersKey: "concept.dessert.triggers", axis: "dessert", uses: ["빵"], label: "디저트·빵" },
  { id: "brunch", triggersKey: "concept.brunch.triggers", axis: "brunch", uses: ["빵"], label: "브런치" }, // 2026-08-13: 전용 축 신설로 dessert 차용 해제
  { id: "roast", triggersKey: "concept.roast.triggers", axis: "roast", label: "직접로스팅·스페셜티" },
  { id: "space", triggersKey: "concept.space.triggers", axis: "space", label: "넓은공간" },
  { id: "pet", triggersKey: "concept.pet.triggers", axis: "pet", label: "반려동반" }, // 2026-08-13: 축 연결(전엔 트리거만 있고 점수 미반영)
  { id: "view", triggersKey: "concept.view.triggers", axis: "view", label: "뷰 좋은" },
  { id: "bakery", triggersKey: "concept.bakery.triggers", axis: "bakery", uses: ["빵"], label: "베이커리" }, // 2026-08-27 신설
  { id: "terrace", triggersKey: "concept.terrace.triggers", axis: "terrace", label: "테라스·야외" }, // 2026-08-27 신설
  // decisions#959(2026-09-04): "노키즈존" 검색 3사이클 연속 0건 — 개념 트리거 사전 미등재가 근본원인이었다.
  //   신설 축이라 기존 카페 char_scores 소급(scripts/backfill-newaxes.mjs류)은 별도 데이터 작업 필요.
  { id: "nokids", triggersKey: "concept.nokids.triggers", axis: "nokids", label: "노키즈존" },
  { id: "acidity", triggersKey: "concept.acidity.triggers", taste: "acidity", label: "산미 또렷" },
  { id: "body", triggersKey: "concept.body.triggers", taste: "body", label: "묵직·고소" },
  { id: "sweet", triggersKey: "concept.sweet.triggers", taste: "sweet", label: "단맛" },
];
const CONCEPTS: { id: string; triggers: string[]; axis?: string; taste?: string; uses?: string[]; label: string }[] =
  CONCEPTS_BASE.map((c) => ({ id: c.id, axis: c.axis, taste: c.taste, uses: c.uses, label: c.label, get triggers() { return getListSync(c.triggersKey); } }));

// 서울·경기 빠른경로 조회용 — 목록 자체는 lib/regionList.ts SIDO_GU 단일출처(복제 금지).
const SEOUL_GU = SIDO_GU["서울"];
const GYEONGGI_SI = SIDO_GU["경기"];
// 동네·상권명 → 행정구 매핑 (region 없는 검색에서 "홍대" → "마포구" 자동 추출)
const DONG_TO_GU: Record<string, string> = {
  "홍대": "마포구", "합정": "마포구", "망원": "마포구", "연남": "마포구", "상암": "마포구", "상수": "마포구", "공덕": "마포구",
  "이태원": "용산구", "한남": "용산구", "해방촌": "용산구", "경리단": "용산구",
  "성수": "성동구", "서울숲": "성동구", "왕십리": "성동구",
  "강남": "강남구", "신사": "강남구", "압구정": "강남구", "청담": "강남구", "역삼": "강남구", "논현": "강남구", "가로수길": "강남구",
  "서초": "서초구", "방배": "서초구", "반포": "서초구", "양재": "서초구",
  "잠실": "송파구", "석촌": "송파구",
  "을지로": "중구", "명동": "중구", "충무로": "중구",
  "종로": "종로구", "광화문": "종로구", "인사동": "종로구", "북촌": "종로구", "삼청": "종로구", "익선": "종로구",
  "신촌": "서대문구", "연희": "서대문구",
  "건대": "광진구", "뚝섬": "광진구",
  "여의도": "영등포구", "당산": "영등포구",
  "목동": "양천구", "마곡": "강서구",
  "가산": "금천구", "구로": "구로구",
};
// 광역명(SIDO_GU 키 — "서울"·"경기"·"강원"·"충북"·"충남"·"대전"·"세종"·"부산"·"경남"·"인천") → 하위 행정구역
// 목록(area 컬럼 표기 그대로, 접두 시도는 regionKeyFor로 "인천 중구" 형태 복원). 없으면 null.
//   🧭 2026-09-06(#1007): 예전엔 서울·경기만 하드코딩 배열로 알아 강원·충북·충남·경남 등 도(道) 단위
//   검색이 전량 0건이었다(discover.ts와 달리 SIDO_GU 전체를 안 훑음). SIDO_GU 단일출처를 그대로 순회하도록 일반화.
function metroAreaList(region: string): string[] | null {
  const guList = (SIDO_GU as Record<string, string[]>)[region];
  if (!guList) return null;
  return guList.map((gu) => regionKeyFor(region, gu));
}

// 🗺️ area↔region 매칭 — lib/regionList.ts areaMatchesRegion(단일출처, 2026-09-04)에 위임.
//   과거엔 인천/대전/부산 접두·서울·경기 광역명만 여기 따로 처리해 강원·충북·충남·경남 도 단위 검색이
//   전량 실패했다(#1007). 분류·매칭 로직 복제는 반복 사고의 원인이라 새로 만들지 않는다.
function inRegion(area: string, region: string): boolean {
  return areaMatchesRegion(area ?? "", region);
}
const occ = (text: string, kw: string) => (!text || !kw ? 0 : text.toLowerCase().split(kw.toLowerCase()).length - 1);

// exact(키워드) + 개념(느낌) 가산 — 두 모드 공통
// 리뷰 인용 배열은 두 모양으로 온다 — 객체 배열(원본 synth_reviews) 또는 문자열 배열(SQL에서 quote만 잘라온 것).
//   💰 후자가 기본 경로다(큰 컬럼 통째 전송 금지). 두 모양을 한 곳에서 흡수해 호출부가 신경 쓰지 않게 한다.
const quoteList = (rv: any): string[] =>
  Array.isArray(rv) ? rv.map((r: any) => (typeof r === "string" ? r : (r?.quote ?? ""))).filter(Boolean) : [];

function lexicalScore(c: any, tokens: string[], hitConcepts: typeof CONCEPTS) {
  const reviewText = quoteList(c.synth_reviews).join(" ");
  // 필드가중치는 criteria 단일출처(폴백 4/2.5/2/2/2/1.5/1.5/2/1). GET 진입 시 loadCriteria로 캐시 프라임(동기 읽기).
  //   ⚠️ reviewText(검증리뷰 인용)는 아래에서 별도 집계한다(#452) — occ()가 "이디야보다 낫다" 같은
  //   타사비교 문장도 그냥 매칭 카운트로 세어, 리뷰 단독 언급 1건만으로 exact 최댓값을 차지하고
  //   maxLex 정규화 분모가 돼 lexScore=100·gradeBonus까지 받아 실제 무관 카페가 진짜 의미매칭 카페를
  //   역전하던 버그(테라커피 174.4점 1위 vs 이디알베이커리카페 70.8점, "이디야" 검색 재현).
  const fields: [string, number][] = [
    [c.name ?? "", getCriterionSync("search.field_weight.name")], [c.synth_identity ?? "", getCriterionSync("search.field_weight.identity")], [c.signature ?? "", getCriterionSync("search.field_weight.signature")], [c.note ?? "", getCriterionSync("search.field_weight.note")],
    [c.vibe ?? "", getCriterionSync("search.field_weight.vibe")], [c.uses ?? "", getCriterionSync("search.field_weight.uses")], [c.beans ?? "", getCriterionSync("search.field_weight.beans")], [c.area ?? "", getCriterionSync("search.field_weight.area")],
  ];
  let coreExact = 0;
  const tokenHit = new Set<string>();
  for (const tok of tokens) for (const [text, w] of fields) { const n = occ(text, tok); if (n > 0) { coreExact += n * w; tokenHit.add(tok); } }

  let reviewExact = 0;
  const reviewWeight = getCriterionSync("search.field_weight.review");
  for (const tok of tokens) { const n = occ(reviewText, tok); if (n > 0) { reviewExact += n * reviewWeight; tokenHit.add(tok); } }
  // 리뷰 인용문 매칭이 유일한 근거(다른 필드는 전혀 안 맞음)면 랭킹 점수에서 제외 — 카페명/정체성 등
  // 실제 필드가 이미 맞은 경우엔 기존처럼 리뷰 가중치도 그대로 합산(회귀 없음).
  // ⚠️ 2026-08-10 재교정: 예전엔 리뷰에만 걸리면 exact를 **0으로 지웠다**(#452 대응).
  //   그 조치의 원인은 "리뷰 언급 1건이 maxLex 정규화 분모를 차지해 점수가 폭주"하는 **스케일 문제**였는데,
  //   랭킹을 RRF(순위 융합)로 바꾸면서 그 원인 자체가 사라졌다. 그런데 0으로 지우는 규칙만 남아
  //   **리뷰 본문 검색을 구조적으로 막고 있었다** — '경의선숲길'이 리뷰에만 있는 카페가 아예 탈락했다.
  //   → 지우지 않고 **감쇠**한다. 이름·정체성 매칭보다는 약하게, 그러나 검색은 되게.
  const reviewOnly = coreExact === 0 && reviewExact > 0;
  const exact = reviewOnly ? reviewExact * 0.5 : coreExact + reviewExact;

  let concept = 0;
  const cs = c.char_scores ?? {};
  const reasons: string[] = [];
  for (const cc of hitConcepts) {
    let add = 0;
    if (cc.axis && (cs[cc.axis] ?? 0) > 0) add += Math.min(cs[cc.axis], getCriterionSync("search.char_axis.cap")) * getCriterionSync("search.char_axis.scale");
    if (cc.taste) { const t = c[`synth_${cc.taste}`]; if (t != null) add += t >= getCriterionSync("search.taste.high") ? getCriterionSync("search.taste.high_bonus") : t >= getCriterionSync("search.taste.mid") ? getCriterionSync("search.taste.mid_bonus") : 0; }
    if (cc.uses && c.uses && cc.uses.some((u) => String(c.uses).includes(u))) add += 6;
    if (add > 0) { concept += add; reasons.push(`'${cc.label}' 느낌`); }
  }
  // 📌 근거는 '단어 이름'이 아니라 **실제 리뷰 문장**으로 보여준다(CEO 요구: 리뷰를 쉽게 찾을 수 있게).
  //   예전엔 "리뷰에 '카페' 언급"처럼 아무 정보도 없는 근거만 떠서, 왜 이 카페가 나왔는지 알 수 없었다.
  const quotes = quoteList(c.synth_reviews);
  const reviewTok = tokens.find((t) => occ(reviewText, t) > 0);
  let snippet: string | null = null;
  if (reviewTok) {
    const hitQuote = quotes.find((qt) => occ(qt, reviewTok) > 0) ?? "";
    // 매칭어 주변만 잘라 보여준다(문장 전체는 길어 화면을 잡아먹는다)
    const at = hitQuote.toLowerCase().indexOf(reviewTok.toLowerCase());
    const from = Math.max(0, at - 22);
    snippet = (from > 0 ? "…" : "") + hitQuote.slice(from, from + 74).trim() + (hitQuote.length > from + 74 ? "…" : "");
    reasons.push(`리뷰: ${snippet}`);
  } else if (tokenHit.size > 0) reasons.push(`'${Array.from(tokenHit)[0]}' 일치`);
  return { exact, concept, reasons, snippet, matchedTerm: reviewTok ?? null, reviewOnly };
}

// 💰 synth_reviews는 통째로 싣지 않고 **SQL 안에서 quote만 잘라** 받는다(TOAST 1.9GB 컬럼 → 인용문 몇 줄).
//   후보 80건 × 리뷰 전체를 앱으로 옮기던 것이 검색 응답 지연·전송비의 주범이었다.
const FIELDS = `id, name, area, synth_grade, synth_count, visitor_n, visitor_trip, visitor_local, synth_identity, signature, note, vibe, uses, beans, char_scores, jsonb_path_query_array(synth_reviews, '$[*].quote') AS synth_reviews, synth_acidity, synth_body, synth_sweet`;

// 🧳🏠 방문객 성격 배지 — /api/cafes와 **같은 규약**(붙는 곳만 "T"/"L"/"TL"). 지도앱이 한 컴포넌트로 렌더한다.
const vbOf = (c: any): string | undefined => {
  const v = visitorBadges({ n: c.visitor_n ?? 0, trip: c.visitor_trip ?? 0, local: c.visitor_local ?? 0 })
    .map((b) => (b.key === "trip" ? "T" : "L")).join("");
  return v || undefined;
};

// 등급 가중치 — '검증'이 '참고'보다 위 노출(동네 커피 노트의 약속). 절대 우선은 아니고 가산.
//   임계값은 DB 기준(criteria) 단일출처, 폴백=검증25/참고8. GET 진입 시 loadCriteria로 캐시 프라임.
const gradeBonus = (g?: string): number => (g === "검증" ? getCriterionSync("search.grade_bonus.verified") : g === "참고" ? getCriterionSync("search.grade_bonus.reference") : 0);
// 일반 카테고리·개념 단어 — 이런 검색은 '이름이 그 단어인 카페'가 아니라 '그 부류 옥석'을 원함.
//   → 이름 직접매칭(9999 최상단 고정)을 건너뛰어 등급순 노출이 살게 한다(참고가 검증 위로 가던 버그 차단).
const CATEGORY_WORD = new Set(["로스터리", "로스터스", "로스터즈", "로스팅", "핸드드립", "드립", "베이커리", "디저트", "브런치", "스페셜티", "에스프레소", "아메리카노", "라떼", "콜드브루", "원두", "제과", "빵집", "북카페", "카페", "커피", "커피숍", "커피전문점"]);
// 브랜드 상호가 영문(STARBUCKS 등)으로 등록돼 한글 질의(스타벅스)와 표기가 달라 이름 직접매칭이 누락되던 버그(#120) —
//   실제 상호가 그 브랜드를 리뷰에서만 언급한 무관 카페보다 랭킹이 밀리던 원인. 한글↔영문 별칭을 매칭에 포함시켜 방지.
const BRAND_ALIAS: Record<string, string[]> = {
  "스타벅스": ["starbucks"], "이디야": ["ediya"], "투썸플레이스": ["twosome", "twosomeplace"],
  "커피빈": ["coffeebean", "thecoffeebean"], "폴바셋": ["paulbassett"], "블루보틀": ["bluebottle"],
  "할리스": ["hollys"], "탐앤탐스": ["tomntoms", "tomandtoms"], "빽다방": ["paikscoffee"],
  "메가커피": ["megacoffee", "megamgccoffee"], "컴포즈커피": ["composecoffee"], "매머드커피": ["mammothcoffee"],
};

// 체인·다지점 브랜드 독점 방지 — "로스터리" 같은 카테고리 검색 상위권이 한 브랜드 지점들로만 채워지던 버그(#120).
//   상호 첫 단어를 브랜드 키로 보고 같은 키는 최대 CHAIN_CAP개까지만 순위를 지키고, 초과분은 뒤로 밀어(제거 아님)
//   다른 브랜드가 상위에 섞이게 한다. 상호 직접검색(아래 이름매칭 블록)은 이 함수 이후에 추가되므로 영향 없음.
// CHAIN_CAP은 criteria 단일출처(폴백 2). GET 진입 시 loadCriteria 프라임 후 diversifyChains에서 동기 읽기.
// 마지막 단어(지점명: "역삼점" 등)를 뺀 나머지를 공백 없이 합쳐 키로 삼는다 —
// "로스터리 락온"(2단어 브랜드) 지점이 "로스터리 락온 역삼점"/"로스터리락온 역삼점"처럼 표기가 섞여도
// 같은 체인 키로 묶이게 한다(기존엔 첫 단어만 써서 "로스터리"↔"로스터리락온"으로 갈려 CHAIN_CAP이 무력화됨).
// 단, 마지막 단어가 "점"으로 끝나는 지점 접미(점/지점/역점/호점 등) 패턴일 때만 체인으로 간주한다 —
// 그렇지 않으면 "카페 물루"처럼 "카페/더/베이커리" 같은 일반명사를 상호 앞단어로 쓰는 독립카페까지
// 같은 체인 키로 묶여 diversifyChains에서 부당하게 하위로 밀리는 오탐이 발생한다(#512, 검증카페 261곳 영향).
const BRANCH_SUFFIX_RE = /점$/;
const chainKeyOf = (name: string): string => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name ?? "";
  const last = parts[parts.length - 1];
  if (!BRANCH_SUFFIX_RE.test(last)) return name ?? "";
  return parts.slice(0, -1).join("");
};
function diversifyChains<T extends { name: string }>(list: T[]): T[] {
  const chainCap = getCriterionSync("search.chain_cap");
  const count = new Map<string, number>();
  const kept: T[] = [];
  const overflow: T[] = [];
  for (const r of list) {
    const key = chainKeyOf(r.name);
    const n = count.get(key) ?? 0;
    if (n < chainCap) { kept.push(r); count.set(key, n + 1); } else overflow.push(r);
  }
  return [...kept, ...overflow];
}

// Claude 후보용: char_scores → 한국어 특징 태그, 검증 리뷰 → 인용
const AXIS_LABEL: Record<string, string> = Object.fromEntries(CONCEPTS.filter((c) => c.axis).map((c) => [c.axis as string, c.label]));
function charTags(cs: any): string {
  if (!cs || typeof cs !== "object") return "";
  return Object.entries(cs).filter(([, v]) => Number(v) > 0).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 4).map(([k]) => AXIS_LABEL[k] ?? k).join(", ");
}
function quotesOf(reviews: any): string {
  return quoteList(reviews).slice(0, 3).join(" / ");
}

// 검색 캐시: (질문+지역)별 결과를 저장해 같은/비슷한 질문은 LLM·임베딩 재계산 없이 즉시 응답.
let cacheReady = false;
async function ensureCache() {
  if (cacheReady) return;
  // 💰 콜드스타트마다 DDL 반복 금지(2026-08-20 전수 적용) — 배포 단위 1회.
  await ensureOnce("search.ensureCache", async () => {
  await sql`CREATE TABLE IF NOT EXISTS search_cache (qkey TEXT PRIMARY KEY, payload JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`;
  });
  cacheReady = true;
}
// 검색 캐시 유효시간은 criteria 단일출처(폴백 3시간). GET 진입 시 loadCriteria 프라임 후 동기 읽기.
//   12→3시간: 비공개 카페가 캐시에 남는 시간 단축(heal이 비공개 발생 시 즉시 무효화도 함)

// 🔎 검색 수요 로깅(비차단) — 무엇을 찾고 결과가 충분했는지 적재. cron-demand가 수요-공급 갭 분석.
//   내부 헬스체크 호출(X-Internal-Check 헤더)은 실사용자 수요가 아니므로 제외 — 아니면 수요분석이 봇을 실사용자로 오인(#113).
function logSearch(q: string, region: string, results: number, mode: string, internal: boolean, aiErr?: string | null) {
  if (!q || q.length < 1 || internal) return;
  sql`CREATE TABLE IF NOT EXISTS search_log (id BIGSERIAL PRIMARY KEY, q TEXT, region TEXT, results INT, mode TEXT, ts TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  sql`ALTER TABLE search_log ADD COLUMN IF NOT EXISTS ai_err TEXT`.catch(() => {});
  sql`INSERT INTO search_log (q, region, results, mode, ai_err) VALUES (${q.slice(0, 80)}, ${(region || "").slice(0, 40)}, ${results}, ${mode}, ${aiErr ?? null})`.catch(() => {});
}

export async function GET(req: NextRequest) {
  // ⚡ 두 캐시 프라임 병렬(독립, 동기 getter 사용 전에 완료). 결과 불변.
  await Promise.all([loadCriteria(), loadCriteriaLists()]);
  try {
    await Promise.all([ensureSchema(), ensureCache()]); // ⚡ 독립 DDL 프라임 병렬(cafes·search_cache)
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const region = (req.nextUrl.searchParams.get("region") ?? "").trim();
    if (q.length < 1) return NextResponse.json({ ok: false, error: "검색어 필요" }, { status: 400 });
    const isInternalCheck = !!req.headers.get("x-internal-check"); // 헬스체크 대표질의 — search_log 수요 집계에서 제외

    const ql = q.toLowerCase();
    // 🔤 불용어 제거·조사 절단(lib/searchQuery) — '카페·맛집·좋은'이 전 카페에 매칭돼 랭킹을 지배하던 문제 해결.
    const parsed = parseQuery(q);
    const tokens = parsed.tokens;
    const hitConcepts = CONCEPTS.filter((c) => c.triggers.some((t) => ql.includes(t)));
    // 질의 자체가 개념어인가('카공'·'공부'). 부분 상호매칭 바닥값을 뺄지 판단하는 데만 쓴다.
    const pureConceptQuery = hitConcepts.some((c) => c.triggers.some((t) => ql.trim() === t));
    let effectiveRegion = region;
    let regionExplicit = !!region;
    if (!effectiveRegion) {
      // ① 기존 하드코딩 사전(빠른 경로·상권 별칭: 홍대·경리단 등 행정동에 없는 이름을 커버)
      for (const tok of tokens) {
        if (DONG_TO_GU[tok]) { effectiveRegion = DONG_TO_GU[tok]; break; }
        if (SEOUL_GU.includes(tok)) { effectiveRegion = tok; break; }
        if (GYEONGGI_SI.includes(tok)) { effectiveRegion = tok; break; }
      }
      // ② DB 실데이터(dong/area) 전수 인덱스 — '우면동·자양동'처럼 사전에 없던 동을 커버(정확도 실패의 주원인).
      if (!effectiveRegion) {
        const geo = await loadGeoIndex();
        // 지역 판정은 **원형 토큰**으로 — 절단본을 쓰면 '고양이'가 '고양'이 돼 고양시로 잡힌다(실측 사고).
        const hit = detectRegion(parsed.rawTokens, geo);
        if (hit) effectiveRegion = hit.area;
      }
      regionExplicit = !!effectiveRegion;
    }

    // 캐시 조회: 같은 질문+지역이면 즉시 반환(LLM·임베딩 호출 0). ensureCache는 위 Promise.all에서 이미 프라임됨.
    const qkey = q.toLowerCase().replace(/\s+/g, " ").trim() + "|" + effectiveRegion;
    const nocache = req.nextUrl.searchParams.get("nocache") === "1";
    if (!nocache) {
      const hit = (await sql`SELECT payload FROM search_cache WHERE qkey=${qkey} AND created_at > now() - (${getCriterionSync("search.cache_ttl_hours")} || ' hours')::interval LIMIT 1`)[0];
      if (hit?.payload && Array.isArray(hit.payload.results) && hit.payload.results.length > 0) {
        logSearch(q, region, Number(hit.payload?.count ?? 0), "cache", isInternalCheck);
        return NextResponse.json({ ...hit.payload, cached: true }, {
          headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
        });
      }
    }
    const shortRaw = effectiveRegion.replace(/(특별시|광역시|시|군|구)$/, "");
    const short = shortRaw.length >= 2 ? shortRaw : effectiveRegion; // '중구'→'중'(1자)는 중랑구까지 오매칭 → 전체이름 유지
    const p1 = `%${effectiveRegion}%`, p2 = `%${short}%`;
    const metroList = metroAreaList(effectiveRegion);

    let mode: "semantic" | "keyword" | "ai" = "keyword";
    let scored: any[] = [];
    const byId = new Map<number, any>(); // Claude 재정렬용 원본 row 보관

    // ===== 시맨틱(임베딩) 경로 =====
    if (hasEmbedKey()) {
      try {
        const qvec = await embedQuery(q);
        if (qvec) {
          const lit = toVectorLiteral(qvec);
          const rows = metroList
            ? (await sql.query(
                `SELECT ${FIELDS}, 1 - (embedding <=> $1::vector) AS sim
                 FROM cafes
                 WHERE published = true AND embedding IS NOT NULL
                   AND area = ANY($2::text[])
                 ORDER BY embedding <=> $1::vector
                 LIMIT 80`,
                [lit, metroList],
              )) as unknown as any[]
            : (await sql.query(
                `SELECT ${FIELDS}, 1 - (embedding <=> $1::vector) AS sim
                 FROM cafes
                 WHERE published = true AND embedding IS NOT NULL
                   AND ($2 = '' OR area ILIKE $3 OR area ILIKE $4)
                 ORDER BY embedding <=> $1::vector
                 LIMIT 80`,
                [lit, effectiveRegion, p1, p2],
              )) as unknown as any[];
          // 🎯 #979(#977 후속) — 개념 축 질의('노키즈존' 등)는 임베딩 유사도가 약해 그 축을 가진 카페가
          //   top-80 밖으로 밀려나면 concept/axis 재랭킹 자체가 기회를 못 받는다(임베딩이 뽑은 후보 안에서만 재랭킹하므로).
          //   → char_scores에 해당 축 점수(>0)를 가진 카페를 별도로 보강 조회해 후보풀에 합류시킨다.
          //   (char_scores는 축마다 항상 키가 존재하고 값이 0일 수 있어 키 존재만으론 부족 — 값>0을 직접 확인.)
          const conceptAxes = Array.from(new Set(hitConcepts.filter((c) => c.axis).map((c) => c.axis as string)));
          if (conceptAxes.length > 0) {
            const axisRows = metroList
              ? (await sql.query(
                  `SELECT ${FIELDS}, 1 - (embedding <=> $1::vector) AS sim
                   FROM cafes
                   WHERE published = true AND embedding IS NOT NULL
                     AND area = ANY($2::text[])
                     AND EXISTS (SELECT 1 FROM unnest($3::text[]) ax WHERE (char_scores->>ax)::numeric > 0)
                   ORDER BY (SELECT MAX((char_scores->>ax)::numeric) FROM unnest($3::text[]) ax) DESC
                   LIMIT 40`,
                  [lit, metroList, conceptAxes],
                )) as unknown as any[]
              : (await sql.query(
                  `SELECT ${FIELDS}, 1 - (embedding <=> $1::vector) AS sim
                   FROM cafes
                   WHERE published = true AND embedding IS NOT NULL
                     AND ($2 = '' OR area ILIKE $3 OR area ILIKE $4)
                     AND EXISTS (SELECT 1 FROM unnest($5::text[]) ax WHERE (char_scores->>ax)::numeric > 0)
                   ORDER BY (SELECT MAX((char_scores->>ax)::numeric) FROM unnest($5::text[]) ax) DESC
                   LIMIT 40`,
                  [lit, effectiveRegion, p1, p2, conceptAxes],
                )) as unknown as any[];
            const seenIds = new Set(rows.map((r) => r.id));
            for (const r of axisRows) if (!seenIds.has(r.id)) { rows.push(r); seenIds.add(r.id); }
          }
          if (rows.length > 0) {
            mode = "semantic";
            for (const c of rows) byId.set(c.id, c);
            const lex = rows.map((c) => ({ c, ...lexicalScore(c, tokens, hitConcepts) }));
            // #219: exact+concept은 필드가중치 누적이라 상한이 없어(다중토큰·다중필드 매치 시 수십점) gradeBonus 격차(17점)를
            //   쉽게 뭉개고 참고등급이 검증등급 위로 노출되던 버그 — sim*100과 같은 0~100 스케일로 후보군 내 상대값 정규화해
            //   AI재정렬 경로(아래 rankScore 0~100 정규화+gradeBonus)와 두 경로를 일치시킨다.
            const maxLex = Math.max(1, ...lex.map((l) => l.exact + l.concept));
            // #532: 어휘일치가 전혀 없는(lexMatched===false) 후보는 의미유사도(sim) 단독값만으로 순위가 매겨져
            //   무관 질의(오타·무의미 문자열·미보유 프랜차이즈명)에도 하한 없이 24건이 검증배지와 함께 확정노출되던 버그.
            //   sim이 이 하한 미만이면 후보에서 제외 — 어휘일치가 있는 후보(브랜드 상호 부분일치 등)는 그대로 둔다.
            const semanticFloor = getCriterionSync("search.semantic_floor.min_sim");
            // 🔀 순위 융합(RRF) — 실측 문제: sim이 전 후보 66~81%에 뭉쳐 변별력이 없는데(스케일 0~100),
            //   어휘점수는 정규화 후 0~100 + 등급가산 25라 **어휘가 의미를 항상 압도**했다. 그래서 리뷰 문장으로
            //   검색해도 그 카페가 42%만 1위였다. 점수를 더하는 대신 **각 랭킹의 등수**를 섞으면 스케일 문제가 사라진다.
            //   RRF: score = Σ 1/(k + rank). k=20(후보 80개 기준 상위권을 완만하게 우대).
            const RRF_K = 20;
            const simRank = new Map<string, number>();
            [...lex].sort((a, b) => (Number(b.c.sim) || 0) - (Number(a.c.sim) || 0))
              .forEach((l, i) => simRank.set(String(l.c.id), i));
            const lexRank = new Map<string, number>();
            [...lex].sort((a, b) => (b.exact + b.concept) - (a.exact + a.concept))
              .forEach((l, i) => lexRank.set(String(l.c.id), i));
            // 🎯 2026-08-31 — 개념 질의('카공'·'조용한')에서 **실제로 그런 카페인가**를 순위에 넣는다.
            //   실측 문제: "카공" 1위가 카페 공명(work 59)이고, 디벙크(work 123 · "콘센트 갖춘 작업·공부하기 좋은 곳")가
            //   4위였다. 임베딩이 '카공'과 '카페 공명'을 이름 모양으로 가깝게 봐서 sim 랭킹이 그렇게 만든 것이다.
            //   concept 점수는 상한 18점이라 lexRank 안에서 묻힌다 → **독립 랭킹**으로 올려야 힘을 갖는다.
            //   개념이 안 걸린 질의(상호·지역 검색)에는 적용하지 않는다 — 그쪽 동작은 건드리지 않는다.
            const axisRank = new Map<string, number>();
            if (hitConcepts.length > 0) {
              const axisOf = (c: any) => hitConcepts.reduce((m, cc) =>
                Math.max(m, cc.axis ? Number((c.char_scores ?? {})[cc.axis] ?? 0) : 0), 0);
              [...lex].sort((a, b) => axisOf(b.c) - axisOf(a.c))
                .forEach((l, i) => axisRank.set(String(l.c.id), i));
            }
            scored = lex
              .map(({ c, exact, concept, reasons, snippet, reviewOnly }) => {
                const sim = Number(c.sim) || 0;
                // #216: 키워드·느낌 완전 불일치(exact+concept===0)면 등급가산 미적용 — 브랜드명(이디야·컴포즈 등)
                //   DB無매칭 검색 시 의미유사도만 있는 무관 카페가 gradeBonus(+25)로 검증배지·고득점 1위로
                //   오인 노출되던 왜곡 차단. 키워드 폴백 경로(아래)와 동일한 가드로 두 경로를 일치시킨다.
                const lexMatched = exact + concept > 0;
                // #727: reviewOnly(다른 필드는 전혀 안 맞고 리뷰 인용문의 비교언급 1건뿐)는 lexMatched지만
                //   "진짜 매칭"이 아니다 — semantic_floor 면제·gradeBonus 지급 대상에서는 제외한다(qualifies).
                //   RRF 랭킹(rLex)에는 그대로 반영해 리뷰 본문 검색 자체는 계속 되게 한다(2026-08-10 재교정 유지).
                const qualifies = (exact > 0 && !reviewOnly) || concept > 0;
                // RRF 융합값을 0~100 스케일로 환산(두 랭킹 모두 1위면 100). 어휘 미매칭은 의미 랭킹만 반영.
                const rSim = simRank.get(String(c.id)) ?? lex.length;
                const rLex = lexMatched ? (lexRank.get(String(c.id)) ?? lex.length) : lex.length * 2;
                const rAxis = axisRank.size ? (axisRank.get(String(c.id)) ?? lex.length) : null;
                const parts = rAxis === null ? [rSim, rLex] : [rSim, rLex, rAxis];
                const rrf = parts.reduce((sum, r) => sum + 1 / (RRF_K + r), 0) / (parts.length / (RRF_K + 0)) * 100;
                // 🗺️ 지역 미지정 질의의 외곽 상위노출 방지 — 지역을 *명시한* 질의엔 적용하지 않는다.
                //   (실측: "크루아상 맛집" 1위가 이천시, "고양이 있는 카페" 1위가 강화군이었다.)
                const corePrior = !regionExplicit && isCoreArea(c.area) ? 6 : 0;
                const total = rrf + (qualifies ? gradeBonus(c.synth_grade) : 0) + corePrior;
                const why = [`의미 유사 ${Math.round(sim * 100)}%`, ...reasons];
                return { sim, qualifies, item: { id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count, identity: c.synth_identity, vb: vbOf(c), score: Math.round(total * 10) / 10, reasons: why.slice(0, 3), snippet } };
              })
              .filter((x) => x.qualifies || x.sim >= semanticFloor)
              .map((x) => x.item);
          }
        }
      } catch {
        // 임베딩 실패 → 키워드 폴백
      }
    }

    // ===== 키워드/개념 폴백 =====
    if (scored.length === 0) {
      // 💰 2026-08-10 비용 수리: 예전엔 `SELECT <synth_reviews 포함 전 필드> FROM cafes WHERE published`로
      //   공개 13,484곳의 **큰 컬럼(TOAST 1.9GB)을 통째로 끌어왔다** — 임베딩이 실패할 때마다 발생하는
      //   전수 blob 전송으로, 사장님이 금지한 패턴이 검색 경로 한복판에 있었다.
      //   → 어휘 후보를 **SQL에서 먼저 좁히고**(작은 컬럼 ILIKE, 상한 400) 그 안에서만 점수를 낸다.
      //   리뷰 인용은 SQL 안에서 잘라 받는다(통째 전송 금지).
      const likes = tokens.slice(0, 6).map((t) => `%${t}%`);
      const rows = likes.length === 0 ? [] : ((await sql.query(
        `SELECT id, name, area, synth_grade, synth_count, synth_identity, signature, note, vibe, uses, beans,
                char_scores, synth_acidity, synth_body, synth_sweet,
                jsonb_path_query_array(synth_reviews, '$[*].quote') AS synth_reviews
         FROM cafes
         WHERE published = true
           AND (name ILIKE ANY($1::text[]) OR synth_identity ILIKE ANY($1::text[]) OR signature ILIKE ANY($1::text[])
                OR note ILIKE ANY($1::text[]) OR vibe ILIKE ANY($1::text[]) OR uses ILIKE ANY($1::text[])
                OR beans ILIKE ANY($1::text[]) OR area ILIKE ANY($1::text[]))
         LIMIT 400`,
        [likes],
      )) as unknown as any[]);
      for (const c of rows) {
        if (!inRegion(c.area ?? "", effectiveRegion)) continue;
        const { exact, concept, reasons, snippet, reviewOnly } = lexicalScore(c, tokens, hitConcepts);
        // #727: reviewOnly 단독 매칭(리뷰 인용문의 타사 비교언급뿐)은 등급가산 대상에서 제외(semantic 경로와 일치).
        const qualifies = (exact > 0 && !reviewOnly) || concept > 0;
        const total = exact + concept + (qualifies ? gradeBonus(c.synth_grade) : 0);
        if (exact + concept <= 0) continue;
        byId.set(c.id, c);
        scored.push({ id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count, identity: c.synth_identity, vb: vbOf(c), score: Math.round(total * 10) / 10, reasons: reasons.slice(0, 3), snippet });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // ===== Claude Sonnet 맥락 재정렬 (콘솔 API 키 있을 때) =====
    // 후보를 압축해 보내고, 질문 의도에 맞는 곳만 선별·정렬. 실패/키없음 시 위 점수순 폴백.
    let results = scored.slice(0, 24);
    let aiErr: string | null = null; // 결재#135: rerankWithClaude 실패 사유(검색 로그에 함께 적재)
    if (hasSearchLLM() && scored.length > 0) {
      const cands: SearchCand[] = scored.slice(0, 25).map((s) => {
        const c = byId.get(s.id) ?? {};
        return { id: s.id, name: s.name, area: s.area, identity: c.synth_identity ?? s.identity, tags: charTags(c.char_scores), quotes: quotesOf(c.synth_reviews) };
      });
      const ranked = await rerankWithClaude(q, region, cands);
      aiErr = ranked ? null : lastRerankError(); // await 직후 즉시 캡처 — 동시 요청 간 모듈 전역상태 덮어쓰기 방지
      if (ranked && ranked.length > 0) {
        mode = "ai";
        // ⚠️ P0(2026-07-05): cafes.id=bigint → neon이 문자열("8744")로 반환하는데 Claude 재정렬은 숫자 id를 준다.
        //   양쪽을 String으로 정규화하지 않으면 sById.get(숫자)가 문자열키 맵에서 전량 미스 → 재정렬 결과 전부 탈락 → 개념검색 count 0.
        const sById = new Map(scored.map((s) => [String(s.id), s]));
        // Claude 랭킹은 의미적합도만 보고 등급(검증/참고) 신호를 못 받아, "디저트 맛집" 같은 질의에서
        // 참고 카페가 검증 카페보다 위로 가던 버그(B). LLM 순위(0~100 환산, 결정론)에 등급가산을 더해 재정렬.
        const withGrade = (ranked
          .map((r, i) => {
            const s = sById.get(String(r.id));
            if (!s) return null;
            const rankScore = ((ranked.length - i) / ranked.length) * 100 + gradeBonus(s.grade);
            return { ...s, reasons: r.reason ? [r.reason] : s.reasons, _rankScore: rankScore };
          })
          .filter(Boolean) as any[]);
        withGrade.sort((a, b) => b._rankScore - a._rankScore);
        results = withGrade.map(({ _rankScore, ...rest }) => rest).slice(0, 24);
      }
    }
    results = diversifyChains(results);

    // ===== 상호(카페명) 직접 매칭 — 시맨틱/재정렬이 놓치는 '이름 검색'을 항상 보장(최상단 고정) =====
    //   '마루빈'처럼 의미가 없는 상호는 임베딩으로 안 떠서 사라지던 버그 차단. 띄어쓰기 무시 매칭.
    //   ⚠️ 단, '로스터리·핸드드립·베이커리' 같은 카테고리·개념 단어 검색은 *이름이 그 단어인 카페*가 아니라
    //   '그 부류 옥석'을 원하므로 이름매칭 9999 고정을 건너뛴다(참고 카페가 검증 위로 가던 버그 차단).
    try {
      const dq = ql.replace(/\s+/g, "");
      const isCategory = CATEGORY_WORD.has(dq) || tokens.every((t) => CATEGORY_WORD.has(t));
      if (dq.length >= 2 && !isCategory) {
        // 브랜드가 영문 상호로 등록된 경우(STARBUCKS 등)를 대비해 한글 질의에 별칭을 더해 함께 매칭.
        const dqVariants = Array.from(new Set([dq, ...(BRAND_ALIAS[dq] ?? [])]));
        const likePatterns = dqVariants.map((v) => `%${v}%`);
        const nameRows = metroList
          ? (await sql.query(
              `SELECT ${FIELDS} FROM cafes WHERE published = true
                 AND replace(lower(name), ' ', '') LIKE ANY($1::text[])
                 AND area = ANY($2::text[])
               ORDER BY (replace(lower(name), ' ', '') = ANY($3::text[])) DESC, (synth_grade = '검증') DESC, synth_count DESC NULLS LAST LIMIT 8`,
              [likePatterns, metroList, dqVariants],
            )) as unknown as any[]
          : (await sql.query(
              `SELECT ${FIELDS} FROM cafes WHERE published = true
                 AND replace(lower(name), ' ', '') LIKE ANY($1::text[])
                 AND ($2 = '' OR area ILIKE $3 OR area ILIKE $4)
               ORDER BY (replace(lower(name), ' ', '') = ANY($5::text[])) DESC, (synth_grade = '검증') DESC, synth_count DESC NULLS LAST LIMIT 8`,
              [likePatterns, effectiveRegion, p1, p2, dqVariants],
            )) as unknown as any[];
        if (nameRows.length > 0) {
          const byId = new Map(results.map((r: any) => [r.id, r]));
          // 정확히 이름이 일치하는 것만 최상단 고정(9999). 부분일치는 등급가점만 받아 일반 랭킹과 경쟁.
          const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "");
          const variantSet = new Set(dqVariants);
          let boosted = false;
          const nameResults: any[] = [];
          for (const c of nameRows) {
            const exactName = variantSet.has(norm(c.name));
            const existing = byId.get(c.id);
            if (existing) {
              // 이미 시맨틱/키워드 결과에 낮은 점수로 들어있던 정확매칭 후보 — 스킵하지 말고 9999로 승격(버그 N).
              if (exactName && existing.score < 9999) { existing.score = 9999; boosted = true; }
              continue;
            }
            nameResults.push({
              id: c.id, name: c.name, area: c.area, grade: c.synth_grade, count: c.synth_count, vb: vbOf(c),
              identity: c.synth_identity,
              // 🔴 2026-08-31 — 부분 상호매칭의 200점 바닥값이 개념 결과(최대 ~108)를 구조적으로 압도했다.
              //   실측: "공부" 1위가 공부차파크(참고등급 · work 23 · 정체성 '사진 찍기 좋은 분위기') 231점,
              //   2위(진짜 작업카페) 110점. 이름에 우연히 '공부'가 들어갔을 뿐인데 2배 격차로 1위였다.
              //   → **질의 자체가 개념어일 때만** 바닥값을 빼고 일반 결과와 같은 스케일로 경쟁시킨다.
              //   정확 상호 일치(9999)는 그대로 — 그 카페를 찾는 사람의 의도는 명확하다.
              //   '공부차' 같은 부분 상호 검색도 그대로 — 질의가 트리거와 정확히 같지 않으면 적용 안 된다.
              score: exactName ? 9999
                : (pureConceptQuery ? 0 : 200) + gradeBonus(c.synth_grade) + Math.min(50, Number(c.synth_count) || 0),
              reasons: ["카페명 일치"],
            });
          }
          if (nameResults.length > 0 || boosted) results = [...nameResults, ...results].sort((a: any, b: any) => b.score - a.score).slice(0, 24);
        }
      }
    } catch { /* 상호매칭 실패해도 기존 결과 유지 */ }

    const coverageNote = detectOutOfCoverage(q, region);
    // 🏪 프랜차이즈 질의 안내(2026-08-13 P3) — 실측: "스타벅스" 검색이 30일 3회 들어와 빈약결과로 조용히 이탈.
    //   미등록은 큐레이션 정책(옥석 컨셉)이라 맞지만, 이유를 안 알려주면 "검색이 고장났다"로 보인다.
    //   isFranchise는 동기·메모리 캐시(learnedTerms)라 추가 조회 0.
    const franchiseNote = isFranchise(q.replace(/\s+/g, ""))
      ? "동네 커피 노트는 프랜차이즈 대신 동네의 검증된 개인 카페만 큐레이션해요. 아래에서 근처의 검증 카페를 만나보세요."
      : null;
    const payload: Record<string, unknown> = {
      ok: true, mode, region: effectiveRegion || "전체 지역", q,
      concepts: hitConcepts.map((c) => c.label),
      count: results.length, results,
    };
    if (coverageNote) payload.coverageNote = coverageNote;
    if (franchiseNote) payload.franchiseNote = franchiseNote;
    // 결과가 있으면 캐시에 저장(다음 동일 질문은 재계산 0)
    if (results.length > 0) {
      // 🛡️ 2026-08-31 — nocache=1은 **읽기만** 건너뛰고 쓰기는 그대로였다.
      //   search_cache는 프로덕션과 로컬이 같은 Neon을 공유한다. 그래서 로컬에서 실험용으로 nocache를 켜면
      //   그 결과가 프로덕션 캐시를 덮어써 실제 사용자에게 나간다(A/B 하려다 이 사실을 발견했다).
      //   디버그 플래그가 공유 상태를 바꾸면 안 된다 — nocache면 쓰지도 않는다.
      if (!nocache)
        sql`INSERT INTO search_cache (qkey, payload, created_at) VALUES (${qkey}, ${JSON.stringify(payload)}, now())
            ON CONFLICT (qkey) DO UPDATE SET payload=EXCLUDED.payload, created_at=now()`.catch(() => {});
    }
    logSearch(q, region, results.length, mode, isInternalCheck, aiErr); // 🔎 수요 로깅(수요-공급 갭·발굴 우선순위·콘텐츠 소재)
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
