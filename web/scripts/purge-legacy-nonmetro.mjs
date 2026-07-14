// 협업#192→#198 후속(결재#369): lib/discover.ts 수도권 박스 필터(커밋 132178e)는 이미 06-26부터 정상 동작 중
// (신규 오염 0건 확인됨). 잔존 문제는 그 수정 이전(06-06~06-26)에 적재된 레거시 217건 — area 태그는 있으나
// 실제 좌표가 수도권 박스 밖(완전 비수도권: 부산·광주·울산·전남·충북 등), 전량 published=false(라이브 위험 0).
// 정합성조사팀 소관 purge류 스크립트(purge-contam-reviews.mjs 관행)로 일괄 삭제한다 — 결정론·published=false만 대상.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { loadCriteria, getCriterionSync } = await import("../lib/criteria.ts");

await loadCriteria(); // 수도권 좌표박스 기준(단일출처 criteria.ts, 폴백=36.8~38.3/124.5~127.9)
const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");

const targets = await sql`
  SELECT id, name, area
  FROM cafes
  WHERE published = false
    AND area IS NOT NULL
    AND lat IS NOT NULL AND lng IS NOT NULL
    AND NOT (lat BETWEEN ${latMin} AND ${latMax} AND lng BETWEEN ${lngMin} AND ${lngMax})`;

console.log(`대상 ${targets.length}건(레거시 비수도권, published=false, area 태그 있음)`);
if (!targets.length) { console.log("정리할 레거시 오염 없음 — 종료"); process.exit(0); }

const byArea = new Map();
for (const t of targets) byArea.set(t.area, (byArea.get(t.area) || 0) + 1);
console.log([...byArea.entries()].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a}${n}`).join(" · "));

const ids = targets.map((t) => t.id);
const res = await sql`DELETE FROM cafes WHERE id = ANY(${ids}) AND published = false RETURNING id`;
// 전량 published=false → 공개상태 무변, 전 캐시 레이어 무효화 불요(CLAUDE.md §2-5는 공개상태 변경 시에만 적용).
await sql`DELETE FROM search_cache`.catch(() => {});
console.log(`완료 — ${res.length}건 삭제(대상 ${targets.length}건 중)`);
process.exit(0);
