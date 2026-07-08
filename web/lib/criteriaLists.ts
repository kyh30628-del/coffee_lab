// 키워드/리스트 사전 단일출처 — 소비자 출력을 직접 형성하는 하드코딩 키워드 리스트를 무배포로 편집.
//   설계 선례: lib/criteria.ts(숫자 임계) + lib/learnedTerms.ts(리스트 오버라이드). 이 둘을 리스트용으로 합친다.
//   원칙: 하드코딩 BASE = 폴백 진실원본(현재값). DB `criteria_lists` = 오버레이(추가/제거) 오버라이드.
//     유효리스트 = BASE에서 remove 제외 후 add 항목 append → DB가 비어도/죽어도 BASE 그대로(서비스 무변).
//   동기 소비처(synthEngine.synthesize·reviewQuality·charScore 등)는 매번 DB를 못 읽으므로 모듈 캐시(TTL 60s).
//     합성/검색/발굴 진입점이 loadCriteriaLists()로 캐시 갱신하고, 규칙은 getListSync()/getListSetSync()로 동기 조회.
//   ⚠️ 이 파일은 '리스트 정의(BASE)'의 단일출처다. 소비처는 반드시 여기 키를 통해 읽는다(하드코딩 재정의 금지 → 드리프트 방지).
import { sql } from "./db";

export type ListMeta = {
  key: string;
  category: string;
  label: string;
  consumer: string; // 어느 코드가 소비하는지(어드민 표시·추적용)
  items: string[]; // 하드코딩 폴백 = 진실원본(현재값). DB가 죽어도 이 값으로 안전동작.
};

