// 🧹 표시 인용문 소급 정리 — 네이버가 잘라 보낸 제목(`....`)이 화면에 그대로 노출되던 것을 걷어낸다.
//   원본(raw_reviews)이 있는 공개 카페를 재합성한다. refresh:false라 **네이버 쿼터 0**.
//   ⚠️ 재합성은 전 게이트를 다시 통과시키므로 자격을 잃은 카페는 내려갈 수 있다(정당한 재판정).
//      실측(09-18, 표본 220곳): 공개→비공개 강등 1곳(0.45%).
//   ⏰ 새벽 침범 방지 하드 데드라인(기본 22시). 중단해도 손실 0 — 다음 실행이 이어받는다.
// 사용: node --import tsx scripts/refresh-display-quotes.mjs [--apply] [--limit N] [--conc N] [--stop-hour H]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { synthAndStore } = await import("../lib/synthStore.ts");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const APPLY = process.argv.includes("--apply");
const LIMIT = arg("--limit", 2000), CONC = arg("--conc", 3), STOP_H = arg("--stop-hour", 22);
const past = () => new Date(Date.now() + 9 * 3600e3).getUTCHours() >= STOP_H;

const rows = await sql`SELECT id, name, area FROM cafes
  WHERE published AND raw_reviews IS NOT NULL
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) e WHERE e->>'quote' LIKE '%....')
  ORDER BY synth_updated DESC LIMIT ${LIMIT}`;
console.log(`대상 ${rows.length.toLocaleString()}곳 (잘린 제목이 화면에 노출 중) · 네이버 쿼터 0 · 동시 ${CONC}`);
if (!APPLY) { console.log("▶ 드라이런이다. --apply 로 실행."); process.exit(0); }

let i = 0, ok = 0, err = 0, stopped = false; const t0 = Date.now();
const worker = async () => { while (true) { const c = rows[i++]; if (!c) break; if (past()) { stopped = true; break; }
  try { await synthAndStore({ id: c.id, name: c.name, area: c.area ?? "" }, { refresh: false }); ok++; }
  catch (e) { err++; if (err <= 3) console.log(`  오류 ${c.name}: ${String(e).slice(0, 60)}`); }
  if (ok % 500 === 0 && ok) console.log(`  … ${ok}곳 (${Math.round((Date.now() - t0) / 1000)}초)`); } };
await Promise.all(Array.from({ length: CONC }, worker));
const [a] = await sql`SELECT COUNT(*) FILTER (WHERE published)::int still FROM cafes WHERE id = ANY(${rows.map(r => r.id)})`;
console.log(`\n완료 ${ok}곳 · 오류 ${err} · ${Math.round((Date.now() - t0) / 1000)}초${stopped ? ` · ⏰ ${STOP_H}시 중단` : ""}`);
console.log(`공개 유지 ${a.still}/${rows.length} (강등 ${rows.length - a.still}곳)`);
