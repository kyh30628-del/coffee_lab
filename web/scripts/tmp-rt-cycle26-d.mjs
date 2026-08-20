import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(url);

const types = await sql`SELECT DISTINCT action_type FROM decisions WHERE action_type IS NOT NULL ORDER BY 1`;
console.log('=== action_type distinct values ===');
console.log(types.map(t=>t.action_type).join(', '));

// recent unpublish/downgrade examples with action_params shape
const ex = await sql`SELECT id,title,action_type,action_params,status FROM decisions WHERE action_type IN ('unpublish_cafe','downgrade_grade','set_published') ORDER BY created_at DESC LIMIT 5`;
console.log('=== examples ===');
console.log(JSON.stringify(ex,null,1));

// id13615 current status
const c2 = await sql`SELECT id,name,synth_grade,synth_count,synth_updated,published FROM cafes WHERE id=13615`;
console.log('=== id13615 current ===', JSON.stringify(c2));
