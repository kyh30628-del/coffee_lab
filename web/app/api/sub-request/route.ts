import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { encryptPII, decryptPII } from "@/lib/crypto";
export const runtime = "nodejs";

// 사장님 구독(홍보팩) 신청 — 연락처(개인정보)는 암호화 저장·동의 기록·보유기간 자동 폐기.
async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS sub_requests (
    id SERIAL PRIMARY KEY, cafe_name TEXT, contact TEXT, plan TEXT,
    status TEXT DEFAULT 'new', consent BOOLEAN DEFAULT false, consent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`ALTER TABLE sub_requests ADD COLUMN IF NOT EXISTS consent BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE sub_requests ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ`;
  await sql`CREATE TABLE IF NOT EXISTS purge_log (id SERIAL PRIMARY KEY, n INT, deleted_at TIMESTAMPTZ DEFAULT now())`;
}
// 보유기간 자동 폐기 + 삭제 알림 로그. 반환: 이번에 삭제된 건수.
async function purgeExpired(): Promise<number> {
  const del = await sql`DELETE FROM sub_requests
    WHERE (status IN ('done','cancel') AND created_at < now() - interval '90 days')
       OR created_at < now() - interval '1 year'
    RETURNING id` as unknown as any[];
  if (del.length > 0) await sql`INSERT INTO purge_log (n) VALUES (${del.length})`;
  return del.length;
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
    await sql`INSERT INTO sub_requests (cafe_name, contact, plan, consent, consent_at) VALUES (${cafeName}, ${encryptPII(contactRaw)}, ${plan}, true, now())`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
    await ensure();
    await purgeExpired();
    const rows = await sql`SELECT id, cafe_name, contact, plan, status, consent, created_at,
      GREATEST(0, CEIL(EXTRACT(epoch FROM (created_at + interval '1 year') - now())/86400))::int AS delete_in
      FROM sub_requests ORDER BY created_at DESC LIMIT 100` as unknown as any[];
    const requests = rows.map((r) => ({ ...r, contact: decryptPII(r.contact) })); // 관리자만 복호화
    // 최근 30일 자동 삭제 알림(재연락 시 재수집·재동의 필요)
    const purges = await sql`SELECT n, deleted_at FROM purge_log WHERE deleted_at > now() - interval '30 days' ORDER BY deleted_at DESC LIMIT 10` as unknown as any[];
    const purgedRecently = purges.reduce((s, p) => s + (p.n ?? 0), 0);
    return NextResponse.json({ ok: true, requests, purgedRecently });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
