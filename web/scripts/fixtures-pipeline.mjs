#!/usr/bin/env node
// 🔒 파이프라인 상태 정합성 픽스처 — published ↔ pipeline_status는 **항상 같은 뜻**이어야 한다.
//   2026-09-16 실측: 968곳이 어긋나 있었고, 그 때문에 관제·보고가 공개 수를 389곳 과다 계상했다.
//   원인은 synthStore가 published만 내리고 pipeline_status를 안 건드린 것.
//   이 픽스처는 **코드가 아니라 데이터**를 본다 — 같은 클래스의 재발을 즉시 잡기 위해서다.
//   실행: node --import tsx scripts/fixtures-pipeline.mjs
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");

const [r] = await sql`SELECT
  count(*) FILTER (WHERE published AND pipeline_status IS DISTINCT FROM 'live')::int bad_pub,
  count(*) FILTER (WHERE NOT published AND pipeline_status = 'live')::int bad_live,
  count(*) FILTER (WHERE published)::int pub,
  count(*) FILTER (WHERE pipeline_status='live')::int live
 FROM cafes`;

const fails = [];
if (r.bad_pub > 0) fails.push(`  ✗ published=true 인데 status≠live: ${r.bad_pub}곳`);
if (r.bad_live > 0) fails.push(`  ✗ status=live 인데 published=false: ${r.bad_live}곳`);
if (r.pub !== r.live) fails.push(`  ✗ 공개 수 불일치: published ${r.pub} vs live ${r.live}`);

console.log(`파이프라인 정합성: published=true ${r.pub.toLocaleString()} · pipeline_status=live ${r.live.toLocaleString()}`);
if (fails.length) {
  console.log(fails.join("\n"));
  console.log("\n→ published만 바꾸고 pipeline_status를 안 바꾼 코드 경로가 있다. 두 필드는 함께 움직여야 한다.");
  process.exit(1);
}
console.log("✅ 두 필드 완전 일치 — 어느 쪽으로 세도 같은 수가 나온다");
