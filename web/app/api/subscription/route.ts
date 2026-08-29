import { NextRequest, NextResponse } from "next/server";
import { noteSilentFail } from "@/lib/silentFail";
import { TRIAL_DAYS, isTrialDuration } from "@/lib/ownerPlan";
import { sql, ensureSchema , ensureOnce } from "@/lib/db";
import { ensureOwnerActivity } from "@/lib/ownerActivity";
import { encryptPII, decryptPII } from "@/lib/crypto";
import { subscriptionLive, paymentsLive, bankTransferEmailEnabled } from "@/lib/flags";
import { renderOnboardingEmail } from "@/lib/onboardingEmail";
import { ownerScope } from "@/lib/ownerAuth";
import { PLAN, PRICE, genPin, ensureBilling } from "@/lib/billing"; // 상품 상수·PIN·결제 스키마 단일 출처
import { sendBillingEmail } from "@/lib/billingEmail";
import { put } from "@vercel/blob";
export const runtime = "nodejs";

// 💳 구독 회원(카페별). 요금제(/pricing)에서 회원가입 → 관리자 활성화 → PIN 발급(이메일)·featured 연동.
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
// 등록 이메일로 온보딩 메일(내 카페 열쇠 + 전용 서비스 사용법) 발송(Resend). 키 없으면 미발송(관리자 화면에서 PIN 확인·전달).
//   본문은 lib/onboardingEmail.ts 단일 출처(리뷰 분석·쇼케이스·노출·뉴스레터 안내 포함). 체험/구독 분기(lib/ownerPlan.ts isTrialDuration).
async function sendPinEmail(to: string, pin: string, cafeName: string, days = 30): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to || !to.includes("@")) return false;
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://dongnecoffeenote.com";
  const { subject, html } = renderOnboardingEmail({ cafeName, pin, days, site });
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject, html }),
    });
    return r.ok;
  } catch { return false; }
}

