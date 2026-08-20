import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);
const rows = await sql`SELECT id, topic, detail, status, resolution, resolved_at FROM coordination WHERE id = 319`;
console.log(JSON.stringify(rows, null, 2));
