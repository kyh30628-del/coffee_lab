import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

// functional usage this week: taste_logs, bookmarks tied to non-internal anon (best-effort join if anon_id exists on those tables)
const cols = await sql`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_name IN ('taste_logs','bookmarks') ORDER BY table_name, ordinal_position`;
console.log('COLS:', JSON.stringify(cols));
