import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const jobs = await sql`SELECT DISTINCT job FROM heal_attempts WHERE frozen_until > now()`;
console.log('JOBS', JSON.stringify(jobs));
const noncafe = await sql`SELECT id, cafe_id, job, note, created_at FROM heal_attempts WHERE frozen_until > now() AND job ILIKE '%noncafe%' AND (note IS NULL OR note NOT LIKE '[사람판독%') LIMIT 20`;
console.log('NONCAFE_UNREAD', JSON.stringify(noncafe));
