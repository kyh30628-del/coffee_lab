import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const rows = await sql`
  SELECT id, name, area, synth_grade, synth_count
  FROM cafes
  WHERE published AND synth_grade='검증'
    AND (name ~* '(맛집|삼겹살|고기|횟집|술집|포차|이자카야|BBQ|치킨|호프|와인바|전시관|갤러리|미술관)$'
         OR name ~* '^(식당|레스토랑)')
  LIMIT 20
`;
console.log('=== 검증 카페 중 비카페 의심 이름패턴 ===', rows.length);
console.log(JSON.stringify(rows, null, 1));