async function ensure() {
  // 💰 2026-08-20 전수 적용: 이 함수 일부는 메모 플래그조차 없어 **매 요청** DDL이 돌았다 — 배포 단위 1회로.
  await ensureOnce("subscription.ensure", async () => {
  await sql`CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY, cafe_id INT UNIQUE, cafe_name TEXT, owner_name TEXT,
    contact TEXT, email TEXT, plan TEXT DEFAULT '홍보팩', price INT DEFAULT 9900,
    status TEXT DEFAULT 'pending', started_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
    consent BOOLEAN DEFAULT false, consent_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pin TEXT`; // 승인 시 발급되는 사장님 로그인 PIN
  // 사장님 인증(사칭 방지) 증빙 — 사업자등록증 이미지·번호·법적 동의·접속기록(IP/UA). 분쟁 시 추적·법적 근거.
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS biz_reg_url TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS biz_no TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS attested BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS attested_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS signup_ip TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS signup_ua TEXT`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false`; // 관리자 서류 대조 완료 표시
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS suspend_reason TEXT`;            // 사칭/위반 즉시정지 사유(증빙)
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS newsletter_opt_in BOOLEAN DEFAULT true`; // 주간 뉴스레터 수신동의
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS pin_emailed_at TIMESTAMPTZ`;             // 키 이메일 실제 발송 성공 시각(발송 증빙)
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS duration_days INT`;                     // 승인 시 확정한 이용기간(7일 체험/30일 등). 시계는 '첫 로그인'에 시작되므로 여기에 보관.
  // 🔔 사장님發 구독 전환 요청 시각 — 체험/만료 사장님이 "유료 전환하고 싶다"를 스스로 남긴 신호. 관리자 대시보드
  //   노출 + CEO 알림메일로 "실제 구독 요청 여부"를 즉시 알 수 있게 한다(카드결제 오픈 전에도 유효). 승인(activate) 시 클리어.
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS conversion_requested_at TIMESTAMPTZ`;
  await ensureBilling(); // 💳 정기결제 컬럼(billing_key·customer_key·autopay 등) + payments 테이블 — 단일 출처 lib/billing.ts
  });
  // ⚠️ 2026-08-20 래핑 사고 수리: 아래 3개 UPDATE는 스키마가 아니라 **주기 업무로직**(만료 반영·혜택 동기화)이다.
  //   ensureOnce에 묶으면 배포 사이에 만료가 멈춘다 — 래퍼 밖(매 요청, 원래 동작)으로 복원. 테이블 2행이라 비용 무시 수준.
  // 만료 자동 반영: 기간 지난 active → expired + 모든 혜택 해제(골드핀·우선노출·쇼케이스). expires_at IS NULL=미시작(첫 로그인 전)은 만료 아님.
  await sql`UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='active' AND expires_at IS NOT NULL AND expires_at < now()`;
  // 혜택 OFF: 구독이 active-시작-미만료가 아닌 모든 카페(만료·취소·정지·미시작). featured=골드핀·우선노출, approved=쇼케이스.
  await sql`UPDATE cafe_promos p SET featured=false, approved=false, updated_at=now()
            FROM subscriptions s
            WHERE s.cafe_id = p.cafe_id
              AND (s.status <> 'active' OR s.expires_at IS NULL OR s.expires_at <= now())
              AND (p.featured = true OR p.approved = true)`;
  // 🔒 self-heal: '시작된(첫 로그인 완료)' active 구독은 항상 전 혜택 유지 — 드리프트 자동복구. 미로그인(expires NULL)은 제외.
  //    혜택 시작은 첫 로그인(lib/ownerActivity), 제거는 만료·정지·취소로만.
  await sql`UPDATE cafe_promos p SET featured=true, approved=true, featured_until=s.expires_at, updated_at=now()
            FROM subscriptions s
            WHERE s.cafe_id = p.cafe_id AND s.status='active' AND s.expires_at IS NOT NULL AND s.expires_at > now()
              AND (p.featured = false OR p.approved = false OR p.featured_until IS NULL OR p.featured_until < now())`;
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    if (req.nextUrl.searchParams.get("all")) {
      if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
      await ensureOwnerActivity(); // 활동 추적 컬럼·테이블 보장
      const rows = await sql`SELECT s.id, s.cafe_id, s.cafe_name, s.owner_name, s.contact, s.email, s.plan, s.price, s.status, s.pin, s.pin_emailed_at, s.updated_at, s.newsletter_opt_in, s.started_at, s.expires_at, s.duration_days, s.created_at, s.biz_reg_url, s.biz_no, s.attested, s.signup_ip, s.signup_ua, s.verified, s.suspend_reason, s.suspended_at, s.last_seen_at, s.first_login_at, COALESCE(s.login_count,0) AS login_count, s.billing_key, s.card_last4, s.card_company, s.autopay, s.last_payment_status, s.next_billing_at, s.billing_status, s.conversion_requested_at, COALESCE(c.published, false) AS cafe_published,
        (SELECT COALESCE(json_agg(json_build_object('event', e.event, 'at', e.at) ORDER BY e.at DESC), '[]'::json) FROM (SELECT event, at FROM owner_events WHERE cafe_id = s.cafe_id ORDER BY at DESC LIMIT 8) e) AS recent_events
        FROM subscriptions s LEFT JOIN cafes c ON c.id = s.cafe_id ORDER BY (s.conversion_requested_at IS NOT NULL AND s.status<>'active') DESC, (s.status='pending') DESC, s.created_at DESC LIMIT 200` as unknown as any[];
      // emailReady: 이 환경(프로덕션 포함)에 Resend 키가 있어야 승인 시 키 이메일이 자동 발송됨
      // senderReady: 발신주소(RESEND_FROM)가 설정돼야 브랜드 도메인(noreply@dongnecoffeenote.com)으로 나감.
      //   ⚠️ 미설정 시 코드가 onboarding@resend.dev(공용 테스트 도메인) 폴백 → 스팸행·비전문 발신. 키만 보면 이 사각을 놓침(2026-07-30 강화).
      // liveExposure: 소비자에게 실제로 우선노출(금색핀·추천카페·쇼케이스)이 보이는지 — SUBSCRIPTION_LIVE=true 여야 함
      // bankTransferEmail: 🏦 계좌이체 안내메일 발송이 켜져 있는지(기본 off) — 꺼져 있으면 버튼 비활성
      return NextResponse.json({ ok: true, emailReady: !!process.env.RESEND_API_KEY, senderReady: !!process.env.RESEND_FROM, liveExposure: subscriptionLive(), bankTransferEmail: bankTransferEmailEnabled(), subs: rows.map((r) => ({ ...r, contact: decryptPII(r.contact), email: decryptPII(r.email) })) });
    }
    // 사장님: 본인 카페 구독 상태(관리자 전체 또는 PIN=본인 카페만)
    const cafeId = Number(req.nextUrl.searchParams.get("cafeId"));
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    const scope = await ownerScope(req);
    if (scope !== "admin" && scope !== cafeId) return NextResponse.json({ ok: false }, { status: 401 });
    const r = (await sql`SELECT id, cafe_id, owner_name, plan, price, status, started_at, expires_at, duration_days, autopay, billing_status, card_last4, card_company, next_billing_at, last_payment_status, conversion_requested_at FROM subscriptions WHERE cafe_id=${cafeId}`)[0] ?? null;
    return NextResponse.json({ ok: true, sub: r, paymentsLive: paymentsLive() });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}

// 🔔 CEO 알림 메일(Resend) — 사장님 구독 요청 등 즉시 인지가 필요한 이벤트. 키 없으면 조용히 미발송(무해).
async function sendCeoAlert(subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = "dongnecoffeenote@gmail.com"; // 관리자 알림 고정(env 우회 없음 — 개발자 개인메일로 새지 않게)
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject, html }),
    });
    return r.ok;
  } catch { return false; }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    const b = await req.json().catch(() => ({}));

    // 🔔 사장님發 구독 전환 요청 (PIN 인증 — 관리자 인증 불필요, 본인 카페만). status는 안 건드리고 신호만 남긴다.
    //   → conversion_requested_at 기록 + owner_events 로그 + CEO 알림메일. 관리자 대시보드에 '구독 전환 요청'으로 노출.
    if (b.action === "request_conversion") {
      const cafeId = Number(b.cafeId);
      if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
      const scope = await ownerScope(req);
      if (scope !== "admin" && scope !== cafeId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      const s = (await sql`SELECT cafe_name, owner_name, contact, email, status, plan FROM subscriptions WHERE cafe_id=${cafeId}`)[0] as any;
      if (!s) return NextResponse.json({ ok: false, error: "구독 없음" }, { status: 404 });
      await sql`UPDATE subscriptions SET conversion_requested_at=now(), updated_at=now() WHERE cafe_id=${cafeId}`;
      await sql`INSERT INTO owner_events (cafe_id, event, at) VALUES (${cafeId}, 'request_conversion', now())`
        .catch((e) => noteSilentFail("subscription.owner_events", e)); // 이력 유실 시 전환 퍼널이 과소집계된다
      const note = String(b.note ?? "").slice(0, 300).replace(/[<>]/g, "");
      await sendCeoAlert(`🔔 구독 전환 요청 — ${s.cafe_name ?? ""}`,
        `<div style="font-family:sans-serif;line-height:1.6"><h2>사장님이 유료 구독 전환을 요청했어요</h2>` +
        `<p><b>카페</b>: ${s.cafe_name ?? ""} (id ${cafeId})<br><b>사장님</b>: ${s.owner_name ?? ""}<br>` +
        `<b>연락처</b>: ${(decryptPII(s.contact ?? "") || "-")} · ${(decryptPII(s.email ?? "") || "-")}<br>` +
        `<b>현재 상태</b>: ${s.status ?? "-"} · ${s.plan ?? ""}</p>${note ? `<p><b>메모</b>: ${note}</p>` : ""}` +
        `<p>→ /admin '💳 구독 카페 현황'에서 승인(activate) 또는 계좌이체 안내로 진행하세요.</p></div>`);
      return NextResponse.json({ ok: true, requested: true });
    }

    // 관리자 액션: 활성화/해지/연장 (관리자 인증 필요)
    if (b.action) {
      if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      const id = Number(b.id);
      if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
      const s = (await sql`SELECT cafe_id, cafe_name, email, expires_at, pin, duration_days, status FROM subscriptions WHERE id=${id}`)[0] as any;
      if (!s) return NextResponse.json({ ok: false, error: "구독 없음" }, { status: 404 });
      const days = Math.min(Math.max(Number(b.days) || 30, 1), 365);
      if (b.action === "activate") {
        const pin = s.pin || genPin(); // 재활성화면 기존 PIN 유지
        // 체험(≤TRIAL_DAYS일) = 첫 로그인 시점 시작 / 유료 구독 = 결제(=이 승인) 시점 즉시 시작. 온보딩 메일 분기와 동일 기준(lib/ownerPlan.ts 단일출처).
        const isTrial = isTrialDuration(days);
        if (isTrial) {
          // 🕐 무료 체험: 시계는 '첫 로그인'에. 승인 시엔 PIN·이용기간만 확정(started/expires·혜택은 첫 접속 때 lib/ownerActivity가 ON).
          await sql`UPDATE subscriptions SET status='active', started_at=NULL, expires_at=NULL, duration_days=${days}, pin=${pin}, verified=true, conversion_requested_at=NULL, updated_at=now() WHERE id=${id}`;
          if (s.cafe_id) await sql`INSERT INTO cafe_promos (cafe_id, featured, featured_until, approved, published, updated_at)
            VALUES (${s.cafe_id}, false, NULL, false, true, now())
            ON CONFLICT (cafe_id) DO UPDATE SET featured=false, featured_until=NULL, approved=false, updated_at=now()`;
        } else {
          // 💳 유료 구독: 결제 시점(=이 승인)부터 즉시 시작 + 전 혜택(골드핀·우선노출·쇼케이스) ON.
          await sql`UPDATE subscriptions SET status='active', started_at=now(), expires_at=now()+make_interval(days=>${days}), duration_days=${days}, pin=${pin}, verified=true, conversion_requested_at=NULL, updated_at=now() WHERE id=${id}`;
          if (s.cafe_id) await sql`INSERT INTO cafe_promos (cafe_id, featured, featured_until, approved, published, updated_at)
            VALUES (${s.cafe_id}, true, now()+make_interval(days=>${days}), true, true, now())
            ON CONFLICT (cafe_id) DO UPDATE SET featured=true, featured_until=now()+make_interval(days=>${days}), approved=true, updated_at=now()`;
        }
        const emailed = await sendPinEmail(decryptPII(s.email ?? ""), pin, s.cafe_name ?? "", days);
        if (emailed) await sql`UPDATE subscriptions SET pin_emailed_at=now() WHERE id=${id}`;
        return NextResponse.json({ ok: true, status: "active", pin, emailed, started: !isTrial, email: decryptPII(s.email ?? "") });
      }
      if (b.action === "extend") {
        await sql`UPDATE subscriptions SET status='active', expires_at=GREATEST(coalesce(expires_at,now()),now())+make_interval(days=>${days}), updated_at=now() WHERE id=${id}`;
        const e = (await sql`SELECT expires_at FROM subscriptions WHERE id=${id}`)[0] as any;
        if (s.cafe_id) await sql`INSERT INTO cafe_promos (cafe_id, featured, featured_until, approved, published, updated_at)
          VALUES (${s.cafe_id}, true, ${e.expires_at}, true, true, now())
          ON CONFLICT (cafe_id) DO UPDATE SET featured=true, featured_until=${e.expires_at}, approved=true`;
        return NextResponse.json({ ok: true, status: "active" });
      }
      if (b.action === "cancel") {
        await sql`UPDATE subscriptions SET status='cancelled', updated_at=now() WHERE id=${id}`;
        if (s.cafe_id) await sql`UPDATE cafe_promos SET featured=false, featured_until=NULL WHERE cafe_id=${s.cafe_id}`;
        return NextResponse.json({ ok: true, status: "cancelled" });
      }
      // 🚫 사칭·위반 즉시정지 — PIN 접근 즉시 차단(owner-auth가 active만 허용) + 우선노출 OFF. 기록은 증빙 보존(삭제 안 함).
      if (b.action === "suspend") {
        const reason = String(b.reason ?? "").slice(0, 300);
        await sql`UPDATE subscriptions SET status='suspended', suspend_reason=${reason}, suspended_at=now(), updated_at=now() WHERE id=${id}`;
        if (s.cafe_id) await sql`UPDATE cafe_promos SET featured=false, featured_until=NULL WHERE cafe_id=${s.cafe_id}`;
        return NextResponse.json({ ok: true, status: "suspended" });
      }
      // 📧 온보딩 패키지 리마인드 재발송 — 이미 승인(PIN 발급)된 사장님께 온보딩 메일(PIN+내카페열쇠+서비스 사용법)을 다시 보낸다.
      //   메일이 묻혔거나 못 받은 사장님 대상. 상태·혜택은 안 건드리고 '발송'만. 체험/유료 분기는 저장된 duration_days로.
      if (b.action === "remind") {
        if (!s.pin) return NextResponse.json({ ok: false, error: "PIN 미발급 — 먼저 승인(activate)하세요" }, { status: 400 });
        const to = decryptPII(s.email ?? "");
        if (!to) return NextResponse.json({ ok: false, error: "등록된 이메일이 없어요 — 화면의 PIN을 직접 전달하세요" }, { status: 400 });
        const remindDays = Math.min(Math.max(Number(s.duration_days) || 30, 1), 365);
        const emailed = await sendPinEmail(to, s.pin, s.cafe_name ?? "", remindDays);
        if (emailed) await sql`UPDATE subscriptions SET pin_emailed_at=now() WHERE id=${id}`;
        return NextResponse.json({ ok: emailed, emailed, email: to, error: emailed ? undefined : "발송 실패 — Resend 키/이메일 주소 확인" });
      }
      // 🏦 계좌이체 안내 — 카드 정기결제(PAYMENTS_LIVE) 오픈 전, 사장님이 계좌이체로 먼저 전환할 수 있도록
      //   사실 문구(회신하면 계좌 안내)만 담아 발송. 실제 계좌번호는 개별 회신으로만 안내(코드에 하드코딩 금지).
      //   ⏸️ 현재 발송 중단(BANK_TRANSFER_EMAIL_ENABLED 기본 off) — 액션은 정상 처리하되 메일만 스킵. on이면 기존대로 발송.
      if (b.action === "bank_transfer") {
        const to = decryptPII(s.email ?? "");
        if (!to) return NextResponse.json({ ok: false, error: "등록된 이메일이 없어요" }, { status: 400 });
        if (!bankTransferEmailEnabled()) {
          console.log(`[subscription] bank_transfer 메일 스킵(발송 중단 상태) — sub#${id} ${s.cafe_name ?? ""}`);
          return NextResponse.json({ ok: true, skipped: true, emailed: false, email: to, reason: "BANK_TRANSFER_EMAIL_ENABLED off" });
        }
        const emailed = await sendBillingEmail(to, "bank_transfer", { cafeName: s.cafe_name ?? "" });
        return NextResponse.json({ ok: emailed, emailed, email: to, error: emailed ? undefined : "발송 실패 — Resend 키/이메일 주소 확인" });
      }
      return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
    }

    // 사장님 회원가입(가입 신청)
    const cafeId = Number(b.cafeId);
    const cafeName = String(b.cafeName ?? "").slice(0, 80);
    const ownerName = String(b.ownerName ?? "").trim().slice(0, 40);
    const contact = String(b.contact ?? "").trim().slice(0, 120);
    const email = String(b.email ?? "").trim().slice(0, 120);
    const bizNo = String(b.bizNo ?? "").replace(/[^0-9]/g, "").slice(0, 12); // 사업자등록번호(선택, 숫자만)
    if (!cafeId || !ownerName || !contact) return NextResponse.json({ ok: false, error: "카페·이름·연락처 필요" }, { status: 400 });
    if (!b.consent) return NextResponse.json({ ok: false, error: "개인정보 동의 필요" }, { status: 400 });
    if (!b.attest) return NextResponse.json({ ok: false, error: "사업주 본인확인 동의가 필요합니다" }, { status: 400 });
    // 🔒 사칭 방지: 이미 인증된 사장님이 이용 중인 카페는 새 신청으로 덮어쓸 수 없음(탈취 차단).
    const existing = (await sql`SELECT status FROM subscriptions WHERE cafe_id=${cafeId}`)[0] as any;
    if (existing?.status === "active") return NextResponse.json({ ok: false, error: "이미 인증된 사장님이 이용 중인 카페예요. 본인 매장인데 문제가 있다면 고객센터로 문의해 주세요." }, { status: 409 });
    // 사업자등록증 이미지(필수) — 증빙용 Blob 저장. 분쟁 시 위·변조 여부로 책임 추궁 근거.
    let bizRegUrl: string | null = null;
    if (typeof b.bizRegBase64 === "string" && b.bizRegBase64.startsWith("data:image")) {
      try {
        const buf = Buffer.from(b.bizRegBase64.split(",")[1], "base64");
        if (buf.length > 8 * 1024 * 1024) return NextResponse.json({ ok: false, error: "이미지는 8MB 이하로 올려주세요" }, { status: 400 });
        const mime = b.bizRegBase64.slice(5).split(";")[0] || "image/jpeg";
        const ext = (mime.split("/")[1] || "jpg").replace(/[^a-z0-9]/gi, "");
        const blob = await put(`owner-docs/${cafeId}-${Date.now()}.${ext}`, buf, { access: "public", contentType: mime });
        bizRegUrl = blob.url;
      } catch { return NextResponse.json({ ok: false, error: "이미지 업로드 실패 — 다시 시도해 주세요" }, { status: 500 }); }
    }
    if (!bizRegUrl) return NextResponse.json({ ok: false, error: "사업자등록증 이미지가 필요합니다" }, { status: 400 });
    const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0].trim().slice(0, 60);
    const ua = (req.headers.get("user-agent") ?? "").slice(0, 200);
    const isTrial = !!b.trial;                          // 무료 체험 신청 — 관리자가 TRIAL_DAYS(lib/ownerPlan.ts)로 승인
    const plan = isTrial ? `${TRIAL_DAYS}일 체험` : PLAN;
    const price = isTrial ? 0 : PRICE;
    const optIn = b.newsletter !== false;   // 뉴스레터 수신동의(기본 true)
    await sql`INSERT INTO subscriptions (cafe_id, cafe_name, owner_name, contact, email, plan, price, status, consent, consent_at, biz_reg_url, biz_no, attested, attested_at, signup_ip, signup_ua, newsletter_opt_in)
      VALUES (${cafeId}, ${cafeName}, ${ownerName}, ${encryptPII(contact)}, ${encryptPII(email)}, ${plan}, ${price}, 'pending', true, now(), ${bizRegUrl}, ${bizNo}, true, now(), ${ip}, ${ua}, ${optIn})
      ON CONFLICT (cafe_id) DO UPDATE SET owner_name=${ownerName}, contact=${encryptPII(contact)}, email=${encryptPII(email)}, plan=${plan}, price=${price}, biz_reg_url=${bizRegUrl}, biz_no=${bizNo}, attested=true, attested_at=now(), signup_ip=${ip}, signup_ua=${ua}, newsletter_opt_in=${optIn}, verified=false, status='pending', updated_at=now()`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
