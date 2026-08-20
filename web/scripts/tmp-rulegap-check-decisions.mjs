import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='decisions' ORDER BY ordinal_position`;
console.log('cols:', cols.map(c=>c.column_name).join(','));

const rows = await sql`
  SELECT id, title, status, action_type, created_at
  FROM decisions
  WHERE title ILIKE '%펜션%' OR title ILIKE '%글램핑%' OR title ILIKE '%LODGING%' OR title ILIKE '%숙박%'
  ORDER BY created_at DESC LIMIT 10
`;
console.log(JSON.stringify(rows,null,1));

const recent = await sql`
  SELECT id, title, status, action_type, created_at
  FROM decisions
  ORDER BY created_at DESC LIMIT 8
`;
console.log('=== recent decisions ===');
console.log(JSON.stringify(recent,null,1));
