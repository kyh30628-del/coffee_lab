import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// 사장님 PIN 로그인 — 유효한 PIN(활성 구독)이면 본인 카페 정보 반환. 다른 카페 접근 불가의 근거.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS subscriptions (id SERIAL PRIMARY KEY, cafe_id INT UNIQUE, status TEXT, pin TEXT)`;
    const b = await req.json().catch(() => ({}));
    const pin = String(b.pin ?? "").trim().toUpperCase();
    if (pin.length < 6) return NextResponse.json({ ok: false, error: "PIN을 입력하세요" }, { status: 400 });
    const r = (await sql`SELECT s.cafe_id, c.name AS cafe_name, s.status, s.expires_at FROM subscriptions s JOIN cafes c ON c.id = s.cafe_id WHERE s.pin = ${pin}`)[0] as any;
    if (!r || r.status !== "active") return NextResponse.json({ ok: false, error: "유효하지 않은 키(PIN)이거나 이용 상태가 아니에요" }, { status: 401 });
    // 만료일 직접 검증 — 자동만료 배치가 안 돌았어도 기간 지난 키는 거부(7일 체험·구독 만료 확정 차단).
    if (r.expires_at && new Date(r.expires_at).getTime() < Date.now()) {
      await sql`UPDATE subscriptions SET status='expired', updated_at=now() WHERE pin=${pin} AND status='active'`.catch(() => {});
      return NextResponse.json({ ok: false, error: "이용 기간이 만료됐어요. 구독하시면 계속 이용할 수 있어요." }, { status: 401 });
    }
    return NextResponse.json({ ok: true, cafeId: r.cafe_id, cafeName: r.cafe_name, expiresAt: r.expires_at });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
