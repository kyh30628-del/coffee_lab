import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 📣 공유 클릭 기록 — 사용자가 카페 상세 등에서 공유 버튼을 눌러 '타인에게 공유'한 이벤트(바이럴 신호).
//   channel=kakao|web|clipboard. anon_id로 내부(대표·팀) 구분 가능. 개인정보 없음(anon만).
let ensured = false;
async function ensure() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS share_events (id BIGSERIAL PRIMARY KEY, anon_id TEXT, path TEXT, cafe_id INT, channel TEXT, ts TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_share_events_ts ON share_events (ts)`;
  // source: 공유가 일어난 화면 구분(카페상세/MYPIN) — 전환 분석용(#363).
  await sql`ALTER TABLE share_events ADD COLUMN IF NOT EXISTS source TEXT`.catch(() => {});
  ensured = true;
}

export async function POST(req: NextRequest) {
  try {
    await ensure();
    const b = await req.json().catch(() => ({}));
    const anonId = String(b.anonId ?? "").slice(0, 64);
    const path = String(b.path ?? "").slice(0, 200);
    const channel = String(b.channel ?? "").slice(0, 20);
    const source = String(b.source ?? "").slice(0, 30) || null;
    const m = path.match(/\/c\/(\d+)/);
    const cafeId = m ? Number(m[1]) : null;
    if (!anonId && !path) return NextResponse.json({ ok: false }, { status: 400 });
    await sql`INSERT INTO share_events (anon_id, path, cafe_id, channel, source) VALUES (${anonId}, ${path}, ${cafeId}, ${channel}, ${source})`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
