// 📧 결제 알림 메일 — 성공(영수증)·실패·정지. Resend fetch 패턴은 subscription/route.ts sendPinEmail과 동일.
//   온보딩 메일(lib/onboardingEmail)과 분리된 결제 전용 문구. 톤: 동네 커피 노트(크림/커피색).
const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

type BillingKind = "paid" | "failed" | "suspended" | "bank_transfer";
type BillingOpts = { cafeName: string; amount?: number; nextBillingAt?: string | Date | null };

function fmtDate(d?: string | Date | null): string {
  if (!d) return "";
  try {
    const dt = typeof d === "string" ? new Date(d) : d;
    return `${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, "0")}.${String(dt.getDate()).padStart(2, "0")}`;
  } catch { return ""; }
}
const won = (n?: number) => (n != null ? `₩${n.toLocaleString("en-US")}` : "");

function render(kind: BillingKind, opts: BillingOpts): { subject: string; html: string } {
  const name = esc(opts.cafeName || "우리 카페");
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://dongnecoffeenote.com").replace(/\/$/, "");
  const next = fmtDate(opts.nextBillingAt);
  let kicker: string, title: string, body: string, subject: string, accent: string;
  if (kind === "paid") {
    accent = "#8a6d3b"; kicker = "결제가 완료됐어요"; title = "우리가게 홍보팩 결제 완료";
    subject = `☕ ${opts.cafeName} 사장님 · 홍보팩 결제 완료`;
    body = `${won(opts.amount)} 정기결제가 정상 처리됐어요. 골드핀·우선노출·쇼케이스가 계속 유지됩니다.${next ? ` 다음 결제 예정일은 <b>${next}</b>이에요.` : ""}`;
  } else if (kind === "failed") {
    accent = "#b0733e"; kicker = "결제에 실패했어요"; title = "카드 확인이 필요해요";
    subject = `⚠️ ${opts.cafeName} 사장님 · 홍보팩 결제 실패`;
    body = `이번 정기결제가 처리되지 않았어요. 카드 유효기간·한도를 확인해 주세요. 며칠간 자동으로 다시 시도하며, 계속 실패하면 우선노출이 잠시 중단될 수 있어요.`;
  } else if (kind === "suspended") {
    accent = "#9c5b3f"; kicker = "구독이 일시 중단됐어요"; title = "결제 실패로 노출이 중단됐어요";
    subject = `⚠️ ${opts.cafeName} 사장님 · 홍보팩 일시 중단`;
    body = `결제가 계속 실패해 우선노출·쇼케이스가 잠시 꺼졌어요. 카드를 다시 등록하시면 바로 복구됩니다. 문의: dongnecoffeenote@gmail.com`;
  } else {
    accent = "#8a6d3b"; kicker = "계좌이체 안내"; title = "계좌이체로 먼저 시작하실 수 있어요";
    subject = `☕ ${opts.cafeName} 사장님 · 홍보팩 계좌이체 안내`;
    body = `카드 자동결제는 준비 중이라 아직 화면에서 바로 등록하실 수 없어요. 그 전까지는 계좌이체로 먼저 이용을 시작하실 수 있습니다. 이 메일에 회신 주시면 입금 계좌와 절차를 바로 안내해드릴게요. 문의: dongnecoffeenote@gmail.com`;
  }
  const html = `<div style="margin:0;padding:0;background:#efe7d8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe7d8;padding:32px 12px;"><tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fffdf9;border:1px solid #e7dcc6;border-radius:18px;overflow:hidden;font-family:'Nanum Myeongjo',Georgia,'Apple SD Gothic Neo',serif;">
        <tr><td style="background:#2b2018;padding:16px 28px;"><span style="color:#e8b87a;font-size:12px;letter-spacing:3px;">☕ 동네 커피 노트</span></td></tr>
        <tr><td style="padding:30px 28px 6px;">
          <div style="font-size:13px;color:${accent};letter-spacing:0.5px;margin-bottom:8px;">${esc(kicker)}</div>
          <div style="font-size:20px;font-weight:700;color:#2b2018;line-height:1.4;">${name} 사장님, ${esc(title)}</div>
          <p style="font-size:14.5px;color:#52402e;line-height:1.9;margin:16px 0 0;">${body}</p>
        </td></tr>
        <tr><td style="padding:18px 28px 24px;" align="center">
          <a href="${site}/owner" style="display:inline-block;background:#2b2018;color:#f4ece0;text-decoration:none;font-size:14.5px;font-weight:700;padding:13px 28px;border-radius:30px;">내 카페 화면으로 →</a>
        </td></tr>
        <tr><td style="background:#faf4ea;border-top:1px solid #efe2cd;padding:16px 28px;">
          <p style="font-size:11px;color:#9c8569;margin:0;line-height:1.7;">동네 커피 노트 · 우리가게 홍보팩 · 문의 dongnecoffeenote@gmail.com</p>
        </td></tr>
      </table>
    </td></tr></table>
  </div>`;
  return { subject, html };
}

// 결제 알림 발송(Resend). 키 없거나 이메일 무효면 false(우아한 미발송).
export async function sendBillingEmail(to: string, kind: BillingKind, opts: BillingOpts): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to || !to.includes("@")) return false;
  const { subject, html } = render(kind, opts);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject, html }),
    });
    return r.ok;
  } catch { return false; }
}
