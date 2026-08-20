import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const ex = await sql`SELECT id,title,action_type,action_params,status,result FROM decisions WHERE action_type IN ('purge_contam_reviews','unpublish','downgrade') ORDER BY created_at DESC LIMIT 6`;
console.log(JSON.stringify(ex,null,1));
