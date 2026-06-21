import { sql } from "@/lib/db";
import { decryptPII } from "@/lib/crypto";
import crypto from "crypto";

// 📰 구독 사장님 주간 트렌드 뉴스레터 — 코어(스키마·수신자·가드·이메일·발송·수신거부).
//   생성(LLM)은 newsletterGen.ts. 이 파일은 LLM 없이 동작/테스트 가능.

export type NLItem = { text: string; note?: string; why?: string; source_url?: string; verified?: boolean; flag?: string };
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

// ── 📰 신문 지면 스타일 이메일 렌더(제호·발행일·헤드라인·카테고리·요약 기사·단 구분, 수신거부 포함) ──
export function renderNewsletterEmail(nl: Newsletter, site: string, email: string, issueNo?: number): { subject: string; html: string } {
  const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
  const unsub = `${site}/unsubscribe?e=${encodeURIComponent(email)}&t=${optoutToken(email)}`;
  const subject = `📰 ${nl.title || "사장님 위클리"} — 동네 커피 노트`;
  const SERIF = "Georgia,'Nanum Myeongjo','Apple SD Gothic Neo',serif";
  const KICKER: Record<string, string> = { tldr: "BRIEFING", radar: "TREND RADAR", coffee: "COFFEE", dessert: "DESSERT", cafes: "CAFE", action: "PLAYBOOK", news: "IN BRIEF" };
  const d = new Date();
  const dateLine = `제${issueNo ?? nl.issue_no ?? 1}호 · ${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  // 팔레트(통일된 악센트·하이라이트)
  const INK = "#211a12", BODY = "#3c3022", MUTED = "#8a7a60", ACCENT = "#9a6a2f", RULE = "#cdbf9f", HI = "#f5ecd9";
  const src = (u?: string) => (u ? ` <a href="${esc(u)}" style="color:${ACCENT};font-size:10.5px;text-decoration:none;">[출처]</a>` : "");
  const tip = (why?: string) => (why ? `<div style="margin:7px 0 0;padding:6px 11px;background:${HI};border-left:3px solid ${ACCENT};font-size:12.5px;line-height:1.6;color:#6f4e1f;"><b style="color:${ACCENT};">우리 가게엔</b> ${esc(why)}</div>` : "");
  const sectionTitle = (kicker: string, title: string) => `
    <div style="font-size:10.5px;letter-spacing:2.5px;color:${ACCENT};font-weight:700;">${kicker}</div>
    <div style="font-size:17px;font-weight:700;color:${INK};margin:3px 0 9px;line-height:1.3;">${esc(title.replace(/^[^ ]+ /, ""))}</div>`;

  const renderSection = (sec: NLSection, i: number): string => {
    const kicker = KICKER[sec.key] || "TREND";
    const rule = i === 0 ? "" : `border-top:1px solid ${RULE};`;
    // 트렌드 레이더: 2단 키워드 표
    if (sec.key === "radar") {
      const cells = (sec.items || []).map((it) => `
        <td width="50%" valign="top" style="padding:7px 12px 7px 0;border-bottom:1px dotted ${RULE};">
          <div style="font-size:14.5px;font-weight:700;color:${INK};">${esc(it.text)}${src(it.source_url)}</div>
          ${it.why ? `<div style="font-size:12px;color:${MUTED};margin-top:2px;line-height:1.5;">${esc(it.why)}</div>` : ""}
        </td>`);
      const rows: string[] = [];
      for (let k = 0; k < cells.length; k += 2) rows.push(`<tr>${cells[k] || ""}${cells[k + 1] || '<td width="50%"></td>'}</tr>`);
      return `<tr><td style="padding:16px 26px 10px;${rule}">${sectionTitle(kicker, sec.title)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table></td></tr>`;
    }
    // TLDR: 헤드라인 브리핑 박스
    if (sec.key === "tldr") {
      const lis = (sec.items || []).map((it) => `<tr><td valign="top" style="font-size:13px;color:${ACCENT};padding:0 7px 5px 0;font-weight:700;">▪</td><td style="font-size:13.5px;color:${BODY};line-height:1.65;padding-bottom:5px;">${esc(it.text)}</td></tr>`).join("");
      return `<tr><td style="padding:8px 26px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1.5px solid ${INK};"><tr><td style="padding:13px 16px;background:${HI};">
          <div style="font-size:10.5px;letter-spacing:2.5px;color:${INK};font-weight:700;margin-bottom:7px;">📌 이번 주 헤드라인</div>
          <table role="presentation" cellpadding="0" cellspacing="0">${lis}</table></td></tr></table></td></tr>`;
    }
    // 일반 기사: 카테고리 + 헤드라인 + (섹션 팁) + 요약 단락 + 하이라이트 팁
    const arts = (sec.items || []).map((it) => `
      <div style="margin:0 0 12px;">
        <p style="margin:0;font-size:14px;color:${BODY};line-height:1.72;"><b style="color:${INK};">${it.flag ? "⚠️ " : ""}${esc(it.text)}</b>${src(it.source_url)}</p>
        ${it.note ? `<div style="font-size:12.5px;color:${MUTED};line-height:1.6;margin-top:2px;">${esc(it.note)}</div>` : ""}
        ${tip(it.why)}
      </div>`).join("");
    const intro = sec.intro ? tip(sec.intro.replace(/^우리 가게엔[:：]\s*/, "")) : "";
    return `<tr><td style="padding:16px 26px 8px;${rule}">${sectionTitle(kicker, sec.title)}${intro}${arts}</td></tr>`;
  };
  const sectionsHtml = (nl.sections || []).map(renderSection).join("");

  const html = `<div style="margin:0;padding:0;background:#e7e0d0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e7e0d0;padding:26px 10px;"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fbf8ef;border:1px solid #cabd9c;font-family:${SERIF};">
        <!-- 제호(MASTHEAD) -->
        <tr><td style="padding:20px 26px 8px;border-top:5px double ${INK};text-align:center;">
          <div style="font-size:10.5px;letter-spacing:4px;color:${ACCENT};">THE NEIGHBORHOOD COFFEE NOTE</div>
          <div style="font-size:29px;font-weight:800;color:${INK};letter-spacing:-0.5px;margin:4px 0 2px;">동네 커피 노트</div>
          <div style="font-size:13px;letter-spacing:5px;color:${MUTED};">사 장 님 위 클 리</div>
        </td></tr>
        <tr><td style="padding:8px 26px 0;">
          <table role="presentation" width="100%" style="border-top:1.5px solid ${INK};border-bottom:1.5px solid ${INK};"><tr>
            <td style="padding:5px 0;font-size:11px;color:#5a4a36;letter-spacing:0.3px;">${dateLine}</td>
            <td align="right" style="padding:5px 0;font-size:11px;color:#5a4a36;letter-spacing:0.3px;">커피 · 카페 · 디저트 주간</td>
          </tr></table>
        </td></tr>
        <!-- 리드 헤드라인 -->
        <tr><td style="padding:20px 26px 2px;text-align:center;">
          <div style="font-size:24px;font-weight:800;color:${INK};line-height:1.28;letter-spacing:-0.3px;">${esc(nl.title || "이번 주 트렌드")}</div>
          <div style="width:54px;height:3px;background:${ACCENT};margin:12px auto 0;"></div>
        </td></tr>
        ${sectionsHtml}
        <!-- 발행 -->
        <tr><td style="padding:18px 26px 22px;border-top:2px solid ${INK};">
          <p style="font-size:11px;color:${MUTED};margin:0;line-height:1.7;">발행 · <b>동네 커피 노트</b> 편집부 | 본 지면은 <b>구독·체험 사장님</b>께 보내는 정보성 뉴스레터입니다. 외부 콘텐츠는 요약·출처 링크로 제공하며 원문 저작권은 각 매체에 있습니다.</p>
          <p style="font-size:11px;color:#b09a78;margin:7px 0 0;">수신을 원치 않으시면 <a href="${unsub}" style="color:${ACCENT};">수신거부</a> · 문의 kyh30628@gmail.com</p>
        </td></tr>
      </table>
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
    const { subject, html } = renderNewsletterEmail({ title: nl.title, sections: nl.sections } as Newsletter, site, r.email, nl.issue_no);
    const ok = await resendSend(r.email, subject, html);
    await sql`INSERT INTO newsletter_sends (newsletter_id, sub_id, email, status) VALUES (${id}, ${r.subId}, ${r.email}, ${ok ? "sent" : "failed"})`;
    ok ? sent++ : failed++;
  }
  await sql`UPDATE newsletters SET status='sent', sent_at=now(), sent_count=${sent} WHERE id=${id}`;
  return { ok: true, sent, failed };
}
