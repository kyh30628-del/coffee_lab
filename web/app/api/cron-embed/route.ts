import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedBatch, toVectorLiteral, EMBED_DIM, hasEmbedKey, buildCafeEmbedText } from "@/lib/embed";
import { PRIORITY_AREAS } from "@/lib/discover";
import { recordRun } from "@/lib/agentLog";
export const runtime = "nodejs";
export const maxDuration = 300;

// 매일(Vercel cron) 임베딩 안 된 카페를 채운다. 무료 일일 쿼터 내에서 점진 완성 + 신규 유지.
// Vercel cron은 CRON_SECRET을 Authorization 헤더로 자동 전송.
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!hasEmbedKey()) return NextResponse.json({ ok: false, error: "embed key 미설정" }, { status: 400 });
    await ensureSchema();
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await sql.query(`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS embedding vector(${EMBED_DIM})`);
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS embed_updated TIMESTAMPTZ`;

    // NULL(미임베딩) 먼저, 그다음 재합성으로 오래된(embed_updated < synth_updated) 것 갱신.
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS pipeline_status TEXT`.catch(() => {});
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
    const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published = true AND embedding IS NULL`)[0].n;
    await recordRun("cron-embed", true, `임베딩 ${updated} 남음 ${remain}`, updated);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), embedded: updated, remaining: remain });
  } catch (e) {
    await recordRun("cron-embed", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
