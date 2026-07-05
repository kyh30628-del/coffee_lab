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
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS duration_days INT`; // 첫 로그인 시 시계 시작에 쓰는 이용기간 — 로그인 경로가 이 컬럼을 참조하므로 여기서도 보장
  ensured = true;
}

// PIN 로그인 성공 시 — 항상 기록(첫 접속·재접속 모두 의미).
//  🕐 '첫 로그인 = 구독 시작' 단일 지점: started_at/expires_at을 이때 확정하고 모든 혜택(골드핀·우선노출·쇼케이스)을 켠다.
//     (승인이 아니라 첫 접속 기준이라, 사장님이 늦게 접속해도 체험·구독 기간을 손해보지 않는다.)
export async function recordOwnerLogin(cafeId: number) {
  try {
    await ensureOwnerActivity();
    await sql`INSERT INTO owner_events (cafe_id, event) VALUES (${cafeId}, 'login')`;
    // started_at/expires_at은 COALESCE로 '첫 로그인 때만' 세팅(이후 로그인은 그대로 유지). 기간은 승인 시 저장한 duration_days.
    await sql`UPDATE subscriptions
      SET last_seen_at=now(), login_count=COALESCE(login_count,0)+1, first_login_at=COALESCE(first_login_at, now()),
          started_at=COALESCE(started_at, now()),
          expires_at=COALESCE(expires_at, now() + make_interval(days => COALESCE(duration_days, 30))),
          updated_at=now()
      WHERE cafe_id=${cafeId} AND status='active'`;
    // 🎁 전 혜택 ON — 시작~만료 창(featured_until=expires_at)에 정렬. 매 로그인 idempotent라 드리프트 자가복구도 됨.
    const e = (await sql`SELECT expires_at FROM subscriptions WHERE cafe_id=${cafeId} AND status='active' AND expires_at > now()`)[0] as any;
    if (e) await sql`INSERT INTO cafe_promos (cafe_id, featured, featured_until, approved, published, updated_at)
      VALUES (${cafeId}, true, ${e.expires_at}, true, true, now())
      ON CONFLICT (cafe_id) DO UPDATE SET featured=true, featured_until=${e.expires_at}, approved=true, updated_at=now()`;
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
