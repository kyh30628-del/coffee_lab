import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureNewsletterSchema, verifyOptout } from "@/lib/newsletter";
export const runtime = "nodejs";

// 공개 수신거부 — 서명 토큰 검증 후 처리(인증 불필요). 정보통신망법 수신거부 권리 이행.
export async function POST(req: NextRequest) {
  try {
    await ensureNewsletterSchema();
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || "").trim().toLowerCase();
    const token = String(b.token || "").trim();
    if (!verifyOptout(email, token)) return NextResponse.json({ ok: false, error: "유효하지 않은 링크예요" }, { status: 400 });
    // 이메일은 암호화 저장이라 직접 매칭 불가 → optout 테이블이 발송 제외의 1차 기준(getRecipients가 대조).
    await sql`INSERT INTO newsletter_optout (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e) }, { status: 500 }); }
}
