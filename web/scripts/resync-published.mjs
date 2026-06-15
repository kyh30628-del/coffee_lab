// 수정된 게이트로 공개 상태 재동기화 — 잘못 내린 진짜 카페 복구 + 비카페/프랜차이즈 비공개.
// 대상: 등급(검증·참고) 받은 카페 중 live/rejected (held·noise·new·pending은 건드리지 않음). 좌표 유효.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { isFranchise, isNonCafe } = await import("../lib/discover.ts");
const { sql } = await import("../lib/db.ts");

const cafes = await sql`SELECT id, name, naver_category FROM cafes
  WHERE synth_grade IN ('검증','참고')
    AND pipeline_status IN ('live','rejected')
    AND lat IS NOT NULL AND lat BETWEEN 36.8 AND 38.3 AND lng BETWEEN 124.5 AND 127.9`;
let pub = 0, rej = 0;
const rejNames = [];
for (const c of cafes) {
  const bad = isFranchise(c.name) || isNonCafe(c.name, c.naver_category || "");
  if (bad) {
    await sql`UPDATE cafes SET published = false, pipeline_status = 'rejected' WHERE id = ${c.id} AND published = true`;
    rej++; if (rejNames.length < 15) rejNames.push(c.name);
  } else {
    await sql`UPDATE cafes SET published = true, pipeline_status = 'live' WHERE id = ${c.id} AND published = false`;
    pub++;
  }
}
const total = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published`)[0].n;
console.log(`재동기화 완료 — 검사 ${cafes.length}곳`);
console.log(`복구(재공개): ${pub}곳 · 비공개(비카페/프랜차이즈): ${rej}곳`);
console.log(`비공개 예시: ${rejNames.join(", ")}`);
console.log(`현재 공개 카페: ${total.toLocaleString()}`);
process.exit(0);
