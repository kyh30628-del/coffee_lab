import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.+)/);
const sql = neon(m[1].trim());

console.log('--- A. 검증등급인데 실제 네이버 평점 낮음(<3.5, rating_count>=10) ---');
console.log(await sql`
  SELECT id, name, area, synth_grade, rating, rating_count, synth_count
  FROM cafes WHERE published=true AND synth_grade='검증' AND rating IS NOT NULL AND rating < 3.5 AND rating_count >= 10
  ORDER BY rating ASC LIMIT 10
`);

console.log('--- B. char_scores 단일축 극단치(최대축/synth_count 비율 top) ---');
console.log(await sql`
  SELECT id, name, synth_count,
    (SELECT max(v::int) FROM jsonb_each_text(char_scores) AS x(k,v)) AS maxaxis
  FROM cafes WHERE published=true AND char_scores IS NOT NULL AND synth_count IS NOT NULL AND synth_count > 0
  ORDER BY (SELECT max(v::int) FROM jsonb_each_text(char_scores) AS x(k,v))::float / synth_count DESC
  LIMIT 10
`);

console.log('--- C. reputation_note 비어있지 않은 샘플 ---');
console.log(await sql`
  SELECT id, name, reputation_note FROM cafes
  WHERE reputation_note IS NOT NULL AND length(reputation_note) > 0
  LIMIT 10
`);
