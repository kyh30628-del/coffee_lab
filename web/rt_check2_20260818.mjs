import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='decisions' ORDER BY ordinal_position`;
console.log("decisions cols:", cols.map(c=>c.column_name).join(','));

const c319 = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,accepted_at,resolved_at,created_at FROM coordination WHERE id=319`;
console.log("=== c319 ===", JSON.stringify(c319, null, 1));

const c320 = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,accepted_at,resolved_at,resolution,created_at FROM coordination WHERE id=320`;
console.log("=== c320 ===", JSON.stringify(c320, null, 1));