// ⚠️ 아래 items 는 각 소비처의 '현재 하드코딩 리스트'와 100% 동일해야 한다(서비스 출력 무변). 시드·폴백 모두 이 값.
export const LIST_META: ListMeta[] = [
  // ── 성향 6축 키워드 (lib/charScore.ts · CHAR_AXES.kws) — 성향점수→개념검색·큐레이션 직접형성 ──
  { key: "char.roast.kws", category: "성향축", label: "성향축: 직접로스팅 🔥", consumer: "charScore.computeCharScores",
    items: ["로스팅", "로스터리", "직접 볶", "자가배전", "스페셜티", "싱글오리진"] },
  { key: "char.work.kws", category: "성향축", label: "성향축: 작업·공부 💻", consumer: "charScore.computeCharScores",
    items: ["작업", "노트북", "공부", "콘센트", "집중", "와이파이"] },
  { key: "char.quiet.kws", category: "성향축", label: "성향축: 조용·혼자 🤍", consumer: "charScore.computeCharScores",
    items: ["조용", "차분", "혼자", "사색", "한적", "고요한", "고요함", "고요히", "고요하게"] },
  { key: "char.dessert.kws", category: "성향축", label: "성향축: 디저트 🍰", consumer: "charScore.computeCharScores",
    items: ["디저트", "케이크", "스콘", "크로플", "티라미수", "베이커리", "쿠키", "빵"] },
  { key: "char.mood.kws", category: "성향축", label: "성향축: 분위기 📸", consumer: "charScore.computeCharScores",
    items: ["분위기", "예쁜", "감성", "인테리어", "사진", "뷰", "루프탑", "아늑"] },
  { key: "char.space.kws", category: "성향축", label: "성향축: 넓은공간 🪑", consumer: "charScore.computeCharScores",
    items: ["넓", "대형", "규모", "테라스", "주차"] },

  // ── 맛 3축 신호어 (lib/synthEngine.ts · SIGNALS/AMBIGUOUS) — 맛 좌표(산미·바디·단맛) 직접형성 ──
  { key: "taste.acidity.strong", category: "맛축", label: "맛: 산미 강신호", consumer: "synthEngine.synthesize",
    items: ["산미", "신맛", "상큼", "과일향", "베리", "시트러스", "플로럴", "꽃향", "게이샤", "acidity", "acidic", "sour", "fruity", "floral", "berry", "citrus", "bright", "geisha"] },
  { key: "taste.acidity.weak", category: "맛축", label: "맛: 산미 약신호(부정)", consumer: "synthEngine.synthesize",
    items: ["산미가 없", "산미없", "신맛이 없", "산미 거의", "산미가 적", "산미 불호", "산미가 약", "not sour", "no acidity", "without acidity", "low acidity", "less acidic", "not much sour"] },
  { key: "taste.acidity.ambiguous", category: "맛축", label: "맛: 산미 모호어(부정 취급)", consumer: "synthEngine.synthesize",
    items: [] },
  { key: "taste.body.strong", category: "맛축", label: "맛: 바디 강신호", consumer: "synthEngine.synthesize",
    items: ["묵직", "진한", "바디감", "다크", "스모키", "고소", "견과", "다크초콜릿", "full body", "full-bodied", "heavy body", "dark chocolate", "nutty", "robust", "bold", "rich body"] },
  { key: "taste.body.weak", category: "맛축", label: "맛: 바디 약신호(부정)", consumer: "synthEngine.synthesize",
    items: ["가볍", "연한", "밍밍", "물 같", "라이트", "light body", "watery", "thin", "light-bodied"] },
  { key: "taste.body.ambiguous", category: "맛축", label: "맛: 바디 모호어(부정 취급)", consumer: "synthEngine.synthesize",
    items: ["smooth", "부드러", "clean", "깔끔", "mellow", "mild", "soft", "delicate"] },
  { key: "taste.sweet.strong", category: "맛축", label: "맛: 단맛 강신호", consumer: "synthEngine.synthesize",
    items: ["단맛", "달달", "달콤", "카라멜", "바닐라", "꿀", "sweet", "sweetness", "caramel", "vanilla", "honey", "sugary"] },
  { key: "taste.sweet.weak", category: "맛축", label: "맛: 단맛 약신호(부정)", consumer: "synthEngine.synthesize",
    items: ["안 달", "안달", "달지 않", "씁쓸", "쓴맛", "not sweet", "bitter", "less sweet"] },
  { key: "taste.sweet.ambiguous", category: "맛축", label: "맛: 단맛 모호어(부정 취급)", consumer: "synthEngine.synthesize",
    items: [] },

  // ── 용도 신호어 (lib/synthEngine.ts · USE_SIGNALS) — 카페 용도 태그 형성 ──
  { key: "use.작업", category: "용도", label: "용도: 작업", consumer: "synthEngine.synthesize",
    items: ["작업", "노트북", "공부", "콘센트", "좌석", "read", "work", "laptop", "study", "books"] },
  { key: "use.혼자", category: "용도", label: "용도: 혼자", consumer: "synthEngine.synthesize",
    items: ["혼자", "조용", "사색", "차분", "고요", "quiet", "serene", "calm", "low key", "low-key", "peaceful"] },
  { key: "use.수다", category: "용도", label: "용도: 수다", consumer: "synthEngine.synthesize",
    items: ["수다", "친구", "대화", "일행", "함께", "group", "friends", "together", "chat"] },
  { key: "use.사진", category: "용도", label: "용도: 사진", consumer: "synthEngine.synthesize",
    items: ["사진", "인테리어", "예쁜", "감성", "분위기", "루프탑", "interior", "ambience", "ambiance", "aesthetic", "rooftop"] },
  { key: "use.빵", category: "용도", label: "용도: 빵", consumer: "synthEngine.synthesize",
    items: ["빵", "베이커리", "스콘", "크루아상", "디저트", "케이크", "티라미수", "bread", "bakery", "scone", "croissant", "dessert", "cake", "tiramisu", "pastry"] },

  // ── 운영 정체성 신호어 (lib/synthEngine.ts · OP_SIGNALS) — 직접로스팅·원두판매·권위 주장 탐지 ──
  { key: "op.직접로스팅", category: "운영신호", label: "운영: 직접로스팅 주장", consumer: "synthEngine.synthesize",
    items: ["직접 로스팅", "직접로스팅", "자가배전", "직접 볶", "직접볶", "로스터리", "빈투바", "bean to bar", "in-house roast", "in house roast", "house roasted", "roast in-house", "직접 볶은", "직접 볶아", "로스팅합니다", "로스팅 합니다"] },
  { key: "op.원두판매", category: "운영신호", label: "운영: 원두판매", consumer: "synthEngine.synthesize",
    items: ["원두 판매", "원두 구매", "원두 사", "원두 한봉", "bag of bean", "beans to take", "buy a bag", "roasted coffee beans"] },
  { key: "op.권위", category: "운영신호", label: "운영: 권위·수상", consumer: "synthEngine.synthesize",
    items: ["블루리본", "수상", "10년 연속", "미슐랭", "blue ribbon", "best specialty", "key player", "reputation", "hidden gem"] },

  // ── 검색 개념 트리거 (app/api/search/route.ts · CONCEPTS.triggers) — 질의→개념 매칭·랭킹 직접형성 ──
  { key: "concept.quiet.triggers", category: "검색개념", label: "개념: 조용·혼자", consumer: "search.route",
    items: ["조용", "혼자", "차분", "사색", "고요", "한적", "혼카", "평온", "힐링", "나홀로", "한가"] },
  { key: "concept.work.triggers", category: "검색개념", label: "개념: 작업·공부", consumer: "search.route",
    items: ["작업", "공부", "노트북", "콘센트", "스터디", "와이파이", "오래", "독서", "집중", "책"] },
  { key: "concept.mood.triggers", category: "검색개념", label: "개념: 분위기·감성", consumer: "search.route",
    items: ["분위기", "감성", "예쁜", "이쁜", "데이트", "사진", "인테리어", "뷰", "루프탑", "아늑", "무드", "빈티지", "힙", "감각", "조명", "이국적"] },
  { key: "concept.dessert.triggers", category: "검색개념", label: "개념: 디저트·빵", consumer: "search.route",
    items: ["빵", "디저트", "케이크", "베이커리", "달달", "달콤", "스콘", "크로플", "쿠키", "티라미수", "마카롱", "휘낭시에", "과자", "구움"] },
  { key: "concept.roast.triggers", category: "검색개념", label: "개념: 직접로스팅·스페셜티", consumer: "search.route",
    items: ["로스팅", "스페셜티", "원두", "핸드드립", "드립", "커피맛", "고급", "로스터리", "싱글", "에스프레소", "진심", "커피가 맛", "커피 맛"] },
  { key: "concept.space.triggers", category: "검색개념", label: "개념: 넓은공간", consumer: "search.route",
    items: ["넓", "대형", "테라스", "주차", "규모", "아이", "애견", "반려", "쾌적", "층고", "단체"] },
  { key: "concept.acidity.triggers", category: "검색개념", label: "개념: 산미 또렷", consumer: "search.route",
    items: ["산미", "상큼", "과일", "베리", "시트러스", "플로럴", "꽃향", "새콤", "산뜻", "후르츠"] },
  { key: "concept.body.triggers", category: "검색개념", label: "개념: 묵직·고소", consumer: "search.route",
    items: ["고소", "묵직", "진한", "다크", "스모키", "견과", "바디", "구수", "진하게"] },
  { key: "concept.sweet.triggers", category: "검색개념", label: "개념: 단맛", consumer: "search.route",
    items: ["단맛", "카라멜", "바닐라", "꿀", "초콜릿", "달콤한"] },
  { key: "search.out_of_coverage", category: "검색개념", label: "검색: 미서비스 지역 키워드", consumer: "search.route",
    items: ["부산", "대구", "대전", "광주광역시", "광주 광역시", "울산", "세종", "강원", "충북", "충남", "충청", "전북", "전남", "전라", "경북", "경남", "경상", "제주", "춘천", "원주", "강릉", "속초", "포항", "경주", "안동", "구미", "창원", "진주", "통영", "김해", "거제", "양산", "밀양", "전주", "군산", "익산", "목포", "순천", "여수", "광양", "청주", "충주", "제천", "천안", "아산", "공주", "서산", "제주시", "서귀포"] },

  // ── 오염/비카페 순수 리스트 (lib/discover.ts) — 로직(regex) 제외, 순수 문자열 리스트만 ──
  { key: "discover.non_cafe", category: "오염리스트", label: "발굴: 비카페 상호 토큰(부분일치)", consumer: "discover.isNonCafe",
    items: ["고로케", "정육", "세탁소", "치킨집", "피자", "분식", "국밥", "삼겹", "횟집", "노래방", "PC방", "문구"] },
  { key: "discover.manual_noncafe", category: "오염리스트", label: "발굴: 수동 지목 비카페", consumer: "discover.isNonCafe",
    items: ["차덕분"] },
  // 지역발굴 라우트(app/api/cafe-discover) 전용 추가 비카페 토큰. discover.non_cafe(공용)와 합집합으로 소비 → 기존 하드코딩 16토큰과 동작 동일.
  //   (세탁·치킨·노래가 공용의 세탁소·치킨집·노래방을 포섭하므로 두 키 합집합 = 종전 유효필터 무변.) 어드민에서 이 키를 편집하면 지역발굴 경로에 반영.
  { key: "discover.non_cafe_regional", category: "오염리스트", label: "발굴(지역 라우트): 비카페 추가 토큰(부분일치)", consumer: "cafe-discover.isNonCafe",
    items: ["마트", "편의점", "세탁", "미용", "약국", "치킨", "노래"] },

  // ── 초약체 유일토큰 (lib/reviewQuality.ts · WEAK_IDENTITY_TOKEN) — 리뷰 매칭 엄격도 게이트 ──
  { key: "identity.weak_token", category: "정체성", label: "초약체 유일토큰(엄격 매칭 요구)", consumer: "reviewQuality",
    items: ["공간", "다이아", "블라블라", "충무", "브라더스", "2005", "인테리어", "조도", "회전목마", "실험실", "청하동길", "스위치"] },
];

