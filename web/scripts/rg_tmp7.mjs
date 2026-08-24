import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// search across published cafes' synth_reviews for recurring meetup-notice pattern
const rows = await sql`
  SELECT id, name, area
  FROM cafes
  WHERE published = true
    AND synth_reviews::text ~ '정모\\s*안내|정기모임\\s*안내|번개모임|모임\\s*공지'
  LIMIT 20
`;
console.log(JSON.stringify(rows, null, 1));
