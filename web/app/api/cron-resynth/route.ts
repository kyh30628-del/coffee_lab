import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore } from "@/lib/synthStore";

export const runtime = "nodejs";
export const maxDuration = 60;

const synthOne = synthAndStore;

// 자동 실행 진입점: 가장 오래 갱신 안 된 카페 몇 곳을 재수집
export async function GET(req: NextRequest) {
  try {
    // 보안: 아무나 이 주소를 호출해 비용을 쓰지 못하게 비밀키 확인
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_reviews JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS char_scores JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_quality JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS review_dates JSONB`;
    // 한 번 실행에 3곳씩만 (비용·시간 보호). 매주 돌면 3곳씩 천천히 최신화.
    const targets = await sql`
      SELECT id, name, area FROM cafes
      WHERE published = true
      ORDER BY synth_updated ASC NULLS FIRST
      LIMIT 3
    ` as unknown as { id: number; name: string; area: string }[];

    const results = [];
    for (const cafe of targets) {
      try { results.push(await synthOne(cafe)); }
      catch (e) { results.push({ name: cafe.name, ok: false, error: String(e) }); }
      await new Promise((r) => setTimeout(r, 400));
    }
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
