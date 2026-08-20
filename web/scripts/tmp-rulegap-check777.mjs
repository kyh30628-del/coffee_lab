import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT id,title,detail,team,severity,action_type,action_params,status,recommendation FROM decisions WHERE id IN (777,651,650)`;
console.log(JSON.stringify(r,null,2));
