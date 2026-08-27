import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema , ensureOnce } from "@/lib/db";
import { embedBatch, toVectorLiteral, EMBED_DIM, hasEmbedKey, buildCafeEmbedText } from "@/lib/embed";
import { finalizePipeline } from "@/lib/synthStore";
import { PRIORITY_AREAS } from "@/lib/discover";
import { recordRun } from "@/lib/agentLog";
import { startJobRun } from "@/lib/blobBudget";
import { openScope } from "@/lib/writeScope";
import { fingerprintOf } from "@/lib/runLedger";
export const runtime = "nodejs";
export const maxDuration = 300;

// 매일(Vercel cron) 임베딩 안 된 카페를 채운다. 무료 일일 쿼터 내에서 점진 완성 + 신규 유지.
// Vercel cron은 CRON_SECRET을 Authorization 헤더로 자동 전송.
export async function GET(req: NextRequest) {
  startJobRun("cron-embed"); openScope("cron-embed"); // 💰🔐 하네스 L1·L3 — 큰 컬럼 계량 + 쓰기 스코프
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!hasEmbedKey()) return NextResponse.json({ ok: false, error: "embed key 미설정" }, { status: 400 });
    await ensureSchema();
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    // 💰 2026-08-22 잔여 수리: 이 DDL도 매 실행마다 돌고 있었다 — 배포 단위 1회로.
    await ensureOnce("cron-embed.ddl", async () => {
      await sql.query(`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS embedding vector(${EMBED_DIM})`);
      await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS embed_updated TIMESTAMPTZ`;
  
      // NULL(미임베딩) 먼저, 그다음 재합성으로 오래된(embed_updated < synth_updated) 것 갱신.
      await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS pipeline_status TEXT`.catch(() => {});
    });
    // 신규 pending도 임베딩(공개 게이트 통과에 필요) — pending 최우선, 그다음 공개 카페.
    const rows = (await sql`
      SELECT id, name, area, synth_identity, signature, note, vibe, uses, beans, char_scores, synth_reviews
      FROM cafes
      WHERE (published = true OR pipeline_status = 'pending')
        AND synth_updated IS NOT NULL
        AND (embedding IS NULL OR embed_updated IS NULL OR embed_updated < synth_updated)
      ORDER BY (pipeline_status = 'pending') DESC NULLS LAST, (area = ANY(${PRIORITY_AREAS})) DESC, (embedding IS NOT NULL), embed_updated ASC NULLS FIRST
      LIMIT 600`) as unknown as any[];

    let updated = 0;
    if (rows.length > 0) {
      const vecs = await embedBatch(rows.map(buildCafeEmbedText), "RETRIEVAL_DOCUMENT");
      for (let i = 0; i < rows.length; i++) {
        const v = vecs[i];
        if (!v || v.length !== EMBED_DIM) continue;
        await sql`UPDATE cafes SET embedding = ${toVectorLiteral(v)}::vector, embed_updated = now() WHERE id = ${rows[i].id}`;
        updated++;
      }
    }
    // 🔗 B(2026-08-27): 임베딩 직후 바로 공개 승격을 붙인다.
    //   이유: cron-embed는 하루 4회(08/12/16/20:01 KST)인데 승격(orchestrator?heal)은 하루 2회(12:30·20:30)라
    //   순서가 어긋나 **공개가 최대 4.5시간 지연**됐다(실제 피해: 강원 고성 '바다정원' 등 578곳).
    //   💰 새 크론·새 함수 실행 0 — 이미 도는 이 함수 안에서 UPDATE 한 번. 임베딩이 없었으면 부르지도 않는다.
    //   ⚠️ 캐시 무효화는 하지 않는다 — heal도 '비공개'일 때만 search_cache를 지운다(공개는 자연 만료 대기).
    //   공개를 즉시 반영하려고 캐시를 지우면 검색이 통째로 재계산돼 비용이 는다.
    let promoted = 0;
    if (updated > 0) {
      try { promoted = (await finalizePipeline()).promoted; } catch { /* 승격 실패가 임베딩 성과를 되돌리지 않는다 */ }
    }
    // 🔴 A(2026-08-27): '남음' 집계가 큐 조건과 달라 **적체를 0으로 보고**하던 사각지대를 고친다.
    //   큐는 (published OR pending) + 재임베딩 대상까지 집는데, 집계는 published만 세어
    //   실제 577곳이 밀려 있는데 로그에 "남음 0"이 찍혔다(LIMIT 600에 잘려도 티가 안 났다).
    //   관제탑·정체 탐지(fingerprint)가 이 값을 쓰므로 반드시 큐와 같은 조건이어야 한다.
    const remain = (await sql`SELECT COUNT(*)::int n FROM cafes
      WHERE (published = true OR pipeline_status = 'pending')
        AND synth_updated IS NOT NULL
        AND (embedding IS NULL OR embed_updated IS NULL OR embed_updated < synth_updated)`)[0].n;
    // 📒 하네스 L5 — 지문은 **남은 일(백로그)** 기준. 할 일이 없으면(0) 지문을 안 남긴다 —
    //   "일이 없어 조용한 것"과 "일이 있는데 못 끝내는 것"을 구분해야 정체 탐지가 소음이 안 된다.
    await recordRun("cron-embed", true, `임베딩 ${updated} 남음 ${remain}${promoted ? ` · 공개승격 ${promoted}` : ""}`, updated, { fingerprint: (remain) > 0 ? fingerprintOf({ remain, updated, promoted }) : undefined, metrics: { remain, updated, promoted } });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), embedded: updated, remaining: remain, promoted });
  } catch (e) {
    await recordRun("cron-embed", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
