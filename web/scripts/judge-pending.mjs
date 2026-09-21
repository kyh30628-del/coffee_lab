// 🤖 pending 판정 자동 청산(2026-09-21 CEO 승인: "판정 자동으로 붙여 하루 $1.5 상한으로 돌려")
//   대상: pipeline_status='pending' AND llm_judged_at IS NULL(수집·옥석은 끝났고 LLM 판정만 남은 곳). route가 pending을 최우선으로 뽑는다.
//   원칙(09-20 크레딧 사고 5건 재발 방지): ①수거(manual=1)와 제출(&submit=1) 분리 ②진행중 배치 있으면 재제출 금지
//   ③하루 누적 비용 상한(파일 agent-reports/judge-spend-YYYYMMDD.json, 여러 실행에 걸쳐 합산) ④pending 0이면 제출 안 함
//   (후보 구제·공개 재정제엔 쓰지 않는다 — rejected 판정 전환율 2.4% 실측) ⑤회차 상한.
//   비용: Anthropic Batches $0.001/곳 실측(09-21 437곳 $0.43). 네이버 쿼터 0. DB는 이미 깨어 있는 수집 창 안에서만 돈다.
import fs from "node:fs";
import { homedir } from "node:os";
for (const l of fs.readFileSync(".env.local", "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const CAP = Number((process.argv.find((a) => a.startsWith("--cap=")) || "--cap=1.5").split("=")[1]);
const MAX_ROUNDS = 60;
const SECRET = process.env.CRON_SECRET;
const URL = "https://dongnecoffeenote.com/api/cron-batch-judge";
const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).replace(/-/g, "");
const SPEND = `${homedir()}/coffee-platform/agent-reports/judge-spend-${day}.json`;
const readSpend = () => { try { return JSON.parse(fs.readFileSync(SPEND, "utf8")); } catch { return { usd: 0, cafes: 0 }; } };
const writeSpend = (s) => fs.writeFileSync(SPEND, JSON.stringify(s));
const hit = async (submit) => { const r = await fetch(`${URL}?manual=1${submit ? "&submit=1" : ""}`, { headers: { authorization: `Bearer ${SECRET}` } }); return r.json().catch(() => ({})); };
const pendingCount = async () => Number((await sql`SELECT COUNT(*)::int n FROM cafes WHERE published=false AND pipeline_status='pending' AND llm_judged_at IS NULL AND raw_reviews IS NOT NULL`)[0].n);
const log = (m) => console.log(`[${new Date().toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}] ${m}`);

let spend = readSpend();
log(`판정 청산 시작 · 오늘 누적 $${spend.usd.toFixed(4)} / 상한 $${CAP} · pending ${await pendingCount()}곳`);
if (spend.usd >= CAP) { log("오늘 상한 도달 — 제출 없음"); process.exit(0); }
let idle = 0;
for (let i = 1; i <= MAX_ROUNDS; i++) {
  const c = await hit(false); // 수거·적용만
  const cost = Number(c?.applied?.costUsd || 0), cafes = Number(c?.applied?.cafes || 0);
  if (cost || cafes) { spend = { usd: spend.usd + cost, cafes: spend.cafes + cafes }; writeSpend(spend); }
  log(`[${i}] 수거 적용 ${cafes}곳 · $${cost.toFixed(4)} · 오늘 누적 $${spend.usd.toFixed(4)}`);
  if (spend.usd >= CAP) { log("상한 도달 — 종료"); break; }
  const left = await pendingCount();
  const inflight = Number(c?.pollingBatches || 0) > 0;
  if (left === 0 && !inflight) { log("pending 0 · 진행중 0 — 종료"); break; }
  if (left > 0) {
    const s = await hit(true);
    if (s?.ok === false && /credit balance|too low|billing/i.test(String(s?.error || ""))) { log(`🔴 크레딧 부족 — 즉시 종료(대표님 충전 필요): ${String(s.error).slice(0, 160)}`); break; }
    if (s?.ok === false) { log(`🔴 제출 오류: ${String(s.error).slice(0, 200)}`); idle++; if (idle >= 2) break; await new Promise((r) => setTimeout(r, 60_000)); continue; }
    if (s?.blocked === "in-flight") { idle++; log("진행중 배치 — 대기"); await new Promise((r) => setTimeout(r, 90_000)); continue; }
    const n = Number(s?.submitted?.cafes ?? 0); // route 응답: submitted: { newBatchId, cafes, noBorderlineMarked }
    log(`제출 ${JSON.stringify(s?.submitted ?? s).slice(0, 100)}`);
    if (!s?.submitted || (typeof s.submitted === "object" && !s.submitted.newBatchId && !n)) { idle++; if (idle >= 3) { log("제출 대상 없음 — 종료"); break; } }
    else idle = 0;
  }
  await new Promise((r) => setTimeout(r, 120_000));
}
log(`종료 · 오늘 누적 $${spend.usd.toFixed(4)} · 적용 ${spend.cafes}곳`);
process.exit(0);
