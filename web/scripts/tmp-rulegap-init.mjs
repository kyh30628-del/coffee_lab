import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);

const inbox = await sql`
  SELECT id, from_team, to_team, type, topic, detail, stage, status, created_at
  FROM coordination
  WHERE status IN ('open','in_progress')
    AND (to_team ILIKE '%룰갭%' OR to_team ILIKE '%rulegap%' OR to_team ILIKE '%품질본부%' OR to_team ILIKE '%리뷰품질%')
  ORDER BY created_at DESC
  LIMIT 20
`;
console.log('=== INBOX ===');
console.log(JSON.stringify(inbox, null, 1));

const runs = await sql`
  SELECT job, status, started_at, finished_at
  FROM agent_runs
  WHERE job ILIKE '%rulegap%'
  ORDER BY started_at DESC
  LIMIT 5
`;
console.log('=== RULEGAP RUNS ===');
console.log(JSON.stringify(runs, null, 1));
