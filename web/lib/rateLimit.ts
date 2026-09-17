// 공개 API IP 레이트리밋 — 결재#1079(협업#415)로 도입, 협업#423(리스크매니지먼트팀)이 잔여 갭 지적 →
//   결재#1111로 교정.
//   과거(v1): 인스턴스 로컬 메모리 슬라이딩 윈도우. Fluid Compute가 부하 증가 시 인스턴스를 여러 개로
//   확장하면 카운터가 인스턴스별로 별도 유지돼 전역 한도가 사실상 우회될 수 있었다(코드리뷰 관찰).
//   v2: 이미 프로비저닝된 Neon Postgres(lib/db.ts)에 카운터를 두어 인스턴스 무관 전역 집행으로 전환한다.
//   Upstash Redis 등 신규 유료 연동은 추가하지 않는다(비용 극민감·마켓플레이스 신규 프로비저닝은 CEO 확인 필요).
//   proxy(Next 16)는 기본 Node.js 런타임이라 neon 서버리스 드라이버(HTTP 기반) 호출이 문제 없다.
import { sql } from "@/lib/db";

export type RateLimitResult = { allowed: boolean; remaining: number; resetMs: number };

let tableEnsured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!tableEnsured) {
    tableEnsured = sql`CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      key text PRIMARY KEY,
      count integer NOT NULL,
      reset_at timestamptz NOT NULL
    )`
      .then(() => undefined)
      .catch((err) => {
        tableEnsured = null; // 실패 시 다음 호출에서 재시도
        throw err;
      });
  }
  return tableEnsured;
}

// DB 왕복 1회로 원자적 증가·윈도우 리셋을 처리한다(동시요청 레이스는 행단위 UPDATE 잠금으로 방지).
export async function checkRateLimit(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
  try {
    await ensureTable();
    const windowInterval = `${windowMs} milliseconds`;
    const rows = (await sql`
      INSERT INTO rate_limit_buckets AS b (key, count, reset_at)
      VALUES (${key}, 1, now() + ${windowInterval}::interval)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN b.reset_at <= now() THEN 1 ELSE b.count + 1 END,
        reset_at = CASE WHEN b.reset_at <= now() THEN now() + ${windowInterval}::interval ELSE b.reset_at END
      RETURNING count, reset_at
    `) as { count: number; reset_at: string }[];
    const row = rows[0];
    const resetMs = Math.max(0, new Date(row.reset_at).getTime() - Date.now());

    // 별도 크론 없이 만료된 행 누적을 막는 확률적 청소(대략 500회당 1회).
    if (Math.random() < 0.002) {
      sql`DELETE FROM rate_limit_buckets WHERE reset_at < now() - interval '1 hour'`.catch(() => {});
    }

    return { allowed: row.count <= max, remaining: Math.max(0, max - row.count), resetMs };
  } catch {
    // DB 장애 시 레이트리밋이 공개 API 전체의 단일 장애점이 되지 않도록 fail-open.
    return { allowed: true, remaining: max, resetMs: windowMs };
  }
}
