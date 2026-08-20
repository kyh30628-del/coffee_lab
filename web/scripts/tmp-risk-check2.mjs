import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const [ages, sentinelDec, resynthPending, decisionsRecent, closureBacklog, ruleGapPending] = await Promise.all([
  sql`SELECT id, title, extract(epoch from (now()-first_seen))/3600 as age_h FROM issues WHERE status='open'`,
  sql`SELECT id, title, status, created_at FROM decisions WHERE title ILIKE '%sentinel%' OR title ILIKE '%컬럼 예산%' ORDER BY id DESC LIMIT 5`,
  sql`SELECT count(*) FROM cafes WHERE synth_updated IS NULL AND is_public=true`.catch(e=>e.message),
  sql`SELECT id, title, status, action_type, created_at FROM decisions ORDER BY id DESC LIMIT 8`,
  sql`SELECT count(*) FROM closure_checks WHERE misses>=3`.catch(e=>e.message),
  sql`SELECT count(*) FROM decisions WHERE status='pending'`,
]);
console.log('=== issue ages (h) ===');
console.table(ages);
console.log('=== sentinel-related decisions ===');
console.table(sentinelDec);
console.log('resynth pending (public, synth_updated null):', resynthPending);
console.log('=== recent decisions ===');
console.table(decisionsRecent);
console.log('closure backlog:', closureBacklog);
console.log('pending decisions count:', ruleGapPending);
