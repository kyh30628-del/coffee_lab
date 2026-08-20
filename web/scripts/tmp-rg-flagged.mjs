import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const cnt = await sql`SELECT count(*)::int n FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false)`;
console.log('flagged >=0.55 & not ok:', cnt[0].n);

const rows = await sql`
  SELECT id, name, area, offctx_rate, synth_count, synth_grade
  FROM cafes
  WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false)
  ORDER BY offctx_rate DESC LIMIT 20
`;
for (const r of rows) console.log(`${r.id}\t${r.name}\t${r.area}\trate=${r.offctx_rate}\tn=${r.synth_count}\tgrade=${r.synth_grade}`);
