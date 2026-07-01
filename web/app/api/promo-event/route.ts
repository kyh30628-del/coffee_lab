import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 쇼케이스 1차 성과 집계 — 노출(view)·클릭(click)·영상재생(play). 익명·공개. 승인된 홍보만 카운트.
// (우리 앱에서 직접 측정한 1차 데이터 — 외부 약관과 무관)
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const cafeId = Number(body.cafeId);
    const type = String(body.type ?? "");
    if (!cafeId || !["view", "click", "play"].includes(type)) return NextResponse.json({ ok: false }, { status: 400 });
    await sql`CREATE TABLE IF NOT EXISTS promo_daily (cafe_id INT, day DATE, views INT DEFAULT 0, clicks INT DEFAULT 0, plays INT DEFAULT 0, PRIMARY KEY (cafe_id, day))`;
    // 승인된 프로모만 집계 — cafe_promos(누적)는 approved=true만 올리는데 promo_daily(월)는 무조건 올려 월>누적 불일치·고아행이 생겼음.
    const appr = (await sql`SELECT 1 FROM cafe_promos WHERE cafe_id=${cafeId} AND approved=true LIMIT 1`) as any[];
    if (!appr.length) return NextResponse.json({ ok: true, skipped: "not-approved" });
    if (type === "view") {
      await sql`UPDATE cafe_promos SET views = COALESCE(views,0)+1 WHERE cafe_id=${cafeId} AND approved=true`;
      await sql`INSERT INTO promo_daily (cafe_id, day, views) VALUES (${cafeId}, (now() AT TIME ZONE 'Asia/Seoul')::date, 1) ON CONFLICT (cafe_id, day) DO UPDATE SET views = promo_daily.views + 1`;
    } else if (type === "click") {
      await sql`UPDATE cafe_promos SET clicks = COALESCE(clicks,0)+1 WHERE cafe_id=${cafeId} AND approved=true`;
      await sql`INSERT INTO promo_daily (cafe_id, day, clicks) VALUES (${cafeId}, (now() AT TIME ZONE 'Asia/Seoul')::date, 1) ON CONFLICT (cafe_id, day) DO UPDATE SET clicks = promo_daily.clicks + 1`;
    } else {
      await sql`UPDATE cafe_promos SET plays = COALESCE(plays,0)+1 WHERE cafe_id=${cafeId} AND approved=true`;
      await sql`INSERT INTO promo_daily (cafe_id, day, plays) VALUES (${cafeId}, (now() AT TIME ZONE 'Asia/Seoul')::date, 1) ON CONFLICT (cafe_id, day) DO UPDATE SET plays = promo_daily.plays + 1`;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
