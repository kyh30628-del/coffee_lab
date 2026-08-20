import { NextRequest, NextResponse } from "next/server";
import { sql , ensureOnce } from "@/lib/db";
export const runtime = "nodejs";

// 📣 공유 클릭 기록 — 사용자가 카페 상세 등에서 공유 버튼을 눌러 '타인에게 공유'한 이벤트(바이럴 신호).
//   channel=kakao|web|clipboard. anon_id로 내부(대표·팀) 구분 가능. 개인정보 없음(anon만).
let ensured = false;
async function ensure() {
  // 💰 2026-08-20 전수 적용: 이 함수 일부는 메모 플래그조차 없어 **매 요청** DDL이 돌았다 — 배포 단위 1회로.
  await ensureOnce("track-share.ensure", async () => {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS share_events (id BIGSERIAL PRIMARY KEY, anon_id TEXT, path TEXT, cafe_id INT, channel TEXT, ts TIMESTAMPTZ NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS idx_share_events_ts ON share_events (ts)`;
  // source: 공유가 일어난 화면 구분(카페상세/MYPIN) — 전환 분석용(#363).
  await sql`ALTER TABLE share_events ADD COLUMN IF NOT EXISTS source TEXT`.catch(() => {});
  // kakao_failed/note: 카톡 공유 실작동 검증 — 카톡 버튼인데 폴백되면 true+원인 기록(폴백을 진짜 카톡과 구분).
  await sql`ALTER TABLE share_events ADD COLUMN IF NOT EXISTS kakao_failed BOOLEAN`.catch(() => {});
  await sql`ALTER TABLE share_events ADD COLUMN IF NOT EXISTS note TEXT`.catch(() => {});
  ensured = true;
  });
}

export async function POST(req: NextRequest) {
  try {
    await ensure();
    const b = await req.json().catch(() => ({}));
    const anonId = String(b.anonId ?? "").slice(0, 64);
    const path = String(b.path ?? "").slice(0, 200);
    const channel = String(b.channel ?? "").slice(0, 20);
    const source = String(b.source ?? "").slice(0, 30) || null;
    // cafeId: 명시값 우선(홈 슬라이드 패널은 pathname이 "/"라 파싱 불가) → 없으면 path에서 /c/ID 파싱.
    const explicit = Number(b.cafeId);
    const m = path.match(/\/c\/(\d+)/);
    const cafeId = Number.isFinite(explicit) && explicit > 0 ? explicit : (m ? Number(m[1]) : null);
    const kakaoFailed = b.kakaoFailed === true ? true : null;
    const note = b.note ? String(b.note).slice(0, 120) : null;
    if (!anonId && !path) return NextResponse.json({ ok: false }, { status: 400 });
    await sql`INSERT INTO share_events (anon_id, path, cafe_id, channel, source, kakao_failed, note) VALUES (${anonId}, ${path}, ${cafeId}, ${channel}, ${source}, ${kakaoFailed}, ${note})`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
