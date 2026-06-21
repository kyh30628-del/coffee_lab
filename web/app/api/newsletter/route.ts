import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureNewsletterSchema, applyGuards, sendNewsletter, renderNewsletterEmail, getRecipients, type Newsletter } from "@/lib/newsletter";
import { generateNewsletter, generateNewsletterFree } from "@/lib/newsletterGen";
export const runtime = "nodejs";
export const maxDuration = 120;

const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureNewsletterSchema();
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (id) {
    const nl = (await sql`SELECT * FROM newsletters WHERE id=${id}`)[0] ?? null;
    const recips = (await getRecipients()).length;
    return NextResponse.json({ ok: true, newsletter: nl, recipients: recips });
  }
  const rows = await sql`SELECT id, issue_no, week_of, status, title, flags, sent_count, cost, created_at, sent_at FROM newsletters ORDER BY created_at DESC LIMIT 50`;
  const recips = (await getRecipients()).length;
  return NextResponse.json({ ok: true, list: rows, recipients: recips });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureNewsletterSchema();
  const b = await req.json().catch(() => ({}));
  const action = String(b.action || "");

  if (action === "generate") {
    // 기본: 네이버 검색 무료 생성(크레딧 0). b.llm=true면 Sonnet+웹서치 고급 생성(크레딧).
    const r = b.llm ? await generateNewsletter() : await generateNewsletterFree();
    return NextResponse.json(r);
  }
  if (action === "update") {
    const id = Number(b.id);
    const nl: Newsletter = { title: b.title, sections: b.sections };
    const g = applyGuards(nl);
    await sql`UPDATE newsletters SET title=${g.title}, sections=${JSON.stringify(g.sections)}, flags=${JSON.stringify(g.flags || [])} WHERE id=${id}`;
    return NextResponse.json({ ok: true, flags: g.flags });
  }
  if (action === "approve") {
    await sql`UPDATE newsletters SET status='approved', approved_at=now() WHERE id=${Number(b.id)}`;
    return NextResponse.json({ ok: true });
  }
  if (action === "delete") {
    await sql`DELETE FROM newsletters WHERE id=${Number(b.id)}`;
    return NextResponse.json({ ok: true });
  }
  if (action === "test") {
    // 관리자 본인 메일로 미리보기 1통
    const id = Number(b.id), to = String(b.email || "").trim();
    if (!to.includes("@")) return NextResponse.json({ ok: false, error: "이메일 필요" }, { status: 400 });
    const nl = (await sql`SELECT title, sections, issue_no FROM newsletters WHERE id=${id}`)[0] as any;
    if (!nl) return NextResponse.json({ ok: false, error: "없음" }, { status: 404 });
    const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://dongnecoffeenote.com").replace(/\/$/, "");
    const { subject, html } = renderNewsletterEmail({ title: nl.title, sections: nl.sections }, site, to, nl.issue_no);
    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "RESEND 키 없음" });
    const rr = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject: "[미리보기] " + subject, html }) });
    return NextResponse.json({ ok: rr.ok });
  }
  if (action === "send") {
    const id = Number(b.id);
    const st = (await sql`SELECT status FROM newsletters WHERE id=${id}`)[0] as any;
    if (st?.status !== "approved") return NextResponse.json({ ok: false, error: "먼저 승인하세요" }, { status: 400 });
    const r = await sendNewsletter(id);
    return NextResponse.json(r);
  }
  return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
}
