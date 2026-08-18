import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const dec = await sql`SELECT id,action_type,status,title,decided_at,created_at FROM decisions WHERE title ILIKE '%어썸블리스%' OR detail ILIKE '%18295%' ORDER BY created_at DESC LIMIT 5`;
console.log("=== DECISIONS re 18295 ===", JSON.stringify(dec, null, 1));

const cafe = await sql`SELECT id,name,synth_grade,published,synth_count,offctx_rate,synth_updated FROM cafes WHERE id=18295`;
console.log("=== id18295 current ===", JSON.stringify(cafe, null, 1));

// sample of verified cafes with low synth_count + negative signal for new attack surface
const susp = await sql`SELECT id,name,area,synth_grade,synth_count,offctx_rate,synth_coherence FROM cafes WHERE published AND synth_grade='검증' AND synth_count<=5 ORDER BY synth_count ASC, random() LIMIT 12`;
console.log("=== low synth_count verified sample ===", JSON.stringify(susp, null, 1));
