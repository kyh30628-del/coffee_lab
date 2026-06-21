import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { encryptPII, decryptPII } from "@/lib/crypto";
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
  // 만료 자동 반영: 기간 지난 active → expired + featured 해제
  await sql`UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='active' AND expires_at < now()`;
  await sql`UPDATE cafe_promos SET featured=false WHERE cafe_id IN (SELECT cafe_id FROM subscriptions WHERE status='expired') AND featured_until < now()`;
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    if (req.nextUrl.searchParams.get("all")) {
      if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
      const rows = await sql`SELECT id, cafe_id, cafe_name, owner_name, contact, email, plan, price, status, pin, started_at, expires_at, created_at FROM subscriptions ORDER BY (status='pending') DESC, created_at DESC LIMIT 200` as unknown as any[];
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
        await sql`UPDATE subscriptions SET status='active', started_at=now(), expires_at=now()+make_interval(days=>${days}), pin=${pin}, updated_at=now() WHERE id=${id}`;
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
      return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
    }

    // 사장님 회원가입(가입 신청)
    const cafeId = Number(b.cafeId);
    const cafeName = String(b.cafeName ?? "").slice(0, 80);
    const ownerName = String(b.ownerName ?? "").trim().slice(0, 40);
    const contact = String(b.contact ?? "").trim().slice(0, 120);
    const email = String(b.email ?? "").trim().slice(0, 120);
    if (!cafeId || !ownerName || !contact) return NextResponse.json({ ok: false, error: "카페·이름·연락처 필요" }, { status: 400 });
    if (!b.consent) return NextResponse.json({ ok: false, error: "개인정보 동의 필요" }, { status: 400 });
    const isTrial = !!b.trial;                          // 7일 무료 체험 신청 — 관리자가 7일로 승인
    const plan = isTrial ? "7일 체험" : PLAN;
    const price = isTrial ? 0 : PRICE;
    await sql`INSERT INTO subscriptions (cafe_id, cafe_name, owner_name, contact, email, plan, price, status, consent, consent_at)
      VALUES (${cafeId}, ${cafeName}, ${ownerName}, ${encryptPII(contact)}, ${encryptPII(email)}, ${plan}, ${price}, 'pending', true, now())
      ON CONFLICT (cafe_id) DO UPDATE SET owner_name=${ownerName}, contact=${encryptPII(contact)}, email=${encryptPII(email)}, plan=${plan}, price=${price}, status=CASE WHEN subscriptions.status='active' THEN 'active' ELSE 'pending' END, updated_at=now()`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
