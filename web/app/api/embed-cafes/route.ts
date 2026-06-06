import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { embedBatch, toVectorLiteral, EMBED_DIM, hasEmbedKey } from "@/lib/embed";
import { CHAR_AXES } from "@/lib/charScore";
export const runtime = "nodejs";
export const maxDuration = 60;

// 카페별 임베딩 텍스트: 화면·DB·검증 리뷰의 의미를 한 덩어리로.
function buildText(c: any): string {
  const parts: string[] = [c.name];
  if (c.synth_identity) parts.push(c.synth_identity);
  if (c.signature) parts.push(`추천 ${c.signature}`);
  if (c.note) parts.push(c.note);
  if (c.vibe) parts.push(c.vibe);
  if (c.uses) parts.push(`용도 ${c.uses}`);
  if (c.beans) parts.push(`원두 ${c.beans}`);
  const cs = c.char_scores ?? {};
  const chars = CHAR_AXES.filter((a) => (cs[a.key] ?? 0) > 0).sort((a, b) => (cs[b.key] ?? 0) - (cs[a.key] ?? 0)).map((a) => a.label);
  if (chars.length) parts.push(`특징 ${chars.join(", ")}`);
  if (Array.isArray(c.synth_reviews)) parts.push(c.synth_reviews.map((r: any) => r?.quote ?? "").join(" "));
  if (c.area) parts.push(c.area);
  return parts.filter(Boolean).join(". ").slice(0, 6000);
}

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
