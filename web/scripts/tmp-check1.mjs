import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const triggers = await sql`SELECT kind, ref, detail, consumed_at FROM audit_triggers WHERE consumed_at > now() - interval '20 minutes' ORDER BY consumed_at DESC`;
console.log('TRIGGERS:', JSON.stringify(triggers));

const decisions = await sql`SELECT id, title, status, action_type, team, tier, created_at FROM decisions WHERE created_at > now() - interval '18 hours' ORDER BY id DESC LIMIT 15`;
console.log('RECENT_DECISIONS:', JSON.stringify(decisions));
