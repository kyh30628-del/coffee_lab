import { sql } from "@/lib/db";

// 사장님(구독 PIN) 활동 추적 — 접속·사용 모니터링. "제대로 접속하고 쓰는지" 본부가 알 수 있게.
// owner_events: 상세 이력(로그인·분석조회 등). subscriptions: 빠른 요약(최근접속·횟수·첫로그인).
let ensured = false;
export async function ensureOwnerActivity() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS owner_events (id SERIAL PRIMARY KEY, cafe_id INT, event TEXT, at TIMESTAMPTZ DEFAULT now(), meta JSONB)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_owner_events_cafe ON owner_events(cafe_id, at DESC)`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS login_count INT DEFAULT 0`;
  ensured = true;
}

// PIN 로그인 성공 시 — 항상 기록(첫 접속·재접속 모두 의미).
export async function recordOwnerLogin(cafeId: number) {
  try {
    await ensureOwnerActivity();
    await sql`INSERT INTO owner_events (cafe_id, event) VALUES (${cafeId}, 'login')`;
    await sql`UPDATE subscriptions SET last_seen_at=now(), login_count=COALESCE(login_count,0)+1, first_login_at=COALESCE(first_login_at, now()) WHERE cafe_id=${cafeId}`;
  } catch { /* 추적 실패가 로그인/조회를 막지 않도록 무해화 */ }
}

// 분석 조회 등 사용 활동 — 20분 세션 중복은 접어 이력 노이즈 방지. 최근접속(last_seen)은 항상 갱신.
export async function recordOwnerActivity(cafeId: number, event = "view_analysis") {
  try {
    await ensureOwnerActivity();
    const dup = (await sql`SELECT 1 FROM owner_events WHERE cafe_id=${cafeId} AND event=${event} AND at > now() - interval '20 minutes' LIMIT 1`)[0];
    if (!dup) await sql`INSERT INTO owner_events (cafe_id, event) VALUES (${cafeId}, ${event})`;
    await sql`UPDATE subscriptions SET last_seen_at=now() WHERE cafe_id=${cafeId}`;
  } catch { /* 무해화 */ }
}
