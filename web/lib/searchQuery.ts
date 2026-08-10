import { sql } from "./db";

// 🔤 검색어 처리기 — 검색 정확도의 8할이 여기서 결정된다.
//
// 왜 만들었나(2026-08-10 실측): 실제 카페 리뷰 문장을 그대로 검색했을 때 그 카페가 1위로 나온 비율이 **42%**였다.
//   "우면동 카페 재방문한 최애 맛집"으로 서초구 카페를 찾으면 은평구 카페가 1위였다.
//   원인 두 가지가 여기에서 해결된다.
//     ① 일반어 지배 — 토큰이 `길이 2 이상`이면 전부 매칭 대상이라 '카페·맛집·좋은·내돈내산'이
//        전 카페에 붙어 랭킹을 지배했다. 실제로 "루프탑 야경" 검색의 상위 3곳 근거가 전부 "리뷰에 '카페' 언급"이었다.
//     ② 지역 미인식 — 동네→구 매핑이 하드코딩 40개뿐이라 '우면동·자양동·화랑대'는 지역으로 인식조차 안 됐다.
//        → DB의 실제 `dong` 값을 단일 출처로 삼는다(하드코딩 사전을 코드에 더 늘리지 않는다).

/** 검색에서 의미를 거의 못 주는 일반어 — 매칭 대상에서 제외한다(빼기만 하고 결과를 막지는 않는다). */
const STOPWORDS = new Set([
  // 업종·범용 명사(모든 카페에 다 있음)
  "카페", "커피", "커피숍", "카페추천", "맛집", "추천", "후기", "리뷰", "방문", "정보", "위치", "주소", "영업", "시간",
  "메뉴", "가격", "사진", "오늘", "요즘", "여기", "거기", "이곳", "그곳", "근처", "주변", "동네", "우리", "제가", "저는",
  // 블로그 상투어
  "내돈내산", "솔직후기", "찐맛집", "인생", "최애", "존맛", "강추", "가성비", "재방문", "다녀왔어요", "다녀온",
  // 형용사·동사 어미가 붙은 흔한 꼬리
  "좋은", "좋아", "좋다", "있는", "있어", "있다", "없는", "많은", "많이", "정말", "너무", "진짜", "완전", "조금",
  "하기", "하는", "해서", "가기", "가는", "먹기", "먹는", "보기", "보는", "같은", "같이", "함께", "그리고", "하지만",
  // 단위·군더더기
  "이상", "이하", "정도", "가지", "번째", "곳은", "곳이", "것도", "것을", "수도", "때는",
]);

/** 한국어 조사·어미 꼬리 — 붙어 있으면 떼서 어간을 살린다("루프탑에서"→"루프탑"). */
const PARTICLES = [
  "에서는", "에서도", "으로는", "이라면", "한테는", "께서는",
  "에서", "에게", "한테", "부터", "까지", "보다", "처럼", "만큼", "라도", "이나", "든지", "이랑",
  "으로", "로는", "에는", "에도", "이고", "이며", "지만", "면서", "って",
  "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "만", "로", "랑",
];

/** 조사 절단 — 어간이 2자 미만이 되면 원본을 유지(과절단 방지). */
export function stripParticle(tok: string): string {
  for (const p of PARTICLES) {
    if (tok.length > p.length + 1 && tok.endsWith(p)) {
      const stem = tok.slice(0, -p.length);
      if (stem.length >= 2) return stem;
    }
  }
  return tok;
}

export type ParsedQuery = {
  raw: string;
  tokens: string[];      // 랭킹에 쓰는 의미 토큰(불용어 제거·조사 절단 완료)
  stopped: string[];     // 제거된 일반어(설명·디버깅용)
};

