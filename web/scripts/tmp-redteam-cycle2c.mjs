import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const [coord, auditFlags, offctx, lowCountVerified, negReview] = await Promise.all([
  sql`SELECT id,from_team,to_team,type,topic,detail,stage,status FROM coordination WHERE (to_team ILIKE '%레드팀%' OR to_team ILIKE '%품질%') AND status IN ('open','in_progress') ORDER BY id DESC LIMIT 20`,
  sql`SELECT id,cafe_id,cafe_name,issue,resolved FROM audit_flags WHERE issue != 'audit_complete' AND resolved=false LIMIT 20`,
  sql`SELECT id,name,area,offctx_rate FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false) ORDER BY offctx_rate DESC LIMIT 20`,
  sql`SELECT id,name,area,synth_count,synth_updated FROM cafes WHERE published AND synth_grade='verified' AND synth_count IS NOT NULL AND synth_count <= 3 ORDER BY synth_updated DESC LIMIT 15`,
  sql`SELECT id,name,area,rating,rating_count,synth_grade,synth_updated FROM cafes WHERE published AND synth_grade='verified' AND rating IS NOT NULL AND rating < 3.7 ORDER BY rating ASC LIMIT 15`
]);
console.log('COORD', JSON.stringify(coord));
console.log('AUDITFLAGS', JSON.stringify(auditFlags));
console.log('OFFCTX', JSON.stringify(offctx));
console.log('LOWCOUNT_VERIFIED', JSON.stringify(lowCountVerified));
console.log('NEGRATING_VERIFIED', JSON.stringify(negReview));
