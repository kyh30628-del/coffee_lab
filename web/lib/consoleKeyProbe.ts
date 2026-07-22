import { sql } from "./db";

// 🔑 콘솔키(ANTHROPIC_API_KEY) 크레딧 소진 실측 프로브 — 트래픽 무관 감지.
//   기존 search_log.ai_err 신호는 '실사용자 검색이 있어야만' 잡힌다 → 검색이 뜸하면
//   크레딧이 소진돼도 신호가 사라져 이슈가 조용히 자동해소되던 사각(협업#133·재무 오보 2026-07-06).
//   이 프로브가 소액 호출(max_tokens:1)로 크레딧 상태를 직접 확인해 관제탑·재무가 항상 실측으로 판단하게 한다.
//   ⚠️ 프로덕션=콘솔키 규칙 준수(구독토큰 아님). 소진 시 호출은 400으로 실패=과금0이라 프로브 자체가 안전.
//      정상일 때도 haiku 입력 몇 토큰+출력 1토큰(≈$0)이라 비용 무시. cron-sentinel(2×/일)에서만 호출.
//   🆕 [결재#361] 능동 사전경보: #133→#182→#185→#189→#193까지 같은 소진 장애가 4~5회 재발한 근본원인은
//      "탐지는 됐지만 관제탑을 봐야만 안다"는 수동성 — 아무도 안 보면 24h+ 방치. Anthropic엔 잔액 조회 API가
//      없어 '바닥나기 전' 사전경보는 불가하므로, 대신 소진 탐지 즉시(사후 발견 기다리지 않고) 이메일/Slack으로
//      능동 푸시한다. 6h 스로틀로 크론 2×/일 주기와 맞춰 미해결 시 재알림, 중복발송은 방지.

const CONSOLE_KEY = process.env.ANTHROPIC_API_KEY;
// 프로브 모델 = 배치판정과 동일 haiku(가장 싸고, 이 경로가 곧 배치판정 건강을 대변). 소진은 모델 무관.
const PROBE_MODEL = process.env.PROBE_MODEL || "claude-haiku-4-5";
const ALERT_THROTTLE_H = 6;

export type ProbeSignal = "ok" | "credit" | "authkey" | "ratelimit" | "exception" | "other" | "nokey";
export type ProbeResult = { signal: ProbeSignal; ok: boolean; detail: string };

async function ensureConsoleKeyState(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS console_key_state (
    id INT PRIMARY KEY DEFAULT 1,
    probed_at TIMESTAMPTZ DEFAULT now(),
    ok BOOLEAN,
    signal TEXT,
    detail TEXT,
    alerted_at TIMESTAMPTZ
  )`.catch(() => {});
  await sql`ALTER TABLE console_key_state ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ`.catch(() => {});
}

const escHtml = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

// 이메일(Resend) — RESEND_API_KEY 없으면 조용히 스킵(재무·개발환경 무해).
async function sendCreditAlertEmail(r: ProbeResult): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const to = "dongnecoffeenote@gmail.com"; // 관리자 알림 고정(env 우회 없음)
  const label = r.signal === "credit" ? "크레딧 소진" : "인증키 오류";
  const subject = `🚨 [동네 커피 노트] Anthropic 콘솔키 ${label} — 결제/키 확인 필요`;
  const html = `<div style="font-family:'Apple SD Gothic Neo',sans-serif;padding:24px;color:#2b2018;">
    <h2 style="margin:0 0 12px;">Anthropic 콘솔키(ANTHROPIC_API_KEY) ${label} 감지</h2>
    <p style="margin:0 0 8px;">신호: <b>${escHtml(r.signal)}</b> · ${escHtml(r.detail)}</p>
    <p style="margin:0 0 8px;">영향: 검색 AI 재정렬·리뷰 경계판정이 결정론 폴백으로 조용히 저하됩니다(크래시 없음).</p>
    <p style="margin:0;">조치: <a href="https://console.anthropic.com/settings/billing">console.anthropic.com Plans &amp; Billing</a>에서 크레딧 충전 또는 키 상태 확인.</p>
  </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject, html }),
    });
    return res.ok;
  } catch { return false; }
}

// Slack — SLACK_WEBHOOK_URL 미설정 시 무시(신규 시크릿 없이도 이메일 경보는 동작).
async function sendCreditAlertSlack(r: ProbeResult): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `🚨 Anthropic 콘솔키 ${r.signal} — ${r.detail}\n조치: console.anthropic.com Plans & Billing 확인` }),
    });
    return res.ok;
  } catch { return false; }
}

