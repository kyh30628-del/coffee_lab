import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);
const ids = [849,3103,4254,4733,6100,8299,18919,19777];
const noteMap = {
  849: '오탐 — 자기 카페(포천 감성카페) 정상 리뷰, 부속 약과매장 언급은 병기',
  3103: '오탐 — 보름산미술관 부속카페, 리뷰에 카페명·메뉴 직접 언급(decision#32 선례)',
  4254: '오탐 — 야자수마을카페(식물원형) 자기 카페 정상 리뷰',
  4733: '오탐 — 풍물기행 한옥카페, 빙수/식빵 메뉴 직접 언급 정상 리뷰',
  6100: '오탐 — 일월수목원 부속카페 데이지원, 카페명·디저트 직접 언급(decision#32 선례)',
  8299: '오탐 — 식물원 부속카페 빌리, 스콘/카페명 직접 언급',
  18919: '오탐 — 영흥수목원 부속카페 버터플라이, 라떼/카페명 직접 언급(decision#32 선례)',
  19777: '오탐 — 부천 식물원 부속카페 수피아, 카페명 직접 언급 정상 리뷰',
};
for (const id of ids) {
  await sql`UPDATE heal_attempts SET note = ${'[사람판독 08-20] ' + noteMap[id]} WHERE job='sentinel.attraction' AND target_id=${String(id)}`;
}
const check = await sql`SELECT target_id, note FROM heal_attempts WHERE job='sentinel.attraction' AND target_id = ANY(${ids.map(String)})`;
console.log(JSON.stringify(check, null, 1));

const cats = await sql`
  SELECT job,
    count(*) FILTER (WHERE note LIKE '[사람판독%') AS read,
    count(*) FILTER (WHERE note IS NULL OR note NOT LIKE '[사람판독%') AS unread
  FROM heal_attempts
  WHERE frozen_until IS NOT NULL AND frozen_until > now()
  GROUP BY job ORDER BY job
`;
console.log('=== updated tally ===');
console.log(JSON.stringify(cats, null, 2));
