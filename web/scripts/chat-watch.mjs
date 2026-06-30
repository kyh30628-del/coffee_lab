// 💬 관제 챗봇 로컬 워커 — chat_queue(pending)를 폴링해 라이브 그라운딩 + claude -p(구독·$0)로 답하고 DB에 기록.
//   구독토큰을 백엔드에 안 넣는 ToS-clean 구조: 서버는 큐만, 실제 LLM은 여기(로컬)서. KeepAlive launchd로 상주.
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { neon } from "@neondatabase/serverless";

const env = readFileSync("/Users/wangwida/coffee-platform/web/.env.local", "utf8");
const sql = neon(env.match(/DATABASE_URL="?([^"\n]+)/)[1].trim());
const one = async (q) => { try { return Number((await q)[0].c); } catch { return "?"; } };

const KB = `너는 '동네 커피 노트'(dongnecoffeenote.com) 운영 관제 챗봇이다. CEO(대표님)에게 *정확히, 간결히* 답한다.
규칙: 아래 [라이브 상태]·[지식]을 근거로 답하라. 부족하면 Bash로 DB를 *읽기전용 SELECT* 조회해 확인하라(web/.env.local DATABASE_URL, 절대 UPDATE/DELETE 금지). 숫자는 실측 그대로, 모르면 "확인 필요"라 하고 지어내지 마라.
[지식: 조직] CEO→기획조정실장(2인자)─직할 자율진단감사실(self-audit)·비서실장. 6본부: 품질·성장·운영·경험·영업·전략기획(주간)·경영지원(주간). DoA: L0팀·L1본부·L2기조실장·L3 CEO만 결재.
[지식: 스케줄KST] 상시: audit-watch 5분, cron-issues 10분(RM탐지+autoCorrect), embed/synth 매시, heal·grow 2h, enrich 3h, selfaudit 6h. 하루: 00 sentinel·01 self-audit·01:30 rulegap·06 verify·08/17 전체사이클(LLM)·17 demand·04/10/16/22 closure. LLM=로컬claude-p(구독$0)·결정론=Vercel크론.
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

function askClaude(prompt) {
  return new Promise((res) => {
    execFile("claude", ["-p", prompt, "--model", "sonnet", "--dangerously-skip-permissions", "--allowedTools", "Bash", "--max-turns", "12", "--output-format", "json"],
      { cwd: "/Users/wangwida/coffee-platform/web", maxBuffer: 16 * 1024 * 1024, timeout: 120000, env: { ...process.env, PATH: "/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" } },
      (err, stdout) => { try { res(JSON.parse(stdout).result || "(빈 응답)"); } catch { res(err ? `(LLM 오류: ${String(err).slice(0, 80)})` : "(응답 파싱 실패)"); } });
  });
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
      const prompt = `${KB}\n\n${g}\n\n${hist ? "[직전 대화]\n" + hist + "\n\n" : ""}[질문] ${question}\n\n위 라이브 상태·지식에 근거해 정확·간결하게 답하라(필요시 Bash로 DB 추가조회).`;
      const answer = await askClaude(prompt);
      await sql`UPDATE chat_queue SET answer=${answer.slice(0, 6000)}, status='done', mode='claude-p', answered_at=now() WHERE id=${id}`;
      console.log(`[${new Date().toISOString()}] answered #${id}`);
    }
  } catch (e) { console.error("tick err", String(e).slice(0, 120)); }
  busy = false;
}

console.log("chat-watch 시작 (3초 폴링)");
setInterval(tick, 3000);
tick();
