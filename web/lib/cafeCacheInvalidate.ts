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
      // 🌙 2026-09-02 — OG 이미지는 별도 라우트라 /c/[id] purge로 안 지워진다.
      //   재생성 주기를 6h→7d로 늘렸으므로 여기서 안 지우면 비공개 카페 이미지가 최대 7일 남는다.
      revalidatePath(`/c/${id}/opengraph-image`);
    }
    revalidatePath("/api/cafes");   // 🗺️ 지도 데이터(2026-09-01 캐시 재도입) — 여기를 빼면 2026-07-01 사고가 그대로 재발한다.
    revalidatePath("/sitemap.xml");
    revalidatePath("/area/[gu]", "page");
    // 🔧 2026-08-18: 테마·동 페이지가 무효화 목록에서 빠져 있었다. ISR 주기를 늘리기 전에 먼저 채운다
    //   (순서가 반대면 비공개 처리한 카페가 그 화면에 더 오래 남는다).
    revalidatePath("/area/[gu]/[taste]", "page");
    revalidatePath("/area/[gu]/dong/[dong]", "page");
  } catch (e) {
    // 🔴 2026-08-31 — 여기가 **조용히 실패하던 자리**다.
    //   revalidatePath는 요청 컨텍스트 밖(맥의 로컬 워커·크론 스크립트)에서 던진다.
    //   예전 코드는 그걸 빈 catch로 삼켜, DB는 비공개인데 **CDN이 옛 페이지를 계속 냈다.**
    //   실측(id24609): 비공개 36분 뒤에도 200 · x-vercel-cache: HIT. "비공개했다"가 화면에선 거짓이었다.
    //   → 프로덕션의 무효화 실행구를 원격 호출해 같은 일을 **거기서** 시킨다. 그것마저 실패하면 세어서 남긴다.
    await remoteRevalidate(ids).catch(async (e2) => {
      const { noteSilentFail } = await import("./silentFail");
      await noteSilentFail("cacheInvalidate.remote", e2 ?? e).catch(() => {});
    });
  }
}

/** 요청 컨텍스트 밖에서 ISR을 지우는 유일한 방법 — 프로덕션 안에서 실행시킨다. */
async function remoteRevalidate(ids: number[]): Promise<void> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD 미설정 — 원격 무효화 불가");
  const r = await fetch("https://dongnecoffeenote.com/api/admin/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": pw },
    body: JSON.stringify({ ids: ids.slice(0, 50) }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`원격 무효화 실패 ${r.status}`);
}
