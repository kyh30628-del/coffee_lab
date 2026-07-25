// 🕵️ 인용문 교차오염 탐지 — 한 카페의 노출 인용문(quote)에 '자기와 무관한 다른 카페의 고유 상호'가
//   통째로 들어간 경우(예: 삼남매 빵집 인용문에 경쟁 '자연도 소금빵')를 잡는다. 오탐 방지가 핵심이라
//   ①흔한 업종어 ②동사/숫자 ③자기명·같은브랜드(코어 2자 이상 공유) ④단일 카페 소유 아님 을 전부 배제한다.
//   sentinel 스캐너와 즉시 sweep가 공유(단일 출처). base(neon 미유입)만 import.
import { cleanCafeName } from "./reviewQuality";

// 상호로서 변별력 없는 흔한 업종/일반어(코어가 이거면 고유상호 아님 — 모든 리뷰에 등장).
const COMMON = new Set(
  "베이커리 베이글 에스프레소바 에스프레소 로스터리 로스팅 커피 카페 디저트 브런치 브레드 케이크 케잌 도넛 도너츠 토스트 샌드위치 크로플 크루아상 파이 마카롱 스토어 하우스 라운지 갤러리 스튜디오 팩토리 공방 공장 마켓 다방 찻집 티하우스 플라워 베이크 파티세리 블랑제리 파티스리 커피랩 커피바 스페셜티 원두 소금빵 식빵".split(" "),
);
const VERB = /(니다|습니다|세요|어요|아요|드려|드립|였어|겠|해요|네요|더라|구요|이에요|예요)/;

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

export type CompetitorIndex = Map<string, number[]>; // 코어 → 카페id[] (validCore만)
export function buildCompetitorIndex(cafes: { id: number; name: string }[]): CompetitorIndex {
  const idx: CompetitorIndex = new Map();
  for (const c of cafes) {
    const cc = cafeCore(cleanCafeName(c.name));
    if (!validCore(cc)) continue;
    if (!idx.has(cc)) idx.set(cc, []);
    idx.get(cc)!.push(c.id);
  }
  return idx;
}
// 인용문 text에서 '자기와 무관한 단일소유 다른 카페 고유상호'를 찾으면 그 코어 반환(없으면 null).
export function competitorInText(text: string, selfCore: string, selfId: number, idx: CompetitorIndex): string | null {
  const qn = (text || "").replace(/[\s·・.]/g, "").toLowerCase();
  if (!qn) return null;
  for (const [cc, ids] of idx) {
    if (ids.length !== 1 || ids[0] === selfId) continue; // 여러 카페 공유명 = 변별력 없음 / 자기
    if (shareRun(cc, selfCore)) continue;                // 자기·같은브랜드
    if (qn.includes(cc)) return cc;
  }
  return null;
}
