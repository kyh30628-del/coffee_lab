import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedBatch, toVectorLiteral, EMBED_DIM, hasEmbedKey, buildCafeEmbedText as buildText } from "@/lib/embed";
export const runtime = "nodejs";
export const maxDuration = 60;

async function ensure() {
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql.query(`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS embedding vector(${EMBED_DIM})`);
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS embed_updated TIMESTAMPTZ`;
}

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD) return true;
  return false;
}

// POST { limit?, force? } — 임베딩 없는 카페부터 limit개씩. force=true면 전체 갱신.
export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!hasEmbedKey()) return NextResponse.json({ ok: false, error: "GOOGLE_AI_KEY 미설정" }, { status: 400 });
    await ensureSchema();
    await ensure();
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 100);
    const force = !!body.force;

    const rows = force
      ? (await sql`SELECT id, name, area, synth_identity, signature, note, vibe, uses, beans, char_scores, synth_reviews
                   FROM cafes WHERE published = true ORDER BY embed_updated ASC NULLS FIRST LIMIT ${limit}`) as unknown as any[]
      : (await sql`SELECT id, name, area, synth_identity, signature, note, vibe, uses, beans, char_scores, synth_reviews
                   FROM cafes WHERE published = true AND embedding IS NULL LIMIT ${limit}`) as unknown as any[];

    if (rows.length === 0) {
      const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published = true AND embedding IS NULL`)[0].n;
      return NextResponse.json({ ok: true, processed: 0, remaining: remain, done: remain === 0 });
    }

    const texts = rows.map(buildText);
    const vecs = await embedBatch(texts, "RETRIEVAL_DOCUMENT");

    let updated = 0;
    for (let i = 0; i < rows.length; i++) {
      const v = vecs[i];
      if (!v || v.length !== EMBED_DIM) continue;
      await sql`UPDATE cafes SET embedding = ${toVectorLiteral(v)}::vector, embed_updated = now() WHERE id = ${rows[i].id}`;
      updated++;
    }
    const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published = true AND embedding IS NULL`)[0].n;
    return NextResponse.json({ ok: true, processed: updated, remaining: remain, done: remain === 0 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureSchema();
    await ensure();
    const done = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published = true AND embedding IS NOT NULL`)[0].n;
    const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published = true AND embedding IS NULL`)[0].n;
    return NextResponse.json({ ok: true, embedded: done, remaining: remain });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