const BY_KEY: Record<string, ListMeta> = Object.fromEntries(LIST_META.map((m) => [m.key, m]));
export const BASE_BY_KEY: Record<string, string[]> = Object.fromEntries(LIST_META.map((m) => [m.key, m.items]));
const BASE_SET: Record<string, Set<string>> = {};
export function listKeys(): string[] { return LIST_META.map((m) => m.key); }
export function isListKey(key: string): boolean { return key in BY_KEY; }

// 유효리스트 계산 — BASE에서 remove 제외 후 add append. 오버라이드 없으면 BASE 그대로(순서·내용 동일 → 서비스 무변).
function effective(key: string, overrides?: Map<string, "add" | "remove">): string[] {
  const base = BASE_BY_KEY[key] ?? [];
  if (!overrides || overrides.size === 0) return base.slice();
  const removes = new Set<string>();
  for (const [item, op] of overrides) if (op === "remove") removes.add(item);
  const out = base.filter((x) => !removes.has(x));
  for (const [item, op] of overrides) if (op === "add" && !removes.has(item) && !out.includes(item)) out.push(item);
  return out;
}

let CACHE: Record<string, string[]> = {};
let CACHE_SET: Record<string, Set<string>> = {};
let loadedAt = 0;
let ensured = false;

export async function ensureCriteriaListsTable(): Promise<void> {
  if (ensured) return;
  // 오버레이 1행 = (key, item)당 하나의 오버라이드. op=add(항목추가) | remove(항목숨김). status=active | reverted.
  await sql`CREATE TABLE IF NOT EXISTS criteria_lists (
    key TEXT NOT NULL,
    item TEXT NOT NULL,
    op TEXT NOT NULL DEFAULT 'add',
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT DEFAULT 'manual',
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (key, item)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS criteria_list_history (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    item TEXT,
    action TEXT NOT NULL,
    actor TEXT,
    note TEXT,
    at TIMESTAMPTZ DEFAULT now()
  )`;
  ensured = true;
}

