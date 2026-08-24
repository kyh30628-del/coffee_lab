import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

// high offctx_rate published cafes, excluding recently examined names from proposals
const rows = await sql`
  SELECT id, name, area, offctx_rate, synth_count, naver_category, synth_grade
  FROM cafes
  WHERE published = true AND offctx_rate IS NOT NULL AND offctx_rate > 0.15
  ORDER BY offctx_rate DESC
  LIMIT 25
`;
console.log(JSON.stringify(rows, null, 1));
