import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureBilling, markPaidAndActivate } from "@/lib/billing";
import { verifyTossSignature, reconcilePayment } from "@/lib/tossWebhook";
export const runtime = "nodejs";

// 💳 토스 결제결과 웹훅(POST). payload는 신뢰하지 않고 재조회로 진실 확보 + payments.order_id 멱등.
//   항상 200 반환(토스 재전송 폭주 방지 — 처리 실패해도 cron-billing 리컨실이 백스톱).
export async function POST(req: NextRequest) {
  try {
    await ensureBilling();
    const raw = await req.text();
    verifyTossSignature(raw, req.headers); // 보강(경고용) — 진실은 아래 재조회로 확정
    const body = JSON.parse(raw || "{}");
    const data = body.data ?? body ?? {};
    const orderId: string | undefined = data.orderId;
    const paymentKey: string | undefined = data.paymentKey;
    if (!orderId && !paymentKey) return NextResponse.json({ ok: true, note: "no ids" });

    // 이미 확정 처리된 주문이면 no-op(웹훅 재전송 방어)
    if (orderId) {
      const existing = (await sql`SELECT status FROM payments WHERE order_id=${orderId}`)[0] as any;
      if (existing?.status === "paid") return NextResponse.json({ ok: true, note: "already paid" });
    }

    const rc = await reconcilePayment({ orderId, paymentKey });
    if (!rc.found) return NextResponse.json({ ok: true, note: "not found in toss" });
    const oid = orderId || rc.raw?.orderId;
    const cafeId = Number((oid || "").match(/^dcn_(\d+)_/)?.[1] || 0)
      || Number(((await sql`SELECT cafe_id FROM payments WHERE order_id=${oid}`)[0] as any)?.cafe_id || 0);

    if (rc.status === "DONE") {
      await sql`INSERT INTO payments (order_id, cafe_id, payment_key, amount, status, method, paid_at, raw)
        VALUES (${oid}, ${cafeId || null}, ${rc.paymentKey}, ${rc.amount}, 'paid', ${rc.method}, now(), ${JSON.stringify(rc.raw)})
        ON CONFLICT (order_id) DO UPDATE SET status='paid', payment_key=EXCLUDED.payment_key, method=EXCLUDED.method, paid_at=now(), raw=EXCLUDED.raw`;
      if (cafeId) await markPaidAndActivate(cafeId, rc.amount ?? 0, { orderId: oid });
    } else if (rc.status && /CANCELED|EXPIRED|ABORTED|FAILED/i.test(rc.status)) {
      await sql`UPDATE payments SET status='failed', raw=${JSON.stringify(rc.raw)} WHERE order_id=${oid}`;
      if (cafeId) await sql`UPDATE subscriptions SET last_payment_status='failed', updated_at=now() WHERE cafe_id=${cafeId}`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    // 실패해도 200 — cron 리컨실이 백스톱(토스 재전송 폭주 방지)
    return NextResponse.json({ ok: true, error: String(e) });
  }
}
