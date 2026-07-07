import { sql } from "./db";

// 🔑 콘솔키(ANTHROPIC_API_KEY) 크레딧 소진 실측 프로브 — 트래픽 무관 감지.
//   기존 search_log.ai_err 신호는 '실사용자 검색이 있어야만' 잡힌다 → 검색이 뜸하면
//   크레딧이 소진돼도 신호가 사라져 이슈가 조용히 자동해소되던 사각(협업#133·재무 오보 2026-07-06).
//   이 프로브가 소액 호출(max_tokens:1)로 크레딧 상태를 직접 확인해 관제탑·재무가 항상 실측으로 판단하게 한다.
//   ⚠️ 프로덕션=콘솔키 규칙 준수(구독토큰 아님). 소진 시 호출은 400으로 실패=과금0이라 프로브 자체가 안전.
//      정상일 때도 haiku 입력 몇 토큰+출력 1토큰(≈$0)이라 비용 무시. cron-sentinel(2×/일)에서만 호출.

const CONSOLE_KEY = process.env.ANTHROPIC_API_KEY;
// 프로브 모델 = 배치판정과 동일 haiku(가장 싸고, 이 경로가 곧 배치판정 건강을 대변). 소진은 모델 무관.
const PROBE_MODEL = process.env.PROBE_MODEL || "claude-haiku-4-5";

export type ProbeSignal = "ok" | "credit" | "authkey" | "ratelimit" | "exception" | "other" | "nokey";
export type ProbeResult = { signal: ProbeSignal; ok: boolean; detail: string };

async function ensureConsoleKeyState(): Promise<void> {
  await sql`CREATE TABLE IF NOT EXISTS console_key_state (
    id INT PRIMARY KEY DEFAULT 1,
    probed_at TIMESTAMPTZ DEFAULT now(),
    ok BOOLEAN,
    signal TEXT,
    detail TEXT
  )`.catch(() => {});
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
