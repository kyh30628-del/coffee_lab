// 공용 하트비트 — launchd 잡이 실행될 때마다 agent_runs에 기록을 남겨, 서버(Vercel) 자율진단이
//   로컬 잡의 정지/실패를 감지하게 한다. launchd 잡은 Vercel 크론과 달리 스스로 기록 안 하면 관제 사각.
//   사용: node --import tsx scripts/heartbeat.mjs <job> <exitcode> ["detail"]
//   exitcode 0 = 정상(ok), 그 외 = 실패(ok=false → recordRun이 즉시 이슈화+트리거+본부배정).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { recordRun } = await import("../lib/agentLog.ts");
const job = process.argv[2];
const code = Number(process.argv[3] || 0);
const detail = process.argv[4] || (code === 0 ? "완료" : `비정상 종료(exit ${code})`);
if (job) await recordRun(job, code === 0, detail, 0).catch(() => {});
process.exit(0);
