// 전 공개 카페에 프랜차이즈·비카페 게이트를 재적용 → 통과 못하면 비공개(rejected). 이름·저장카테고리 기반(쿼터 불필요).
// 차덕분 등 카테고리 비어있어 못 거른 건은 dong-backfill(카테고리 재수집)에서 추가로 잡힘.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { isFranchise, isNonCafe } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");

await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS naver_category TEXT`.catch(() => {});
const cafes = await sql`SELECT id, name, naver_category FROM cafes WHERE published = true`;
let franch = 0, noncafe = 0;
const fNames = [], nNames = [];
for (const c of cafes) {
  if (isFranchise(c.name)) {
    await sql`UPDATE cafes SET published = false, pipeline_status = 'rejected' WHERE id = ${c.id}`;
    franch++; if (fNames.length < 10) fNames.push(c.name);
  } else if (isNonCafe(c.name, c.naver_category || "")) {
    await sql`UPDATE cafes SET published = false, pipeline_status = 'rejected' WHERE id = ${c.id}`;
    noncafe++; if (nNames.length < 10) nNames.push(c.name);
  }
}
const left = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published = true`)[0].n;
console.log(`재필터 완료 — 검사 ${cafes.length}곳`);
console.log(`프랜차이즈 비공개: ${franch}곳 (${fNames.join(", ")}${franch > 10 ? " 외" : ""})`);
console.log(`비카페 비공개: ${noncafe}곳 (${nNames.join(", ")}${noncafe > 10 ? " 외" : ""})`);
console.log(`남은 공개 카페: ${left.toLocaleString()}`);
process.exit(0);
