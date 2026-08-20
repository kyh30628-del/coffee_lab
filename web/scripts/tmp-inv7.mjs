import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const m = env.match(/DATABASE_URL=(.*)/);
const sql = neon(m[1].trim());

// duplicate synth_identity text across different cafe ids (copy-paste contamination)
const dup = await sql`
  SELECT synth_identity, count(DISTINCT id) n, array_agg(id) ids
  FROM cafes WHERE published=true AND synth_identity IS NOT NULL AND length(synth_identity) > 15
  GROUP BY synth_identity HAVING count(DISTINCT id) > 1 LIMIT 10`;
console.log('dup synth_identity:', JSON.stringify(dup));
