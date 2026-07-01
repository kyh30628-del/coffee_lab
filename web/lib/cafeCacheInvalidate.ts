import { sql } from "./db";

// 🧹 카페 공개상태 변경(비공개/복원/삭제) 시 **모든 캐시 레이어** 무효화 — 단일 진입점.
//   원칙(2026-07-01 사고): DB만 바꾸면 CDN·ISR·search_cache가 옛 상태를 계속 낸다.
//   API는 always-fresh(max-age=0)로 이미 해결 — 남은 레이어 = ①search_cache(DB) ②ISR 페이지(/c/[id]·share·area·sitemap).
//   revalidatePath는 route handler 컨텍스트에서만 유효하므로 동적 import + graceful.
export async function invalidateCafeCaches(ids: number[]): Promise<void> {
  await sql`DELETE FROM search_cache`.catch(() => {});
  try {
    const { revalidatePath } = await import("next/cache");
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/c/${id}`);
      revalidatePath(`/share/${id}`);
    }
    revalidatePath("/sitemap.xml");
    revalidatePath("/area/[gu]", "page");
  } catch { /* 빌드/비-요청 컨텍스트에선 ISR 무효화 불가 — search_cache 삭제만으로도 검색은 즉시 반영 */ }
}
