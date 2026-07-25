// 🕵️ 인용문 교차오염 탐지 — 한 카페의 노출 인용문(quote)에 '자기와 무관한 다른 카페의 고유 상호'가
//   통째로 들어간 경우(예: 삼남매 빵집 인용문에 경쟁 '자연도 소금빵')를 잡는다. 오탐 방지가 핵심이라
//   ①흔한 업종어 ②동사/숫자 ③자기명·같은브랜드(코어 2자 이상 공유) ④단일 카페 소유 아님 을 전부 배제한다.
//   sentinel 스캐너와 즉시 sweep가 공유(단일 출처). base(neon 미유입)만 import.
import { cleanCafeName } from "./reviewQuality";

// 상호로서 변별력 없는 흔한 업종/일반어(코어가 이거면 고유상호 아님 — 모든 리뷰에 등장).
const COMMON = new Set(
  "베이커리 베이글 에스프레소바 에스프레소 로스터리 로스팅 커피 카페 디저트 브런치 브레드 케이크 케잌 도넛 도너츠 토스트 샌드위치 크로플 크루아상 파이 마카롱 스토어 하우스 라운지 갤러리 스튜디오 팩토리 공방 공장 마켓 다방 찻집 티하우스 플라워 베이크 파티세리 블랑제리 파티스리 커피랩 커피바 스페셜티 원두 소금빵 식빵 우리동네 동네카페 우리집 로스터스본".split(" "),
);
const VERB = /(니다|습니다|세요|어요|아요|드려|드립|였어|겠|해요|네요|더라|구요|이에요|예요)/;
// 브랜드루트가 이걸로 시작하면 일반 업종어 조합(베이커리카페·아이스크림 등) → 고유 브랜드 아님.
const COMMON_PREFIX = ["베이커리", "아이스", "젤라또", "커피", "카페", "디저트", "브런치", "케이크", "케잌", "로스터", "스페셜", "마카롱", "도넛", "도너츠", "토스트", "샌드위치", "브레드", "티라미수", "크로플", "와플", "빵집", "제과", "다방", "찻집"];

// 앞뒤 카페어를 벗긴 '고유 코어명' — 식별 비교의 기준.
export function cafeCore(name: string): string {
  return (name || "").replace(/[\s·・.]/g, "").toLowerCase()
    .replace(/^(카페|커피|더|the|스튜디오)/, "")
    .replace(/(카페|커피숍|커피|로스터리|베이커리|제과점|빵집|하우스|스토어|점)$/, "");
}
// 고유상호 코어 자격: 한글 4자+ (또는 라틴 5자+), 동사/숫자/흔한업종어 아님.
function validCore(cc: string): boolean {
  if (!cc || COMMON.has(cc) || VERB.test(cc)) return false;
  const ko = (cc.match(/[가-힣]/g) || []).length;
  if (ko >= 4) return true;
  if (ko === 0 && /^[a-z]{5,}$/.test(cc)) return true;
  return false;
}
// 두 코어가 2자 이상 겹치면 자기/같은브랜드 의심 → 경쟁으로 안 봄.
function shareRun(a: string, b: string): boolean {
  for (let i = 0; i + 2 <= a.length; i++) if (b.includes(a.slice(i, i + 2))) return true;
  return false;
}
// 인용문에 이 상호를 언급하면 '자기 후기'로 보는 마커.
export function selfMarkers(cleanName: string): string[] {
  const x = (cleanName || "").replace(/[\s·・.]/g, "").toLowerCase();
  return x ? [x + "카페", "카페" + x, x + "커피", "커피" + x, x] : [];
}

export type CompetitorIndex = Map<string, number[]>; // 코어/브랜드루트 → 카페id[]
export function buildCompetitorIndex(cafes: { id: number; name: string }[]): CompetitorIndex {
  const idx: CompetitorIndex = new Map();
  const cores: { cc: string; id: number }[] = [];
  for (const c of cafes) { const cc = cafeCore(cleanCafeName(c.name)); if (cc.length >= 2) cores.push({ cc, id: c.id }); }
  // ① 정식 코어(고유상호 자격). 여러 카페 공유 = 변별력 낮으니 그대로 두되 competitorInText에서 메가체인 컷.
  for (const { cc, id } of cores) { if (!validCore(cc)) continue; if (!idx.has(cc)) idx.set(cc, []); idx.get(cc)!.push(id); }
  // ② 브랜드 루트: 지점명이 붙어 코어가 길어진 프랜차이즈('자연도소금빵in성수'·'자연도소금빵자연도차')는
  //    형제 지점들의 공통 접두(≥5 한글)가 브랜드('자연도소금빵'). 인용문의 브랜드명 매칭용으로 함께 등재.
  const sorted = [...cores].sort((a, b) => a.cc.localeCompare(b.cc));
  const brandOwners = new Map<string, Set<number>>();
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i]; let n = 0;
    while (n < a.cc.length && n < b.cc.length && a.cc[n] === b.cc[n]) n++;
    const pre = a.cc.slice(0, n);
    // 브랜드루트가 일반 업종어로 시작하면(베이커리카페·아이스크림 등) 브랜드 아님 → 제외.
    if (COMMON_PREFIX.some((p) => pre.startsWith(p))) continue;
    if ((pre.match(/[가-힣]/g) || []).length >= 5 && validCore(pre)) {
      if (!brandOwners.has(pre)) brandOwners.set(pre, new Set());
      brandOwners.get(pre)!.add(a.id); brandOwners.get(pre)!.add(b.id);
    }
  }
  for (const [brand, ids] of brandOwners) {
    if (ids.size > 8) continue; // 메가체인 브랜드는 비교 언급이 흔해 제외
    const arr = idx.get(brand) ?? []; for (const id of ids) if (!arr.includes(id)) arr.push(id); idx.set(brand, arr);
  }
  return idx;
}
// 인용문 text에서 '자기와 무관한 다른 카페 고유상호/브랜드'를 찾으면 반환(없으면 null).
//   메가체인(소유 9곳+)은 비교 언급이 정상이라 제외. 자기·같은브랜드(2자 공유)도 제외.
export function competitorInText(text: string, selfCore: string, selfId: number, idx: CompetitorIndex): string | null {
  const qn = (text || "").replace(/[\s·・.]/g, "").toLowerCase();
  if (!qn) return null;
  for (const [cc, ids] of idx) {
    if (ids.length > 8 || ids.includes(selfId)) continue; // 메가체인 / 자기
    if (shareRun(cc, selfCore)) continue;                 // 자기·같은브랜드
    if (qn.includes(cc)) return cc;
  }
  return null;
}
