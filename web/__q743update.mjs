import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  UPDATE decisions
  SET action_params = action_params || jsonb_build_object(
    'dev_status', 'built',
    'summary', 'lib/issues.ts:49 ids 파싱에 action_params.cafe_id 단수 폴백 추가(app/api/admin/decide/route.ts:33-37과 동일 패턴). tsc 신규에러 0, npm run build 성공.'
  )
  WHERE id = 743
  RETURNING id, action_params->>'dev_status' AS dev_status
`;
console.log(JSON.stringify(rows, null, 2));
