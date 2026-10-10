import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { ensureCacheTables, enqueuePaths, purgeMapCache } from "@/lib/cafeCacheInvalidate";
import { pagesForCafe, type CachePageRow } from "@/lib/cachePages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 🧺 목록 페이지 무효화 큐 비우기 — lib/cafeCacheInvalidate가 모은 "카페가 실린 페이지"를 묶어서 지운다(2026-10-10).
//   ?tier=hour  매시   공개/등급 변화(tier 1)만
//   ?tier=day   매일   전부 + 보정 대사(아래)
//   ?tier=seed  수동   배포 직후 1회: 공개 카페별 현재 집합을 기록만 한다(무효화 없음). 끝나면 ccp_seeded 표식.
//
// revalidatePath는 "표시"만 한다 — 실제 재생성은 그 페이지에 다음 방문이 올 때 1번(= ISR Write 1건).
//   그래서 비용 상한 = 하루에 지워진 서로 다른 목록 페이지 수(경로 기본키로 중복 제거).
// 한글·공백 경로는 원문과 인코딩형 둘 다 지운다(요청 URL이 어느 쪽으로 키가 잡혔든 맞도록).
//
// 🔁 보정 대사(day): 무효화 함수를 거치지 않고 공개상태가 바뀐 카페(옛 스크립트 등)를 잡는다.
//   ① 공개인데 기록에 @pub가 없음 → 새로 실린 것 ② 기록엔 @pub인데 지금 비공개 → 빠진 것.
const FLUSH_CAP = 4000;
const RECONCILE_CAP = 3000;
const SEED_BATCH = 5000;

const encodePath = (p: string) => p.split("/").map((s) => encodeURIComponent(s)).join("/");

async function flush(tiers: number[]): Promise<number> {
  const rows = (await sql`DELETE FROM cache_inval_queue WHERE path IN (
      SELECT path FROM cache_inval_queue WHERE tier = ANY(${tiers}::smallint[]) ORDER BY tier, enqueued_at LIMIT ${FLUSH_CAP})
    RETURNING path`) as { path: string }[];
  for (const { path } of rows) {
    revalidatePath(path);
    const enc = encodePath(path);
    if (enc !== path) revalidatePath(enc);
  }
  return rows.length;
}

type Row = CachePageRow & { id: number; old_pages: string[] | null };

async function reconcile(): Promise<{ added: number; removed: number }> {
  const added = (await sql`SELECT c.id, c.published, c.area, c.dong, c.synth_grade, c.synth_count, c.char_scores, c.facets, c.created_at, p.pages AS old_pages
    FROM cafes c LEFT JOIN cafe_cache_pages p ON p.id = c.id
    WHERE c.published AND (p.id IS NULL OR NOT ('@pub' = ANY(p.pages)))
    LIMIT ${RECONCILE_CAP}`) as Row[];
  const removed = (await sql`SELECT c.id, c.published, c.area, c.dong, c.synth_grade, c.synth_count, c.char_scores, c.facets, c.created_at, p.pages AS old_pages
    FROM cafe_cache_pages p JOIN cafes c ON c.id = p.id
    WHERE '@pub' = ANY(p.pages) AND NOT c.published
    LIMIT ${RECONCILE_CAP}`) as Row[];
  const paths: string[] = [];
  const ids: number[] = [], pages: string[] = [];
  for (const r of [...added, ...removed]) {
    const next = pagesForCafe(r);
    paths.push(...(r.old_pages ?? []), ...next);
    ids.push(Number(r.id)); pages.push(JSON.stringify(next));
  }
  if (ids.length) {
    await enqueuePaths([...paths, "/area"], 2);
    await saveSets(ids, pages);
  }
  return { added: added.length, removed: removed.length };
}

async function saveSets(ids: number[], pages: string[]) {
  await sql`INSERT INTO cafe_cache_pages (id, pages, at)
    SELECT u.id, ARRAY(SELECT jsonb_array_elements_text(u.pages::jsonb)), now()
    FROM unnest(${ids}::bigint[], ${pages}::text[]) AS u(id, pages)
    ON CONFLICT (id) DO UPDATE SET pages = EXCLUDED.pages, at = now()`;
}

async function seed(): Promise<{ seeded: number; done: boolean }> {
  const rows = (await sql`SELECT c.id, c.published, c.area, c.dong, c.synth_grade, c.synth_count, c.char_scores, c.facets, c.created_at
    FROM cafes c LEFT JOIN cafe_cache_pages p ON p.id = c.id
    WHERE c.published AND p.id IS NULL ORDER BY c.id LIMIT ${SEED_BATCH}`) as Row[];
  if (rows.length) await saveSets(rows.map((r) => Number(r.id)), rows.map((r) => JSON.stringify(pagesForCafe(r))));
  const done = rows.length < SEED_BATCH;
  if (done) await sql`INSERT INTO cache_purge_state (k, at) VALUES ('ccp_seeded', now()) ON CONFLICT (k) DO NOTHING`;
  return { seeded: rows.length, done };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    await ensureCacheTables();
    const tier = req.nextUrl.searchParams.get("tier") || "hour";
    if (tier === "seed") return NextResponse.json({ ok: true, ...(await seed()) });
    if (tier === "day") {
      const rec = await reconcile();
      if (rec.added + rec.removed > 0) await purgeMapCache().catch(() => {});
      const flushed = await flush([1, 2]);
      return NextResponse.json({ ok: true, tier, flushed, ...rec });
    }
    const flushed = await flush([1]);
    return NextResponse.json({ ok: true, tier: "hour", flushed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
}
