import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT DISTINCT status FROM decisions`;
console.log(JSON.stringify(r));
const r2 = await sql`SELECT id,title,status,tier FROM decisions WHERE status NOT IN ('done','approved') ORDER BY created_at DESC LIMIT 5`;
console.log(JSON.stringify(r2,null,1));
