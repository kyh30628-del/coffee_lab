import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const noncafe = await sql`SELECT target_id, job, note, last_at FROM heal_attempts WHERE frozen_until > now() AND job = 'sentinel.noncafe-biz' AND (note IS NULL OR note NOT LIKE '[사람판독%') ORDER BY last_at DESC LIMIT 20`;
console.log('NONCAFE_UNREAD', noncafe.length, JSON.stringify(noncafe));
