import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const rows = await sql`
  SELECT id, name, area, offctx_rate, offctx_ok, synth_count, synth_grade
  FROM cafes
  WHERE published = true AND (name ILIKE '%라운지%' OR name ILIKE '%루프탑%' OR name ILIKE '%펜트하우스%')
  ORDER BY offctx_rate DESC NULLS LAST
  LIMIT 30
`;
for (const r of rows) {
  console.log(`${r.id}\t${r.name}\t${r.area}\trate=${r.offctx_rate}\tok=${r.offctx_ok}\tn=${r.synth_count}\tgrade=${r.synth_grade}`);
}
