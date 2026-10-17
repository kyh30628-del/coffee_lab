import { sql, ensureOnce } from "./db";
import { pagesForCafe, isToken, PUB_TOKEN, type CachePageRow } from "./cachePages";

// 🧹 카페 변경 → 캐시 무효화 단일 진입점(CLAUDE.md §2.5).
//
// ## 2026-10-10 재설계 — "유형 전체 purge"를 "실린 페이지만"으로(CEO "ISR·재생성 진짜 제대로")
//   예전: 카페 1곳마다(6시간 창당 1회로 묶었어도) `/area/[gu]/[taste]` 등 유형 전체 ≈ 4,163페이지 +
//         sitemap + search_cache 전삭. 식은 페이지를 크롤러가 밟을 때마다 재생성 → ISR Write가 비용의 64%.
//         그리고 상세 경로는 앞 50곳만 지워 51번째부터는 옛 화면이 남았다(버그).
//   지금:
//   ① 상세(/c/{id}·/share/{id}·og) — 넘겨받은 **전부** 즉시(50곳 상한 제거). 소비자가 들어가 보는 화면.
//   ② 목록 — lib/cachePages가 계산한 "그 카페가 실린 페이지"만, 바뀌기 전 ∪ 바뀐 후.
//      즉시 지우지 않고 큐(cache_inval_queue)에 모은다. 경로 기본키라 같은 페이지는 한 번만 지워진다.
//        tier 1(매시) = 공개/등급이 바뀐 카페 — 비공개가 목록에 오래 남으면 안 된다.
//        tier 2(매일) = 그 밖의 변경(후기 재합성 등) — 상세는 ①로 즉시 맞고, 목록 한 줄 인용만 하루 늦는다.
//      비우는 쪽: app/api/cron-cache-flush.
//   ③ 지도(/api/cafes) — 공개/등급이 바뀐 때만 태그로 즉시 purge(2분에 1회로 묶음). 그 밖엔 CDN 10분 만료.
//   ④ search_cache — 공개가 바뀐 때만, 10분에 1회로 묶어 비운다(예전엔 매번 전삭이라 캐시가 늘 0행이었다).
//   한 번도 공개된 적 없는 카페(재합성 보류 등)는 목록·지도를 건드리지 않는다.
//
//   이전 집합은 cafe_cache_pages에 둔다(cafes 행을 건드리면 updated_at·지도 버전이 흔들린다).

export const CAFES_MAP_TAG = "cafes-map";
const SEARCH_WIPE_MIN_SEC = 600;
const MAP_PURGE_MIN_SEC = 120;
const REMOTE_CHUNK = 200;