// 합성/검색/발굴 진입점에서 호출. TTL 내면 재조회 생략(핫패스 비용 0). 실패해도 BASE 유지(안전폴백).
export async function loadCriteriaLists(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 60_000 && loadedAt > 0) return;
  try {
    await ensureCriteriaListsTable();
    const rows = (await sql`SELECT key, item, op FROM criteria_lists WHERE status='active'`) as { key: string; item: string; op: string }[];
    const byKey = new Map<string, Map<string, "add" | "remove">>();
    for (const r of rows) {
      if (!isListKey(r.key)) continue; // 미등록 키 무시(드리프트 방어)
      if (r.op !== "add" && r.op !== "remove") continue;
      let m = byKey.get(r.key);
      if (!m) { m = new Map(); byKey.set(r.key, m); }
      m.set(r.item, r.op);
    }
    const nextArr: Record<string, string[]> = {};
    const nextSet: Record<string, Set<string>> = {};
    for (const k of Object.keys(BASE_BY_KEY)) {
      const arr = effective(k, byKey.get(k));
      nextArr[k] = arr;
      nextSet[k] = new Set(arr);
    }
    CACHE = nextArr;
    CACHE_SET = nextSet;
    loadedAt = Date.now();
  } catch {
    /* 테이블 없거나 DB 오류 → BASE(현재값)로 동작. 서비스 절대 안 깨짐. */
  }
}