export function parseQuery(q: string): ParsedQuery {
  const ql = q.toLowerCase();
  const rawTokens = Array.from(new Set(ql.split(/[\s,./?!~"'()\[\]|:·…]+/).filter((t) => t.length >= 2)));
  const tokens: string[] = [];
  const stopped: string[] = [];
  for (const t of rawTokens) {
    const stem = stripParticle(t);
    if (STOPWORDS.has(t) || STOPWORDS.has(stem)) { stopped.push(t); continue; }
    if (stem.length >= 2 && !tokens.includes(stem)) tokens.push(stem);
  }
  // 전부 불용어였다면(예: "좋은 카페 추천") 원본 토큰을 살려 결과 0을 막는다 — 정밀도보다 재현율 우선인 경계.
  if (tokens.length === 0) return { raw: q, tokens: rawTokens, stopped: [] };
  return { raw: q, tokens, stopped };
}

// ── 지역 인식: DB의 실제 dong/area가 단일 출처 ────────────────────────────────
//   하드코딩 사전을 늘리는 대신 실데이터를 쓴다. 값은 거의 안 변하므로 프로세스 메모리에 캐시(6시간).
//   ⚠️ 조회는 작은 컬럼 2개 GROUP BY 한 번뿐 — 큰 컬럼 미조회.
type GeoIndex = { dong: Map<string, string>; area: Set<string> };
let geoCache: { at: number; idx: GeoIndex } | null = null;
const GEO_TTL_MS = 6 * 60 * 60 * 1000;

export async function loadGeoIndex(): Promise<GeoIndex> {
  if (geoCache && Date.now() - geoCache.at < GEO_TTL_MS) return geoCache.idx;
  const dong = new Map<string, string>();
  const area = new Set<string>();
  try {
    const rows = (await sql`
      SELECT dong, area, COUNT(*)::int n FROM cafes
      WHERE published AND dong IS NOT NULL AND area IS NOT NULL
      GROUP BY dong, area ORDER BY n DESC`) as any[];
    for (const r of rows) {
      const d = String(r.dong).trim();
      area.add(String(r.area));
      if (d.length < 2) continue;
      if (!dong.has(d)) dong.set(d, String(r.area));           // 같은 동명은 카페 많은 쪽 우선(ORDER BY n DESC)
      const bare = d.replace(/(동|가|읍|면|리)$/, "");           // '우면동'→'우면'도 같은 구로
      if (bare.length >= 2 && !dong.has(bare)) dong.set(bare, String(r.area));
    }
  } catch { /* DB 실패 시 빈 인덱스 — 기존 하드코딩 폴백이 살아 있다 */ }
  geoCache = { at: Date.now(), idx: { dong, area } };
  return geoCache.idx;
}

/** 질의 토큰에서 지역을 찾아낸다. 찾으면 그 area와, 지역어로 쓰인 토큰을 함께 돌려준다. */
export function detectRegion(tokens: string[], geo: GeoIndex): { area: string; token: string } | null {
  for (const t of tokens) {
    if (geo.area.has(t)) return { area: t, token: t };
    const hit = geo.dong.get(t);
    if (hit) return { area: hit, token: t };
  }
  // '성수동카페'처럼 붙여 쓴 경우 — 토큰 앞부분이 동명과 일치하는지
  for (const t of tokens) {
    for (let len = Math.min(5, t.length); len >= 2; len--) {
      const head = t.slice(0, len);
      const hit = geo.dong.get(head);
      if (hit) return { area: hit, token: head };
    }
  }
  return null;
}

// ── 수도권 핵심부 가산 ────────────────────────────────────────────────────────
//   지역을 지정하지 않은 질의에서 연천·여주·강화가 1위로 오면 사실상 못 쓴다(실측 확인).
//   지역을 *명시한* 질의에는 적용하지 않는다 — "연천 카페"를 검색한 사람에겐 연천이 정답이다.
const CORE_GYEONGGI = new Set(["성남시", "고양시", "수원시", "용인시", "부천시", "안양시", "광명시", "하남시", "구리시",
  "과천시", "남양주시", "김포시", "의정부시", "시흥시", "안산시", "군포시", "의왕시", "파주시", "화성시", "평택시"]);
export function isCoreArea(area?: string): boolean {
  const a = String(area || "");
  if (!a) return false;
  if (a.startsWith("인천")) return !/강화|옹진/.test(a);
  if (a.endsWith("구")) return true;                    // 서울 자치구
  return CORE_GYEONGGI.has(a);
}
