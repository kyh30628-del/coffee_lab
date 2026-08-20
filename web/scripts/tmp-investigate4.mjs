import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

console.log('=== char_scores max axis vs synth_count (review 수 대비 비정상 태그量) ===');
const cs = await sql`
  SELECT id, name, area, synth_grade, synth_count, char_scores
  FROM cafes
  WHERE published = true AND char_scores IS NOT NULL AND synth_count IS NOT NULL
  LIMIT 5000
`;
let flagged = [];
for (const row of cs) {
  let obj = row.char_scores;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { continue; } }
  if (!obj || typeof obj !== 'object') continue;
  const vals = Object.values(obj).filter(v => typeof v === 'number');
  if (!vals.length) continue;
  const max = Math.max(...vals);
  const cnt = row.synth_count || 0;
  if (cnt > 0 && max > cnt * 5) {
    flagged.push({id: row.id, name: row.name, area: row.area, grade: row.synth_grade, synth_count: cnt, maxAxis: max, scores: obj});
  }
}
flagged.sort((a,b) => (b.maxAxis/b.synth_count) - (a.maxAxis/a.synth_count));
console.log('flagged count:', flagged.length);
console.log(JSON.stringify(flagged.slice(0,15), null, 2));
