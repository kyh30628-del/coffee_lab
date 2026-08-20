import { NextRequest, NextResponse } from "next/server";
import { sql , ensureOnce } from "@/lib/db";
import { put } from "@vercel/blob";
import { hashPin } from "@/lib/pin";
export const runtime = "nodejs";

// 방문 기록 테이블 (익명 기기기반). 사용자 raw 좌표는 저장 안 함(개인정보 최소화).
// ⚡ warm 인스턴스 재실행 방지 가드(다른 ensure들과 동일 패턴) — 매 요청 DDL 왕복 제거. 동작 불변(IF NOT EXISTS).
let ensured = false;
async function ensure() {
  // 💰 2026-08-20 전수 적용: 이 함수 일부는 메모 플래그조차 없어 **매 요청** DDL이 돌았다 — 배포 단위 1회로.
  await ensureOnce("my-cafe.ensure", async () => {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS user_visits (
    id SERIAL PRIMARY KEY,
    cafe_id INT REFERENCES cafes(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    photo_url TEXT,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(cafe_id, device_id)
  )`;
  // verified: GPS 30m 위치인증 여부. true=현장 인증됨, false='나중에 인증하기'로 저장(미인증).
  // 기존 행은 모두 30m 통과 후 저장돼 verified=true 상태 → 재백필 불필요. 신규 미인증만 false.
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false`.catch(() => {});
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS memory TEXT`.catch(() => {});
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false`.catch(() => {});
  // finalized: 위치인증(임시저장) 후 "추억을 기록합니다" 확정 단계. 기존 행은 DEFAULT true로 자동 백필(이미 노출 중이던 기록 유지).
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS finalized BOOLEAN DEFAULT true`.catch(() => {});
  // photos: 방문 사진 최대 5장(URL 배열). photo_url은 대표(첫 장) — 지도·내보내기 호환 유지.
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS photos JSONB`.catch(() => {});
  // is_public: 공개 선택 시 다른 사용자에게 카페 상세의 '방문자 후기'로 노출(기본 비공개).
  await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`.catch(() => {});
  // 공용 PC 잠금 PIN(기기별). GET에서 잠금 판단에 사용.
  await sql`CREATE TABLE IF NOT EXISTS device_pins (device_id TEXT PRIMARY KEY, pin_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  // 🔎 지도 MY PIN 조회는 device_id 단독 필터(WHERE v.device_id=…) — UNIQUE(cafe_id,device_id)는 선두가 cafe_id라 못 씀. 접근경로만 개선(결과·정렬 불변).
  await sql`CREATE INDEX IF NOT EXISTS idx_user_visits_device ON user_visits(device_id)`.catch(() => {});
  ensured = true;
  });
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
  // 본인 기기 조회는 인증/미인증 모두 노출(미인증은 클라이언트에서 배지로 구분). 공개 노출 게이트(verified=true)는 popular·cafe-reviews에서 별도 유지.
  const rows = await sql`
    SELECT c.id, c.name, c.area, c.lat, c.lng, c.synth_grade, c.synth_identity, v.photo_url, v.photos, v.memory, v.favorite, v.is_public, v.verified, v.created_at
    FROM user_visits v JOIN cafes c ON c.id = v.cafe_id
    WHERE v.device_id = ${device} AND v.finalized = true
    ORDER BY v.favorite DESC, v.verified DESC, v.created_at DESC`;
  return NextResponse.json({ ok: true, cafes: rows });
}

// 내 카페 등록 — 2단계
//  action="stage"(기본): ★30m 위치 인증 필수 → 임시저장(finalized=false). "그 카페에서의 경험"임을 보증.
//  action="commit": 위치 비교 없음 → "추억을 기록합니다" 확정(finalized=true). 아무데서나 가능.
export async function POST(req: NextRequest) {
  try {
    await ensure();
    const body = await req.json();
    const { action, cafeId, device, userLat, userLng, photoBase64, photosBase64, memory, favorite, isPublic, pin, allowUnverified } = body;
    const pub = !!isPublic;
    if (!cafeId || !device) return NextResponse.json({ ok: false, error: "필수값 누락" }, { status: 400 });

    // 공용 PC 잠금: PIN 설정된 기기는 올바른 PIN 없이 기록 추가/수정 불가
    const [pinRow] = await sql`SELECT pin_hash FROM device_pins WHERE device_id = ${device} LIMIT 1` as any[];
    if (pinRow && pinRow.pin_hash !== hashPin(device, pin || ""))
      return NextResponse.json({ ok: false, locked: true, error: "잠금 상태예요. PIN을 먼저 입력해주세요." }, { status: 403 });

    const [cafe] = await sql`SELECT id, name, lat, lng FROM cafes WHERE id = ${cafeId} AND published = true LIMIT 1` as any[];
    if (!cafe || cafe.lat == null) return NextResponse.json({ ok: false, error: "카페를 찾을 수 없어요" }, { status: 404 });

    // ── '지금 인증하기' — 미인증(verified=false) 기록을 GPS 30m 재확인 후 인증으로 업그레이드 ──
    //   위치인증 자체는 그대로 필수(30m). 재방문해 현장에서 누르면 미인증→인증.
    if (action === "verify") {
      const [rec] = await sql`SELECT verified FROM user_visits WHERE cafe_id = ${cafeId} AND device_id = ${device} LIMIT 1` as any[];
      if (!rec) return NextResponse.json({ ok: false, error: "먼저 추억을 저장해주세요." }, { status: 409 });
      if (rec.verified) return NextResponse.json({ ok: true, verified: true, cafe: { id: cafe.id, name: cafe.name } });
      if (userLat == null || userLng == null)
        return NextResponse.json({ ok: false, error: "위치 정보가 필요해요" }, { status: 400 });
      const dv = distM(Number(userLat), Number(userLng), Number(cafe.lat), Number(cafe.lng));
      if (dv > RADIUS_M)
        return NextResponse.json({ ok: false, error: `카페에서 ${Math.round(dv)}m 떨어져 있어요. ${RADIUS_M}m 안에서 인증할 수 있어요.`, dist: Math.round(dv) }, { status: 403 });
      await sql`UPDATE user_visits SET verified = true WHERE cafe_id = ${cafeId} AND device_id = ${device}`;
      return NextResponse.json({ ok: true, verified: true, cafe: { id: cafe.id, name: cafe.name }, dist: Math.round(dv) });
    }

    const mem = typeof memory === "string" && memory.trim() ? memory.slice(0, 2000) : null;
    const fav = !!favorite;

    // 사진 Blob 업로드 — 최대 5장. data:image면 업로드, 이미 http URL이면 유지(수정모드 기존 사진). (commit·stage 공용)
    const incoming: string[] = (Array.isArray(photosBase64) ? photosBase64 : (photoBase64 ? [photoBase64] : []))
      .filter((p: any) => typeof p === "string").slice(0, 5);
    const photoUrls: string[] = [];
    for (const p of incoming) {
      if (p.startsWith("http")) { photoUrls.push(p); continue; }
      if (p.startsWith("data:image")) {
        const buf = Buffer.from(p.split(",")[1], "base64");
        const blob = await put(`visits/${device.slice(0, 8)}-${cafeId}-${Date.now()}-${photoUrls.length}.jpg`, buf, { access: "public", contentType: "image/jpeg" });
        photoUrls.push(blob.url);
      }
    }
    const photoUrl = photoUrls[0] ?? null;                 // 대표(첫 장)
    const photosJson = photoUrls.length ? JSON.stringify(photoUrls) : null;

    // ── 최종 기록(추억을 기록합니다) / 기존 기록 수정 — 위치 비교 없음 ──
    //   신규는 stage(위치인증) 후 commit. 기존 기록은 행이 이미 있으니 위치 없이 메모·사진·즐겨찾기 수정 가능
    //   (집에서 갤러리 사진 추가 등). 행이 없으면 '먼저 위치 인증' 안내.
    if (action === "commit") {
      const [staged] = await sql`SELECT id FROM user_visits WHERE cafe_id = ${cafeId} AND device_id = ${device} LIMIT 1` as any[];
      if (!staged) return NextResponse.json({ ok: false, error: "먼저 카페에서 위치 인증(임시저장)을 해주세요." }, { status: 409 });
      await sql`UPDATE user_visits SET
          finalized = true,
          memory = COALESCE(${mem}, memory),
          favorite = ${fav},
          is_public = ${pub},
          photo_url = COALESCE(${photoUrl}, photo_url),
          photos = COALESCE(${photosJson}, photos),
          created_at = now()
        WHERE cafe_id = ${cafeId} AND device_id = ${device}`;
      return NextResponse.json({ ok: true, cafe: { id: cafe.id, name: cafe.name }, finalized: true });
    }

    // ── 1단계: 임시저장 — 30m 위치 인증(기본). GPS 실패 시 allowUnverified면 미인증(verified=false)으로 완화 저장 ──
    //   위치인증 경로 자체는 그대로 유지: 30m 이내면 verified=true. 실패했는데 완화 미허용이면 기존처럼 거부(하위호환).
    const hasLoc = userLat != null && userLng != null;
    let dist: number | null = null;
    let verifiedNow = false;
    if (hasLoc) {
      dist = Math.round(distM(Number(userLat), Number(userLng), Number(cafe.lat), Number(cafe.lng)));
      verifiedNow = dist <= RADIUS_M;
    }
    if (!verifiedNow && !allowUnverified) {
      if (!hasLoc) return NextResponse.json({ ok: false, error: "위치 정보가 필요해요" }, { status: 400 });
      return NextResponse.json({ ok: false, error: `카페에서 ${dist}m 떨어져 있어요. ${RADIUS_M}m 안에서 임시저장할 수 있어요.`, dist }, { status: 403 });
    }

    // 신규는 finalized=false(임시), 기존 기록 재편집이면 기존 finalized 유지(노출 끊기지 않게).
    // verified는 절대 다운그레이드 안 함(기존 인증 유지) + 이번에 30m 통과면 미인증→인증 업그레이드.
    await sql`INSERT INTO user_visits (cafe_id, device_id, photo_url, photos, memory, favorite, is_public, verified, finalized)
      VALUES (${cafeId}, ${device}, ${photoUrl}, ${photosJson}, ${mem}, ${fav}, ${pub}, ${verifiedNow}, false)
      ON CONFLICT (cafe_id, device_id) DO UPDATE SET
        photo_url = COALESCE(EXCLUDED.photo_url, user_visits.photo_url),
        photos = COALESCE(EXCLUDED.photos, user_visits.photos),
        memory = COALESCE(EXCLUDED.memory, user_visits.memory),
        favorite = EXCLUDED.favorite, is_public = EXCLUDED.is_public,
        verified = user_visits.verified OR EXCLUDED.verified,
        finalized = user_visits.finalized, created_at = now()`;

    return NextResponse.json({ ok: true, staged: true, verified: verifiedNow, cafe: { id: cafe.id, name: cafe.name }, dist });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
