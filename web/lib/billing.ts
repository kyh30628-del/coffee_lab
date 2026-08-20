// 💳 토스페이먼츠 정기결제(빌링키) 유틸 — 단일 출처.
//   원칙: 카드 민감정보는 토스가 보관, 우리는 billingKey/customerKey만 저장.
//   결제 성공은 기존 구독 수명주기(subscription/route.ts activate/extend, ownerActivity)의
//   '기간 세팅 + 혜택 ON'에 결선한다(markPaidAndActivate). 혜택 최종정합은 ensure() self-heal이 보장.
import crypto from "crypto";
import { sql , ensureOnce } from "./db";
import { decryptPII } from "./crypto";
import { sendBillingEmail } from "./billingEmail";

// 상품 단일 출처 — 과거 subscription/route.ts와 pricing에 흩어졌던 하드코딩을 여기로.
export const PLAN = "홍보팩";
export const PRICE = 9900;
export const PERIOD_DAYS = 30; // 정기결제 1주기
export const ORDER_NAME = "동네 커피 노트 우리가게 홍보팩 (월 구독)";
const TOSS_BASE = "https://api.tosspayments.com";

// 영문+숫자 8자리 PIN(혼동 문자 제외) — subscription/route.ts와 동일 규칙(단일 출처).
export function genPin(): string {
  const cs = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => cs[crypto.randomInt(cs.length)]).join("");
}

// 🔑 키 선택 — 단일 세트(TOSS_CLIENT_KEY/TOSS_SECRET_KEY). 라이브 컷오버는 Vercel env 값 교체로.
export const tossClientKey = () => process.env.TOSS_CLIENT_KEY || "";
const tossSecretKey = () => process.env.TOSS_SECRET_KEY || "";
// 토스 Basic 인증: base64(secretKey + ":") — 비밀번호 없이 시크릿키 뒤 콜론.
const tossAuthHeader = () => `Basic ${Buffer.from(`${tossSecretKey()}:`).toString("base64")}`;

