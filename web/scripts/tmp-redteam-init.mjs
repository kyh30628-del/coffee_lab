import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const coord = await sql`SELECT id, from_team, to_team, type, topic, stage, status, created_at FROM coordination WHERE status IN ('open','in_progress') AND (to_team ILIKE '%레드팀%' OR to_team ILIKE '%품질본부%' OR to_team ILIKE '%redteam%') ORDER BY created_at DESC LIMIT 20`;
console.log('COORD_INBOX:', JSON.stringify(coord));

const af = await sql`SELECT count(*)::int as n FROM audit_flags WHERE issue!='audit_complete' AND resolved=false`;
console.log('AUDIT_FLAGS_UNRESOLVED:', JSON.stringify(af));

const offctx = await sql`SELECT id, name, area, offctx_rate FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false) ORDER BY offctx_rate DESC LIMIT 20`;
console.log('OFFCTX_WATCHLIST:', JSON.stringify(offctx));

const d750 = await sql`SELECT id, title, status, action_type, created_at FROM decisions WHERE id=750`;
console.log('DECISION_750:', JSON.stringify(d750));

const mine = await sql`SELECT id, title, status, created_at FROM decisions WHERE title ILIKE '%검증%' OR title ILIKE '%레드팀%' OR title ILIKE '%nameCoherence%' ORDER BY created_at DESC LIMIT 10`;
console.log('RELATED_DECISIONS:', JSON.stringify(mine));

// sample verified cafes with low synth_count for scrutiny
const lowcount = await sql`SELECT id, name, area, synth_grade, synth_count, offctx_rate FROM cafes WHERE published AND synth_grade='검증' AND synth_count IS NOT NULL AND synth_count <= 6 ORDER BY synth_count ASC LIMIT 15`;
console.log('LOW_SYNTH_COUNT_VERIFIED:', JSON.stringify(lowcount));

// negative-sentiment verified cafes (char_scores low avg or recent_ratio low)
const negrecent = await sql`SELECT id, name, area, synth_count, recent_ratio FROM cafes WHERE published AND synth_grade='검증' AND recent_ratio IS NOT NULL AND recent_ratio < 0.4 ORDER BY recent_ratio ASC LIMIT 10`;
console.log('NEGATIVE_RECENT_RATIO_VERIFIED:', JSON.stringify(negrecent));
