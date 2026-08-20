import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='cafes' ORDER BY ordinal_position`;
console.log('cafes cols:', cols.map(c=>c.column_name).join(','));

const dups = await sql`
  SELECT name, count(*) c, array_agg(id) ids, array_agg(DISTINCT area) areas
  FROM cafes
  WHERE published = true
  GROUP BY name
  HAVING count(*) > 1 AND count(DISTINCT area) > 1
  ORDER BY c DESC
  LIMIT 25
`;
console.log('=== dup names, diff areas ===');
console.log(JSON.stringify(dups, null, 1));
