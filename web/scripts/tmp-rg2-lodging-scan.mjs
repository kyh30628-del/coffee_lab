import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

// cafes whose name does NOT contain 호텔/hotel brand, but displayed synth_reviews contain lodging-stay signal words
// AND no cafe substance words in same review -> potential leaked pension/resort content
const rows = await sql`
  SELECT c.id, c.name, c.area, c.synth_grade, count(*) AS hit_count, c.synth_count
  FROM cafes c, jsonb_array_elements(c.synth_reviews) r
  WHERE c.published = true
    AND c.name !~ '호텔|리조트|콘도|풀빌라'
    AND (r->>'quote') ~ '(숙박|투숙|1박\s*2일|글램핑|펜션|연수원|바베큐\s*무한리필|단체\s*워크숍|가평숙소|가평리조트|계곡\s*물놀이)'
    AND (r->>'quote') !~ '(커피|라떼|아메리카노|에스프레소|콜드브루|디저트|케이크|베이커리|빵|원두|바리스타)'
  GROUP BY c.id, c.name, c.area, c.synth_grade, c.synth_count
  ORDER BY hit_count DESC
  LIMIT 20
`;
console.log('cafes with lodging-signal displayed reviews lacking cafe substance:', rows.length);
rows.forEach(r => console.log(`${r.id}\t${r.name}\t${r.area}\tgrade=${r.synth_grade}\thits=${r.hit_count}/${r.synth_count}`));
