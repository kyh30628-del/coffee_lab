import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const [coordStrategy, decisionsWatch, verifiedTrend, subs, coordAllOpen] = await Promise.all([
  sql`SELECT id, from_team, to_team, type, topic, status, stage, created_at, now()-created_at AS age FROM coordination WHERE to_team ILIKE '%전략%' AND status IN ('open','in_progress') ORDER BY created_at`,
  sql`SELECT id, title, status, action_type, created_at, now()-created_at AS age FROM decisions WHERE id IN (356,490,552,699,742,776,777,782,783,784,786) ORDER BY id`,
  sql`SELECT count(*) FILTER (WHERE published AND synth_grade='verified') AS verified, count(*) FILTER (WHERE published) AS pub FROM cafes`,
  sql`SELECT status, count(*) FROM subscriptions GROUP BY status`.catch(e=>({error:e.message})),
  sql`SELECT id, from_team, to_team, type, topic, stage, status, created_at FROM coordination WHERE status IN ('open','in_progress') ORDER BY created_at ASC LIMIT 30`,
]);

console.log('=== coordination to 전략 (open) ==='); console.table(coordStrategy);
console.log('=== decisions watch ==='); console.table(decisionsWatch);
console.log('=== verified trend ==='); console.table(verifiedTrend);
console.log('=== subscriptions ==='); console.table(subs);
console.log('=== coordination all open ==='); console.table(coordAllOpen);