export async function ensureCacheTables(): Promise<void> {
  await ensureOnce("cacheInval.tables.v1", async () => {
    await sql`CREATE TABLE IF NOT EXISTS cache_purge_state (k TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS cafe_cache_pages (id BIGINT PRIMARY KEY, pages TEXT[] NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS cache_inval_queue (path TEXT PRIMARY KEY, tier SMALLINT NOT NULL, enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  });
}

/** 창 안에서 첫 호출만 true(프로세스가 여러 개여도 원자적). 판정 실패 시 true — 덜 지우는 쪽으로 틀리지 않는다. */
async function claim(k: string, minSec: number): Promise<boolean> {
  try {
    const r = (await sql`INSERT INTO cache_purge_state (k, at) VALUES (${k}, now())
      ON CONFLICT (k) DO UPDATE SET at = now()
      WHERE cache_purge_state.at < now() - make_interval(secs => ${minSec})
      RETURNING k`) as unknown[];
    return r.length > 0;
  } catch { return true; }
}

async function isSeeded(): Promise<boolean> {
  try { return ((await sql`SELECT 1 FROM cache_purge_state WHERE k='ccp_seeded'`) as unknown[]).length > 0; }
  catch { return false; }
}

const gradeOf = (pages: string[]) => pages.find((p) => p.startsWith("@g:")) ?? "";

export async function enqueuePaths(paths: string[], tier: 1 | 2): Promise<void> {
  const list = [...new Set(paths.filter((p) => p && !isToken(p)))];
  if (!list.length) return;
  await sql`INSERT INTO cache_inval_queue (path, tier)
    SELECT p, ${tier}::smallint FROM unnest(${list}::text[]) AS p
    ON CONFLICT (path) DO UPDATE SET tier = LEAST(cache_inval_queue.tier, EXCLUDED.tier)`;
}

/** 이전 집합과 새 집합을 비교해 목록을 큐에 넣고 새 집합을 저장한다. 공개/등급 변화 여부를 돌려준다. */
export async function diffAndEnqueue(ids: number[]): Promise<{ pubChanged: boolean; gradeChanged: boolean }> {
  await ensureCacheTables();
  const rows = (await sql`SELECT c.id, c.published, c.area, c.dong, c.synth_grade, c.synth_count, c.char_scores, c.facets, c.created_at,
      p.pages AS old_pages
    FROM cafes c LEFT JOIN cafe_cache_pages p ON p.id = c.id
    WHERE c.id = ANY(${ids}::bigint[])`) as (CachePageRow & { id: number; old_pages: string[] | null })[];
  const seeded = rows.some((r) => r.old_pages == null && !r.published) ? await isSeeded() : true;
  const hourly: string[] = [], daily: string[] = [];
  const upIds: number[] = [], upPages: string[] = [];
  let pubChanged = false, gradeChanged = false;
  for (const r of rows) {
    const next = pagesForCafe(r);
    let prev = r.old_pages;
    if (prev == null) {
      // 기록 없음 = 시드 이후라면 한 번도 공개된 적 없는 카페. 시드 전이면 공개였을 수 있으니 공개 가정으로 계산.
      prev = !r.published && !seeded ? pagesForCafe({ ...r, published: true }) : [];
    }
    const pc = prev.includes(PUB_TOKEN) !== next.includes(PUB_TOKEN);
    const gc = !pc && next.includes(PUB_TOKEN) && gradeOf(prev) !== gradeOf(next);
    if (pc) pubChanged = true;
    if (gc) gradeChanged = true;
    const union = [...new Set([...prev, ...next])];
    (pc || gc ? hourly : daily).push(...union);
    if (r.old_pages != null || next.length) {
      upIds.push(Number(r.id));
      upPages.push(JSON.stringify(next));
    }
  }
  if (pubChanged) hourly.push("/area");
  await enqueuePaths(hourly, 1);
  await enqueuePaths(daily, 2);
  if (upIds.length) {
    await sql`INSERT INTO cafe_cache_pages (id, pages, at)
      SELECT u.id, ARRAY(SELECT jsonb_array_elements_text(u.pages::jsonb)), now()
      FROM unnest(${upIds}::bigint[], ${upPages}::text[]) AS u(id, pages)
      ON CONFLICT (id) DO UPDATE SET pages = EXCLUDED.pages, at = now()`;
  }
  return { pubChanged, gradeChanged };
}

/** 지도 데이터 CDN 항목 삭제 — 태그(Vercel-Cache-Tag) + 라우트 경로 둘 다. 요청 컨텍스트 안에서만 호출. */
export async function purgeMapCache(): Promise<void> {
  const { revalidateTag, revalidatePath } = await import("next/cache");
  revalidateTag(CAFES_MAP_TAG, { expire: 0 });
  revalidatePath("/api/cafes");
}

function revalidateDetails(revalidatePath: (p: string) => void, ids: number[]) {
  for (const id of ids) {
    revalidatePath(`/c/${id}`);
    revalidatePath(`/share/${id}`);
    // 🌙 OG 이미지는 별도 라우트라 /c/[id] purge로 안 지워진다(2026-09-02).
    revalidatePath(`/c/${id}/opengraph-image`);
  }
}

/** 내용만 바뀐 경우용 **좁은 무효화** — 상세 1장만 지운다(2026-10-17, 깊은 수집 레인 전용).
 *
 *  비용 근거: invalidateCafeCaches는 카페당 ISR을 **3장** 지운다 —
 *    `/c/{id}` · `/share/{id}` · `/c/{id}/opengraph-image`.
 *  그중 **OG가 가장 비싸다**: 전용 라우트가 4.5MB 한글 폰트(data/fonts/NanumSeongSirCe.ttf)를 읽어
 *  이미지를 다시 그린다. 그런데 OG에 실리는 건 이름·등급·후기 수뿐이라 **후기가 늘어도 그림은 거의 같다**.
 *  `/share/{id}`도 공유로 들어온 사람만 본다.
 *  → 등급·공개가 안 바뀌는 변경은 상세 1장만. **카페당 ISR write 3 → 1(-67%)**.
 *
 *  ⚠️ 등급·공개가 바뀌었으면 쓰지 말 것 — 목록·지도·검색·OG까지 어긋난다(그때는 invalidateCafeCaches).
 */
export async function invalidateCafeDetailOnly(ids: number[]): Promise<void> {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!list.length) return;
  try {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/c/${list[0]}`); // 요청 컨텍스트 밖이면 여기서 던진다 → 원격 위임
    for (const id of list) revalidatePath(`/c/${id}`);
  } catch (e) {
    await remoteInvalidate(list, "detail").catch(async (e2) => {
      const { noteSilentFail } = await import("./silentFail");
      await noteSilentFail("cacheInvalidate.detailRemote", e2 ?? e).catch(() => {});
    });
  }
}

