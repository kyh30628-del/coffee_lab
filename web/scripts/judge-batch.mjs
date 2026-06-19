// 로컬 리뷰 판정 배치 (Claude Max 구독으로 실행).
// 사장님 머신에서 주기 실행 → 공유 DB의 '경계 리뷰'를 Haiku가 맥락 판정 → 양질만 공개.
// 웹앱(Vercel)은 LLM 호출 없이 결과만 서빙. (PRINCIPLES §1·§5)
// 판정 기준(정밀 루브릭)은 scripts/_judge-rubric.mjs 단일 출처 — Batches 경로(batch-judge.mjs)와 동일.
//
// 준비(최초 1회):
//   1) npm i @anthropic-ai/claude-agent-sdk        (web/ 폴더에서)
//   2) claude setup-token                          → 출력된 토큰 복사
//   3) export CLAUDE_CODE_OAUTH_TOKEN="발급토큰"
//      unset ANTHROPIC_API_KEY                      (있으면 구독 대신 API키로 가버림)
//   4) export APP_URL="https://coffee-lab-product-builder.vercel.app"
//      export ADMIN_PASSWORD="관리자비밀번호"
// 실행: node scripts/judge-batch.mjs

import { query } from "@anthropic-ai/claude-agent-sdk";
import { JUDGE_RUBRIC, buildJudgePrompt, parseJudgeVerdicts } from "./_judge-rubric.mjs";

const APP_URL = process.env.APP_URL || "https://coffee-lab-product-builder.vercel.app";
const PW = process.env.ADMIN_PASSWORD || "";

// 구독 세션 한도/레이트 등은 '문제'가 아니라 정상 종료로 본다(진행분은 이미 저장됨, 내일 04:00 이어감).
const isLimit = (e) => /session limit|rate limit|429|usage limit|overloaded|exceeded/i.test(String(e?.message ?? e));
process.on("unhandledRejection", (e) => { if (isLimit(e)) { console.log("구독 한도 도달(비동기) — 오늘은 여기까지. 내일 04:00 이어서 심사."); process.exit(0); } console.error("unhandledRejection:", e); process.exit(0); });
process.on("uncaughtException", (e) => { if (isLimit(e)) { console.log("구독 한도 도달 — 오늘은 종료. 내일 이어서."); process.exit(0); } console.error("uncaughtException:", e); process.exit(0); });
const MODEL = process.env.JUDGE_MODEL || "claude-haiku-4-5"; // 분류 작업이라 Haiku로 충분 + 한도·속도 유리
const MAX_CAFES = Number(process.env.JUDGE_MAX || 150); // 1회 상한(Haiku는 한도 여유 큼 + 도달 시 우아한 중단)

async function judge(cafeName, area, items) {
  const prompt = buildJudgePrompt(cafeName, area, items.map((b, i) => ({ i, title: b.title, body: b.body })));
  let text = "";
  for await (const msg of query({ prompt, options: { systemPrompt: JUDGE_RUBRIC, model: MODEL, maxTurns: 1, allowedTools: [] } })) {
    if (msg.type === "result" && msg.subtype === "success") text = msg.result;
  }
  return parseJudgeVerdicts(text);
}

// 타겟 모드: JUDGE_AREA(지역) 또는 JUDGE_CAFE_ID(단건) → 해당 카페만 강제 재판정(단일 패스)
const TARGET = process.env.JUDGE_AREA ? `&area=${encodeURIComponent(process.env.JUDGE_AREA)}` : (process.env.JUDGE_CAFE_ID ? `&cafeId=${process.env.JUDGE_CAFE_ID}` : "");
const TARGETED = !!TARGET;
async function getCandidates(limit) {
  const r = await fetch(`${APP_URL}/api/judge-candidates?limit=${limit}${TARGET}`, { headers: { "x-admin-password": PW } });
  if (!r.ok) throw new Error(`candidates ${r.status}`);
  return r.json();
}
async function apply(cafeId, decisions) {
  const r = await fetch(`${APP_URL}/api/judge-apply`, { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": PW }, body: JSON.stringify({ cafeId, decisions }) });
  return r.json();
}

async function main() {
  const { existsSync } = await import("node:fs");
  if (existsSync(new URL("./.ai-paused", import.meta.url))) { console.log("⏸ .ai-paused — AI 판정 일시정지(Claude 한도 보호)"); process.exit(0); }
  if (!PW) { console.error("ADMIN_PASSWORD 미설정"); process.exit(1); }
  let done = 0, published = 0, stop = false;
  while (done < MAX_CAFES && !stop) {
    const { ok, cafes, remaining, noBorderline } = await getCandidates(TARGETED ? 40 : 25);
    if (!ok) { console.error("candidates 실패"); break; }
    if (cafes.length === 0) { console.log(`심사 대상 카페 없음(스킵 ${noBorderline}). 남은 후보 ${remaining}.`); break; }
    // 동시 판정(서브프로세스 병렬) → SDK 오버헤드를 묶어 처리량 ~3배
    const CONC = Number(process.env.JUDGE_CONC || 3);
    for (let bi = 0; bi < cafes.length && !stop; bi += CONC) {
      const batch = cafes.slice(bi, bi + CONC);
      const results = await Promise.all(batch.map(async (c) => {
        try { return { c, verdicts: await judge(c.name, c.area, c.candidates) }; }
        catch (e) { return { c, limit: isLimit(e), err: String(e) }; }
      }));
      for (const r of results) {
        if (r.limit) { console.log(`\n구독 한도 도달 — 여기까지(${done}곳 완료). 진행분 저장, 다음 리셋에 이어감.`); stop = true; break; }
        if (!r.verdicts || !Array.isArray(r.verdicts)) { if (r.err) console.log(`  ✗ ${r.c.name}: ${r.err.slice(0, 60)} — 건너뜀`); continue; }
        const decisions = {};
        for (const v of r.verdicts) { const key = r.c.candidates[v?.i]?.key; if (key) decisions[key] = !!(v.about && v.helpful); }
        const approved = Object.values(decisions).filter(Boolean).length;
        const res = await apply(r.c.cafeId, decisions);
        if (res?.published) published++;
        done++;
        console.log(`[${done}] ${r.c.name}: 후보 ${r.c.candidates.length} → 양질 ${approved} | 등급 ${res?.grade ?? "?"} 공개 ${res?.published ?? "?"}`);
        if (done >= MAX_CAFES) { stop = true; break; }
      }
    }
    console.log(`  …진행 ${done} (공개 ${published}), 남은 후보 ${remaining}`);
    if (TARGETED) break; // 타겟 모드는 단일 패스(재호출 시 같은 카페 반복 방지)
  }
  console.log(`\n완료: ${done}곳 판정, 공개 ${published}곳.`);
}
main().catch((e) => {
  if (isLimit(e)) { console.log("구독 한도 도달 — 오늘은 종료(진행분 저장). 내일 04:00 이어서."); process.exit(0); }
  console.error(e); process.exit(0); // 야간 best-effort 배치 — 에러도 로그만 남기고 깨끗이 종료(진행분은 저장됨)
});
