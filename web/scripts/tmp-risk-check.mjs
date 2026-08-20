import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const [issuesOpen, coordInbox, coordOpenAll, decisionsWatch, l2pending, groundSusp, auditFlags, consoleErr] = await Promise.all([
  sql`SELECT id, severity, team, title, first_seen, now()-first_seen AS age FROM issues WHERE status='open' ORDER BY severity DESC, first_seen ASC LIMIT 50`,
  sql`SELECT id, from_team, type, topic, stage, status, created_at FROM coordination WHERE to_team ILIKE '%리스크%' OR to_team ILIKE '%경영지원%' AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 20`,
  sql`SELECT id, from_team, to_team, type, topic, stage, status, created_at FROM coordination WHERE status IN ('open','in_progress') ORDER BY created_at ASC LIMIT 30`,
  sql`SELECT id, title, status, action_type, created_at FROM decisions WHERE id IN (356,552) `,
  sql`SELECT id, title, status, created_at, now()-created_at as age FROM decisions WHERE status='approved' ORDER BY created_at ASC LIMIT 15`,
  sql`SELECT count(*) FROM cafes WHERE grounding_suspect = true`.catch(()=>null),
  sql`SELECT count(*) FROM audit_flags WHERE status='open'`.catch(()=>null),
  sql`SELECT count(*) FROM search_log WHERE ai_err IS NOT NULL AND created_at > now() - interval '24 hours'`.catch(()=>null),
]);

console.log('=== ISSUES OPEN ===');
console.table(issuesOpen);
console.log('=== COORD INBOX (risk/mgmt) ===');
console.table(coordInbox);
console.log('=== COORD OPEN ALL ===');
console.table(coordOpenAll);
console.log('=== DECISIONS 356/552 ===');
console.table(decisionsWatch);
console.log('=== APPROVED PENDING EXECUTION ===');
console.table(l2pending);
console.log('grounding suspect count', groundSusp);
console.log('audit flags open', auditFlags);
console.log('console ai_err 24h', consoleErr);
