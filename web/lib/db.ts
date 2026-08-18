// ⚠️ 클라이언트 번들 유입 방어는 '모듈 경계 분리'로 구조적으로 달성한다:
//    lib/criteriaListsBase.ts(클라 안전 코어)만 client 체인이 임포트하고, db는 서버 전용
//    criteriaLists.ts만 임포트 → 'use client' 그래프가 db.ts에 도달하지 않는다(홈 다운 사고의 실 원인 차단).
//    과거 `import "server-only"` 컴파일 트립와이어도 걸었으나, db.ts는 로컬 tsx 스크립트
//    (heartbeat·resynth·embed·youtube-backfill 등 자율 워커)도 공유하는 모듈인데 server-only가
//    Node/tsx에서 해석 불가('Cannot find package')→로컬 워커를 전멸시켜(e370942 부작용) 제거했다.
//    미래의 client→db 회귀는 배포 파이프라인의 브라우저 스모크체크로 감지한다. 런타임 가드(아래)는 유지.
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
  // 💰 2026-08-18: 여기도 콜드스타트마다 다시 돌았다 — 배포 단위 1회로.
  await ensureOnce("db.baseSchema", async () => {
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
  });
  ensured = true;
}

/**
 * 🧊 스키마 보장 "1회 통과" 게이트 (2026-08-18, CEO 지시: 불필요한 DB 작업 근절)
 *
 * 실측 근거(pg_stat_statements 스냅샷): 전체 DB 실행시간 **4,739초 중 535초(11.3%)·24,961회**가
 *   "이미 있는 컬럼을 또 만드는" DDL이었다. 예: `ALTER TABLE cafes ADD COLUMN IF NOT EXISTS raw_reviews`
 *   단독으로 166회·121초. `IF NOT EXISTS`라 결과는 no-op이지만, 2GB 테이블에서 수백 ms가 걸리고
 *   그동안 락도 잡는다. 서버리스는 인스턴스가 자주 새로 뜨므로 **콜드스타트마다 30개씩** 다시 돌았다.
 *
 * 해결: 배포(커밋 SHA) 단위로 "이미 보장됨" 표시를 DB에 남기고, 다음 콜드스타트는 **가벼운 조회 1회**로 건너뛴다.
 *   - 배포가 바뀌면 태그가 달라져 새 컬럼이 있어도 정확히 한 번은 실행된다(안전).
 *   - 표시 조회·기록이 실패해도 원래 DDL을 그대로 실행한다(실패 시 기존 동작 유지 — 절대 스키마를 건너뛰지 않는다).
 */
const SCHEMA_TAG = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NODE_ENV || "local";
const schemaDone = new Map<string, boolean>();
export async function ensureOnce(key: string, run: () => Promise<void>): Promise<void> {
  if (schemaDone.get(key)) return;
  let skip = false;
  try {
    const r = (await sql`SELECT 1 FROM schema_state WHERE key=${key} AND tag=${SCHEMA_TAG} LIMIT 1`) as unknown[];
    skip = r.length > 0;
  } catch {
    // 표시 테이블이 아직 없음 → 아래에서 만든다(최초 1회뿐).
    try {
      await sql`CREATE TABLE IF NOT EXISTS schema_state (key TEXT PRIMARY KEY, tag TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    } catch { /* 만들지 못해도 아래 DDL은 그대로 돈다 */ }
  }
  if (!skip) {
    await run();
    try {
      await sql`INSERT INTO schema_state (key, tag) VALUES (${key}, ${SCHEMA_TAG})
        ON CONFLICT (key) DO UPDATE SET tag=EXCLUDED.tag, at=now()`;
    } catch { /* 기록 실패는 무해 — 다음에 다시 실행될 뿐 */ }
  }
  schemaDone.set(key, true);
}
