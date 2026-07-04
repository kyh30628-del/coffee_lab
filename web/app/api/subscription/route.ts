import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { encryptPII, decryptPII } from "@/lib/crypto";
import { subscriptionLive } from "@/lib/flags";
import { put } from "@vercel/blob";
import crypto from "crypto";
export const runtime = "nodejs";

// 💳 구독 회원(카페별). 요금제(/pricing)에서 회원가입 → 관리자 활성화 → PIN 발급(이메일)·featured 연동.
const PLAN = "홍보팩";
const PRICE = 9900;
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

// 영문+숫자 8자리 PIN(혼동 문자 제외)
function genPin(): string {
  const cs = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => cs[crypto.randomInt(cs.length)]).join("");
}
// 등록 이메일로 PIN(내 카페 열쇠) 발송(Resend). 키 없으면 미발송(관리자 화면에서 PIN 확인·전달).
//   동네 커피 노트 톤(따뜻한 세리프·크림/커피색) + 손님 후기가 모인 '우리 가게 이야기' 정서. 체험/구독 분기.
async function sendPinEmail(to: string, pin: string, cafeName: string, days = 30): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to || !to.includes("@")) return false;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://dongnecoffeenote.com").replace(/\/$/, "");
  const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const name = esc(cafeName || "우리 카페");
  const isTrial = days <= 7;
  const kicker = isTrial ? "7일 무료 체험이 시작됐어요" : "우리 가게 이야기가 시작됐어요";
  const body = isTrial
    ? `우리 동네 누군가는 오늘도 사장님 가게의 커피 한 잔을 기억합니다. 손님들이 남긴 진심 어린 후기가 모여 만든 <b style="color:#5b4636">‘우리 가게 이야기’</b>를, 지금부터 <b style="color:#5b4636">7일 동안</b> 마음껏 들여다보세요.`
    : `수많은 손님이 남긴 진심이 모여 사장님 가게만의 색깔이 되었어요. 이제 그 이야기와 함께, 우리 가게를 더 오래 빛나게 해보세요.`;
  const footer = isTrial
    ? `지금 7일 무료 체험이 시작됐어요. 기간이 끝나도 구독으로 언제든 이어갈 수 있어요.`
    : `우리가게 홍보팩 구독이 시작됐어요. 함께해 주셔서 고맙습니다.`;
  const subject = isTrial ? `☕ ${cafeName} 사장님, 우리 가게 이야기를 열어보세요 (7일 무료 체험)` : `☕ ${cafeName} 사장님, 우리 가게 이야기가 시작됐어요`;
  const html = `<div style="margin:0;padding:0;background:#efe7d8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe7d8;padding:32px 12px;"><tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#fffdf9;border:1px solid #e7dcc6;border-radius:18px;overflow:hidden;font-family:'Nanum Myeongjo',Georgia,'Apple SD Gothic Neo',serif;">
        <tr><td style="background:#2b2018;padding:16px 28px;"><span style="color:#e8b87a;font-size:12px;letter-spacing:3px;">☕ 동네 커피 노트</span></td></tr>
        <tr><td style="padding:30px 28px 6px;">
          <div style="font-size:13px;color:#b07d3e;letter-spacing:0.5px;margin-bottom:8px;">${kicker}</div>
          <div style="font-size:22px;font-weight:700;color:#2b2018;line-height:1.4;">${name} 사장님,</div>
          <p style="font-size:15px;color:#52402e;line-height:1.9;margin:16px 0 0;">${body}</p>
        </td></tr>
        <tr><td style="padding:22px 28px 6px;">
          <div style="background:#f4ece0;border:1px dashed #d8c4a3;border-radius:14px;padding:18px;text-align:center;">
            <div style="font-size:12px;color:#9c6b3f;letter-spacing:1px;margin-bottom:10px;">🔑 내 카페 열쇠</div>
            <div style="font-size:30px;font-weight:800;letter-spacing:8px;color:#2b2018;font-family:'Courier New',monospace;">${esc(pin)}</div>
          </div>
        </td></tr>
        <tr><td style="padding:10px 28px 28px;" align="center">
          <a href="${site}/owner" style="display:inline-block;background:#2b2018;color:#f4ece0;text-decoration:none;font-size:15px;font-weight:700;padding:14px 30px;border-radius:30px;">내 카페 이야기 보러 가기 →</a>
          <p style="font-size:12px;color:#a8927a;margin:14px 0 0;line-height:1.7;">화면에서 위 열쇠를 입력하면 <b style="color:#7c6a55;">내 카페로 바로</b> 들어가요.</p>
        </td></tr>
        <tr><td style="background:#faf4ea;border-top:1px solid #efe2cd;padding:18px 28px;">
          <p style="font-size:12px;color:#9c8569;margin:0;line-height:1.7;">${footer}</p>
          <p style="font-size:11px;color:#bcae98;margin:8px 0 0;">열쇠는 본인만 알 수 있게 보관해 주세요 · 문의 kyh30628@gmail.com</p>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#b3a489;margin-top:14px;font-family:'Apple SD Gothic Neo',serif;">동네 커피 노트 · 진짜 후기로 고른 우리 동네 카페</div>
    </td></tr></table>
  </div>`;
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
  // 만료 자동 반영: 기간 지난 active → expired + featured 해제
  await sql`UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='active' AND expires_at < now()`;
  await sql`UPDATE cafe_promos SET featured=false WHERE cafe_id IN (SELECT cafe_id FROM subscriptions WHERE status='expired') AND featured_until < now()`;
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    if (req.nextUrl.searchParams.get("all")) {
      if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
      const rows = await sql`SELECT s.id, s.cafe_id, s.cafe_name, s.owner_name, s.contact, s.email, s.plan, s.price, s.status, s.pin, s.pin_emailed_at, s.newsletter_opt_in, s.started_at, s.expires_at, s.created_at, s.biz_reg_url, s.biz_no, s.attested, s.signup_ip, s.signup_ua, s.verified, s.suspend_reason, s.suspended_at, COALESCE(c.published, false) AS cafe_published FROM subscriptions s LEFT JOIN cafes c ON c.id = s.cafe_id ORDER BY (s.status='pending') DESC, s.created_at DESC LIMIT 200` as unknown as any[];
      // emailReady: 이 환경(프로덕션 포함)에 Resend 키가 있어야 승인 시 키 이메일이 자동 발송됨
      // liveExposure: 소비자에게 실제로 우선노출(금색핀·추천카페·쇼케이스)이 보이는지 — SUBSCRIPTION_LIVE=true 여야 함
      return NextResponse.json({ ok: true, emailReady: !!process.env.RESEND_API_KEY, liveExposure: subscriptionLive(), subs: rows.map((r) => ({ ...r, contact: decryptPII(r.contact), email: decryptPII(r.email) })) });
    }
    // 사장님: 본인 카페 구독 상태
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    const cafeId = Number(req.nextUrl.searchParams.get("cafeId"));
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });
    const r = (await sql`SELECT id, cafe_id, owner_name, plan, price, status, started_at, expires_at FROM subscriptions WHERE cafe_id=${cafeId}`)[0] ?? null;
    return NextResponse.json({ ok: true, sub: r });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    const b = await req.json().catch(() => ({}));

    // 관리자 액션: 활성화/해지/연장 (관리자 인증 필요)
    if (b.action) {
      if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
      const id = Number(b.id);
      if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
      const s = (await sql`SELECT cafe_id, cafe_name, email, expires_at, pin FROM subscriptions WHERE id=${id}`)[0] as any;
      if (!s) return NextResponse.json({ ok: false, error: "구독 없음" }, { status: 404 });
      const days = Math.min(Math.max(Number(b.days) || 30, 1), 365);
      if (b.action === "activate") {
        const pin = s.pin || genPin(); // 재활성화면 기존 PIN 유지
        await sql`UPDATE subscriptions SET status='active', started_at=now(), expires_at=now()+make_interval(days=>${days}), pin=${pin}, verified=true, updated_at=now() WHERE id=${id}`;
        if (s.cafe_id) await sql`INSERT INTO cafe_promos (cafe_id, featured, featured_until, approved, published, updated_at)
          VALUES (${s.cafe_id}, true, now()+make_interval(days=>${days}), true, true, now())
          ON CONFLICT (cafe_id) DO UPDATE SET featured=true, featured_until=now()+make_interval(days=>${days}), approved=true`;
        const emailed = await sendPinEmail(decryptPII(s.email ?? ""), pin, s.cafe_name ?? "", days);
        if (emailed) await sql`UPDATE subscriptions SET pin_emailed_at=now() WHERE id=${id}`;
        return NextResponse.json({ ok: true, status: "active", pin, emailed, email: decryptPII(s.email ?? "") });
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
    const isTrial = !!b.trial;                          // 7일 무료 체험 신청 — 관리자가 7일로 승인
    const plan = isTrial ? "7일 체험" : PLAN;
    const price = isTrial ? 0 : PRICE;
    const optIn = b.newsletter !== false;   // 뉴스레터 수신동의(기본 true)
    await sql`INSERT INTO subscriptions (cafe_id, cafe_name, owner_name, contact, email, plan, price, status, consent, consent_at, biz_reg_url, biz_no, attested, attested_at, signup_ip, signup_ua, newsletter_opt_in)
      VALUES (${cafeId}, ${cafeName}, ${ownerName}, ${encryptPII(contact)}, ${encryptPII(email)}, ${plan}, ${price}, 'pending', true, now(), ${bizRegUrl}, ${bizNo}, true, now(), ${ip}, ${ua}, ${optIn})
      ON CONFLICT (cafe_id) DO UPDATE SET owner_name=${ownerName}, contact=${encryptPII(contact)}, email=${encryptPII(email)}, plan=${plan}, price=${price}, biz_reg_url=${bizRegUrl}, biz_no=${bizNo}, attested=true, attested_at=now(), signup_ip=${ip}, signup_ua=${ua}, newsletter_opt_in=${optIn}, verified=false, status='pending', updated_at=now()`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
