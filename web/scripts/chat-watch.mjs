// 💬 관제 챗봇 로컬 워커 — chat_queue(pending)를 폴링해 (1) 상태질문은 라이브 그라운딩+claude -p로 즉답,
//   (2) 대표님 **작업지시**는 트리아지 후 안전·가역 코드변경이면 dev_task(승인·CEO)로 자율 파이프라인에 태워
//   격리 워크트리 구현→tsc/빌드 검증→(위험도 낮/중) 자동배포까지 돌리고, 진행상황을 챗으로 되보고한다.
//   파괴적·비가역·데이터변경·모호/택일 건은 절대 자동실행 없이 챗으로 대표님께 되묻는다(차단기).
//   ⚠️ ToS-clean: 구독토큰은 백엔드 금지 → 서버는 큐만, 실제 LLM/실행/배포는 전부 여기(로컬 claude -p·로컬 git).
//   코드 구현·커밋·배포는 이미 검증된 로컬 파이프라인(dev-claim→run-dev-one→dev-deploy, 전역 git락·버전확인)을
//   재사용한다 — 워커가 직접 free git push 하지 않아 과거 git 레이스 사고를 회피.
import { readFileSync, appendFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { neon } from "@neondatabase/serverless";
import { computeGuard } from "./usageGuard.mjs";

const env = readFileSync("/Users/wangwida/coffee-platform/web/.env.local", "utf8");
const sql = neon(env.match(/DATABASE_URL="?([^"\n]+)/)[1].trim());
const one = async (q) => { try { return Number((await q)[0].c); } catch { return "?"; } };

// 📜 CEO 운영원칙 캐논 — triage/실행 프롬프트에 항상 시스템컨텍스트로 주입(캐시됨). 서비스 이해·품질 해자 고정.
const CANON = "/Users/wangwida/coffee-platform/docs/CEO-OPERATING-PRINCIPLES.md";
// 📊 토큰 실측 로깅(측정 사각 해소) — _run.sh와 동일 포맷으로 USAGE.tsv에 적재. 캐시read 포함이 소모 프록시.
function logUsage(job, j) { try { const u = j.usage || {}; const tin = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); appendFileSync("/Users/wangwida/coffee-platform/agent-reports/USAGE.tsv", [new Date().toISOString(), job, tin, u.output_tokens || 0, (j.total_cost_usd || 0).toFixed(4), j.num_turns || 0].join("\t") + "\n"); } catch {} }

const KB = `너는 '동네 커피 노트'(dongnecoffeenote.com)의 **기획조정실장** — 대표님(CEO) 직속 2인자이자 관제 상황을 꿰고 있는 참모다. 대표님께 **똑똑하고 자연스럽게, 핵심만** 답하고, 대표님의 **작업지시는 곧 승인**으로 간주해 자율로 처리를 개시한다. 공손하되 직언하고, 도움이 되면 한발 앞서 제안한다.
[역할 경계 — 중요] ①상태·데이터 **질문**엔 아래 [라이브 상태]로 바로 답한다. ②**안전하고 되돌릴 수 있는 코드/UI/문구/설정 변경 작업지시**는 네가 착수시킨다(격리 워크트리 구현→검증→배포 파이프라인). ③**파괴적·비가역·데이터변경(카페 공개/비공개/등급/대량/삭제)·예산/토큰정책·스케줄/런치d·시크릿·모호하거나 둘 중 택일**인 건은 **절대 자동 실행하지 말고** 대표님께 되묻는다. **너 자신은 DB를 직접 바꾸지 않는다(읽기전용 조회만).**
[말투] 사람처럼 자연스러운 문장으로. 짧은 질문엔 한두 문장으로 시원하게. 표·목록은 수치를 여러 개 비교할 때'만', 딱딱한 보고서 톤·굵게 남발 금지. 모바일에서 읽기 좋게 간결히. (답은 마크다운, 화면이 HTML 렌더)
[정확성] 근거 수치는 거의 다 아래 [라이브 상태]에 있다 — 그걸로 바로 답하라. 숫자는 실측만, 모르면 "확인 필요"라 하고 절대 지어내지 마라. 라이브 상태에 없는 값이 꼭 필요하면 다른 말 없이 \`[NEED_DB]\`만 출력해 추가조회를 요청하라(읽기전용 SELECT로 확인해준다).
[지식: 조직] CEO→기획조정실장(2인자)─직할 자율진단감사실(self-audit)·비서실장. 6본부: 품질·성장·운영·경험·영업·전략기획(주간)·경영지원(주간). DoA: L0팀·L1본부·L2기조실장·L3 CEO만 결재.
[지식: 스케줄KST] 상시: audit-watch 5분·dev-pipeline 5분(코드구현)·dev-deploy 2분(배포)·cron-issues 10분·chat-watch 상주. 매시: embed :05·synth :45. 주기: grow/heal 2h·enrich 3h·selfaudit 6h. 하루: 06 verify·08/17 전체사이클·10:30 거버넌스·16:30 youtube. 주간: 월 resynth·일 newsletter. LLM=로컬claude-p(구독$0)·결정론=Vercel크론.
[지식: 위치컬럼] cafes 위치 3컬럼(100% 채움) — **area=구/시**·**dong=동**·**address=전체주소**·lat/lng. ⚠️'○○동' 질문은 **dong LIKE '%○○%'**로. 구/시 질문만 area.
[지식: 품질기준] 검증옥석=verifyReview로 가비지 제거 후 옥석만 카운트. 공개floor=검증리뷰 3건+(참고)·30+(검증). 오염게이트=cleanCafeName·offctx·coherence·비카페차단. 수도권만·카카오로컬불가.`;

