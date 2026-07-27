import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { sourceBucket } from "@/lib/trafficSource";
import { KNOWN_BOT_UA_PATTERN } from "@/lib/behaviorBot";
export const runtime = "nodejs";

// 확정 봇 UA(meta-externalagent 등, #523·coord#262) 원천 차단 — lib/behaviorBot.ts 단일출처.
// 표출 화면에서만 걸러내면 user_consents/traffic_events 원본은 야간마다 계속 오염 누적된다(실측:
// 07-25~07-27 direct 신규 100건 중 86건 봇). 여기서 걸리면 INSERT 자체를 하지 않는다.
const KNOWN_BOT_UA = new RegExp(KNOWN_BOT_UA_PATTERN, "i");

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
  // 유입경로 첫터치(first-touch) 집계 — '어디서 왔나'. 한 번 기록되면 덮어쓰지 않음(COALESCE).
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS src TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS referrer TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS utm_source TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS utm_medium TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS utm_campaign TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS landing TEXT`;
  // 내부(대표·팀) 트래픽 제외 플래그 — /admin 접속 브라우저 또는 클라 dcn_internal 표시. 한번 켜지면 유지.
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS internal BOOLEAN DEFAULT false`;
  // 세션 수 — '다시 켠 것'(같은 날 포함)을 센다. 브라우저 세션(sessionStorage) 새로 시작할 때마다 +1. visit_count(페이지뷰)와 다름.
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS sessions INT DEFAULT 1`;
  // 방문핑 행은 동의 '미정'(NULL)이어야 거절(false)과 구분됨
  await sql`ALTER TABLE user_consents ALTER COLUMN agreed DROP NOT NULL`;
  await sql`ALTER TABLE user_consents ALTER COLUMN agreed DROP DEFAULT`;
  // 페이지뷰 이벤트(자체 분석 — 인기페이지·퍼널·체류). 90일 보존(orchestrator가 정리).
  await sql`CREATE TABLE IF NOT EXISTS traffic_events (id BIGSERIAL PRIMARY KEY, anon_id TEXT, path TEXT, src TEXT, ts TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_traffic_events_ts ON traffic_events (ts)`;
  // 체류시간(ms) — 페이지 이탈 시 /api/visit/duration 비콘이 진입 행에 채운다. 기존 INSERT는 이 컬럼 없이도 무해.
  await sql`ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS duration_ms INT`;
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
    if (KNOWN_BOT_UA.test(ua)) return NextResponse.json({ ok: true });
    // 유입경로: 클라가 보낸 referrer/UTM(세션 첫 핑만) + 헤더 referer 폴백
    const ref = String(b.ref ?? req.headers.get("referer") ?? "").slice(0, 300);
    const utmSource = String(b.utm_source ?? "").slice(0, 60);
    const utmMedium = String(b.utm_medium ?? "").slice(0, 60);
    const utmCampaign = String(b.utm_campaign ?? "").slice(0, 80);
    const landing = String(b.path ?? "").slice(0, 200);
    const src = sourceBucket(ref, utmSource);
    // 내부(대표·팀) 판정: /admin·/owner 페이지를 봤거나 클라가 내부로 표시 → 이 방문자는 집계 제외 대상
    const isInternal = b.internal === true || /^\/(admin|owner)/.test(landing);
    const newSession = b.newSession === true; // 세션 첫 핑(브라우저 새로 켬) → 세션 +1(같은 날 재방문도 잡힘)
    // 방문 기록: 첫 방문이면 행 생성(동의 미정=NULL), 재방문이면 카운트·최근시각 갱신.
    // 출처(src/referrer/utm/landing)는 첫터치만 보존 — 이미 있으면 덮어쓰지 않음(COALESCE).
    await sql`
      INSERT INTO user_consents (anon_id, visit_count, last_seen, user_agent, src, referrer, utm_source, utm_medium, utm_campaign, landing, internal)
      VALUES (${anonId}, 1, now(), ${ua}, ${src}, ${ref}, ${utmSource}, ${utmMedium}, ${utmCampaign}, ${landing}, ${isInternal})
      ON CONFLICT (anon_id) DO UPDATE SET
        visit_count = COALESCE(user_consents.visit_count, 1) + 1,
        sessions = COALESCE(user_consents.sessions, 1) + ${newSession ? 1 : 0},
        last_seen = now(),
        internal = COALESCE(user_consents.internal, false) OR ${isInternal},
        src = COALESCE(user_consents.src, EXCLUDED.src),
        referrer = COALESCE(NULLIF(user_consents.referrer, ''), NULLIF(EXCLUDED.referrer, '')),
        utm_source = COALESCE(NULLIF(user_consents.utm_source, ''), NULLIF(EXCLUDED.utm_source, '')),
        utm_medium = COALESCE(NULLIF(user_consents.utm_medium, ''), NULLIF(EXCLUDED.utm_medium, '')),
        utm_campaign = COALESCE(NULLIF(user_consents.utm_campaign, ''), NULLIF(EXCLUDED.utm_campaign, '')),
        landing = COALESCE(NULLIF(user_consents.landing, ''), NULLIF(EXCLUDED.landing, ''))`;
    // 빈 경로·내부(대표/팀·/admin·/owner)는 페이지뷰 이벤트서 제외(분석 정확도). 봇은 위에서 이미 원천 차단됨.
    if (landing && !isInternal && !/^\/(admin|owner)/.test(landing)) {
      await sql`INSERT INTO traffic_events (anon_id, path, src) VALUES (${anonId}, ${landing}, ${src})`.catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
