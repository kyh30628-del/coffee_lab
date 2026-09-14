#!/usr/bin/env node
// 🔎 시설 패싯 일괄 적재(2026-09-14) — 검색이 '주차·콘센트·단체…'로 걸리려면 기존 공개 카페에도 facets가 있어야 한다.
//   재합성이 채우면 하루 1,200곳 × 22일이라 너무 느리다. 저장된 인용문(synth_reviews_all)으로 1회 계산한다.
//   비용: 인용문만 뽑아 읽고(카페당 ~6KB) 작은 text[] 1개 UPDATE. 500곳씩 끊어 처리, 새 API 호출 0.
//   ⚠️ 화면 하이라이트와 **같은 사전·같은 임계**(9%+·최소3건·부정어 가드)라 표시와 검색이 어긋나지 않는다.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { extractFacets } = await import("../lib/cafeProfile.ts");
const sql = neon(process.env.DATABASE_URL);
const BATCH = 500;
const FORCE = process.argv.includes("--force");   // 사전·임계가 바뀌면 이미 채운 것도 다시 계산해야 한다
let cursor = 0, done = 0, withFacets = 0;
for (;;) {
  const rows = await sql`SELECT id, jsonb_path_query_array(COALESCE(synth_reviews_all, synth_reviews, '[]'::jsonb), '$[*].quote') AS quotes
    FROM cafes WHERE published = true AND (${FORCE} OR facets IS NULL) AND id > ${cursor} ORDER BY id LIMIT ${BATCH}`;
  if (!rows.length) break;
  for (const r of rows) {
    const texts = Array.isArray(r.quotes) ? r.quotes.filter((x) => typeof x === "string") : [];
    const f = extractFacets(texts);
    await sql`UPDATE cafes SET facets=${f} WHERE id=${r.id}`;
    if (f.length) withFacets++;
    cursor = Number(r.id); done++;
  }
  process.stdout.write(`\r  ${done.toLocaleString()}곳 처리 · 패싯 보유 ${withFacets.toLocaleString()}`);
}
console.log(`\n✅ 완료 — ${done.toLocaleString()}곳 처리, 패싯 보유 ${withFacets.toLocaleString()}곳`);
const top = await sql`SELECT f label, count(*)::int n FROM cafes, unnest(facets) f WHERE published GROUP BY 1 ORDER BY 2 DESC LIMIT 12`;
console.log("상위 패싯:", top.map((r) => `${r.label} ${r.n}`).join(" · "));
