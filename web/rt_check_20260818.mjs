import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const inbox = await sql`SELECT id,from_team,to_team,type,topic,stage,status,created_at FROM coordination WHERE (to_team ILIKE '%레드팀%' OR to_team ILIKE '%검증심사%' OR to_team ILIKE '%품질본부%') AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 20`;
console.log("=== INBOX ===", JSON.stringify(inbox, null, 1));

const dec = await sql`SELECT id,action_type,status,summary,created_at FROM decisions WHERE summary ILIKE '%어썸블리스%' OR summary ILIKE '%18295%' ORDER BY created_at DESC LIMIT 5`;
console.log("=== DECISIONS re 18295 ===", JSON.stringify(dec, null, 1));

const af = await sql`SELECT count(*) FROM audit_flags WHERE issue!='audit_complete' AND resolved=false`;
console.log("audit_flags open:", af[0].count);

const off = await sql`SELECT count(*) FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false)`;
console.log("offctx watchlist:", off[0].count);

const cafe = await sql`SELECT id,name,synth_grade,published,synth_count,offctx_rate,synth_updated FROM cafes WHERE id=18295`;
console.log("=== id18295 current ===", JSON.stringify(cafe, null, 1));
