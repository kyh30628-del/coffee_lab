import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const r = await sql`SELECT id,title,detail,action_params FROM decisions WHERE id=788`;
console.log(JSON.stringify(r,null,2));
