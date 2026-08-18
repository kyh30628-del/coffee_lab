import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

// cafe names ending in generic Korean abstract nouns commonly used mid-sentence
const words = ['재미','여유','쉼','온기','소풍','낭만','행복','설렘','휴식','풍경','기억','하루'];
const pattern = words.join('|');
const rows = await sql`
  SELECT id, name, area, offctx_rate, synth_count, published
  FROM cafes
  WHERE published = true
    AND name ~ ${pattern}
    AND offctx_rate > 0.08
  ORDER BY offctx_rate DESC
  LIMIT 20
`;
console.log(JSON.stringify(rows, null, 1));
