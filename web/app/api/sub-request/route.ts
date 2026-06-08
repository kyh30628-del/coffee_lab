import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { encryptPII, decryptPII } from "@/lib/crypto";
export const runtime = "nodejs";

// 사장님 구독(홍보팩) 신청 — 리드 캡처. 연락처(개인정보)는 암호화 저장, 동의 기록, 자동 폐기.
async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS sub_requests (
    id SERIAL PRIMARY KEY, cafe_name TEXT, contact TEXT, plan TEXT,
    status TEXT DEFAULT 'new', consent BOOLEAN DEFAULT false, consent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`ALTER TABLE sub_requests ADD COLUMN IF NOT EXISTS consent BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE sub_requests ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ`;
  // 보유기간 자동 폐기: 처리 완료/취소 후 90일, 그 외도 최대 1년 경과 시 삭제
  await sql`DELETE FROM sub_requests WHERE (status IN ('done','cancel') AND created_at < now() - interval '90 days') OR created_at < now() - interval '1 year'`;
}
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function POST(req: NextRequest) {
  try {
    await ensureSchema(); await ensure();
    const b = await req.json().catch(() => ({}));
    const cafeName = String(b.cafeName ?? "").trim().slice(0, 80);   // 상호(공개정보)
    const contactRaw = String(b.contact ?? "").trim().slice(0, 120); // 연락처(개인정보)
    const plan = String(b.plan ?? "홍보팩").slice(0, 40);
    if (!cafeName || !contactRaw) return NextResponse.json({ ok: false, error: "가게명·연락처 필요" }, { status: 400 });
    if (!b.consent) return NextResponse.json({ ok: false, error: "개인정보 수집·이용 동의가 필요합니다" }, { status: 400 });
    // 연락처는 암호화해서 저장(키 없이 복호화 불가)
    await sql`INSERT INTO sub_requests (cafe_name, contact, plan, consent, consent_at) VALUES (${cafeName}, ${encryptPII(contactRaw)}, ${plan}, true, now())`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensure();
    const rows = await sql`SELECT id, cafe_name, contact, plan, status, consent, created_at FROM sub_requests ORDER BY created_at DESC LIMIT 100` as unknown as any[];
    // 관리자에게만 복호화해서 보여줌
    const requests = rows.map((r) => ({ ...r, contact: decryptPII(r.contact) }));
    return NextResponse.json({ ok: true, requests });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
