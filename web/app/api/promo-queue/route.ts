import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 홍보 생성 큐 — 사장님 맥의 로컬 배치(promo-batch, Max 구독)가 이용.
// GET: ai_pending 홍보 목록(카페명·소개글·사진). POST: 생성 결과 저장 + pending 해제.
function authed(req: NextRequest): boolean {
  const s = process.env.CRON_SECRET;
  if (s && req.headers.get("authorization") === `Bearer ${s}`) return true;
  return !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS ai_pending BOOLEAN DEFAULT false`;
    await sql`ALTER TABLE cafe_promos ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT false`;
    // review=1: 관리자 승인 대기(생성 완료 & 미승인). 기본: 로컬 배치용 AI 생성 대기.
    if (req.nextUrl.searchParams.get("review")) {
      // 승인 대기 + 공개 중인 홍보 모두(미승인 먼저) — 승인·우선노출·성과 관리
      const rows = await sql`
        SELECT p.cafe_id, p.intro, p.photos, p.ai_headline, p.ai_tagline, p.ai_points, p.ai_pending, p.approved, p.style, p.video_url, p.featured, p.featured_until, p.views, p.clicks, p.plays, c.name, c.area
        FROM cafe_promos p JOIN cafes c ON c.id = p.cafe_id
        WHERE p.published = true ORDER BY p.approved ASC, p.updated_at DESC LIMIT 80`;
      return NextResponse.json({ ok: true, review: rows });
    }
    const rows = await sql`
      SELECT p.cafe_id, p.intro, p.photos, c.name, c.area
      FROM cafe_promos p JOIN cafes c ON c.id = p.cafe_id
      WHERE p.ai_pending = true ORDER BY p.updated_at ASC LIMIT 20`;
    return NextResponse.json({ ok: true, pending: rows });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const cafeId = Number(body.cafeId);
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    // 관리자 승인/반려
    if (body.approve) { await sql`UPDATE cafe_promos SET approved=true WHERE cafe_id=${cafeId}`; return NextResponse.json({ ok: true, approved: true }); }
    if (body.generate) { await sql`UPDATE cafe_promos SET ai_pending=true, updated_at=now() WHERE cafe_id=${cafeId}`; return NextResponse.json({ ok: true, queued: true }); } // 관리자만 AI 생성 트리거 → 로컬 배치가 처리
    if (body.feature) { // 우선 노출 ON — 구독 기간만큼(기본 30일). 만료 시 자동 해제.
      const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
      await sql`UPDATE cafe_promos SET featured=true, featured_until = now() + make_interval(days => ${days}) WHERE cafe_id=${cafeId}`;
      return NextResponse.json({ ok: true, featured: true, days });
    }
    if (body.unfeature) { await sql`UPDATE cafe_promos SET featured=false, featured_until=NULL WHERE cafe_id=${cafeId}`; return NextResponse.json({ ok: true, featured: false }); }
    if (body.reject) { await sql`UPDATE cafe_promos SET approved=false, published=false WHERE cafe_id=${cafeId}`; return NextResponse.json({ ok: true, rejected: true }); }
    if (body.fail) { await sql`UPDATE cafe_promos SET ai_pending=false WHERE cafe_id=${cafeId}`; return NextResponse.json({ ok: true, cleared: true }); }
    const headline = String(body.headline ?? "").slice(0, 24);
    const tagline = String(body.tagline ?? "").slice(0, 60);
    const points = Array.isArray(body.points) ? body.points.slice(0, 3).map((p: any) => String(p).slice(0, 20)) : [];
    if (!headline) return NextResponse.json({ ok: false, error: "headline 필요" }, { status: 400 });
    await sql`UPDATE cafe_promos SET ai_headline=${headline}, ai_tagline=${tagline}, ai_points=${JSON.stringify(points)}, ai_pending=false, updated_at=now() WHERE cafe_id=${cafeId}`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
