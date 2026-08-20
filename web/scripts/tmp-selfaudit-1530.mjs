import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());

const triggers = await sql`SELECT kind, ref, detail, consumed_at FROM audit_triggers WHERE consumed_at > now() - interval '20 minutes' ORDER BY consumed_at DESC`;
console.log('=== TRIGGERS (20min) ===');
console.log(JSON.stringify(triggers, null, 1));

// baseline drift check vs prior 11:30 report numbers: public 13508/verified 6440 -> now digest says 13514/6436
const counts = await sql`SELECT count(*) FILTER (WHERE published) AS published, count(*) FILTER (WHERE published AND grade IN ('검증')) AS verified FROM cafes`;
console.log('=== COUNTS ===', JSON.stringify(counts));

// closure suspects detail (3 count from cron-selfaudit)
const closures = await sql`SELECT id, name, closure_misses, last_visit_evidence_at FROM cafes WHERE closure_misses >= 3 AND published = true ORDER BY closure_misses DESC LIMIT 10`;
console.log('=== CLOSURE SUSPECTS ===', JSON.stringify(closures, null, 1));

// decisions L3 pending check
const l3 = await sql`SELECT id, title, status, tier, created_at FROM decisions WHERE tier='L3' AND status='pending' ORDER BY created_at DESC LIMIT 10`;
console.log('=== L3 PENDING ===', JSON.stringify(l3, null, 1));
