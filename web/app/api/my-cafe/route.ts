import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { put } from "@vercel/blob";
export const runtime = "nodejs";

// 방문 기록 테이블 (익명 기기기반). 사용자 raw 좌표는 저장 안 함(개인정보 최소화).
async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS user_visits (
    id SERIAL PRIMARY KEY,
    cafe_id INT REFERENCES cafes(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    photo_url TEXT,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(cafe_id, device_id)
  )`;
}

// 하버사인 거리(m)
function distM(la1: number, ln1: number, la2: number, ln2: number) {
  const R = 6371000, rad = (d: number) => d * Math.PI / 180;
  const dLa = rad(la2 - la1), dLn = rad(ln2 - ln1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const RADIUS_M = 30; // 인증 반경

// 내가 등록한 카페 목록 (지도 MY PIN용)
export async function GET(req: NextRequest) {
  await ensure();
  const device = req.nextUrl.searchParams.get("device");
  if (!device) return NextResponse.json({ ok: true, cafes: [] });
  const rows = await sql`
    SELECT c.id, c.name, c.area, c.lat, c.lng, v.photo_url, v.created_at
    FROM user_visits v JOIN cafes c ON c.id = v.cafe_id
    WHERE v.device_id = ${device} AND v.verified = true
    ORDER BY v.created_at DESC`;
  return NextResponse.json({ ok: true, cafes: rows });
}

// 내 카페 등록: 30m 위치 인증 통과 시만 저장
export async function POST(req: NextRequest) {
  try {
    await ensure();
    const body = await req.json();
    const { cafeId, device, userLat, userLng, photoBase64 } = body;
    if (!cafeId || !device || userLat == null || userLng == null)
      return NextResponse.json({ ok: false, error: "필수값 누락" }, { status: 400 });

    const [cafe] = await sql`SELECT id, name, lat, lng FROM cafes WHERE id = ${cafeId} AND published = true LIMIT 1` as any[];
    if (!cafe || cafe.lat == null) return NextResponse.json({ ok: false, error: "카페를 찾을 수 없어요" }, { status: 404 });

    // ★ 30m 위치 인증
    const d = distM(Number(userLat), Number(userLng), Number(cafe.lat), Number(cafe.lng));
    if (d > RADIUS_M)
      return NextResponse.json({ ok: false, error: `카페에서 ${Math.round(d)}m 떨어져 있어요. ${RADIUS_M}m 안에서 등록할 수 있어요.`, dist: Math.round(d) }, { status: 403 });

    // 사진 Blob 업로드(있으면)
    let photoUrl: string | null = null;
    if (photoBase64 && typeof photoBase64 === "string" && photoBase64.startsWith("data:image")) {
      const b64 = photoBase64.split(",")[1];
      const buf = Buffer.from(b64, "base64");
      const blob = await put(`visits/${device.slice(0, 8)}-${cafeId}-${Date.now()}.jpg`, buf, { access: "public", contentType: "image/jpeg" });
      photoUrl = blob.url;
    }

    await sql`INSERT INTO user_visits (cafe_id, device_id, photo_url, verified)
      VALUES (${cafeId}, ${device}, ${photoUrl}, true)
      ON CONFLICT (cafe_id, device_id) DO UPDATE SET photo_url = COALESCE(EXCLUDED.photo_url, user_visits.photo_url), verified = true, created_at = now()`;

    return NextResponse.json({ ok: true, cafe: { id: cafe.id, name: cafe.name }, dist: Math.round(d) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
