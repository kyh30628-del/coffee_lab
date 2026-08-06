import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
for (const l of readFileSync(new URL("file://" + process.cwd() + "/.env.local"), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const sql = neon(process.env.DATABASE_URL);
const summary = "lib/collectOrchestrator.ts: 등급판정 gradeCount = verified + reference*0.5 (참고 floor는 trustCount 그대로) — reference(본문스침 약매칭)가 raw볼륨만으로 검증(30) floor를 채우던 결함 수정(id16913: 검증3/참고26→gradeCount16.5→강등 확인). opts.excludeLinks 추가로 원본 루프에서 교차카페 확정오염 링크(cross_cafe_link_exclusions)를 재판정 자체에서 스킵(집계에도 반영). lib/synthStore.ts: loadLinkExclusions 헬퍼로 분리해 synthAndStore/applyDecisions/backfillYouTube 3곳이 collectAndSynthesize 호출 전 exclusion을 선반영(coordination#291). storeResult 표시단 필터는 이중방어로 유지. tsc 신규에러 0(베이스라인 next.config.ts eslint 1건 제외), npm run build 성공.";
const rows = await sql`
  UPDATE decisions
  SET action_params = COALESCE(action_params, '{}'::jsonb) || jsonb_build_object('dev_status', 'built', 'summary', ${summary}::text)
  WHERE id = 628
  RETURNING id, action_params
`;
console.log(JSON.stringify(rows, null, 2));
