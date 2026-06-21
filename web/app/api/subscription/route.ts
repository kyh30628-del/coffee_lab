import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { encryptPII, decryptPII } from "@/lib/crypto";
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
// 등록 이메일로 PIN 발송(Resend). 키 없으면 미발송(관리자 화면에서 PIN 확인·전달).
async function sendPinEmail(to: string, pin: string, cafeName: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to || !to.includes("@")) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>",
        to: [to],
        subject: "[동네 커피 노트] 구독 승인 — 사장님 PIN 번호",
        html: `<div style="font-family:sans-serif"><p><b>${cafeName}</b> 사장님, 홍보팩 구독이 승인됐어요.</p>
          <p>사장님 화면에서 아래 PIN으로 로그인하시면 <b>내 카페로 바로</b> 들어갑니다.</p>
          <p style="font-size:24px;font-weight:bold;letter-spacing:3px;background:#f4ece0;padding:14px 18px;border-radius:10px;display:inline-block">${pin}</p>
          <p style="color:#888;font-size:13px">PIN은 본인만 알 수 있게 보관하세요.</p></div>`,
      }),
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
  // 만료 자동 반영: 기간 지난 active → expired + featured 해제
  await sql`UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='active' AND expires_at < now()`;
  await sql`UPDATE cafe_promos SET featured=false WHERE cafe_id IN (SELECT cafe_id FROM subscriptions WHERE status='expired') AND featured_until < now()`;
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    if (req.nextUrl.searchParams.get("all")) {
      if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
      const rows = await sql`SELECT id, cafe_id, cafe_name, owner_name, contact, email, plan, price, status, pin, started_at, expires_at, created_at, biz_reg_url, biz_no, attested, signup_ip, signup_ua, verified, suspend_reason, suspended_at FROM subscriptions ORDER BY (status='pending') DESC, created_at DESC LIMIT 200` as unknown as any[];
      return NextResponse.json({ ok: true, subs: rows.map((r) => ({ ...r, contact: decryptPII(r.contact), email: decryptPII(r.email) })) });
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
        const emailed = await sendPinEmail(decryptPII(s.email ?? ""), pin, s.cafe_name ?? "");
        return NextResponse.json({ ok: true, status: "active", pin, emailed });
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
    await sql`INSERT INTO subscriptions (cafe_id, cafe_name, owner_name, contact, email, plan, price, status, consent, consent_at, biz_reg_url, biz_no, attested, attested_at, signup_ip, signup_ua)
      VALUES (${cafeId}, ${cafeName}, ${ownerName}, ${encryptPII(contact)}, ${encryptPII(email)}, ${plan}, ${price}, 'pending', true, now(), ${bizRegUrl}, ${bizNo}, true, now(), ${ip}, ${ua})
      ON CONFLICT (cafe_id) DO UPDATE SET owner_name=${ownerName}, contact=${encryptPII(contact)}, email=${encryptPII(email)}, plan=${plan}, price=${price}, biz_reg_url=${bizRegUrl}, biz_no=${bizNo}, attested=true, attested_at=now(), signup_ip=${ip}, signup_ua=${ua}, verified=false, status='pending', updated_at=now()`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
