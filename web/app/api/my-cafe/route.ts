import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { put } from "@vercel/blob";
import { hashPin } from "@/lib/pin";
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
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS memory TEXT`.catch(() => {});
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false`.catch(() => {});
  // finalized: 위치인증(임시저장) 후 "추억을 기록합니다" 확정 단계. 기존 행은 DEFAULT true로 자동 백필(이미 노출 중이던 기록 유지).
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS finalized BOOLEAN DEFAULT true`.catch(() => {});
  // 공용 PC 잠금 PIN(기기별). GET에서 잠금 판단에 사용.
  await sql`CREATE TABLE IF NOT EXISTS device_pins (device_id TEXT PRIMARY KEY, pin_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
}

// 하버사인 거리(m)
function distM(la1: number, ln1: number, la2: number, ln2: number) {
  const R = 6371000, rad = (d: number) => d * Math.PI / 180;
  const dLa = rad(la2 - la1), dLn = rad(ln2 - ln1);
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dLn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const RADIUS_M = 30;

// 내 기록 목록 (지도 MY PIN + 과거 기억 확인용)
export async function GET(req: NextRequest) {
  await ensure();
  const device = req.nextUrl.searchParams.get("device");
  if (!device) return NextResponse.json({ ok: true, cafes: [] });
  // 공용 PC 잠금: PIN이 설정돼 있고 올바른 PIN이 없으면 기록을 내주지 않음(locked)
  const [pinRow] = await sql`SELECT pin_hash FROM device_pins WHERE device_id = ${device} LIMIT 1` as any[];
  if (pinRow) {
    const pin = req.nextUrl.searchParams.get("pin") || "";
    if (!pin || pinRow.pin_hash !== hashPin(device, pin))
      return NextResponse.json({ ok: true, locked: true, hasPin: true, cafes: [] });
  }
  const rows = await sql`
    SELECT c.id, c.name, c.area, c.lat, c.lng, v.photo_url, v.memory, v.favorite, v.created_at
    FROM user_visits v JOIN cafes c ON c.id = v.cafe_id
    WHERE v.device_id = ${device} AND v.verified = true AND v.finalized = true
    ORDER BY v.favorite DESC, v.created_at DESC`;
  return NextResponse.json({ ok: true, cafes: rows });
}

// 내 카페 등록 — 2단계
//  action="stage"(기본): ★30m 위치 인증 필수 → 임시저장(finalized=false). "그 카페에서의 경험"임을 보증.
//  action="commit": 위치 비교 없음 → "추억을 기록합니다" 확정(finalized=true). 아무데서나 가능.
export async function POST(req: NextRequest) {
  try {
    await ensure();
    const body = await req.json();
    const { action, cafeId, device, userLat, userLng, photoBase64, memory, favorite, pin } = body;
    if (!cafeId || !device) return NextResponse.json({ ok: false, error: "필수값 누락" }, { status: 400 });

    // 공용 PC 잠금: PIN 설정된 기기는 올바른 PIN 없이 기록 추가/수정 불가
    const [pinRow] = await sql`SELECT pin_hash FROM device_pins WHERE device_id = ${device} LIMIT 1` as any[];
    if (pinRow && pinRow.pin_hash !== hashPin(device, pin || ""))
      return NextResponse.json({ ok: false, locked: true, error: "잠금 상태예요. PIN을 먼저 입력해주세요." }, { status: 403 });

    const [cafe] = await sql`SELECT id, name, lat, lng FROM cafes WHERE id = ${cafeId} AND published = true LIMIT 1` as any[];
    if (!cafe || cafe.lat == null) return NextResponse.json({ ok: false, error: "카페를 찾을 수 없어요" }, { status: 404 });

    const mem = typeof memory === "string" && memory.trim() ? memory.slice(0, 2000) : null;
    const fav = !!favorite;

    // ── 2단계: 최종 기록(추억을 기록합니다) — 위치 비교 없음 ──
    if (action === "commit") {
      // 임시저장(위치인증 통과한 stage)이 선행돼야 함
      const [staged] = await sql`SELECT id FROM user_visits WHERE cafe_id = ${cafeId} AND device_id = ${device} LIMIT 1` as any[];
      if (!staged) return NextResponse.json({ ok: false, error: "먼저 카페에서 위치 인증(임시저장)을 해주세요." }, { status: 409 });
      await sql`UPDATE user_visits SET
          finalized = true,
          memory = COALESCE(${mem}, memory),
          favorite = ${fav},
          created_at = now()
        WHERE cafe_id = ${cafeId} AND device_id = ${device}`;
      return NextResponse.json({ ok: true, cafe: { id: cafe.id, name: cafe.name }, finalized: true });
    }

    // ── 1단계: 임시저장 — 30m 위치 인증 필수 ──
    if (userLat == null || userLng == null)
      return NextResponse.json({ ok: false, error: "위치 정보가 필요해요" }, { status: 400 });
    const d = distM(Number(userLat), Number(userLng), Number(cafe.lat), Number(cafe.lng));
    if (d > RADIUS_M)
      return NextResponse.json({ ok: false, error: `카페에서 ${Math.round(d)}m 떨어져 있어요. ${RADIUS_M}m 안에서 임시저장할 수 있어요.`, dist: Math.round(d) }, { status: 403 });

    // 사진 Blob 업로드(있으면)
    let photoUrl: string | null = null;
    if (photoBase64 && typeof photoBase64 === "string" && photoBase64.startsWith("data:image")) {
      const b64 = photoBase64.split(",")[1];
      const buf = Buffer.from(b64, "base64");
      const blob = await put(`visits/${device.slice(0, 8)}-${cafeId}-${Date.now()}.jpg`, buf, { access: "public", contentType: "image/jpeg" });
      photoUrl = blob.url;
    }

    // 신규는 finalized=false(임시), 기존 기록 재편집이면 기존 finalized 유지(노출 끊기지 않게)
    await sql`INSERT INTO user_visits (cafe_id, device_id, photo_url, memory, favorite, verified, finalized)
      VALUES (${cafeId}, ${device}, ${photoUrl}, ${mem}, ${fav}, true, false)
      ON CONFLICT (cafe_id, device_id) DO UPDATE SET
        photo_url = COALESCE(EXCLUDED.photo_url, user_visits.photo_url),
        memory = COALESCE(EXCLUDED.memory, user_visits.memory),
        favorite = EXCLUDED.favorite, verified = true,
        finalized = user_visits.finalized, created_at = now()`;

    return NextResponse.json({ ok: true, staged: true, cafe: { id: cafe.id, name: cafe.name }, dist: Math.round(d) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
