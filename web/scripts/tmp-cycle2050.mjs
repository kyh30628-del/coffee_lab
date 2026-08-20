import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = neon(m[1].trim());
const trig = await sql`SELECT kind, ref, detail, consumed_at FROM audit_triggers WHERE consumed_at > now() - interval '20 minutes' ORDER BY consumed_at DESC`;
console.log('TRIGGERS:', JSON.stringify(trig, null, 1));
const closureMiss = await sql`SELECT id, name, closure_misses, updated_at FROM cafes WHERE closure_misses >= 3 ORDER BY closure_misses DESC LIMIT 10`;
console.log('CLOSURE_MISSES:', JSON.stringify(closureMiss, null, 1));
