import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT kind, ref, detail, consumed_at FROM audit_triggers WHERE consumed_at > now() - interval '20 minutes' ORDER BY consumed_at DESC`;
console.log(JSON.stringify(rows, null, 2));
