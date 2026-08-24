import { neon } from "@neondatabase/serverless";
import { readFileSync } from "fs";
for (const l of readFileSync(".env.local","utf8").split("\n")) { const m=l.match(/^([A-Z_0-9]+)=(.*)$/); if(m) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const sql = neon(process.env.DATABASE_URL);

const names = ["fyi","인포메이션카페","셀렉티드닉스","맷카페","테라로사 포스코센터점","테라로사 역삼역점","주기율","드와","카페 레이어프로젝트"];
for (const n of names) {
  const rows = await sql`SELECT id, name, area, synth_grade, char_scores FROM cafes WHERE name = ${n} ORDER BY id LIMIT 3`;
  for (const r of rows) console.log(r.id, r.name, '|area=',r.area, '|grade=',r.synth_grade, JSON.stringify(r.char_scores));
}
