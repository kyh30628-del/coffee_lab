import { NextRequest, NextResponse } from "next/server";
import { sql , ensureOnce } from "@/lib/db";
export const runtime = "nodejs";

// 📊 사장님 신청 퍼널 계측(읽기전용) — CTA 클릭→체험/구독 모달 오픈→제출 성공/실패.
//   #513: 랜딩 296명 유입에도 신청 퍼널 진입이 월 1명뿐인 원인(이탈 지점)을 보려는 것. UI·결제·발송·공개상태 로직과 무관.
//   anon_id만 사용(개인정보 0), share_events/traffic_events와 동일한 얕은 기록 패턴.
const EVENTS = new Set(["cta_click", "modal_open", "submit_success", "submit_fail"]);
let ensured = false;
async function ensure() {
  if (ensured) return;
  await ensureOnce("owner-funnel.ddl", async () => {
    await sql`CREATE TABLE IF NOT EXISTS owner_funnel_events (
      id BIGSERIAL PRIMARY KEY, anon_id TEXT, event TEXT, source TEXT, cafe_id INT, path TEXT, meta JSONB,
      ts TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS idx_owner_funnel_events_ts ON owner_funnel_events (ts)`;
  });
  ensured = true;
}

export async function POST(req: NextRequest) {
  try {
    await ensure();
    const b = await req.json().catch(() => ({}));
    const event = String(b.event ?? "");
    if (!EVENTS.has(event)) return NextResponse.json({ ok: false }, { status: 400 });
    const anonId = String(b.anonId ?? "").slice(0, 64);
    const source = String(b.source ?? "").slice(0, 30) || null;
    const path = String(b.path ?? "").slice(0, 200) || null;
    const cafeId = Number.isFinite(Number(b.cafeId)) && b.cafeId != null ? Number(b.cafeId) : null;
    const meta = b.meta && typeof b.meta === "object" ? JSON.stringify(b.meta).slice(0, 2000) : null;
    await sql`INSERT INTO owner_funnel_events (anon_id, event, source, cafe_id, path, meta)
      VALUES (${anonId}, ${event}, ${source}, ${cafeId}, ${path}, ${meta}::jsonb)`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
