import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const checked = [6478,10125,9690,1995,18775,2102,18724,4263,9634,1316,7265,18246];

// Candidate 1: high offctx_rate public cafes not yet checked
const top = await sql`
  SELECT id, name, offctx_rate, synth_count, synth_coherence
  FROM cafes
  WHERE published = true AND offctx_rate > 0.15
  AND NOT (id = ANY(${checked}))
  ORDER BY offctx_rate DESC
  LIMIT 25
`;
console.log("=== TOP offctx_rate (unchecked) ===");
console.log(JSON.stringify(top, null, 1));

// Candidate 2: generic combo-venue name patterns
const patterns = ['%런드리카페%','%만화카페%','%보드게임카페%','%즉석사진%','%인생네컷%','%셀프사진관%','%스터디카페%'];
for (const p of patterns) {
  const rows = await sql`
    SELECT id, name, offctx_rate, published, synth_count
    FROM cafes WHERE name ILIKE ${p} AND published = true
    ORDER BY offctx_rate DESC NULLS LAST LIMIT 5
  `;
  if (rows.length) {
    console.log(`=== pattern ${p} (${rows.length}) ===`);
    console.log(JSON.stringify(rows, null, 1));
  }
}
