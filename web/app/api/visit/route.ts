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
  // 유입경로 첫터치(first-touch) 집계 — '어디서 왔나'. 한 번 기록되면 덮어쓰지 않음(COALESCE).
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS src TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS referrer TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS utm_source TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS utm_medium TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS utm_campaign TEXT`;
  await sql`ALTER TABLE user_consents ADD COLUMN IF NOT EXISTS landing TEXT`;
  // 방문핑 행은 동의 '미정'(NULL)이어야 거절(false)과 구분됨
  await sql`ALTER TABLE user_consents ALTER COLUMN agreed DROP NOT NULL`;
  await sql`ALTER TABLE user_consents ALTER COLUMN agreed DROP DEFAULT`;
  // 페이지뷰 이벤트(자체 분석 — 인기페이지·퍼널·체류). 90일 보존(orchestrator가 정리).
  await sql`CREATE TABLE IF NOT EXISTS traffic_events (id BIGSERIAL PRIMARY KEY, anon_id TEXT, path TEXT, src TEXT, ts TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_traffic_events_ts ON traffic_events (ts)`;
  ensured = true;
}

// referrer/UTM → 출처 버킷. utm_source가 있으면 우선(우리가 붙인 공유링크 식별).
function sourceBucket(ref: string, utmSource: string): string {
  const s = (utmSource || "").toLowerCase().trim();
  if (s) return s.slice(0, 40);
  const r = (ref || "").toLowerCase();
  if (!r) return "direct";
  if (r.includes("naver.")) return "naver";
  if (r.includes("google.")) return "google";
  if (r.includes("instagram.")) return "instagram";
  if (r.includes("threads.")) return "threads";
  if (r.includes("daum.") || r.includes("kakao")) return "kakao";
  if (r.includes("youtube.") || r.includes("youtu.be")) return "youtube";
  if (r.includes("facebook.") || r.includes("fb.")) return "facebook";
  if (r.includes("bing.")) return "bing";
  if (r.includes("dongnecoffeenote.com")) return "internal";
  try { return new URL(ref).hostname.replace(/^www\./, "").slice(0, 40); } catch { return "other"; }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await ensure();
    const b = await req.json().catch(() => ({}));
    const anonId = String(b.anonId ?? "").slice(0, 64);
    if (!anonId) return NextResponse.json({ ok: false }, { status: 400 });
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
    // 유입경로: 클라가 보낸 referrer/UTM(세션 첫 핑만) + 헤더 referer 폴백
    const ref = String(b.ref ?? req.headers.get("referer") ?? "").slice(0, 300);
    const utmSource = String(b.utm_source ?? "").slice(0, 60);
    const utmMedium = String(b.utm_medium ?? "").slice(0, 60);
    const utmCampaign = String(b.utm_campaign ?? "").slice(0, 80);
    const landing = String(b.path ?? "").slice(0, 200);
    const src = sourceBucket(ref, utmSource);
    // 방문 기록: 첫 방문이면 행 생성(동의 미정=NULL), 재방문이면 카운트·최근시각 갱신.
    // 출처(src/referrer/utm/landing)는 첫터치만 보존 — 이미 있으면 덮어쓰지 않음(COALESCE).
    await sql`
      INSERT INTO user_consents (anon_id, visit_count, last_seen, user_agent, src, referrer, utm_source, utm_medium, utm_campaign, landing)
      VALUES (${anonId}, 1, now(), ${ua}, ${src}, ${ref}, ${utmSource}, ${utmMedium}, ${utmCampaign}, ${landing})
      ON CONFLICT (anon_id) DO UPDATE SET
        visit_count = COALESCE(user_consents.visit_count, 1) + 1,
        last_seen = now(),
        src = COALESCE(user_consents.src, EXCLUDED.src),
        referrer = COALESCE(NULLIF(user_consents.referrer, ''), NULLIF(EXCLUDED.referrer, '')),
        utm_source = COALESCE(NULLIF(user_consents.utm_source, ''), NULLIF(EXCLUDED.utm_source, '')),
        utm_medium = COALESCE(NULLIF(user_consents.utm_medium, ''), NULLIF(EXCLUDED.utm_medium, '')),
        utm_campaign = COALESCE(NULLIF(user_consents.utm_campaign, ''), NULLIF(EXCLUDED.utm_campaign, '')),
        landing = COALESCE(NULLIF(user_consents.landing, ''), NULLIF(EXCLUDED.landing, ''))`;
    // 봇 UA는 페이지뷰 이벤트에서 제외(분석 정확도). 사람 방문만 적재.
    if (!/bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview/i.test(ua)) {
      await sql`INSERT INTO traffic_events (anon_id, path, src) VALUES (${anonId}, ${landing}, ${src})`.catch(() => {});
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
