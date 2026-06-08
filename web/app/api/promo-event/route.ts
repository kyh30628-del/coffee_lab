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
    if (type === "view") await sql`UPDATE cafe_promos SET views = COALESCE(views,0)+1 WHERE cafe_id=${cafeId} AND approved=true`;
    else if (type === "click") await sql`UPDATE cafe_promos SET clicks = COALESCE(clicks,0)+1 WHERE cafe_id=${cafeId} AND approved=true`;
    else await sql`UPDATE cafe_promos SET plays = COALESCE(plays,0)+1 WHERE cafe_id=${cafeId} AND approved=true`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
