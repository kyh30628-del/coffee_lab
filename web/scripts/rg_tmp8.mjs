import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  SELECT id, name, area
  FROM cafes
  WHERE published = true
    AND (synth_reviews::text ~ '정모\\s*안내|정기모임|번개모임|모임\\s*공지|모임\\s*안내|스터디\\s*모임\\s*안내|소모임\\s*안내'
      OR raw_reviews::text ~ '정모\\s*안내|정기모임\\s*안내|번개모임|모임\\s*공지|소모임\\s*안내')
  LIMIT 30
`;
console.log(JSON.stringify(rows, null, 1));
