import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.+)/);
const sql = neon(m[1].trim());

console.log('--- 1. synth_acidity/body/sweet range ---');
console.log(await sql`SELECT min(synth_acidity) mina, max(synth_acidity) maxa, min(synth_body) minb, max(synth_body) maxb, min(synth_sweet) mins, max(synth_sweet) maxs FROM cafes WHERE published=true`);

console.log('--- 2. char_scores outlier (any single key far above others, sample) ---');
console.log(await sql`
  SELECT id, name, char_scores FROM cafes
  WHERE published=true AND char_scores IS NOT NULL
    AND jsonb_typeof(char_scores)='object'
  LIMIT 3
`);

console.log('--- 3. future review_dates ---');
console.log(await sql`
  SELECT id, name, review_dates FROM cafes
  WHERE published=true AND review_dates IS NOT NULL
    AND review_dates::text ~ '202[7-9]|2030'
  LIMIT 10
`);

console.log('--- 4. duplicate synth_identity text across different cafes ---');
console.log(await sql`
  SELECT synth_identity, count(*) c, array_agg(id) ids, array_agg(name) names
  FROM cafes WHERE published=true AND synth_identity IS NOT NULL AND length(synth_identity) > 5
  GROUP BY synth_identity HAVING count(*) > 1
  ORDER BY c DESC LIMIT 10
`);

console.log('--- 5. same lat/lng, different name (co-located mismatch) ---');
console.log(await sql`
  SELECT lat, lng, count(*) c, array_agg(id) ids, array_agg(name) names
  FROM cafes WHERE published=true
  GROUP BY lat, lng HAVING count(*) > 1
  ORDER BY c DESC LIMIT 10
`);

console.log('--- 6. name looks like sentence/generic (contains 다. or 요. or length>25) ---');
console.log(await sql`
  SELECT id, name, area, dong FROM cafes
  WHERE published=true AND (name ~ '(다|요|음)\\.$' OR length(name) > 25)
  LIMIT 10
`);
