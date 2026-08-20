import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const [aiErr48h, lastJudged, judgedRecent24h, needsLlmTotal, needsLlmStale7d, verifiedCount, dec490, dec784, coordL2, hposts] = await Promise.all([
  sql`SELECT count(*) FILTER (WHERE ai_err IS NOT NULL) errs, count(*) total FROM search_log WHERE ts > now() - interval '48 hours'`,
  sql`SELECT max(llm_judged_at) FROM cafes`,
  sql`SELECT count(*) FROM cafes WHERE llm_judged_at > now() - interval '24 hours'`,
  sql`SELECT count(*) FROM cafes WHERE needs_llm = true`.catch(e=>e.message),
  sql`SELECT count(*) FROM cafes WHERE needs_llm = true AND (llm_judged_at IS NULL OR llm_judged_at < now() - interval '7 days')`.catch(e=>e.message),
  sql`SELECT count(*) FROM cafes WHERE published = true AND grade='검증'`.catch(e=>e.message),
  sql`SELECT id, status, title FROM decisions WHERE id=490`,
  sql`SELECT id, status, title, action_type FROM decisions WHERE id=784`,
  sql`SELECT count(*) FROM decisions WHERE status='approved'`,
  sql`SELECT count(*) FROM decisions WHERE status='approved' AND created_at < now() - interval '7 days'`,
]);
console.log({aiErr48h, lastJudged, judgedRecent24h, needsLlmTotal, needsLlmStale7d, verifiedCount, dec490, dec784, coordL2, hposts});
