import { NextRequest, NextResponse } from "next/server";
import { sql , ensureOnce } from "@/lib/db";
export const runtime = "nodejs";

// ⏱️ 체류시간 비콘 — 페이지 이탈(visibilitychange/pagehide) 시 클라가 진입~이탈 경과(ms)를 보낸다.
//   진입 시점의 페이지뷰 행(traffic_events)에 duration_ms를 채운다. 개인정보 없음(anon_id만).
//   sendBeacon은 Content-Type이 text/plain일 수 있어 본문을 관대하게 파싱한다.
let ensured = false;
async function ensure() {
  if (ensured) return;
  await ensureOnce("visit-duration.ddl", async () => {
    await sql`CREATE TABLE IF NOT EXISTS traffic_events (id BIGSERIAL PRIMARY KEY, anon_id TEXT, path TEXT, src TEXT, ts TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`ALTER TABLE traffic_events ADD COLUMN IF NOT EXISTS duration_ms INT`;
  });
  ensured = true;
}

export async function POST(req: NextRequest) {
  try {
    await ensure();
    const raw = await req.text().catch(() => "");
    let b: any = {};
    try { b = raw ? JSON.parse(raw) : {}; } catch { b = {}; }
    const anonId = String(b.anonId ?? "").slice(0, 64);
    const path = String(b.path ?? "").slice(0, 200);
    const durationMs = Math.round(Number(b.durationMs ?? 0));
    // 방어: 식별자·경로 없거나 비정상 체류(음수·6시간 초과)는 무시
    if (!anonId || !path || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 6 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    // 해당 방문자·경로의 가장 최근 페이지뷰 행 중 아직 체류시간이 안 채워진 것에 기록.
    // (INSERT는 진입 시 /api/visit에서 됨 — 여기선 이탈 시 그 행을 갱신)
    await sql`
      UPDATE traffic_events SET duration_ms = ${durationMs}
      WHERE id = (
        SELECT id FROM traffic_events
        WHERE anon_id = ${anonId} AND path = ${path} AND duration_ms IS NULL
        ORDER BY ts DESC LIMIT 1
      )`.catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
