// 에이전트 실행 '전' 주입용 — 그 직원/팀이 최근 받은 대표님 코멘트 + 동료평가를 텍스트로 출력.
//   _run.sh가 이 출력을 프롬프트에 붙여, 피드백이 표시에 그치지 않고 실제 다음 업무에 반영되게 한다
//   (잘한 점=강화, 아쉬운 점=개선 양분 → 더 적극적 업무). 관제 라운지 코멘트/peer_reviews를 읽는다.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { JOB_TO_MEMBER } = await import("../lib/org.ts");

const job = process.argv[2];
const meta = JOB_TO_MEMBER[job];
if (!meta) process.exit(0);
const { name, team } = meta;
const out = [];
try {
  const comments = await sql`SELECT body FROM lounge_comments WHERE (target=${"member:" + name} OR target=${"team:" + team}) AND created_at > now()-interval '21 days' ORDER BY created_at DESC LIMIT 5`;
  for (const c of comments) out.push(`· 대표님 → ${c.body}`);
  const peers = await sql`SELECT reviewer, note FROM peer_reviews WHERE (target LIKE ${"%" + name + "%"} OR target LIKE ${"%" + team + "%"}) AND created_at > now()-interval '14 days' ORDER BY created_at DESC LIMIT 5`;
  for (const p of peers) out.push(`· 동료(${p.reviewer}) → ${p.note}`);
} catch { /* 조용히 스킵 — 피드백 없으면 주입 안 함 */ }

if (out.length) {
  process.stdout.write(`\n\n[최근 받은 피드백 — 대표님·동료의 평가] (표시가 아니라 반영 대상이다)\n${out.join("\n")}\n→ 이 피드백을 진지하게 받아들여라. 칭찬은 그 강점을 이번 사이클에도 유지·강화하고, 아쉬운 점·지적은 변명하지 말고 개선의 양분으로 삼아 구체적 행동으로 반영하라. 성과 보고에 무엇을 개선/반영했는지 드러나게 하라.`);
}
process.exit(0);