// 소진·인증오류 신호에서만 능동경보(일시오류·예외는 헛경보 방지, 기존 판단기준과 동일).
// 스로틀은 console_key_state.alerted_at로 판단 — saveState()가 먼저 upsert해 행이 보장된 뒤 호출한다.
async function maybeAlertCreditExhausted(r: ProbeResult): Promise<void> {
  if (r.signal !== "credit" && r.signal !== "authkey") return;
  try {
    const rows = (await sql`SELECT EXTRACT(EPOCH FROM (now() - alerted_at)) / 3600 AS age_h FROM console_key_state WHERE id = 1`.catch(() => [])) as any[];
    const ageH = rows[0]?.age_h == null ? Infinity : Number(rows[0].age_h);
    if (ageH < ALERT_THROTTLE_H) return;
    const [emailOk, slackOk] = await Promise.all([sendCreditAlertEmail(r), sendCreditAlertSlack(r)]);
    if (emailOk || slackOk) {
      await sql`UPDATE console_key_state SET alerted_at = now() WHERE id = 1`.catch(() => {});
    }
  } catch { /* 알림 실패가 프로브 자체를 막지 않음 */ }
}

async function saveState(r: ProbeResult): Promise<void> {
  await sql`INSERT INTO console_key_state (id, probed_at, ok, signal, detail)
    VALUES (1, now(), ${r.ok}, ${r.signal}, ${r.detail})
    ON CONFLICT (id) DO UPDATE SET probed_at = now(), ok = ${r.ok}, signal = ${r.signal}, detail = ${r.detail}`.catch(() => {});
}

// 소액 프로브 실행 + 상태 저장. 반환값으로 즉시 보고에도 사용.
export async function probeConsoleKey(): Promise<ProbeResult> {
  await ensureConsoleKeyState();
  if (!CONSOLE_KEY) {
    const r: ProbeResult = { signal: "nokey", ok: false, detail: "ANTHROPIC_API_KEY 미설정 — 콘솔 경로 비활성(검색AI·배치판정 규칙폴백)" };
    await saveState(r);
    return r;
  }
  let r: ProbeResult;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": CONSOLE_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: PROBE_MODEL, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
    });
    if (res.ok) {
      r = { signal: "ok", ok: true, detail: `http_${res.status} 정상` };
    } else {
      const body = (await res.text().catch(() => "")).slice(0, 220);
      const low = (`http_${res.status} ` + body).toLowerCase();
      if (/credit|balance|too low/.test(low)) r = { signal: "credit", ok: false, detail: `http_${res.status}:${body.slice(0, 140)}` };
      else if (res.status === 401 || /authentication|invalid.*api.*key|x-api-key/.test(low)) r = { signal: "authkey", ok: false, detail: `http_${res.status}:${body.slice(0, 140)}` };
      else if (res.status === 429 || /overloaded/.test(low)) r = { signal: "ratelimit", ok: true, detail: `http_${res.status}(일시)` }; // 소진 아님
      else r = { signal: "other", ok: false, detail: `http_${res.status}:${body.slice(0, 140)}` };
    }
  } catch (e) {
    // 네트워크 예외 = 판단 보류. 크레딧 소진으로 단정하지 않는다(헛경보 방지) → ok 유지.
    r = { signal: "exception", ok: true, detail: `exception:${String((e as Error)?.message ?? e).slice(0, 140)}` };
  }
  await saveState(r);
  await maybeAlertCreditExhausted(r);
  return r;
}

// 관제탑/재무용 결정론 리더(외부호출 없음, 순수 DB 읽기).
// 최근 프로브가 '크레딧 소진'을 실측했고 그 관측이 신선(≤36h)하면 true. 프로브가 없거나 오래되면 false(신호없음).
export async function consoleCreditExhaustedByProbe(): Promise<boolean> {
  try {
    const rows = (await sql`SELECT signal, EXTRACT(EPOCH FROM (now() - probed_at)) / 3600 AS age_h
      FROM console_key_state WHERE id = 1`.catch(() => [])) as any[];
    const row = rows[0];
    if (!row) return false;
    return row.signal === "credit" && Number(row.age_h) <= 36;
  } catch {
    return false;
  }
}

// 재무 리포트가 그대로 인용할 수 있는 최근 프로브 상태 요약.
export async function consoleKeyStateSummary(): Promise<{ signal: string; ok: boolean; detail: string; probedAt: string | null; ageH: number | null } | null> {
  try {
    const rows = (await sql`SELECT signal, ok, detail, probed_at, EXTRACT(EPOCH FROM (now() - probed_at)) / 3600 AS age_h
      FROM console_key_state WHERE id = 1`.catch(() => [])) as any[];
    const row = rows[0];
    if (!row) return null;
    return { signal: row.signal, ok: row.ok, detail: row.detail, probedAt: row.probed_at, ageH: row.age_h == null ? null : Math.round(Number(row.age_h) * 10) / 10 };
  } catch {
    return null;
  }
}
