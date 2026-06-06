import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 위치이용 동의·기록 (PRINCIPLES §2: 개인정보 최소수집)
// - 익명 식별자(클라이언트 생성 UUID)만 사용. 이름·연락처 등 식별정보 없음.
// - 좌표는 2자리로 반올림(≈1km)해 대략적 지역만 저장. 정밀 위치는 보관하지 않음.
async function ensure() {
  await sql`
    CREATE TABLE IF NOT EXISTS user_consents (
      id              BIGSERIAL PRIMARY KEY,
      anon_id         TEXT UNIQUE NOT NULL,
      agreed          BOOLEAN NOT NULL DEFAULT false,
      consent_version TEXT,
      region          TEXT,
      lat             REAL,
      lng             REAL,
      user_agent      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await ensure();
    const b = await req.json().catch(() => ({}));
    const anonId = String(b.anonId ?? "").slice(0, 64);
    if (!anonId) return NextResponse.json({ ok: false, error: "anonId 필요" }, { status: 400 });

    const agreed = !!b.agreed;
    const version = b.version ? String(b.version).slice(0, 16) : null;
    const region = b.region ? String(b.region).slice(0, 40) : null;
    // 좌표는 대략값(소수 2자리 ≈ 1.1km)만 저장 — 정밀 위치 비보관
    const coarse = (v: unknown) => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
    const lat = coarse(b.lat), lng = coarse(b.lng);
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);

    await sql`
      INSERT INTO user_consents (anon_id, agreed, consent_version, region, lat, lng, user_agent)
      VALUES (${anonId}, ${agreed}, ${version}, ${region}, ${lat}, ${lng}, ${ua})
      ON CONFLICT (anon_id) DO UPDATE SET
        agreed=EXCLUDED.agreed,
        consent_version=COALESCE(EXCLUDED.consent_version, user_consents.consent_version),
        region=COALESCE(EXCLUDED.region, user_consents.region),
        lat=COALESCE(EXCLUDED.lat, user_consents.lat),
        lng=COALESCE(EXCLUDED.lng, user_consents.lng),
        user_agent=EXCLUDED.user_agent,
        updated_at=now()`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// 동의 현황 집계(관리용)
export async function GET() {
  try {
    await ensureSchema();
    await ensure();
    const row = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE agreed)::int AS agreed,
             COUNT(*) FILTER (WHERE region IS NOT NULL)::int AS located
      FROM user_consents`)[0];
    return NextResponse.json({ ok: true, ...row });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