// 규칙(동기)에서 조회 — 캐시 우선, 미프라임/미지정이면 BASE 폴백(항상 안전).
export function getListSync(key: string): string[] {
  return CACHE[key] ?? BASE_BY_KEY[key] ?? [];
}

// Set 형태 동기 조회(reviewQuality 등 .has() 소비처용). 캐시 우선, 폴백은 BASE Set(지연생성).
export function getListSetSync(key: string): Set<string> {
  const c = CACHE_SET[key];
  if (c) return c;
  if (!BASE_SET[key]) BASE_SET[key] = new Set(BASE_BY_KEY[key] ?? []);
  return BASE_SET[key];
}

// 비동기 소비처/어드민용 — 캐시 갱신 후 조회.
export async function getList(key: string): Promise<string[]> {
  await loadCriteriaLists();
  return getListSync(key);
}

// 어드민 전체 조회 — 각 사전의 BASE·오버라이드·유효리스트를 함께 반환.
export type ListView = {
  key: string; category: string; label: string; consumer: string;
  base: string[]; effective: string[];
  added: string[]; removed: string[]; // 오버라이드로 추가된/숨겨진 항목
  isDefault: boolean;
};
export async function getAllLists(): Promise<ListView[]> {
  await ensureCriteriaListsTable();
  const rows = (await sql`SELECT key, item, op FROM criteria_lists WHERE status='active'`) as { key: string; item: string; op: string }[];
  const ovByKey = new Map<string, Map<string, "add" | "remove">>();
  for (const r of rows) {
    if (!isListKey(r.key) || (r.op !== "add" && r.op !== "remove")) continue;
    let m = ovByKey.get(r.key); if (!m) { m = new Map(); ovByKey.set(r.key, m); }
    m.set(r.item, r.op);
  }
  return LIST_META.map((meta) => {
    const ov = ovByKey.get(meta.key);
    const eff = effective(meta.key, ov);
    const added: string[] = []; const removed: string[] = [];
    if (ov) for (const [item, op] of ov) { if (op === "add") added.push(item); else removed.push(item); }
    return { key: meta.key, category: meta.category, label: meta.label, consumer: meta.consumer,
      base: meta.items.slice(), effective: eff, added, removed, isDefault: added.length === 0 && removed.length === 0 };
  });
}

