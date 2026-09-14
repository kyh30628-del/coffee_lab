import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ownerScope } from "@/lib/ownerAuth";
import { invalidateCafeCaches } from "@/lib/cafeCacheInvalidate";

export const runtime = "nodejs";

// 📷 손님 사진 승인 대기함 — 결재 #1084(CEO 승인 2026-09-14).
//   🔴 자동 공개 금지. 남의 가게에 엉뚱하거나 부적절한 사진이 걸리면 우리 해자가 통째로 무너진다.
//   승인 전에는 카페 상세의 어떤 경로로도 노출되지 않는다(getPublicReviews가 photo_approved를 본다).
//   💰 비용: 대기 건수가 한 자릿수~수십 수준이라 조회가 가볍다. 새 테이블 0.

export async function GET(req: NextRequest) {
  if ((await ownerScope(req)) !== "admin") return NextResponse.json({ ok: false }, { status: 401 });
  const rows = await sql`SELECT v.id, v.cafe_id, c.name AS cafe_name, c.area, v.photos, v.photo_url, v.memory,
      v.verified, v.is_public, v.created_at
    FROM user_visits v JOIN cafes c ON c.id = v.cafe_id
    WHERE v.photo_approved IS NOT TRUE AND v.photo_reviewed_at IS NULL
      AND (v.photo_url IS NOT NULL OR jsonb_array_length(COALESCE(v.photos,'[]'::jsonb)) > 0)
    ORDER BY v.created_at DESC LIMIT 100`;
  return NextResponse.json({ ok: true, pending: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  if ((await ownerScope(req)) !== "admin") return NextResponse.json({ ok: false }, { status: 401 });
  const { id, approve } = await req.json().catch(() => ({}));
  if (!Number.isInteger(Number(id))) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
  const [row] = (await sql`UPDATE user_visits SET photo_approved=${!!approve}, photo_reviewed_at=now()
    WHERE id=${Number(id)} RETURNING cafe_id`) as unknown as { cafe_id: number }[];
  if (!row) return NextResponse.json({ ok: false, error: "없음" }, { status: 404 });
  // 승인/반려 즉시 상세 캐시를 털어야 화면에 반영된다(캐시 무효화 누락은 과거 반복 사고).
  await invalidateCafeCaches([Number(row.cafe_id)]).catch(() => {});
  return NextResponse.json({ ok: true });
}