export async function invalidateCafeCaches(ids: number[]): Promise<void> {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (!list.length) return;
  let revalidatePath: (p: string) => void;
  try {
    revalidatePath = (await import("next/cache")).revalidatePath;
    // 요청 컨텍스트 밖(맥의 로컬 워커·스크립트)이면 여기서 던진다 → 프로덕션에 위임.
    revalidatePath(`/c/${list[0]}`);
  } catch (e) {
    // 🔴 2026-08-31 — 예전엔 이걸 빈 catch로 삼켜 DB는 비공개인데 CDN이 옛 페이지를 계속 냈다(id24609, 36분 HIT).
    await remoteInvalidate(list).catch(async (e2) => {
      const { noteSilentFail } = await import("./silentFail");
      await noteSilentFail("cacheInvalidate.remote", e2 ?? e).catch(() => {});
    });
    return;
  }
  revalidateDetails(revalidatePath, list);
  let changed = { pubChanged: true, gradeChanged: true };
  try {
    changed = await diffAndEnqueue(list);
  } catch (e) {
    // 비교 실패 시 목록이 옛 상태로 남지 않도록 지도만은 지운다(목록은 매일 보정 대사가 잡는다).
    const { noteSilentFail } = await import("./silentFail");
    await noteSilentFail("cacheInvalidate.diff", e).catch(() => {});
  }
  if (changed.pubChanged || changed.gradeChanged) {
    if (await claim("map", MAP_PURGE_MIN_SEC)) await purgeMapCache().catch(() => {});
  }
  if (changed.pubChanged && (await claim("search", SEARCH_WIPE_MIN_SEC))) {
    // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 공개 변화와 무관하고 다시 만들면 전수 스캔이다.
    await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
  }
}

/** 요청 컨텍스트 밖에서 ISR을 지우는 유일한 방법 — 프로덕션 안에서 같은 함수를 실행시킨다. */
async function remoteInvalidate(ids: number[], mode?: "detail"): Promise<void> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("ADMIN_PASSWORD 미설정 — 원격 무효화 불가");
  for (let i = 0; i < ids.length; i += REMOTE_CHUNK) {
    const r = await fetch("https://dongnecoffeenote.com/api/admin/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": pw },
      // mode:"detail" = 상세 1장만(내용 변경). 없으면 종전대로 전체(상세·공유·OG + 목록 diff).
      body: JSON.stringify({ ids: ids.slice(i, i + REMOTE_CHUNK), mode }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`원격 무효화 실패 ${r.status}`);
  }
}
