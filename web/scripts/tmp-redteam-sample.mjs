import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

// near-watchlist offctx (didn't cross 0.55 but still elevated) among verified cafes
const near = await sql`SELECT id, name, area, offctx_rate, synth_count FROM cafes WHERE published AND synth_grade='검증' AND offctx_rate BETWEEN 0.35 AND 0.549 ORDER BY offctx_rate DESC LIMIT 10`;
console.log('NEAR_WATCHLIST_VERIFIED:', JSON.stringify(near));

// generic/short name verified cafes (identity collapse risk)
const generic = await sql`SELECT id, name, area, synth_identity, synth_count FROM cafes WHERE published AND synth_grade='검증' AND (name ~ '^카페\\s*[가-힣0-9]{0,2}$' OR length(name) <= 3) ORDER BY synth_count ASC LIMIT 10`;
console.log('GENERIC_NAME_VERIFIED:', JSON.stringify(generic));

// recently promoted/resynthed verified cafes (freshness check for fresh hallucination risk)
const recent = await sql`SELECT id, name, area, synth_identity, synth_count, synth_updated FROM cafes WHERE published AND synth_grade='검증' AND synth_updated > now() - interval '72 hours' ORDER BY synth_updated DESC LIMIT 10`;
console.log('RECENTLY_RESYNTHED_VERIFIED:', JSON.stringify(recent));

// venue/mall token names still verified (known contamination pattern)
const venue = await sql`SELECT id, name, area, synth_identity, offctx_rate FROM cafes WHERE published AND synth_grade='검증' AND (name ~ '몰|타운|스퀘어|플라자|아울렛|점\\s*$') ORDER BY offctx_rate DESC NULLS LAST LIMIT 10`;
console.log('VENUE_TOKEN_VERIFIED:', JSON.stringify(venue));
