// 🔐 토스 웹훅 검증 — 이중 방어.
//   1차(주): 결제 재조회 재확인 — payload를 신뢰하지 않고 paymentKey/orderId로 토스에 직접 물어 실제 status 확보.
//            위조 웹훅은 우리 시크릿키 없인 조회 못 하므로 여기서 진실이 갈린다(가장 견고).
//   2차(보강): HMAC 서명 대조 — TOSS_WEBHOOK_SECRET 있을 때만. 헤더명이 버전마다 달라 '차단'이 아니라 '경고'로만 쓴다.
import crypto from "crypto";
import { getPayment, getPaymentByOrderId } from "./billing";

// 서명 검증(보강). 반환: true=유효, false=불일치, null=검증 불가(시크릿·헤더 없음 → 재조회로 판단).
export function verifyTossSignature(rawBody: string, headers: { get: (k: string) => string | null }): boolean | null {
  const secret = process.env.TOSS_WEBHOOK_SECRET;
  if (!secret) return null;
  const sig = headers.get("tosspayments-webhook-signature") || headers.get("x-tosspayments-signature") || headers.get("toss-signature");
  if (!sig) return null;
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
    const a = Buffer.from(expected);
    const b = Buffer.from(sig.trim());
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return null; }
}

// 재조회로 진실 확보. paymentKey 우선, 없으면 orderId. 반환: { found, status, paymentKey, method, amount, raw }.
export async function reconcilePayment(args: { orderId?: string; paymentKey?: string }): Promise<{ found: boolean; status: string | null; paymentKey: string | null; method: string | null; amount: number | null; raw: any }> {
  let res = null as Awaited<ReturnType<typeof getPayment>> | null;
  if (args.paymentKey) res = await getPayment(args.paymentKey);
  if ((!res || !res.ok) && args.orderId) res = await getPaymentByOrderId(args.orderId);
  if (!res || !res.ok) return { found: false, status: null, paymentKey: null, method: null, amount: null, raw: res?.data ?? null };
  const d = res.data ?? {};
  return { found: true, status: d.status ?? null, paymentKey: d.paymentKey ?? args.paymentKey ?? null, method: d.method ?? null, amount: typeof d.totalAmount === "number" ? d.totalAmount : (d.balanceAmount ?? null), raw: d };
}
