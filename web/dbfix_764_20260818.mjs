import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

// #764 action_params가 null로 상신돼 autoCorrect 실집행 루프(lib/issues.ts)가 매 사이클
// "action_params 누락"으로 실패·재시도만 반복(9h+ 정체). ids만 채워 기존 실행루프가 다음
// cron-issues(30분) 사이클에 정상 집행하도록 복구(신규 권한 부여 아님 — 이미 승인된 unpublish 보정).
const before = await sql`SELECT id, status, action_params FROM decisions WHERE id=764`;
console.log('before:', JSON.stringify(before));

const upd = await sql`UPDATE decisions SET action_params = '{"ids":[18655]}'::jsonb
  WHERE id=764 AND status='approved' AND action_type='unpublish' AND action_params IS NULL
  RETURNING id, action_params`;
console.log('updated:', JSON.stringify(upd));
