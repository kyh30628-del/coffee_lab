import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

console.log('=== COORD INBOX (레드팀/품질본부/검증심사팀) ===');
const inbox = await sql`SELECT id,from_team,to_team,type,topic,detail,stage,status,created_at FROM coordination WHERE (to_team ILIKE '%레드팀%' OR to_team ILIKE '%품질본부%' OR to_team ILIKE '%검증심사%') AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 20`;
inbox.forEach(r => console.log(JSON.stringify(r)));

console.log('=== 아이엠케익 decision status ===');
const dec = await sql`SELECT id,title,action_type,status,created_at,approved_at,executed_at FROM decisions WHERE title ILIKE '%아이엠케익%' OR title ILIKE '%19936%' ORDER BY created_at DESC LIMIT 5`;
dec.forEach(r => console.log(JSON.stringify(r)));

console.log('=== 신규 표본: 비카페성 업태 의심 (검증등급, naver_category 특이) ===');
const susp = await sql`SELECT id,name,area,naver_category,synth_grade,synth_count,synth_coherence,offctx_rate FROM cafes WHERE published AND synth_grade='검증' AND (naver_category ILIKE '%스튜디오%' OR naver_category ILIKE '%공방%' OR naver_category ILIKE '%클래스%' OR naver_category ILIKE '%플라워%' OR naver_category ILIKE '%베이커리%' OR naver_category ILIKE '%전문점%') AND id != 19936 ORDER BY synth_coherence ASC LIMIT 15`;
susp.forEach(r => console.log(JSON.stringify(r)));

console.log('=== audit_flags 재확인 (혹시 새로 뜬 것) ===');
const af = await sql`SELECT id,cafe_id,issue,resolved,created_at FROM audit_flags WHERE issue != 'audit_complete' AND resolved=false ORDER BY created_at DESC LIMIT 10`;
af.forEach(r => console.log(JSON.stringify(r)));

console.log('=== offctx watchlist 재확인 ===');
const oc = await sql`SELECT id,name,area,offctx_rate FROM cafes WHERE published AND offctx_rate>=0.55 AND NOT COALESCE(offctx_ok,false) ORDER BY offctx_rate DESC LIMIT 20`;
oc.forEach(r => console.log(JSON.stringify(r)));
