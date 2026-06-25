import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore } from "@/lib/synthStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const synthOne = synthAndStore;

function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_grade TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_identity TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_basis TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_count INT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_acidity REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_body REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_sweet REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_updated TIMESTAMPTZ`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_reviews JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS char_scores JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_quality JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS review_dates JSONB`;

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 50);
    const refresh = !!body.refresh; // true면 새로 수집(쿼터 사용), 기본은 저장된 raw 재사용
    // populate 모드: raw 캐시 '없는' 카페만 수집(예열·쿼터 효율 — 이미 캐시된 건 건드리지 않음)
    const populate = body.mode === "populate";
    // ids 지정: 특정 카페만 캐시로 재합성(규칙 변경 즉시 적용·검증용)
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => Number.isFinite(n)).slice(0, 50) : null;

    const targets = ids
      ? (await sql`SELECT id, name, area FROM cafes WHERE id = ANY(${ids})`) as unknown as { id: number; name: string; area: string }[]
      : populate
      ? (await sql`SELECT id, name, area FROM cafes WHERE raw_reviews IS NULL ORDER BY id ASC LIMIT ${limit}`) as unknown as { id: number; name: string; area: string }[]
      : (await sql`SELECT id, name, area FROM cafes ORDER BY synth_updated ASC NULLS FIRST LIMIT ${limit}`) as unknown as { id: number; name: string; area: string }[];

    const results = [];
    for (const cafe of targets) {
      try { results.push(await synthOne(cafe, { refresh })); }
      catch (e) { results.push({ id: cafe.id, name: cafe.name, ok: false, reason: String(e) }); }
      await new Promise((r) => setTimeout(r, 400));
    }
    const okN = results.filter((r) => r.ok).length;
    const skipped = results.filter((r: any) => r.skipped).length; // 쿼터/오류로 보존된 건수
    const remainingNull = populate ? (await sql`SELECT COUNT(*)::int n FROM cafes WHERE raw_reviews IS NULL`)[0].n : undefined;
    return NextResponse.json({ ok: true, processed: results.length, success: okN, skipped, remainingNull, failed: results.length - okN, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    await ensureSchema();
    const rows = await sql`SELECT name, area, synth_grade, synth_count, synth_updated FROM cafes WHERE published = true ORDER BY synth_updated ASC NULLS FIRST`;
    return NextResponse.json({ ok: true, cafes: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
