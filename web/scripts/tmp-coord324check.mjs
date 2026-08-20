import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.+)$/m);
const sql = neon(m[1].trim());
const c = await sql`SELECT id, status, to_team, created_at FROM coordination WHERE id IN (324,325) ORDER BY id`;
console.log('COORD:', JSON.stringify(c, null, 1));
