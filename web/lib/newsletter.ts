import { sql } from "@/lib/db";
import { decryptPII } from "@/lib/crypto";
import crypto from "crypto";

// 📰 구독 사장님 주간 트렌드 뉴스레터 — 코어(스키마·수신자·가드·이메일·발송·수신거부).
//   생성(LLM)은 newsletterGen.ts. 이 파일은 LLM 없이 동작/테스트 가능.

export type NLItem = { text: string; why?: string; source_url?: string; verified?: boolean; flag?: string };
export type NLSection = { key: string; title: string; intro?: string; items: NLItem[] };
export type Newsletter = { id?: number; issue_no?: number; week_of?: string; title: string; sections: NLSection[]; flags?: string[]; status?: string };

export async function ensureNewsletterSchema() {
  await sql`CREATE TABLE IF NOT EXISTS newsletters (
    id SERIAL PRIMARY KEY, issue_no INT, week_of DATE,
    status TEXT DEFAULT 'draft', title TEXT, sections JSONB, flags JSONB,
    model TEXT, cost REAL, sent_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(), approved_at TIMESTAMPTZ, sent_at TIMESTAMPTZ
  )`;
  await sql`CREATE TABLE IF NOT EXISTS newsletter_sends (
    id SERIAL PRIMARY KEY, newsletter_id INT, sub_id INT, email TEXT,
    status TEXT, sent_at TIMESTAMPTZ DEFAULT now(), opened_at TIMESTAMPTZ
  )`;
  await sql`CREATE TABLE IF NOT EXISTS newsletter_optout (email TEXT PRIMARY KEY, sub_id INT, opted_out_at TIMESTAMPTZ DEFAULT now())`;
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS newsletter_opt_in BOOLEAN DEFAULT true`.catch(() => {});
}

// 수신 대상: 활성 구독+체험 ∧ 이메일 有 ∧ 수신동의 ∧ 수신거부 아님. 이메일은 복호화.
export async function getRecipients(): Promise<{ subId: number; email: string; cafeName: string }[]> {
  const rows = (await sql`SELECT id, email, cafe_name FROM subscriptions
    WHERE status='active' AND email IS NOT NULL AND COALESCE(newsletter_opt_in, true)=true`) as unknown as any[];
  const out: { subId: number; email: string; cafeName: string }[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const email = (decryptPII(r.email) || "").trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    const isOut = (await sql`SELECT 1 FROM newsletter_optout WHERE email=${email} LIMIT 1`).length > 0;
    if (isOut) continue;
    seen.add(email);
    out.push({ subId: r.id, email, cafeName: r.cafe_name || "" });
  }
  return out;
}

// ── 수신거부 서명 토큰(인증 없이 안전하게) ──
const SECRET = () => process.env.NEWSLETTER_SECRET || process.env.ADMIN_PASSWORD || "dcn-nl";
export function optoutToken(email: string): string {
  return crypto.createHmac("sha256", SECRET()).update(email.toLowerCase()).digest("hex").slice(0, 24);
}
export function verifyOptout(email: string, token: string): boolean {
  return !!email && !!token && crypto.timingSafeEqual(Buffer.from(optoutToken(email)), Buffer.from(token));
}

// ── 저작권·컴플라이언스 결정적 가드 ──
//   요약 길이 제한(원문 복제 방지), 금지/과장 표현 차단, 출처 없는 사실주장 ⚠️ 플래그.
const BANNED = /(100% 보장|확실히 낫는다|치료에 효과|의학적 효능|최고의 [^ ]+ 1위 보장)/;
export function applyGuards(nl: Newsletter): Newsletter {
  const flags: string[] = [];
  const MAX = 220; // 항목 텍스트 길이 상한(요약 강제 = 저작권 안전)
  for (const sec of nl.sections || []) {
    for (const it of sec.items || []) {
      if (it.text && it.text.length > MAX) it.text = it.text.slice(0, MAX) + "…";
      if (it.why && it.why.length > MAX) it.why = it.why.slice(0, MAX) + "…";
      if (BANNED.test(`${it.text} ${it.why || ""}`)) { it.flag = "금지·과장 표현"; flags.push(`[${sec.title}] 금지·과장 표현: ${it.text.slice(0, 30)}`); }
      // 사실성 섹션(트렌드/뉴스/커피/디저트)인데 출처 없으면 확인필요
      if (["radar", "coffee", "dessert", "cafes", "news"].includes(sec.key) && !it.source_url && !it.flag) {
        it.flag = "출처 없음 — 확인필요"; flags.push(`[${sec.title}] 출처 없음: ${it.text.slice(0, 30)}`);
      }
      if (it.flag) it.verified = false;
    }
  }
  nl.flags = flags;
  return nl;
}

// ── 감성 이메일 HTML 렌더(수신거부 링크 포함) ──
export function renderNewsletterEmail(nl: Newsletter, site: string, email: string): { subject: string; html: string } {
  const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const unsub = `${site}/unsubscribe?e=${encodeURIComponent(email)}&t=${optoutToken(email)}`;
  const subject = `☕ ${nl.title || "사장님 위클리"}`;
  const sectionsHtml = (nl.sections || []).map((sec) => {
    const items = (sec.items || []).map((it) => {
      const src = it.source_url ? ` <a href="${esc(it.source_url)}" style="color:#9c6b3f;font-size:11px;">[출처]</a>` : "";
      const why = it.why ? `<div style="font-size:12.5px;color:#7c6a55;margin-top:3px;">↳ ${esc(it.why)}</div>` : "";
      return `<li style="margin:0 0 10px;font-size:14px;color:#3d2f22;line-height:1.7;">${esc(it.text)}${src}${why}</li>`;
    }).join("");
    const intro = sec.intro ? `<p style="font-size:13px;color:#6b5a48;margin:2px 0 8px;">${esc(sec.intro)}</p>` : "";
    return `<tr><td style="padding:18px 28px 4px;">
      <div style="font-size:16px;font-weight:700;color:#2b2018;border-bottom:2px solid #efe2cd;padding-bottom:6px;margin-bottom:8px;">${esc(sec.title)}</div>
      ${intro}<ul style="margin:0;padding-left:18px;">${items}</ul></td></tr>`;
  }).join("");
  const html = `<div style="margin:0;padding:0;background:#efe7d8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe7d8;padding:30px 12px;"><tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fffdf9;border:1px solid #e7dcc6;border-radius:18px;overflow:hidden;font-family:'Nanum Myeongjo',Georgia,'Apple SD Gothic Neo',serif;">
        <tr><td style="background:#2b2018;padding:18px 28px;">
          <span style="color:#e8b87a;font-size:12px;letter-spacing:3px;">☕ 동네 커피 노트 · 사장님 위클리</span>
          <div style="color:#fffdf9;font-size:19px;font-weight:700;margin-top:6px;">${esc(nl.title || "이번 주 트렌드")}</div>
        </td></tr>
        ${sectionsHtml}
        <tr><td style="background:#faf4ea;border-top:1px solid #efe2cd;padding:18px 28px;">
          <p style="font-size:11.5px;color:#9c8569;margin:0;line-height:1.7;">본 메일은 <b>구독·체험 사장님</b>께 발송되는 정보성 뉴스레터입니다. 외부 콘텐츠는 요약·출처 링크로 제공되며 원문 저작권은 각 매체에 있습니다.</p>
          <p style="font-size:11px;color:#bcae98;margin:8px 0 0;">더 이상 받지 않으시려면 <a href="${unsub}" style="color:#9c6b3f;">수신거부</a> · 문의 kyh30628@gmail.com</p>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#b3a489;margin-top:12px;">동네 커피 노트 · 진짜 후기로 고른 우리 동네 카페</div>
    </td></tr></table></div>`;
  return { subject, html };
}

async function resendSend(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject, html }),
    });
    return r.ok;
  } catch { return false; }
}

// 발송 — 야간(21~08 KST) 금지 가드. 활성 구독+체험에게, 수신거부 제외.
export async function sendNewsletter(id: number): Promise<{ ok: boolean; sent: number; failed: number; error?: string }> {
  await ensureNewsletterSchema();
  const nl = (await sql`SELECT * FROM newsletters WHERE id=${id}`)[0] as any;
  if (!nl) return { ok: false, sent: 0, failed: 0, error: "뉴스레터 없음" };
  if (nl.status === "sent") return { ok: false, sent: 0, failed: 0, error: "이미 발송됨" };
  const hourKST = (new Date().getUTCHours() + 9) % 24;
  if (hourKST >= 21 || hourKST < 8) return { ok: false, sent: 0, failed: 0, error: "야간(21~08시) 발송 제한 — 낮에 발송하세요" };
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://dongnecoffeenote.com").replace(/\/$/, "");
  const recips = await getRecipients();
  let sent = 0, failed = 0;
  for (const r of recips) {
    const { subject, html } = renderNewsletterEmail({ title: nl.title, sections: nl.sections } as Newsletter, site, r.email);
    const ok = await resendSend(r.email, subject, html);
    await sql`INSERT INTO newsletter_sends (newsletter_id, sub_id, email, status) VALUES (${id}, ${r.subId}, ${r.email}, ${ok ? "sent" : "failed"})`;
    ok ? sent++ : failed++;
  }
  await sql`UPDATE newsletters SET status='sent', sent_at=now(), sent_count=${sent} WHERE id=${id}`;
  return { ok: true, sent, failed };
}
