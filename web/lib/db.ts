import { neon } from "@neondatabase/serverless";

// Vercel이 넣어준(또는 .env.local의) DATABASE_URL 사용
export const sql = neon(process.env.DATABASE_URL!);

// 취향 기록 테이블 보장 (없으면 생성). 첫 요청 때 한 번 실행됨.
let ensured = false;
export async function ensureSchema() {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS taste_logs (
      id          BIGSERIAL PRIMARY KEY,
      acidity     REAL NOT NULL,
      body        REAL NOT NULL,
      sweetness   REAL NOT NULL,
      flavors     TEXT,
      top_origin  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  ensured = true;
}