type TossResult = { ok: boolean; status: number; data: any };
async function tossFetch(path: string, init: { method: string; body?: any }): Promise<TossResult> {
  try {
    const r = await fetch(`${TOSS_BASE}${path}`, {
      method: init.method,
      headers: { Authorization: tossAuthHeader(), "Content-Type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { message: String(e) } };
  }
}

// 카드 등록 콜백에서 authKey+customerKey로 빌링키 발급.
export async function issueBillingKey(authKey: string, customerKey: string): Promise<TossResult> {
  return tossFetch("/v1/billing/authorizations/issue", { method: "POST", body: { authKey, customerKey } });
}
// 저장해둔 빌링키로 실제 과금.
export async function chargeBilling(args: { billingKey: string; customerKey: string; amount: number; orderId: string; orderName: string }): Promise<TossResult> {
  const { billingKey, ...body } = args;
  return tossFetch(`/v1/billing/${encodeURIComponent(billingKey)}`, { method: "POST", body });
}
// 웹훅 재확인용 — 토스가 말하는 실제 결제 상태 조회(payload 신뢰 안 함).
export async function getPayment(paymentKey: string): Promise<TossResult> {
  return tossFetch(`/v1/payments/${encodeURIComponent(paymentKey)}`, { method: "GET" });
}
export async function getPaymentByOrderId(orderId: string): Promise<TossResult> {
  return tossFetch(`/v1/payments/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
}

// 카드 표시정보(비민감) 추출 — 마지막 4자리·카드사. 토스 응답 형태 방어적으로.
export function cardDisplay(data: any): { last4: string | null; company: string | null } {
  const card = data?.card ?? data?.method?.card ?? {};
  const num = String(card.number ?? "").replace(/[^0-9]/g, "");
  return { last4: num ? num.slice(-4) : null, company: card.company ?? card.cardType ?? card.issuerCode ?? null };
}

// 빌링 스키마 단일 출처 — subscriptions 결제 컬럼 + payments 테이블. subscription/route.ts와 billing 라우트가 함께 호출.
let billingEnsured = false;
export async function ensureBilling() {
  if (billingEnsured) return;
  // 💰 콜드스타트마다 DDL 반복 금지(2026-08-20 전수 적용) — 배포 단위 1회.
  await ensureOnce("lib.billing.ensureBilling", async () => {
  await sql`CREATE TABLE IF NOT EXISTS subscriptions (id SERIAL PRIMARY KEY, cafe_id INT UNIQUE)`; // 방어: 없으면 최소 생성(정식 스키마는 subscription/route.ts)
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_key TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_customer_key TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_last4 TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_company TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS card_registered_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'none'`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_billing_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_payment_status TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS dunning_count INT DEFAULT 0`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS autopay BOOLEAN DEFAULT false`;
  await ensurePayments();
  });
  billingEnsured = true;
}

// 결제이력 + 멱등키 테이블. order_id UNIQUE = 중복과금 차단의 근본 장치.
let paymentsEnsured = false;
export async function ensurePayments() {
  if (paymentsEnsured) return;
  // 💰 콜드스타트마다 DDL 반복 금지(2026-08-20 전수 적용) — 배포 단위 1회.
  await ensureOnce("lib.billing.ensurePayments", async () => {
  await sql`CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id TEXT UNIQUE,
    cafe_id INT,
    subscription_id INT,
    payment_key TEXT,
    amount INT,
    status TEXT DEFAULT 'pending',
    method TEXT,
    fail_code TEXT,
    fail_reason TEXT,
    raw JSONB,
    requested_at TIMESTAMPTZ DEFAULT now(),
    paid_at TIMESTAMPTZ,
    applied_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ`; // 이 결제로 이미 기간 연장했는지(중복 연장 차단)
  await sql`CREATE INDEX IF NOT EXISTS idx_payments_cafe ON payments(cafe_id, created_at DESC)`;
  });
  paymentsEnsured = true;
}

// 청구주기 기준키: dcn_{cafeId}_{YYYYMM} — '이번 주기 이미 결제됨' 판정(주기당 1 성공).
export function billingPeriodKey(cafeId: number, d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `dcn_${cafeId}_${y}${m}`;
}
// 시도별 order_id: 주기키_{DD} — 실패 재시도가 다음날 새 orderId로 가능(토스는 orderId 재사용 거부).
export function attemptOrderId(cafeId: number, d: Date): string {
  return `${billingPeriodKey(cafeId, d)}_${String(d.getUTCDate()).padStart(2, "0")}`;
}

// 💠 결제 성공 → 구독 활성/연장 + 혜택 ON (단일 결선점).
//   authorize(즉시 첫 과금)·webhook·cron-billing이 공유. expires_at은 GREATEST로 절대 단축 안 함(수동 activate와 안 밟힘).
export async function markPaidAndActivate(cafeId: number, amount: number, opts: { periodDays?: number; orderId?: string } = {}): Promise<void> {
  const days = Math.min(Math.max(opts.periodDays ?? PERIOD_DAYS, 1), 365);
  // 🔒 중복 연장 차단 — 이 orderId로 아직 연장 안 했을 때만 진행(cron 성공 + 웹훅이 겹쳐도 1회만).
  if (opts.orderId) {
    const claim = (await sql`UPDATE payments SET applied_at=now() WHERE order_id=${opts.orderId} AND applied_at IS NULL RETURNING id`)[0] as any;
    if (!claim) return; // 이미 이 결제로 연장 완료
  }
  const s = (await sql`SELECT id, cafe_name, email, pin FROM subscriptions WHERE cafe_id=${cafeId}`)[0] as any;
  if (!s) return;
  const pin = s.pin || genPin();
  await sql`UPDATE subscriptions SET
      status='active', autopay=true, billing_status='active',
      last_payment_status='paid', last_payment_at=now(), dunning_count=0,
      started_at=COALESCE(started_at, now()),
      expires_at=GREATEST(COALESCE(expires_at, now()), now()) + make_interval(days=>${days}),
      duration_days=${days}, pin=${pin}, verified=true, updated_at=now()
    WHERE cafe_id=${cafeId}`;
  const e = (await sql`SELECT expires_at FROM subscriptions WHERE cafe_id=${cafeId}`)[0] as any;
  await sql`UPDATE subscriptions SET next_billing_at=${e?.expires_at ?? null} WHERE cafe_id=${cafeId}`;
  // 혜택 ON — 시작~만료 창에 정렬(ownerActivity/ensure()와 동일 패턴).
  await sql`INSERT INTO cafe_promos (cafe_id, featured, featured_until, approved, published, updated_at)
    VALUES (${cafeId}, true, ${e?.expires_at ?? null}, true, true, now())
    ON CONFLICT (cafe_id) DO UPDATE SET featured=true, featured_until=${e?.expires_at ?? null}, approved=true, updated_at=now()`;
  // 영수증 메일(선택·실패 무해)
  const to = decryptPII(s.email ?? "");
  if (to) await sendBillingEmail(to, "paid", { cafeName: s.cafe_name ?? "", amount, nextBillingAt: e?.expires_at ?? null }).catch(() => {});
}

// 💠 1회 과금(멱등) — authorize 즉시결제·cron-billing 정기결제가 공유.
//   멱등 2중: ①이번 주기(YYYYMM) 이미 성공하면 스킵(중복과금 차단) ②시도별 orderId(_DD)로 슬롯 선점(동시실행 차단).
//   실패는 다음날 새 orderId로 재시도 가능. dunning 임계 초과 시 suspend는 호출측(cron)이 판단.
export async function chargeOnce(cafeId: number): Promise<{ ok: boolean; skipped?: boolean; reason?: string }> {
  await ensureBilling();
  const s = (await sql`SELECT id, billing_key, billing_customer_key, cafe_name FROM subscriptions WHERE cafe_id=${cafeId}`)[0] as any;
  if (!s?.billing_key || !s?.billing_customer_key) return { ok: false, reason: "no_billing_key" };
  const now = new Date();
  const periodKey = billingPeriodKey(cafeId, now);
  // ① 이번 주기 이미 결제 성공? → 스킵(중복과금 차단)
  const paid = (await sql`SELECT 1 FROM payments WHERE cafe_id=${cafeId} AND status='paid' AND order_id LIKE ${periodKey + "%"} LIMIT 1`)[0] as any;
  if (paid) return { ok: true, skipped: true, reason: "already_paid_this_period" };
  // ② 오늘 시도 슬롯 선점(동시 실행/재시도 중복 차단). 실패 재시도는 다음날 새 orderId로.
  const orderId = attemptOrderId(cafeId, now);
  const slot = (await sql`INSERT INTO payments (order_id, cafe_id, subscription_id, amount, status)
    VALUES (${orderId}, ${cafeId}, ${s.id}, ${PRICE}, 'pending') ON CONFLICT (order_id) DO NOTHING RETURNING id`)[0] as any;
  if (!slot) return { ok: true, skipped: true, reason: "attempt_in_progress" };
  const res = await chargeBilling({ billingKey: s.billing_key, customerKey: s.billing_customer_key, amount: PRICE, orderId, orderName: ORDER_NAME });
  const d = res.data ?? {};
  if (res.ok && d.status === "DONE") {
    await sql`UPDATE payments SET status='paid', payment_key=${d.paymentKey ?? null}, method=${d.method ?? null}, paid_at=now(), raw=${JSON.stringify(d)} WHERE order_id=${orderId}`;
    await markPaidAndActivate(cafeId, PRICE, { orderId });
    return { ok: true };
  }
  await sql`UPDATE payments SET status='failed', fail_code=${d.code ?? null}, fail_reason=${d.message ?? String(res.status)}, raw=${JSON.stringify(d)} WHERE order_id=${orderId}`;
  await sql`UPDATE subscriptions SET dunning_count=COALESCE(dunning_count,0)+1, last_payment_status='failed', last_payment_at=now(), updated_at=now() WHERE cafe_id=${cafeId}`;
  return { ok: false, reason: d.message ?? `toss_${res.status}` };
}
