// 🚧 컴파일 타임 트립와이어: 이 모듈이 클라이언트 번들에 딸려 들어가면 빌드가 즉시 실패한다.
//    ('use client' 컴포넌트에서 도달 가능한 임포트 그래프에 이 파일이 있으면 next build가 에러)
//    아래 런타임 플레이스홀더 가드(벨트)와 함께 이중 방어(멜빵). 서버(라우트·크론·서버컴포넌트)는 무영향.
import "server-only";
import { neon } from "@neondatabase/serverless";

// ⚠️ sql은 서버 전용이지만, 이 모듈이 클라이언트 번들에 딸려 들어갈 수 있다
//    (예: 'use client' 홈 app/page.tsx → cafeProfile → charScore → criteriaLists → db).
//    브라우저엔 DATABASE_URL이 없어 neon(undefined!)가 **모듈 로드 시점에** throw →
//    앱 전체가 "This page couldn't load"로 크래시했다(2026-07 홈 화면 다운 사고).
//    URL이 없으면(=브라우저) 형식만 갖춘 플레이스홀더로 생성해 로드 크래시를 막는다.
//    서버는 항상 DATABASE_URL이 있어 실 연결을 쓰므로 동작 무변. 브라우저는 sql을
//    실제로 호출하지 않는다(동기 getter들은 캐시/BASE 폴백만 읽음).
export const sql = neon(process.env.DATABASE_URL || "postgresql://unused:unused@localhost/unused");

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
  // 동/면 단위 계층 필터·지도 집계용(지번에서 파싱해 발굴 중 채움)
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS dong TEXT`.catch(() => {});
  // B2B 아웃리치 DM 타깃용 인스타그램 URL
  await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS instagram_url TEXT`.catch(() => {});
  ensured = true;
}
