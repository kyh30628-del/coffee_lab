import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = neon(url);
const trig = await sql`SELECT kind, ref, detail, consumed_at FROM audit_triggers WHERE consumed_at > now() - interval '20 minutes' ORDER BY consumed_at DESC`;
console.log('TRIGGERS:', JSON.stringify(trig));
