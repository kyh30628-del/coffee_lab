import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema , ensureOnce } from "@/lib/db";
import { BOT_ANON_IDS_SQL } from "@/lib/behaviorBot";
export const runtime = "nodejs";

// 위치이용 동의·기록 (PRINCIPLES §2: 개인정보 최소수집)
// - 익명 식별자(클라이언트 생성 UUID)만 사용. 이름·연락처 등 식별정보 없음.
// - 좌표는 약 500m 격자로 스냅해 대략적 지역만 저장. 정밀 위치는 보관하지 않음.
async function ensure() {
  // 💰 2026-08-20: 플래그 없이 **매 동의 요청마다** CREATE TABLE이 돌았다 — 배포 단위 1회로.
  await ensureOnce("consent.schema", async () => {
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
  });
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
    // 좌표는 대략값(≈500m 격자로 스냅)만 저장 — 정밀 위치 비보관
    const GRID = 0.005; // ≈500m
    const coarse = (v: unknown) => (v == null || isNaN(Number(v)) ? null : Math.round(Math.round(Number(v) / GRID) * GRID * 1000) / 1000);
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

// 동의 현황 집계(관리용) — 봇/내부 제외 = lib/behaviorBot.ts BOT_ANON_IDS_SQL 단일출처(#503 후속,
//   CEO "모든 기준을 그걸로" — 방문자 수를 다루는 모든 화면이 예외 없이 같은 기준을 쓰게 통일).
export async function GET() {
  try {
    await ensureSchema();
    await ensure();
    const row = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE agreed)::int AS agreed,
             COUNT(*) FILTER (WHERE region IS NOT NULL)::int AS located,
             COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last7d
      FROM user_consents WHERE anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})`)[0];
    const topRegions = await sql`
      SELECT region, COUNT(*)::int AS n
      FROM user_consents WHERE region IS NOT NULL
        AND anon_id NOT IN (${sql.unsafe(BOT_ANON_IDS_SQL)})
      GROUP BY region ORDER BY n DESC LIMIT 10`;
    return NextResponse.json({ ok: true, ...row, topRegions });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
