import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const dec = await sql`SELECT id,action_type,status,title,team,tier,created_at FROM decisions WHERE team ILIKE '%레드팀%' OR team ILIKE '%검증심사%' ORDER BY created_at DESC LIMIT 10`;
console.log("=== recent redteam decisions ===", JSON.stringify(dec, null, 1));

const cnt = await sql`SELECT synth_grade, count(*), min(synth_count), max(synth_count), avg(synth_count)::numeric(10,1) FROM cafes WHERE published GROUP BY synth_grade`;
console.log("=== grade distribution ===", JSON.stringify(cnt, null, 1));

// negative-signal check: verified cafes with recent low avg sentiment or many offctx even below 0.55 threshold plus small count
const susp2 = await sql`SELECT id,name,area,synth_count,offctx_rate,synth_coherence,synth_updated FROM cafes WHERE published AND synth_grade='검증' AND offctx_rate > 0.3 ORDER BY offctx_rate DESC LIMIT 15`;
console.log("=== verified w/ offctx 0.3-0.55 (below watchlist threshold but notable) ===", JSON.stringify(susp2, null, 1));
