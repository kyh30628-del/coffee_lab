import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
// sample published cafes with synth_reviews containing source 네이버 카페 + trust reference/verified, low nameInTitle signal
const rows = await sql`
  SELECT id, name FROM cafes WHERE published = true ORDER BY id LIMIT 3000
`;
let found = [];
for (const c of rows) {
  // skip; too slow row by row without review col. Instead query directly with jsonb filter.
}
const hits = await sql`
  SELECT id, name, jsonb_array_elements(synth_reviews) AS rev
  FROM cafes
  WHERE published = true AND synth_reviews::text ILIKE '%네이버 카페%'
  LIMIT 4000
`;
const filtered = hits.filter(h => h.rev.source === '네이버 카페' && (h.rev.why||[]).includes('본문에 카페명 언급'));
console.log('total 네이버카페 소스 리뷰(전체 published):', hits.length, '| 본문에만 스친 케이스:', filtered.length);
console.log(JSON.stringify(filtered.slice(0,15).map(f=>({id:f.id,name:f.name,quote:(f.rev.quote||'').slice(0,90),trust:f.rev.trust})), null, 1));
