#!/usr/bin/env node
// ⚠️ "이건 알고 가세요" 백필 — CEO 승인 2026-09-14.
//   대상: 공개 + 후기 15건 이상 (17,829곳 · raw_reviews 935MB = 1회 읽기, 일 디스크읽기 85.7GB의 약 1%).
//   API 0 · LLM 0 · 토큰 0. 재실행 시 이미 채운 곳은 건너뛴다(멱등).
//   ⚠️ 근거는 프로덕션과 같게 **검증 통과 후기만** 쓴다 — synth_reviews_all의 link 집합으로 raw를 거른다.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
const FORCE = process.argv.includes("--force");
const { sql } = await import("../lib/db.ts");
const { extractCautions } = await import("../lib/cafeProfile.ts");

let cursor = 0, seen = 0, filled = 0, empty = 0;
const tally = {};
for (;;) {
  const rows = await sql`SELECT id, raw_reviews, synth_reviews_all FROM cafes
    WHERE published=true AND synth_count>=15 AND raw_reviews IS NOT NULL AND id > ${cursor}
      AND (${FORCE} OR cautions IS NULL)
    ORDER BY id LIMIT 30`;   // ⚠️ raw_reviews가 큰 행이 섞여 있어 300이면 Neon 64MB 응답한도 초과(실측 HTTP 507). 30으로 고정.
  if (!rows.length) break;
  cursor = Number(rows[rows.length - 1].id);
  for (const c of rows) {
    seen++;
    let ok = new Set();
    try { const ev = typeof c.synth_reviews_all === "string" ? JSON.parse(c.synth_reviews_all) : c.synth_reviews_all;
      for (const e of (ev || [])) if (e?.link) ok.add(e.link); } catch {}
    let texts = [];
    try { const j = typeof c.raw_reviews === "string" ? JSON.parse(c.raw_reviews) : c.raw_reviews;
      texts = (j || []).filter((r) => r?.link && ok.has(r.link)).map((r) => String(r?.text ?? "")).filter(Boolean); } catch {}
    const cs = texts.length >= 6 ? extractCautions(texts) : [];
    await sql`UPDATE cafes SET cautions=${JSON.stringify(cs)}::jsonb WHERE id=${c.id}`;
    if (cs.length) { filled++; for (const x of cs) tally[x.label] = (tally[x.label] || 0) + 1; } else empty++;
  }
  console.log(`  ${seen}곳 처리 · 주의점 있음 ${filled} · 없음 ${empty}`);
}
console.log(`\n✅ 백필 완료 — ${seen}곳 처리 · 주의점 부착 ${filled}곳 (${seen ? (filled / seen * 100).toFixed(0) : 0}%)`);
console.table(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([라벨, 곳]) => ({ 라벨, 곳 })));