function validItem(raw: string): string {
  const item = String(raw ?? "").trim();
  if (!item) throw new Error("빈 항목은 추가할 수 없습니다");
  if (item.length > 40) throw new Error("항목이 너무 깁니다(최대 40자)");
  return item;
}
async function logHist(key: string, item: string | null, action: string, actor: string, note?: string) {
  await sql`INSERT INTO criteria_list_history (key, item, action, actor, note) VALUES (${key}, ${item}, ${action}, ${actor}, ${note ?? null})`;
}

// 항목 추가 — 유효리스트에 item이 반드시 들어오게: remove 오버라이드가 있으면 해제, BASE에 없으면 add 오버라이드 삽입.
export async function addListItem(key: string, rawItem: string, by: string, note?: string): Promise<void> {
  if (!isListKey(key)) throw new Error(`알 수 없는 사전: ${key}`);
  const item = validItem(rawItem);
  await ensureCriteriaListsTable();
  const inBase = (BASE_BY_KEY[key] ?? []).includes(item);
  if (inBase) {
    // BASE에 이미 있음 → 혹시 걸려있던 remove 오버라이드만 해제(있으면).
    await sql`DELETE FROM criteria_lists WHERE key=${key} AND item=${item} AND op='remove'`;
  } else {
    await sql`INSERT INTO criteria_lists (key, item, op, status, source, note, updated_at)
      VALUES (${key}, ${item}, 'add', 'active', 'manual', ${note ?? null}, now())
      ON CONFLICT (key, item) DO UPDATE SET op='add', status='active', note=${note ?? null}, updated_at=now()`;
  }
  await logHist(key, item, "add", by, note);
  await loadCriteriaLists(true);
}

// 항목 제거 — 유효리스트에서 item이 빠지게: BASE 항목이면 remove 오버라이드 삽입, add 오버라이드였으면 그 행 삭제.
export async function removeListItem(key: string, rawItem: string, by: string, note?: string): Promise<void> {
  if (!isListKey(key)) throw new Error(`알 수 없는 사전: ${key}`);
  const item = validItem(rawItem);
  await ensureCriteriaListsTable();
  const inBase = (BASE_BY_KEY[key] ?? []).includes(item);
  if (inBase) {
    await sql`INSERT INTO criteria_lists (key, item, op, status, source, note, updated_at)
      VALUES (${key}, ${item}, 'remove', 'active', 'manual', ${note ?? null}, now())
      ON CONFLICT (key, item) DO UPDATE SET op='remove', status='active', note=${note ?? null}, updated_at=now()`;
  } else {
    // BASE에 없는데 제거 요청 = 추가 오버라이드를 되돌리는 것 → 그 행 삭제.
    await sql`DELETE FROM criteria_lists WHERE key=${key} AND item=${item}`;
  }
  await logHist(key, item, "remove", by, note);
  await loadCriteriaLists(true);
}

// 항목 되돌리기 — 이 (key,item)의 모든 오버라이드 제거(하드코딩 기본 멤버십으로 복원).
export async function revertListItem(key: string, rawItem: string, by: string): Promise<void> {
  if (!isListKey(key)) throw new Error(`알 수 없는 사전: ${key}`);
  const item = validItem(rawItem);
  await ensureCriteriaListsTable();
  await sql`DELETE FROM criteria_lists WHERE key=${key} AND item=${item}`;
  await logHist(key, item, "revert", by);
  await loadCriteriaLists(true);
}

// 사전 통째 기본값 복원 — 이 key의 모든 오버라이드 제거.
export async function revertListKey(key: string, by: string): Promise<void> {
  if (!isListKey(key)) throw new Error(`알 수 없는 사전: ${key}`);
  await ensureCriteriaListsTable();
  await sql`DELETE FROM criteria_lists WHERE key=${key}`;
  await logHist(key, null, "revert_all", by);
  await loadCriteriaLists(true);
}
