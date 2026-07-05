// 🩺 모델 티어 회귀 게이트(결정론·무LLM) — haiku로 내린 잡의 품질저하를 감지하면 즉시 sonnet 자동복귀 + 경보.
//   CEO 방침: 티어 내린 잡은 저하 0을 관찰해 확인, 조금이라도 흔들리면 즉시 sonnet 복귀.
//   신호(기계적): 최근 실행 실패(agent_runs.ok=false) 또는 산출 리포트 미생성/빈파일.
//   조치: agent-reports/model-overrides.json에 {job:"sonnet"} 기록(sticky) → agentModel이 다음 실행부터 sonnet.
//   복귀는 sticky(사람이 확인 후 수동 해제) — 안전 우선. run-daily.sh 사이클 말미에 호출(신규 launchd 불필요).
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { HAIKU_JOBS } from "./agentModel.mjs";

const ROOT = "/Users/wangwida/coffee-platform";
const OVR = `${ROOT}/agent-reports/model-overrides.json`;
const LOG = `${ROOT}/agent-reports/logs/orchestrator.log`;
const env = readFileSync(`${ROOT}/web/.env.local`, "utf8");
const sql = neon(env.match(/DATABASE_URL="?([^"\n]+)/)[1].trim());

// 잡별 산출 리포트 접두어(빈/미생성 감지용). 없으면 리포트검사 생략(agent_runs.ok만).
const REPORT_PREFIX = { "team-finance-agent": "finance-" };

function loadOvr() { try { return JSON.parse(readFileSync(OVR, "utf8")) || {}; } catch { return {}; } }
function saveOvr(o) { writeFileSync(OVR, JSON.stringify(o, null, 2) + "\n"); }

async function main() {
  const ovr = loadOvr();
  let changed = false;
  const notes = [];
  for (const job of HAIKU_JOBS) {
    if (ovr[job]) continue; // 이미 복귀됨
    // 최근 3회 실행 상태
    let runs = [];
    try { runs = await sql`SELECT ok, ran_at FROM agent_runs WHERE job=${job} ORDER BY ran_at DESC LIMIT 3`; } catch {}
    const recentFail = runs.length && runs[0].ok === false;
    const twoOfThree = runs.filter((r) => r.ok === false).length >= 2;
    // 산출 리포트 최신성 — **최근 실행 대비**로만 판정(주간 잡이라 절대시간 금지).
    //   마지막 실행이 성공 + 6h 내였는데 그 실행 이후 리포트가 안 생겼으면(빈/미생성) 저하 의심.
    //   실행이 오래됐으면(주간 케이던스 사이) 검사 스킵 — 오탐 방지.
    let reportMissing = false;
    const pref = REPORT_PREFIX[job];
    const lastRunMs = runs.length ? Date.parse(runs[0].ran_at) : 0;
    if (pref && runs.length && runs[0].ok !== false && lastRunMs && Date.now() - lastRunMs < 6 * 3600e3) {
      try {
        const dir = `${ROOT}/agent-reports`;
        const { readdirSync } = await import("node:fs");
        const files = readdirSync(dir).filter((f) => f.startsWith(pref) && f.endsWith(".md"));
        const post = files.map((f) => statSync(`${dir}/${f}`)).filter((s) => s.mtimeMs >= lastRunMs - 5 * 60e3 && s.size > 80);
        if (!post.length) reportMissing = true;
      } catch {}
    }
    if (recentFail || twoOfThree || reportMissing) {
      ovr[job] = "sonnet"; changed = true;
      const why = recentFail ? "최근 실행 실패" : twoOfThree ? "3회 중 2회 실패" : "산출 리포트 미생성/빈파일";
      notes.push(`${job}: ${why} → sonnet 자동복귀`);
    }
  }
  if (changed) {
    saveOvr(ovr);
    const { appendFileSync } = await import("node:fs");
    const line = `[${new Date().toISOString()}] 🩺 모델 회귀게이트: ${notes.join(" / ")}`;
    try { appendFileSync(LOG, line + "\n"); } catch {}
    console.log(line);
  } else {
    console.log(`[${new Date().toISOString()}] 모델 회귀게이트: haiku 잡 ${HAIKU_JOBS.length}개 정상(저하 없음)`);
  }
}
main().catch((e) => console.error("modelQualityWatch", String(e).slice(0, 120)));
