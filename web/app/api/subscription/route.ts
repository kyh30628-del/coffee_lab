import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { encryptPII, decryptPII } from "@/lib/crypto";
export const runtime = "nodejs";

// 💳 구독 회원(카페별). 사장님 회원가입 → 관리자 활성화(featured 연동) → 만료/해지 관리.
const PLAN = "홍보팩";
const PRICE = 9900;
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS subscriptions (
    id SERIAL PRIMARY KEY, cafe_id INT UNIQUE, cafe_name TEXT, owner_name TEXT,
    contact TEXT, email TEXT, plan TEXT DEFAULT '홍보팩', price INT DEFAULT 9900,
    status TEXT DEFAULT 'pending', started_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
    consent BOOLEAN DEFAULT false, consent_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
  )`;
  // 만료 자동 반영: 기간 지난 active → expired + featured 해제
  await sql`UPDATE subscriptions SET status='expired', updated_at=now() WHERE status='active' AND expires_at < now()`;
  await sql`UPDATE cafe_promos SET featured=false WHERE cafe_id IN (SELECT cafe_id FROM subscriptions WHERE status='expired') AND featured_until < now()`;
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    if (req.nextUrl.searchParams.get("all")) {
      if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
      const rows = await sql`SELECT id, cafe_id, cafe_name, owner_name, contact, email, plan, price, status, started_at, expires_at, created_at FROM subscriptions ORDER BY (status='pending') DESC, created_at DESC LIMIT 200` as unknown as any[];
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
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensureSchema(); await ensure();
    const b = await req.json().catch(() => ({}));

    // 관리자 액션: 활성화/해지/연장
    if (b.action) {
      const id = Number(b.id);
      if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
      const s = (await sql`SELECT cafe_id, expires_at FROM subscriptions WHERE id=${id}`)[0] as any;
      if (!s) return NextResponse.json({ ok: false, error: "구독 없음" }, { status: 404 });
      const days = Math.min(Math.max(Number(b.days) || 30, 1), 365);
      if (b.action === "activate") {
        await sql`UPDATE subscriptions SET status='active', started_at=now(), expires_at=now()+make_interval(days=>${days}), updated_at=now() WHERE id=${id}`;
        if (s.cafe_id) await sql`INSERT INTO cafe_promos (cafe_id, featured, featured_until, approved, published, updated_at)
          VALUES (${s.cafe_id}, true, now()+make_interval(days=>${days}), true, true, now())
          ON CONFLICT (cafe_id) DO UPDATE SET featured=true, featured_until=now()+make_interval(days=>${days}), approved=true`;
        return NextResponse.json({ ok: true, status: "active" });
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
    await sql`INSERT INTO subscriptions (cafe_id, cafe_name, owner_name, contact, email, plan, price, status, consent, consent_at)
      VALUES (${cafeId}, ${cafeName}, ${ownerName}, ${encryptPII(contact)}, ${encryptPII(email)}, ${PLAN}, ${PRICE}, 'pending', true, now())
      ON CONFLICT (cafe_id) DO UPDATE SET owner_name=${ownerName}, contact=${encryptPII(contact)}, email=${encryptPII(email)}, status=CASE WHEN subscriptions.status='active' THEN 'active' ELSE 'pending' END, updated_at=now()`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
