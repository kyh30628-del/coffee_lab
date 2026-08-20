import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const inbox = await sql`
  SELECT id, from_team, to_team, type, topic, stage, status, created_at
  FROM coordination
  WHERE to_team ILIKE '%룰갭%'
  ORDER BY created_at DESC
  LIMIT 10
`;
console.log('=== MY TEAM INBOX (룰갭) ===');
console.log(JSON.stringify(inbox, null, 1));

const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='agent_runs'`;
console.log('=== agent_runs cols ===', cols.map(c=>c.column_name));
