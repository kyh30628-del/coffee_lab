// 💬 관제 챗봇 로컬 워커 — chat_queue(pending)를 폴링해 라이브 그라운딩 + claude -p(구독·$0)로 답하고 DB에 기록.
//   구독토큰을 백엔드에 안 넣는 ToS-clean 구조: 서버는 큐만, 실제 LLM은 여기(로컬)서. KeepAlive launchd로 상주.
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const env = readFileSync("/Users/wangwida/coffee-platform/web/.env.local", "utf8");
const sql = neon(env.match(/DATABASE_URL="?([^"\n]+)/)[1].trim());
const one = async (q) => { try { return Number((await q)[0].c); } catch { return "?"; } };

const KB = `너는 '동네 커피 노트'(dongnecoffeenote.com)의 **기획조정실장** — 대표님(CEO) 직속 2인자이자 관제 상황을 꿰고 있는 참모다. 대표님 질문에 **똑똑하고 자연스럽게, 핵심만** 답한다. 공손하되 직언하고, 도움이 되면 한발 앞서 제안한다. **읽기전용 — 작업 지시·데이터 변경은 절대 안 한다.**
[말투] 사람처럼 자연스러운 문장으로. 짧은 질문엔 한두 문장으로 시원하게. 표·목록은 수치를 여러 개 비교할 때'만', 딱딱한 보고서 톤·굵게 남발 금지. 모바일에서 읽기 좋게 간결히. (답은 마크다운, 화면이 HTML 렌더)
[정확성] 근거 수치는 거의 다 아래 [라이브 상태]에 있다 — 그걸로 바로 답하라. 숫자는 실측만, 모르면 "확인 필요"라 하고 절대 지어내지 마라. 라이브 상태에 없는 값이 꼭 필요하면 다른 말 없이 \`[NEED_DB]\`만 출력해 추가조회를 요청하라(읽기전용 SELECT로 확인해준다). 🚫 UPDATE/DELETE/INSERT 절대 금지.
[지식: 조직] CEO→기획조정실장(2인자)─직할 자율진단감사실(self-audit)·비서실장. 6본부: 품질·성장·운영·경험·영업·전략기획(주간)·경영지원(주간). DoA: L0팀·L1본부·L2기조실장·L3 CEO만 결재.
[지식: 스케줄KST] 상시: audit-watch 5분(트리거 감시+cron-selfaudit 워치독)·dev-pipeline 5분·dev-deploy 2분·cron-issues 10분(RM탐지+autoCorrect)·chat-watch 상주. 매시: embed :05·synth :45. 주기: grow(홀수시:10)·heal(홀수시:25) 2h·enrich 3h(:40)·selfaudit 6h(03/09/15/21시 :20). 하루: 00 sentinel·01:30 rulegap·06 verify·08/17 전체사이클(LLM)·10:30 주간거버넌스(격일게이트)·11:30/15:30/21:30 self-audit(LLM)·16:30 youtube-backfill·17 demand·04/10/16/22 closure. 주간: 일13 snapshot·월13 resynth·일20:07 newsletter. LLM=로컬claude-p(구독$0)·결정론=Vercel크론.
[지식: 위치컬럼] cafes 위치는 3컬럼(모두 100% 채움) — **area=구/시**('강북구'·'수원시'), **dong=동**('성수동'·'연남동'), **address=전체주소**, lat/lng=좌표. ⚠️'○○동' 질문은 반드시 **dong LIKE '%○○%'**로 조회하라(area엔 동名 없어 0으로 잘못 나옴). 구/시 질문만 area.
[지식: 품질기준] 검증옥석=verifyReview로 가비지(동명·무관·광고·SEO·nameAsWord) 제거 후 옥석만 카운트. 공개floor=검증리뷰 3건+(참고)·30+(검증)·0~2(후보보류). nameAsWord필터=초단어/일반어명 오염거절. 오염게이트=cleanCafeName·offctx·coherence·off-concept·비카페카테고리·합성순간차단. AI판정=상시OFF수동청산(콘솔키). 수도권만·카카오로컬불가.`;

