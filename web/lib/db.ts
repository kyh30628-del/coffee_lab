import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

let ensured = false;
export async function ensureSchema() {
  if (ensured) return;
  // 기존 취향 로그 (유지)
  await sql`
    CREATE TABLE IF NOT EXISTS taste_logs (
      id BIGSERIAL PRIMARY KEY,
      acidity REAL NOT NULL, body REAL NOT NULL, sweetness REAL NOT NULL,
      flavors TEXT, top_origin TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  // 카페 가이드 (신규)
  await sql`
    CREATE TABLE IF NOT EXISTS cafes (
      id           BIGSERIAL PRIMARY KEY,
      place_id     TEXT UNIQUE,            -- 공개데이터 식별자(중복 방지)
      name         TEXT NOT NULL,
      area         TEXT,                   -- 동네: 강동역/상일동/구리수택동
      address      TEXT,
      lat          DOUBLE PRECISION,
      lng          DOUBLE PRECISION,
      hours        TEXT,
      phone        TEXT,
      rating       REAL,                   -- 공개 평점(참고용)
      rating_count INT,
      -- 큐레이션 (이 서비스의 심장)
      roasts_own   BOOLEAN DEFAULT false,  -- 직접 로스팅 여부
      beans        TEXT,                   -- 취급 원두/산지 (쉼표)
      signature    TEXT,                   -- 대표 메뉴
      uses         TEXT,                   -- 용도 태그: 작업,수다,혼자,사진,빵 (쉼표)
      vibe         TEXT,                   -- 분위기 한 줄
      note         TEXT,                   -- 큐레이터 한 줄평 ("이 집은 ○○")
      price_hint   TEXT,                   -- 가격 참고 (예: 핸드드립 6,000)
      source       TEXT DEFAULT 'auto',    -- seed | auto | owner
      published    BOOLEAN DEFAULT true,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  ensured = true;
}
