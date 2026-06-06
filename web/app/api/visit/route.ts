import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 익명 방문 핑 (PRINCIPLES §2: 개인정보 미수집). anon_id만으로 재방문·활성 집계.
// 정밀 위치·이름·연락처는 일절 받지 않음. 위치는 동의 플로우(/api/consent)에서만.
let ensured = false;
async function ensure() {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS user_consents (
      id BIGSERIAL PRIMARY KEY, anon_id TEXT UNIQUE NOT NULL,
      agreed BOOLEAN, consent_version TEXT, region TEXT, lat REAL, lng REAL,
      user_agent TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS visit_count INT DEFAULT 1`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ`;
  // 방문핑 행은 동의 '미정'(NULL)이어야 거절(false)과 구분됨
  await sql`ALTER TABLE user_consents ALTER COLUMN agreed DROP NOT NULL`;
  await sql`ALTER TABLE user_consents ALTER COLUMN agreed DROP DEFAULT`;
  ensured = true;
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await ensure();
    const b = await req.json().catch(() => ({}));
    const anonId = String(b.anonId ?? "").slice(0, 64);
    if (!anonId) return NextResponse.json({ ok: false }, { status: 400 });
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
    // 방문 기록: 첫 방문이면 행 생성(동의 미정=NULL), 재방문이면 카운트·최근시각 갱신
    await sql`
      INSERT INTO user_consents (anon_id, visit_count, last_seen, user_agent)
      VALUES (${anonId}, 1, now(), ${ua})
      ON CONFLICT (anon_id) DO UPDATE SET
        visit_count = COALESCE(user_consents.visit_count, 1) + 1,
        last_seen = now()`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
