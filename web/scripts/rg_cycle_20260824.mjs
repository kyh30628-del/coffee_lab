import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// coordination inbox for redteam
const coord = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,created_at FROM coordination WHERE (to_team ILIKE '%레드팀%' OR to_team ILIKE '%redteam%') AND status IN ('open','in_progress') ORDER BY id DESC`;
console.log('=== coordination inbox (to redteam, open) ===');
console.log(JSON.stringify(coord,null,1));

const auditCount = await sql`SELECT count(*)::int c FROM audit_flags WHERE issue!='audit_complete' AND resolved=false`;
console.log('audit_flags unresolved:', auditCount[0].c);

const offctxCount = await sql`SELECT count(*)::int c FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false)`;
console.log('offctx watchlist:', offctxCount[0].c);

// grounding-suspect sample among VERIFIED cafes, low synth_count first (attack hypothesis #2: grade inflation)
const lowCount = await sql`
  SELECT id, name, area, synth_grade, synth_count, synth_updated, synth_coherence
  FROM cafes
  WHERE published AND synth_grade='verified' AND synth_count IS NOT NULL
  ORDER BY synth_count ASC NULLS LAST
  LIMIT 15
`;
console.log('=== verified cafes, lowest synth_count ===');
console.log(JSON.stringify(lowCount,null,1));

// grounding suspects (108 per digest) — audit_checked_at null or low coherence proxy
const lowCoh = await sql`
  SELECT id, name, area, synth_grade, synth_count, synth_coherence
  FROM cafes
  WHERE published AND synth_grade='verified' AND synth_coherence IS NOT NULL
  ORDER BY synth_coherence ASC
  LIMIT 15
`;
console.log('=== verified cafes, lowest synth_coherence ===');
console.log(JSON.stringify(lowCoh,null,1));
