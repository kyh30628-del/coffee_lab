import { NextRequest, NextResponse } from "next/server";
import { sql, ensureOnce } from "@/lib/db";
export const runtime = "nodejs";

// 🔔 재방문 장치(2026-10-23) — 찜한 카페를 저장한 바로 그 기기(device_id)에 푸시 구독을 건다.
//   왜: 재방문율 실측 2.1%(97.9%가 다시 안 옴). 신규 유입이 조금만 흔들려도 전체 숫자가
//   크게 흔들리는 구조적 원인. 계정·이메일이 없는 서비스라 **익명 기기 기반 푸시**가 유일한 통로다.
//   기존 bookmarks(device_id)와 **같은 키**를 쓴다 — 북마크=재방문 의도를 보인 기기이므로 그 신호를 재사용.
async function ensure() {
  await ensureOnce("push.ddl", async () => {
    await sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
      device_id TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_sent_at TIMESTAMPTZ
    )`;
  });
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const device = String(b?.device ?? "").slice(0, 80);
    const sub = b?.subscription;
    if (!device || !sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
    }
    await ensure();
    await sql`INSERT INTO push_subscriptions (device_id, endpoint, p256dh, auth)
      VALUES (${device}, ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
      ON CONFLICT (device_id) DO UPDATE SET endpoint=EXCLUDED.endpoint, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 120) }, { status: 500 });
  }
}

// 구독 해지(알림 끄기) — 기기 하나 삭제.
export async function DELETE(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const device = String(b?.device ?? "").slice(0, 80);
    if (!device) return NextResponse.json({ ok: false }, { status: 400 });
    await ensure();
    await sql`DELETE FROM push_subscriptions WHERE device_id = ${device}`;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 120) }, { status: 500 });
  }
}
