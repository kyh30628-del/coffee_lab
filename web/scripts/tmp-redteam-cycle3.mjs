import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const coord = await sql`SELECT id, from_team, to_team, type, topic, stage, status, created_at FROM coordination WHERE status IN ('open','in_progress') AND (to_team ILIKE '%레드팀%' OR to_team ILIKE '%품질본부%') ORDER BY created_at DESC LIMIT 20`;
console.log('=== coordination inbox to redteam/품질본부 ===');
console.log(JSON.stringify(coord, null, 1));

const c324 = await sql`SELECT id, stage, status, resolution, resolved_at FROM coordination WHERE id=324`;
console.log('=== #324 status ===', JSON.stringify(c324, null, 1));

const af = await sql`SELECT count(*)::int c FROM audit_flags WHERE issue!='audit_complete' AND resolved=false`;
console.log('=== audit_flags unresolved ===', JSON.stringify(af));

const offctx = await sql`SELECT count(*)::int c FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false)`;
console.log('=== offctx watchlist ===', JSON.stringify(offctx));

// suspicious sample: verified cafes with low synth_count or high offctx or recently graded
const suspects = await sql`SELECT id, name, area, synth_grade, synth_count, offctx_rate, synth_updated FROM cafes WHERE published AND synth_grade='검증' AND (synth_count <= 6 OR offctx_rate >= 0.4) ORDER BY offctx_rate DESC NULLS LAST LIMIT 15`;
console.log('=== suspect verified sample ===');
console.log(JSON.stringify(suspects, null, 1));
