import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const names = ["산노루 삼성점","콰이어트앤콰이트","주기율","드와","카페 레이어프로젝트"];
for (const n of names) {
  const rows = await sql`SELECT id, name, synth_grade, char_scores FROM cafes WHERE name = ${n} AND area = '강남구' LIMIT 1`;
  console.log(n, JSON.stringify(rows[0]?.char_scores), rows[0]?.synth_grade);
}
