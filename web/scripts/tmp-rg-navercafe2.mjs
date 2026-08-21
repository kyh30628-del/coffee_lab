import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const ids = [11444, 18112, 10314];
for (const id of ids) {
  const rows = await sql`SELECT id, name, offctx_rate, synth_reviews FROM cafes WHERE id = ${id}`;
  const c = rows[0];
  console.log(`\n=== id${c.id} ${c.name} offctx=${c.offctx_rate} ===`);
  (c.synth_reviews||[]).forEach((r,i)=>console.log(`${i+1}. [${r.trust}|${r.source}] ${(r.quote||'').slice(0,160)}`));
}
// distinct cafe count for the pattern
const hits = await sql`
  SELECT id, name, jsonb_array_elements(synth_reviews) AS rev
  FROM cafes
  WHERE published = true AND synth_reviews::text ILIKE '%네이버 카페%'
`;
const filtered = hits.filter(h => h.rev.source === '네이버 카페' && (h.rev.why||[]).includes('본문에 카페명 언급'));
const distinctCafes = new Set(filtered.map(f=>f.id));
console.log('\n총 네이버카페소스 리뷰(전체):', hits.length, '| 본문언급 경로:', filtered.length, '| distinct 카페 수:', distinctCafes.size);
