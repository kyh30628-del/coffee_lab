import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const bm = await sql`
  SELECT count(*) AS total, count(DISTINCT device_id) AS distinct_dev,
    min(created_at) AS earliest, max(created_at) AS latest
  FROM bookmarks WHERE created_at >= now() - interval '7 days'`;
console.log('BOOKMARKS_7D:', JSON.stringify(bm));

const sample = await sql`SELECT device_id, cafe_id, created_at FROM bookmarks ORDER BY created_at DESC LIMIT 5`;
console.log('BM_SAMPLE:', JSON.stringify(sample));

// check taste_logs total recent - already known no anon link, but check volume/dates to confirm still just old test data or ongoing
const tl = await sql`SELECT count(*) AS total, min(created_at) AS earliest, max(created_at) AS latest FROM taste_logs`;
console.log('TASTE_LOGS_ALL:', JSON.stringify(tl));
