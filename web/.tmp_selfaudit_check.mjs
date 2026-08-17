import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const sql = neon(process.env.DATABASE_URL);

const triggers = await sql`SELECT kind, ref, detail, consumed_at FROM audit_triggers WHERE consumed_at > now() - interval '20 minutes' ORDER BY consumed_at DESC`;
console.log('TRIGGERS:', JSON.stringify(triggers, null, 1));
const now = await sql`SELECT now() as t`;
console.log('NOW:', now[0].t);

const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='audit_triggers' ORDER BY ordinal_position`;
console.log('COLS:', cols.map(c=>c.column_name).join(','));
const recent = await sql`SELECT kind, ref, detail, created_at, consumed_at FROM audit_triggers WHERE kind='heal_stuck' ORDER BY created_at DESC LIMIT 6`;
console.log('RECENT heal_stuck:', JSON.stringify(recent, null, 1));
const selfauditRuns = await sql`SELECT ran_at, ok, detail FROM agent_runs WHERE job='cron-selfaudit'`;
console.log('cron-selfaudit latest row:', JSON.stringify(selfauditRuns, null, 1));
const ledgerRows = await sql`SELECT job, fingerprint, started_at, metrics FROM run_ledger WHERE job LIKE 'cron-sentinel%' ORDER BY started_at DESC LIMIT 8`;
console.log('run_ledger sentinel:', JSON.stringify(ledgerRows, null, 1));

const aw = await sql`SELECT ran_at, ok FROM agent_runs WHERE job='audit-watch'`;
console.log('audit-watch latest row:', JSON.stringify(aw));

const coordCols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='coordination' ORDER BY ordinal_position`;
console.log('COORD COLS:', coordCols.map(c=>c.column_name).join(','));
const dup = await sql`SELECT id, title, status, created_at FROM coordination WHERE title ILIKE '%audit-watch%' OR title ILIKE '%plist%' OR detail ILIKE '%StartCalendarInterval%' OR detail ILIKE '%audit-watch%' ORDER BY created_at DESC LIMIT 5`;
console.log('DUP CHECK:', JSON.stringify(dup, null, 1));