async function ground() {
  const L = ["[라이브 상태] (실측)"];
  L.push(`발행: ${await one(sql`SELECT count(*) c FROM cafes WHERE published`)} (검증 ${await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade='검증'`)}·참고 ${await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade='참고'`)}) · 합성대기 ${await one(sql`SELECT count(*) c FROM cafes WHERE synth_updated IS NULL`)} · 후보보류 ${await one(sql`SELECT count(*) c FROM cafes WHERE NOT published AND synth_grade='후보'`)}`);
  L.push(`정합성: 박스밖 ${await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat<36.8 OR lat>38.3 OR lng<124.5 OR lng>127.9)`)}·오염의심 ${await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_coherence<0.3 AND COALESCE(offctx_ok,false)=false`)}`);
  try { const i = await sql`SELECT state,severity,title FROM issues WHERE status='open' ORDER BY first_seen LIMIT 12`; L.push(`실시간이슈(${i.length}): ${i.length ? i.map((x) => `[${x.state}]${x.title}`.slice(0, 55)).join(" / ") : "없음(클린)"}`); } catch {}
  try { const d = await sql`SELECT id,title,recommendation FROM decisions WHERE status='pending' AND COALESCE(tier,'L3')='L3' ORDER BY id`; L.push(`CEO결재대기(${d.length}): ${d.length ? d.map((x) => `#${x.id} ${x.title.slice(0, 35)}${x.recommendation ? `[의견:${x.recommendation.slice(0, 35)}]` : ""}`).join(" / ") : "없음"}`); } catch {}
  try { const dev = await sql`SELECT id,title,action_params->>'dev_status' ds FROM decisions WHERE action_type='dev_task' AND action_params->>'source'='chat' AND status='approved' AND COALESCE(action_params->>'dev_status','') NOT IN ('deployed') ORDER BY id DESC LIMIT 6`; if (dev.length) L.push(`챗발 개발진행(${dev.length}): ${dev.map((x) => `#${x.id}[${x.ds || "개발대기"}]${x.title.slice(0, 22)}`).join(" / ")}`); } catch {}
  try { const c = await sql`SELECT job,ok FROM (SELECT DISTINCT ON (job) job,ok,ran_at FROM agent_runs ORDER BY job,ran_at DESC) t`; const f = c.filter((x) => !x.ok).map((x) => x.job); L.push(`크론(${c.length}): ${f.length ? "실패=" + f.join(",") : "전체정상"}`); } catch {}
  return L.join("\n");
}

// claude -p 1회 호출. 캐논을 시스템프롬프트로 항상 주입(캐시됨) + 토큰 실측 로깅.
//   triage/즉답=haiku(저비용·기계적 분류·그라운딩 추출), 심층 DB조사=sonnet. tools=true면 Bash 허용.
function runClaude(prompt, { tools = false, model = "haiku", job = "chat-triage", retry = 1 } = {}) {
  return new Promise((res) => {
    const args = ["-p", prompt, "--model", model, "--append-system-prompt-file", CANON, "--dangerously-skip-permissions", "--max-turns", tools ? "6" : "2", "--output-format", "json"];
    if (tools) args.splice(args.indexOf("--max-turns"), 0, "--allowedTools", "Bash");
    const child = execFile("claude", args,
      { cwd: "/Users/wangwida/coffee-platform/web", maxBuffer: 16 * 1024 * 1024, timeout: tools ? 75000 : 45000, env: { ...process.env, PATH: "/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin" } },
      async (err, stdout) => {
        let out = "", reason = "";
        try {
          const j = JSON.parse(stdout); logUsage(job, j);
          if (j.is_error) reason = "api_error:" + (j.subtype || j.api_error_status || "unknown");
          else out = (j.result || "").trim();
        } catch { reason = err ? (err.killed ? "timeout" : String(err).slice(0, 70)) : "parse_fail"; }
        if (out) return res(out);
        // 🚫 빈칸 금지: 빈/에러는 1회 재시도(트랜션트 대응), 그래도 실패하면 __ERR__로 명확히 표면화.
        if (retry > 0) { console.error(`[재시도] ${job}/${model}: ${reason || "empty"}`); return res(await runClaude(prompt, { tools, model, job, retry: retry - 1 })); }
        return res(`__ERR__${reason || "빈 응답"}`);
      });
    try { child.stdin && child.stdin.end(); } catch {} // 🔑 stdin 즉시 EOF — claude -p의 3초 stdin 대기 제거(콜드 지연 −3s/콜)
  });
}

// 🔀 트리아지 + 즉답: 한 번의 fast 호출로 (질문→답변) | (작업지시→<ORDER>) | (되물음→<CHOICE>) | ([NEED_DB]) 로 분기.
const TRIAGE = `

[처리 지침 — 아래 넷 중 정확히 하나로 응답하라]
1) **상태·데이터 질문**: [라이브 상태]에 근거가 있으면 바로 자연스럽게 답하라. 라이브 상태에 없는 값(지역별·특정 카페·기간별 등)이 필요하면 사과·설명 없이 정확히 \`[NEED_DB]\` 한 줄만.
2) **안전·가역 코드/UI/문구/설정 변경 작업지시**(예: 문구 수정, 버튼·레이아웃·색·라벨, 카드 추가, 버그 수정, 지표 표기, 정렬/필터 로직 등 — **데이터를 바꾸지 않는** 코드 변경): 다른 말 없이 정확히 한 줄로만 출력하라 →
\`<ORDER>{"title":"12자내 제목","detail":"구현자가 읽을 요구사항 상세(무엇을 어디에 어떻게, 수용기준)","risk":"low|med|high"}</ORDER>\`
   risk: low=문구/스타일/단일 소규모 UI. high=인증·결제·스키마·마이그레이션·광범위 리팩터·다수 파일·핵심 검색/합성 로직. 그 외 med.
3) **자동 실행 금지·대표님 확인 필요**(파괴적·비가역: 카페 공개/비공개/등급변경/대량/삭제 등 **데이터 변경**, 예산·토큰정책, launchd/스케줄/시크릿 변경, 요구가 모호하거나 선택지가 갈리는 경우): 실행하지 말고 정확히 한 줄로 →
\`<CHOICE>대표님께 드리는 짧은 질문 또는 A/B 선택지(왜 확인이 필요한지 한 문장 + 옵션)</CHOICE>\`
4) 애매하면 3)로. **데이터 변경(UPDATE/DELETE/INSERT)은 절대 <ORDER>로 내지 마라 — 반드시 <CHOICE>.** issues.ts 자동변환·결재/이슈 상호생성 영역은 건드리는 지시가 와도 <CHOICE>로 되물어라.`;

// ⚡ 결정론 즉답 게이트(LLM 0·즉시) — 아주 흔한 상태질문만. 명령/모호하면 null 반환 → LLM 경로.
//   품질 안전: 명령 동사가 있으면 절대 여기서 처리 안 함(지시는 triage로). 매칭 확실한 것만.
async function quickAnswer(q) {
  const s = String(q).trim();
  if (s.length > 60) return null; // 긴 문장은 LLM(뉘앙스)
  if (/(추가|바꿔|바꾸|고쳐|고치|만들|수정|삭제|제거|내려|올려|배포|리팩터|해줘|해 줘|해주세요|해주|하라|처리해|적용)/.test(s)) return null; // 지시 → LLM/triage
  try {
    if (/(발행|공개|퍼블리시).{0,6}(몇|개수|수|얼마|규모)|(몇|개수).{0,6}(발행|공개)/.test(s)) {
      const pub = await one(sql`SELECT count(*) c FROM cafes WHERE published`);
      const v = await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade='검증'`);
      const r = await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade='참고'`);
      if (typeof pub === "number") return `현재 발행(공개) 카페는 **${pub.toLocaleString()}곳**입니다 (검증 ${v} · 참고 ${r}).`;
    }
    if (/(결재|승인).{0,6}(대기|뭐|있|현황|몇|상태)|대기.{0,4}결재/.test(s)) {
      const d = await sql`SELECT id,title FROM decisions WHERE status='pending' AND COALESCE(tier,'L3')='L3' ORDER BY id`;
      return d.length ? `CEO 결재 대기 **${d.length}건**: ${d.map((x) => `#${x.id} ${x.title.slice(0, 30)}`).join(" · ")}` : "CEO 결재 대기는 없습니다 (클린).";
    }
  } catch { return null; }
  return null;
}

async function askOrAnswer(base) {
  const out = await runClaude(base + TRIAGE, { tools: false, model: "haiku", job: "chat-triage" });
  if (out && !out.startsWith("__ERR__")) {
    const mo = out.match(/<ORDER>([\s\S]*?)<\/ORDER>/);
    if (mo) { try { return { type: "order", spec: JSON.parse(mo[1].trim()) }; } catch { return { type: "answer", text: out.replace(/<\/?ORDER>/g, "").trim() }; } }
    const mc = out.match(/<CHOICE>([\s\S]*?)<\/CHOICE>/);
    if (mc) return { type: "choice", text: mc[1].trim() };
    if (!out.includes("[NEED_DB]")) return { type: "answer", text: out };
  }
  // [NEED_DB] 또는 fast 실패 → 읽기전용 심층조회로 질문 답변
  const deep = await runClaude(base + "\n\nBash에서 node+@neondatabase/serverless로 web/.env.local의 DATABASE_URL에 접속해 **읽기전용 SELECT만** 실행해 확인한 뒤 자연스럽게 답하라. 🚫 UPDATE/DELETE/INSERT 절대 금지. 마지막엔 반드시 텍스트로 답을 마무리하라.", { tools: true, model: "sonnet", job: "chat-deep" });
  if (deep && !deep.startsWith("__ERR__")) return { type: "answer", text: deep };
  if (out && !out.startsWith("__ERR__")) return { type: "answer", text: out.replace("[NEED_DB]", "").trim() || "확인이 필요합니다 — 질문을 조금 더 구체적으로 다시 주시겠어요?" };
  const err = out.startsWith("__ERR__") ? out.slice(7) : (deep && deep.startsWith("__ERR__") ? deep.slice(7) : "알 수 없음");
  return { type: "answer", text: `⚠️ 일시적으로 응답을 생성하지 못했어요 (사유: ${err}). 로컬 워커는 정상 가동 중이니 잠시 후 다시 보내 주세요.` };
}

// 🛠 작업지시 → dev_task(승인·CEO·source=chat) 적재. 실제 구현·검증·배포는 로컬 파이프라인이 수행.
async function createOrder(spec, question) {
  const title = String(spec.title || question).slice(0, 120);
  const detail = String(spec.detail || question).slice(0, 2000);
  const risk = ["low", "med", "high"].includes(spec.risk) ? spec.risk : "med";
  const autodeploy = risk !== "high"; // 낮/중=자동배포, high=배포대기(챗에서 대표님 확인)
  const ap = { source: "chat", chat_risk: risk, dev_autodeploy: autodeploy };
  const r = await sql`INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params, status, decided_by, decided_at, recommendation, result)
    VALUES (${title}, ${detail}, '기획조정실', 'MED', 'L3', 'dev_task', ${JSON.stringify(ap)}::jsonb, 'approved', 'CEO', now(), '챗봇 지시 — 자율 구현·검증', ${autodeploy ? "챗 착수(자동배포)" : "챗 착수(배포는 대표님 확인)"}) RETURNING id`;
  const id = r[0].id;
  await sql`INSERT INTO work_orders (command, action, tier) VALUES (${question.slice(0, 500)}, ${"dev_task#" + id}, ${risk})`.catch(() => {});
  return { id, autodeploy, risk };
}

let busy = false;
async function tick() {
  if (busy) return; busy = true;
  try {
    const rows = await sql`SELECT id, question, history FROM chat_queue WHERE status='pending' ORDER BY id LIMIT 1`;
    if (rows.length) {
      const { id, question, history } = rows[0];
      await sql`UPDATE chat_queue SET status='processing' WHERE id=${id}`;
      // ⚡ 결정론 즉답 먼저(LLM 0·즉시) — 흔한 상태질문은 여기서 끝. 히스토리 문맥 없을 때만(맥락질문 오답 방지).
      const noHist = !Array.isArray(history) || history.length === 0;
      const quick = noHist ? await quickAnswer(question) : null;
      if (quick) { await sql`UPDATE chat_queue SET answer=${quick}, status='done', mode='quick', answered_at=now() WHERE id=${id}`; console.log(`[${new Date().toISOString()}] answered #${id} (quick·무LLM)`); busy = false; return; }
      const g = await ground();
      const hist = Array.isArray(history) ? history.map((h) => `${h.role === "user" ? "Q" : "A"}: ${String(h.content).slice(0, 300)}`).join("\n") : "";
      const base = `${KB}\n\n${g}\n\n${hist ? "[직전 대화]\n" + hist + "\n\n" : ""}[대표님 입력] ${question}`;
      const r = await askOrAnswer(base);
      let answer = "", mode = "claude-p";
      if (r.type === "order") {
        const guard = computeGuard(); // 🛡️ 주간한도 근접 시 비핵심 자율개발 보류(핵심 판정·그라운딩 보호)
        if (guard.level === "pause") {
          mode = "held";
          answer = `⏸️ **주간 한도 보호로 자율개발을 잠시 보류합니다** (7일 사용 ${guard.pct}% ≥ 컷).\n\n"${r.spec.title || question}"\n\n핵심 판정·질의응답은 계속 정상 동작합니다. 지금 바로 진행을 원하시면 "강행" 또는 컷 상향을 알려주세요.`;
        } else {
          const o = await createOrder(r.spec, question);
          mode = "order";
          answer = `🛠 **착수했습니다 — 개발 #${o.id}**\n\n"${r.spec.title || question}"\n\n격리 워크트리에서 구현 → tsc·빌드 검증 → ${o.autodeploy ? `**자동 배포**(위험도 ${o.risk})` : `**배포대기**(위험도 high — 배포 전 확인 요청드립니다)`}. 진행상황은 여기로 계속 보고드립니다. _(개발 파이프라인 5분 주기 — 곧 시작)_${guard.level === "throttle" ? "\n\n_※ 주간 한도 " + guard.pct + "% — 절약 모드로 진행합니다._" : ""}`;
        }
      } else if (r.type === "choice") {
        mode = "choice";
        answer = `❓ **확인이 필요합니다**\n\n${r.text}\n\n_원하시는 방향을 답해 주시면 그대로 진행하겠습니다._`;
      } else {
        answer = r.text;
      }
      await sql`UPDATE chat_queue SET answer=${answer.slice(0, 6000)}, status='done', mode=${mode}, answered_at=now() WHERE id=${id}`;
      console.log(`[${new Date().toISOString()}] answered #${id} (${mode})`);
    }
  } catch (e) { console.error("tick err", String(e).slice(0, 120)); }
  busy = false;
}

// 진행보고 메시지(챗발 dev_task 상태 전이 → 챗에 1회 보고). 의미없는 중간상태(building/built)는 보고 생략.
function reportMsg(id, ds, ap, result) {
  const s = ap?.summary ? ` — ${String(ap.summary).slice(0, 160)}` : "";
  const auto = ap?.dev_autodeploy;
  switch (ds) {
    case "배포대기": return auto
      ? `✅ **구현·검증 완료** — 개발 #${id}. 자동 배포를 시작합니다(2분 내 반영 확인).`
      : `✅ **구현·검증 완료** — 개발 #${id} (위험도 높음). 배포 전 확인이 필요합니다. 관제탑 '개발 파이프라인' 카드에서 **배포**를 눌러 주세요.`;
    case "deployed": return `🚀 **배포 완료** — 개발 #${id}. 프로덕션 반영 확인${ap?.sha ? ` (${String(ap.sha).slice(0, 8)})` : ""}.`;
    case "빌드오류": return `⚠️ **빌드 오류로 중단** — 개발 #${id}${s}. 지시를 더 구체화해 다시 주시면 재시도합니다.`;
    case "스코프반려": return `🛡️ **자동 반려** — 개발 #${id}: 목적 외 보호파일(빌드·설정·의존성) 변경이 감지돼 차단했습니다${s}.`;
    case "구현불가": return `ℹ️ 개발 #${id}: 코드 변경이 불필요하거나 코드로 처리할 작업이 아니었습니다${s}.`;
    case "배포오류": case "반영미확인": return `⚠️ **배포 문제** — 개발 #${id}: ${String(result || ds).slice(0, 160)}. 점검이 필요합니다.`;
    default: return null; // building/built/deploy_approved 등 중간상태는 조용히 넘김
  }
}

// 🔁 유지관리(8초): ①자동배포 승격(챗발 배포대기+dev_autodeploy → deploy_approved) ②진행보고를 챗에 적재.
//   ⚠️ 차단기: high 위험(dev_autodeploy=false)은 절대 자동배포 승격 안 됨 — 대표님이 관제탑에서 직접 배포.
let maintBusy = false;
async function maintenance() {
  if (maintBusy) return; maintBusy = true;
  try {
    // 🛡️ 주간한도 pause면 자동배포 승격 보류(핵심 판정 보호). throttle/ok면 정상 승격.
    if (computeGuard().level !== "pause")
      await sql`UPDATE decisions SET action_params = action_params || '{"dev_status":"deploy_approved"}'::jsonb, result='챗 자율 — 자동배포 승인(위험도 낮/중)'
        WHERE action_type='dev_task' AND status='approved' AND action_params->>'source'='chat'
          AND action_params->>'dev_status'='배포대기' AND (action_params->>'dev_autodeploy')='true'`.catch(() => {});
    const rows = await sql`SELECT id, action_params ap, result FROM decisions
      WHERE action_type='dev_task' AND action_params->>'source'='chat'
        AND action_params->>'dev_status' IS NOT NULL
        AND COALESCE(action_params->>'chat_reported','') <> COALESCE(action_params->>'dev_status','')`;
    for (const d of rows) {
      const ds = d.ap?.dev_status;
      const rep = reportMsg(d.id, ds, d.ap, d.result);
      if (rep) await sql`INSERT INTO chat_queue (question, answer, status, mode, answered_at) VALUES (${"🛠 개발 #" + d.id + " 진행보고"}, ${rep}, 'done', 'dev-report', now())`.catch(() => {});
      await sql`UPDATE decisions SET action_params = action_params || ${JSON.stringify({ chat_reported: ds })}::jsonb WHERE id=${d.id}`.catch(() => {});
    }
  } catch (e) { console.error("maint err", String(e).slice(0, 120)); }
  maintBusy = false;
}

// 💓 하트비트 — 상주 데몬 생존 기록(경영지원본부, EXPECT_MAX_H 'chat-watch' 1h).
async function heartbeat() { try { await sql`INSERT INTO agent_runs (job, ran_at, ok, detail, processed) VALUES ('chat-watch', now(), true, '관제 챗봇 상주(지시→자율실행)', 0) ON CONFLICT (job) DO UPDATE SET ran_at=now(), ok=true, detail='관제 챗봇 상주(지시→자율실행)'`; } catch {} }
setInterval(heartbeat, 60000); heartbeat();

console.log("chat-watch 시작 (질문즉답 + 지시→자율실행·배포)");
setInterval(tick, 1500); tick();
setInterval(maintenance, 8000); maintenance();
