import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

// high offctx_rate but offctx_ok=true (rules already accepted -> potential false negative / new pattern)
const rows = await sql`
  SELECT id, name, area, offctx_rate, offctx_ok, synth_count, synth_grade
  FROM cafes
  WHERE published = true AND offctx_rate IS NOT NULL AND offctx_rate >= 0.15
    AND synth_count >= 4
  ORDER BY offctx_rate DESC
  LIMIT 25
`;
console.log('=== TOP offctx_rate candidates ===');
for (const r of rows) {
  console.log(`${r.id}\t${r.name}\t${r.area}\trate=${r.offctx_rate}\tok=${r.offctx_ok}\tn=${r.synth_count}\tgrade=${r.synth_grade}`);
}