async function ground() {
  const L = ["[라이브 상태] (실측)"];
  L.push(`발행: ${await one(sql`SELECT count(*) c FROM cafes WHERE published`)} (검증 ${await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade='검증'`)}·참고 ${await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade='참고'`)}) · 합성대기 ${await one(sql`SELECT count(*) c FROM cafes WHERE synth_updated IS NULL`)} · 후보보류 ${await one(sql`SELECT count(*) c FROM cafes WHERE NOT published AND synth_grade='후보'`)}`);
  L.push(`정합성: 박스밖 ${await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat<36.8 OR lat>38.3 OR lng<124.5 OR lng>127.9)`)}·오염의심 ${await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_coherence<0.3 AND COALESCE(offctx_ok,false)=false`)}`);
  try { const i = await sql`SELECT state,severity,title FROM issues WHERE status='open' ORDER BY first_seen LIMIT 12`; L.push(`실시간이슈(${i.length}): ${i.length ? i.map((x) => `[${x.state}]${x.title}`.slice(0, 55)).join(" / ") : "없음(클린)"}`); } catch {}
  try { const d = await sql`SELECT id,title,recommendation FROM decisions WHERE status='pending' AND COALESCE(tier,'L3')='L3' ORDER BY id`; L.push(`CEO결재대기(${d.length}): ${d.length ? d.map((x) => `#${x.id} ${x.title.slice(0, 35)}${x.recommendation ? `[의견:${x.recommendation.slice(0, 35)}]` : ""}`).join(" / ") : "없음"}`); } catch {}
  try { const c = await sql`SELECT job,ok FROM (SELECT DISTINCT ON (job) job,ok,ran_at FROM agent_runs ORDER BY job,ran_at DESC) t`; const f = c.filter((x) => !x.ok).map((x) => x.job); L.push(`크론(${c.length}): ${f.length ? "실패=" + f.join(",") : "전체정상"}`); } catch {}
  return L.join("\n");
}

// claude -p 1회 호출. tools=true면 Bash 허용(추가조회 가능), false면 도구 없이 그라운딩만으로 즉답 강제(턴 소진 불가).
function runClaude(prompt, tools) {
  return new Promise((res) => {
    const args = ["-p", prompt, "--model", "sonnet", "--dangerously-skip-permissions", "--max-turns", tools ? "6" : "2", "--output-format", "json"];
    if (tools) args.splice(args.indexOf("--max-turns"), 0, "--allowedTools", "Bash");
    execFile("claude", args,
      { cwd: "/Users/wangwida/coffee-platform/web", maxBuffer: 16 * 1024 * 1024, timeout: tools ? 75000 : 40000, env: { ...process.env, PATH: "/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" } },
      (err, stdout) => { try { res((JSON.parse(stdout).result || "").trim()); } catch { res(err ? `__ERR__${String(err).slice(0, 80)}` : ""); } });
  });
}

async function askClaude(base) {
  // 1차(빠름): 도구 없이 그라운딩만으로 즉답. DB가 꼭 필요한 질문이면 모델이 [NEED_DB]만 출력 → 2차로 승격.
  const fast = await runClaude(base + "\n\n위 [라이브 상태]에 근거가 있으면 바로 자연스럽게 답하라. **라이브 상태에 없는 값(지역별·특정 카페·기간별 등)이 필요하면, 사과·설명 절대 하지 말고 정확히 `[NEED_DB]` 한 줄만 출력하라. '못 드린다/안 잡혀 있다'고 답하지 말고 반드시 [NEED_DB]로.**", false);
  if (fast && !fast.startsWith("__ERR__") && !fast.includes("[NEED_DB]")) return fast;
  // 2차(에스컬레이션): Bash 읽기전용 조회 허용.
  const deep = await runClaude(base + "\n\nBash에서 node+@neondatabase/serverless로 web/.env.local의 DATABASE_URL에 접속해 **읽기전용 SELECT만** 실행해 확인한 뒤, 자연스럽게 답하라. 🚫 UPDATE/DELETE/INSERT 절대 금지. 반드시 마지막엔 텍스트로 답을 마무리하라.", true);
  if (deep && !deep.startsWith("__ERR__")) return deep;
  // 폴백: 빠른경로가 뭔가 냈으면 그거라도(마커 제거).
  if (fast && !fast.startsWith("__ERR__")) return fast.replace("[NEED_DB]", "").trim() || "(확인 필요 — 다시 질문해 주세요)";
  const err = fast.startsWith("__ERR__") ? fast.slice(7) : (deep && deep.startsWith("__ERR__") ? deep.slice(7) : "");
  return err ? `(LLM 오류: ${err})` : "(빈 응답 — 다시 질문해 주세요)";
}

let busy = false;
async function tick() {
  if (busy) return; busy = true;
  try {
    const rows = await sql`SELECT id, question, history FROM chat_queue WHERE status='pending' ORDER BY id LIMIT 1`;
    if (rows.length) {
      const { id, question, history } = rows[0];
      await sql`UPDATE chat_queue SET status='processing' WHERE id=${id}`;
      const g = await ground();
      const hist = Array.isArray(history) ? history.map((h) => `${h.role === "user" ? "Q" : "A"}: ${String(h.content).slice(0, 300)}`).join("\n") : "";
      const base = `${KB}\n\n${g}\n\n${hist ? "[직전 대화]\n" + hist + "\n\n" : ""}[질문] ${question}`;
      const answer = await askClaude(base);
      await sql`UPDATE chat_queue SET answer=${answer.slice(0, 6000)}, status='done', mode='claude-p', answered_at=now() WHERE id=${id}`;
      console.log(`[${new Date().toISOString()}] answered #${id}`);
    }
  } catch (e) { console.error("tick err", String(e).slice(0, 120)); }
  busy = false;
}

// 💓 하트비트 — 상주 데몬이라 종료 trap이 없으므로 60초마다 agent_runs에 생존 기록(담당: 경영지원본부).
//   60초+ 갱신 끊기면 = 데몬 죽음 → 자율진단이 감지(EXPECT_MAX_H 'chat-watch' 1h).
async function heartbeat() { try { await sql`INSERT INTO agent_runs (job, ran_at, ok, detail, processed) VALUES ('chat-watch', now(), true, '관제 챗봇 상주', 0) ON CONFLICT (job) DO UPDATE SET ran_at=now(), ok=true, detail='관제 챗봇 상주'`; } catch {} }
setInterval(heartbeat, 60000); heartbeat();

console.log("chat-watch 시작 (3초 폴링)");
setInterval(tick, 1500);
tick();
