import { sql } from "./db";

// 🧹 카페 공개상태 변경(비공개/복원/삭제) 시 **모든 캐시 레이어** 무효화 — 단일 진입점.
//   원칙(2026-07-01 사고): DB만 바꾸면 CDN·ISR·search_cache가 옛 상태를 계속 낸다.
//   API는 always-fresh(max-age=0)로 이미 해결 — 남은 레이어 = ①search_cache(DB) ②ISR 페이지(/c/[id]·share·area·sitemap).
//   revalidatePath는 route handler 컨텍스트에서만 유효하므로 동적 import + graceful.
export async function invalidateCafeCaches(ids: number[]): Promise<void> {
  // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 한 곳 비공개는 동네→구 지도와 무관한데,
  //   같이 지우면 다음 검색이 전수 스캔(6,565페이지)으로 지도를 다시 만든다(불필요한 비용).
  await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
  try {
    const { revalidatePath } = await import("next/cache");
    for (const id of ids.slice(0, 50)) {
      revalidatePath(`/c/${id}`);
      revalidatePath(`/share/${id}`);
    }
    revalidatePath("/sitemap.xml");
    revalidatePath("/area/[gu]", "page");
    // 🔧 2026-08-18: 테마·동 페이지가 무효화 목록에서 빠져 있었다. ISR 주기를 늘리기 전에 먼저 채운다
    //   (순서가 반대면 비공개 처리한 카페가 그 화면에 더 오래 남는다).
    revalidatePath("/area/[gu]/[taste]", "page");
    revalidatePath("/area/[gu]/dong/[dong]", "page");
  } catch { /* 빌드/비-요청 컨텍스트에선 ISR 무효화 불가 — search_cache 삭제만으로도 검색은 즉시 반영 */ }
}
