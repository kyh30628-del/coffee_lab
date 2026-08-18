import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

console.log('=== 비카페성 업태 의심 (검증등급) ===');
const susp = await sql`SELECT id,name,area,naver_category,synth_count,synth_coherence,offctx_rate FROM cafes WHERE published AND synth_grade='검증' AND (naver_category ILIKE '%스튜디오%' OR naver_category ILIKE '%공방%' OR naver_category ILIKE '%클래스%' OR naver_category ILIKE '%플라워%') AND id != 19936 ORDER BY synth_coherence ASC LIMIT 15`;
susp.forEach(r => console.log(JSON.stringify(r)));
console.log('count:', susp.length);
