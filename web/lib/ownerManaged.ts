// 🏅 「사장님이 직접 관리하는 카페」 배지 — **단일 출처**.
//
// 왜 단일 출처인가: 배지가 뜨는 화면이 여러 곳(지도 핀·상세 패널·공유 상세·지역/컬렉션/신상 목록…)인데
//   각 화면이 제 나름의 조건으로 판정하면 어떤 화면엔 뜨고 어떤 화면엔 안 뜨는 사고가 난다.
//   실제로 2026-08-26에 배지를 8개 화면 중 2곳에만 달고 '완료'라고 보고했다가 사장님이 발견했다.
//   → 조건도 여기, 문구도 여기. 화면은 `om` 플래그만 받아 그린다.
//
// 판정 기준(기존 단일 규칙과 동일 — app/api/subscription/route.ts):
//   status='active' AND expires_at IS NOT NULL AND expires_at > now()
//   체험도 status='active'로 들어오므로 체험 중인 사장님도 배지를 받는다(체험의 가치를 눈에 보이게 하는 게 상품이다).
import { sql } from "./db";

/** 배지 문구·아이콘도 단일 출처. 화면마다 다른 말을 쓰면 같은 상품이 다르게 보인다. */
export const OWNER_BADGE_LABEL = "사장님이 직접 관리";
export const OWNER_BADGE_EMOJI = "🏅";

let cache: { ids: Set<number>; at: number } = { ids: new Set(), at: 0 };
const TTL_MS = 60_000;

/**
 * 지금 사장님이 관리 중인(구독·체험 유효) 카페 id 집합.
 * - 구독 수가 한 자릿수라 조회가 가볍고, 60초 캐시로 렌더마다 때리지 않는다.
 * - 조회 실패 시 **직전 캐시를 유지**한다. 배지가 잠깐 안 뜨는 건 감수하되 화면이 깨지면 안 된다.
 */
export async function ownerManagedIds(): Promise<Set<number>> {
  if (Date.now() - cache.at < TTL_MS) return cache.ids;
  try {
    const rows = (await sql`
      SELECT cafe_id FROM subscriptions
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at > now()
    `) as unknown as { cafe_id: number }[];
    cache = { ids: new Set(rows.map((r) => Number(r.cafe_id)).filter(Number.isFinite)), at: Date.now() };
  } catch {
    cache = { ...cache, at: Date.now() - TTL_MS + 5_000 }; // 5초 뒤 재시도(폭주 방지)
  }
  return cache.ids;
}

/** 단건 확인 — 상세 페이지처럼 카페 하나만 그릴 때. */
export async function isOwnerManaged(cafeId: number): Promise<boolean> {
  return (await ownerManagedIds()).has(Number(cafeId));
}
