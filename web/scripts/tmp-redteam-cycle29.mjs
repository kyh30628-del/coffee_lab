import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const coord = await sql`SELECT id, from_team, to_team, type, topic, stage, status, created_at, resolved_at FROM coordination WHERE id IN (324,325,326,328) ORDER BY id`;
console.log('=== coord 324/325/326/328 ===');
console.log(JSON.stringify(coord, null, 1));

const inbox = await sql`SELECT id, from_team, to_team, type, topic, stage, status, created_at FROM coordination WHERE status IN ('open','in_progress') AND (to_team ILIKE '%레드팀%' OR to_team ILIKE '%품질본부%') ORDER BY created_at DESC LIMIT 20`;
console.log('=== coordination inbox to redteam/품질본부 ===');
console.log(JSON.stringify(inbox, null, 1));

const af = await sql`SELECT count(*)::int c FROM audit_flags WHERE issue!='audit_complete' AND resolved=false`;
console.log('=== audit_flags unresolved ===', JSON.stringify(af));

const offctx = await sql`SELECT count(*)::int c FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false)`;
console.log('=== offctx watchlist ===', JSON.stringify(offctx));

// New hypothesis sample: verified cafes recently graded (last 7 days) - check for premature verification
const recentVerified = await sql`
  SELECT id, name, area, synth_grade, synth_count, offctx_rate, synth_updated
  FROM cafes
  WHERE published AND synth_grade='검증' AND synth_updated > now() - interval '7 days'
  ORDER BY synth_updated DESC
  LIMIT 15
`;
console.log('=== recently (7d) graded 검증 cafes ===');
console.log(JSON.stringify(recentVerified, null, 1));

// Hypothesis: char_scores extreme outlier (e.g. one dimension maxed at 100 while others near 0) - could signal synthesis glitch
const outlierScores = await sql`
  SELECT id, name, area, synth_grade, char_scores
  FROM cafes
  WHERE published AND synth_grade='검증'
    AND char_scores IS NOT NULL
  ORDER BY synth_updated DESC
  LIMIT 500
`;
console.log('=== fetched char_scores sample count ===', outlierScores.length);
const suspicious = outlierScores.filter(c => {
  const vals = Object.values(c.char_scores || {}).filter(v => typeof v === 'number');
  if (vals.length < 3) return false;
  const max = Math.max(...vals), min = Math.min(...vals);
  return max >= 90 && min <= 10;
});
console.log('=== char_scores extreme spread (max>=90,min<=10) ===', suspicious.length);
console.log(JSON.stringify(suspicious.slice(0,10), null, 1));
