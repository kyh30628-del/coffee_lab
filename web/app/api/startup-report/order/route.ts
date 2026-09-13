import { NextRequest, NextResponse } from "next/server";
import { createOrder, reportBySlug, REPORT_PRICE } from "@/lib/startupReport";

export const runtime = "nodejs";

// 📥 창업 리포트 주문 접수 — 결제는 사업자등록·PG 전이라 수동(계좌이체). 주문 즉시 CEO 알림 메일(코드 포함).
//   CEO가 입금 확인 후 관리자 메일/문자로 코드를 보내고 paid_at을 채우면 그 코드로 전문이 열린다.
async function alertCeo(subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY; if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: ["dongnecoffeenote@gmail.com"], subject, html }) });
    return r.ok;
  } catch { return false; }
}
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const slug = String(b.slug ?? ""); const email = String(b.email ?? "").trim().slice(0, 120); const name = String(b.name ?? "").trim().slice(0, 40).replace(/[<>]/g, "");
    const def = reportBySlug(slug);
    if (!def) return NextResponse.json({ ok: false, error: "없는 리포트" }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: "이메일을 확인해 주세요" }, { status: 400 });
    const o = await createOrder(slug, email, name);
    await alertCeo(`🧾 창업 리포트 주문 — ${def.title} (${REPORT_PRICE.toLocaleString()}원)`,
      `<div style="font-family:sans-serif;line-height:1.6"><h2>${def.title} 카페 창업 리포트 주문</h2><p><b>이메일</b>: ${email}<br><b>이름</b>: ${name || "-"}<br><b>주문번호</b>: ${o.id}<br><b>열람 코드</b>: <code>${o.code}</code></p>
       <p>입금 확인 후 ① DB: <code>UPDATE startup_report_orders SET paid_at=now() WHERE id=${o.id};</code> ② 구매자에게 코드 안내: https://dongnecoffeenote.com/startup/${slug}/full?k=${o.code}</p></div>`);
    return NextResponse.json({ ok: true, orderId: o.id });
  } catch (e) { return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 }); }
}
