import { sql, ensureOnce } from "./db";

// 🔴 2026-09-26 — "유형 전체 무효화"를 카페 1곳마다 하던 것을 묶는다(실측 기반).
//
// ## 무엇이 잘못됐나
//   이 함수는 `revalidatePath("/area/[gu]/[taste]", "page")`처럼 **페이지 유형 전체**를 purge한다.
//   그런데 호출부가 카페 단위였다(synthStore 1022·1293행: 재합성에서 근거 0건/오염이면 곧바로 호출).
//   pg_stat_statements 실측(09-25→09-26 하루): 이 함수가 **5,740회** 실행됐다.
//   한 번에 지역 230 + 취향 1,854 + 동 2,079 ≈ 4,163페이지 → **하루 2,390만 페이지 무효화**.
//
// ## 그래서 생긴 결과 (실측)
//   · `search_cache` 행 수가 **항상 0** — 매번 통째로 비워 캐시가 아예 동작하지 않았다.
//   · 크롤러가 늘 식은 페이지를 만나 렌더 → 렌더 1건이 DB 왕복 6~8회(N+1)
//   · 우리 쿼리 **하루 1,212만 회 = 초당 140회** → 5분 유휴가 생길 수 없어 **DB가 하루종일 안 잔다**
//     (Neon 요금 = 활성시간 × CU × $0.106, 월 212 CU-h ≈ $27)
//
// ## 조치
//   카페별 경로(/c/{id}·/share/{id}·og)와 지도 데이터(/api/cafes)는 **그대로 즉시** purge한다(소비자 정확성).
//   비싼 쪽(유형 전체 3종 + search_cache 전삭)만 **원자적 클레임으로 묶는다** — 창 안에서 첫 호출만 수행.
//   대가: 비공개된 카페가 목록 페이지에 최대 CACHE_BROAD_MIN_SEC(기본 120초)간 남을 수 있다.
//   그 페이지들은 본래 ISR 30분~30일이라 기존 staleness 안에 있고, 카페 상세·지도는 즉시 반영된다.
const BROAD_MIN_SEC = Number(process.env.CACHE_BROAD_MIN_SEC || 120);

/** 유형 전체 purge 권한을 원자적으로 딱 하나만 가져간다(프로세스가 여러 개여도 창당 1회). */
async function claimBroadPurge(): Promise<boolean> {
  try {
    await ensureOnce("cachePurge.state.v1", async () => {
      await sql`CREATE TABLE IF NOT EXISTS cache_purge_state (k TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    });
    const r = (await sql`INSERT INTO cache_purge_state (k, at) VALUES ('broad', now())
      ON CONFLICT (k) DO UPDATE SET at = now()
      WHERE cache_purge_state.at < now() - make_interval(secs => ${BROAD_MIN_SEC})
      RETURNING k`) as unknown[];
    return r.length > 0;
  } catch {
    return true; // 판정 실패 시 기존 동작(항상 purge) — 캐시를 남겨 거짓을 보여주는 쪽으로 틀리지 않는다
  }
}

// 🧹 카페 공개상태 변경(비공개/복원/삭제) 시 **모든 캐시 레이어** 무효화 — 단일 진입점.
//   원칙(2026-07-01 사고): DB만 바꾸면 CDN·ISR·search_cache가 옛 상태를 계속 낸다.
//   API는 always-fresh(max-age=0)로 이미 해결 — 남은 레이어 = ①search_cache(DB) ②ISR 페이지(/c/[id]·share·area·sitemap).
//   revalidatePath는 route handler 컨텍스트에서만 유효하므로 동적 import + graceful.
export async function invalidateCafeCaches(ids: number[]): Promise<void> {
  // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 한 곳 비공개는 동네→구 지도와 무관한데,
  //   같이 지우면 다음 검색이 전수 스캔(6,565페이지)으로 지도를 다시 만든다(불필요한 비용).
  const broad = await claimBroadPurge();
  if (broad) await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
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
    //   ⬆️ 여기까지는 **항상** 한다(카페 상세·공유·지도 = 소비자가 바로 보는 것).
    //   ⬇️ 아래 유형 전체 purge만 묶는다 — 한 번에 4,163페이지를 식히므로 카페마다 하면 캐시가 존재할 수 없다.
    if (!broad) return;
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
    await remoteRevalidate(ids, broad).catch(async (e2) => {
      const { noteSilentFail } = await import("./silentFail");
      await noteSilentFail("cacheInvalidate.remote", e2 ?? e).catch(() => {});
    });
  }
}

/** 요청 컨텍스트 밖에서 ISR을 지우는 유일한 방법 — 프로덕션 안에서 실행시킨다. */
async function remoteRevalidate(ids: number[], broad = true): Promise<void> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD 미설정 — 원격 무효화 불가");
  const r = await fetch("https://dongnecoffeenote.com/api/admin/revalidate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-password": pw },
    //   🔴 broad를 함께 보낸다 — 이걸 안 보내면 원격이 유형 전체를 또 지워 묶음이 무의미해진다.
    //      주 호출자가 맥의 로컬 워커(요청 컨텍스트 밖)라 사실상 이 경로가 전부다.
    body: JSON.stringify({ ids: ids.slice(0, 50), broad }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`원격 무효화 실패 ${r.status}`);
}
