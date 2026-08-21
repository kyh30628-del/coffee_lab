import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const dbUrl = env.match(/DATABASE_URL=(.+)/)[1].trim();
const sql = neon(dbUrl);

const grades = await sql`SELECT synth_grade, count(*) FROM cafes WHERE published=true GROUP BY synth_grade ORDER BY 2 DESC`;
console.log('=== grades ===', JSON.stringify(grades));

// H4: verified grade but low raw rating (trust mismatch)
const lowRatingVerified = await sql`
  SELECT id, name, area, synth_grade, rating, rating_count, synth_count
  FROM cafes
  WHERE published=true AND synth_grade='검증' AND rating IS NOT NULL AND rating < 3.5 AND rating_count >= 10
  ORDER BY rating ASC
  LIMIT 15
`;
console.log('=== H4 verified but low raw rating (<3.5, n>=10) ===', lowRatingVerified.length);
console.log(JSON.stringify(lowRatingVerified, null, 1));

// H5: char_scores all-zero despite verified grade and decent synth_count
const zeroChar = await sql`
  SELECT id, name, area, synth_grade, synth_count, char_scores
  FROM cafes
  WHERE published=true AND synth_grade='검증' AND synth_count >= 8
    AND char_scores IS NOT NULL
    AND (char_scores->>'mood')::int = 0 AND (char_scores->>'work')::int = 0
    AND (char_scores->>'quiet')::int = 0 AND (char_scores->>'roast')::int = 0
    AND (char_scores->>'space')::int = 0 AND (char_scores->>'dessert')::int = 0
  LIMIT 15
`;
console.log('=== H5 all-zero char_scores despite verified+synth_count>=8 ===', zeroChar.length);
console.log(JSON.stringify(zeroChar, null, 1));
