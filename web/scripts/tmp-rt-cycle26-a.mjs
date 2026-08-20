import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

// 1. Check decisions pipeline for prior proposals
const dec = await sql`SELECT id,topic,status,action_type,created_at FROM decisions WHERE topic ILIKE '%소래산%' OR topic ILIKE '%궁뜰%' ORDER BY created_at DESC LIMIT 10`;
console.log('=== decisions for id13050/id13615 proposals ===');
console.log(JSON.stringify(dec, null, 1));

// 2. audit_flags and offctx watchlist sanity (digest says 0, confirm)
const af = await sql`SELECT count(*) FROM audit_flags WHERE issue!='audit_complete' AND resolved=false`;
const offctx = await sql`SELECT count(*) FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false)`;
console.log('audit_flags open:', af[0].count, 'offctx watchlist:', offctx[0].count);

// 3. New suspect sample: verified cafes with low synth_count (thin evidence base for verified mark)
const thin = await sql`SELECT id,name,area,synth_grade,synth_count,offctx_rate FROM cafes WHERE published AND synth_grade='검증' AND synth_count IS NOT NULL AND synth_count < 15 ORDER BY synth_count ASC LIMIT 15`;
console.log('=== thin-evidence verified cafes (synth_count<15) ===');
console.log(JSON.stringify(thin, null, 1));
