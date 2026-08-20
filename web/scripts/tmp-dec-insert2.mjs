import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());

const title = '[정합성] 인천 신규구 동 매핑표 커버리지 누락 — decision#487 재발(5건)';
const detail = `12:08 정합성 조사(2회차): decision#487(07-24, area 202곳 신규구 일괄보정) 이후 신규 유입 카페 5건(id19827,19828,19845,20087,20116 / 07-25~08-03)이 동일 패턴으로 재발 — address 원문에 "서해구"가 명시돼 있는데 area는 제물포구/서구 등으로 잘못 배정. 근본원인: lib/discover.ts 서해구 동 매핑리스트(청라·가정동·석남동·연희동·루원시티)가 실제 유입 카페의 권역(가좌동/원창동/아라뱃길 남단 — 건지로·정서진1로·여우재로)을 커버 못함. 상세: agent-reports/proposals-20260820-1208.md 제안 1. 권장: (1)동 매핑표에 누락 동 추가 또는 (2)address 원문의 신규구 토큰을 area에 직접 반영하는 로직 추가(코드변경=CEO게이트). 저위험 5건은 개별 SQL 임시보정도 가능(근본해결 아님, 별개 승인).`;

const r = await sql`
  INSERT INTO decisions (title, detail, team, severity, action_type, action_params, status, tier, recommendation)
  VALUES (
    ${title}, ${detail}, '품질본부(자율 정합성 조사)', 'low', 'dev_task',
    ${JSON.stringify({rows:5, ids:[19827,19828,19845,20087,20116], field:'area', root_cause:'lib/discover.ts 서해구 동 매핑 커버리지 누락'})}::jsonb,
    'pending', 'L3', 'CEO 확인 후 코드 매핑표 확장 또는 대안 로직 채택 권고'
  ) RETURNING id, title, status`;
console.log(JSON.stringify(r, null, 1));
