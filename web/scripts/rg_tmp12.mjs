import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// structural notice pattern: "일시 :" and "장소 :" co-occurring, from community board source, in DISPLAYED reviews
const rows = await sql`
  SELECT id, name, area, offctx_rate, offctx_ok, synth_grade
  FROM cafes
  WHERE published = true
    AND synth_reviews::text ~ '일시\\s*:.*장소\\s*:|장소\\s*:.*일시\\s*:'
  LIMIT 30
`;
console.log('structural notice hits (displayed):', JSON.stringify(rows, null, 1));
