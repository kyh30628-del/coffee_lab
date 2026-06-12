import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
delete process.env.ANTHROPIC_API_KEY;
const { synthAndStore } = await import("../lib/synthStore.ts");
const sql = neon(process.env.DATABASE_URL);

const flagged = await sql`
  SELECT DISTINCT cafe_id, cafe_name FROM audit_flags 
  WHERE issue = 'review_contamination' AND resolved = false AND cafe_id IS NOT NULL`;
console.log(`플래그 ${flagged.length}곳 재처리 시작`);

let fixed = 0;
for (const f of flagged) {
  try {
    const [c] = await sql`SELECT id, name, area FROM cafes WHERE id = ${f.cafe_id}`;
    if (!c) continue;
    const r = await synthAndStore({ id: c.id, name: c.name, area: c.area }, { refresh: false });
    await sql`UPDATE audit_flags SET resolved = true WHERE cafe_id = ${f.cafe_id}`;
    fixed++;
    console.log(`  ✅ ${c.name}: ${r.collected}건 → 재처리`);
  } catch(e) { console.log(`  ❌ ${f.cafe_name}: ${String(e).slice(0,40)}`); }
}
console.log(`완료: ${fixed}/${flagged.length} 재처리`);
