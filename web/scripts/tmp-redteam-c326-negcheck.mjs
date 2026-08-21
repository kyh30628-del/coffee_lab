import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const c326 = await sql`SELECT id, from_team, to_team, stage, status FROM coordination WHERE id=326`;
console.log('=== #326 ===', JSON.stringify(c326));

// attack hypothesis 2: verified cafes whose synth_reviews contain negative-leaning quotes (rough heuristic: low avg score in review json) but grade stayed 검증
const negs = await sql`
  SELECT id, name, area, synth_count, synth_updated
  FROM cafes
  WHERE published AND synth_grade='검증'
    AND synth_reviews::text ~ '실망|비추|별로|불친절|최악|다신|재방문 안'
  LIMIT 10`;
console.log('=== verified cafes w/ negative-leaning quote text ===');
console.log(JSON.stringify(negs, null, 1));
