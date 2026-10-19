#!/usr/bin/env node
// 🪪 정체성 문장이 빈 공개 카페 재합성 (2026-10-19)
//
// 왜: synth_identity는 지도·검색·SEO 페이지에 다 나오는 **우리 얼굴**이다. 실측 2,149곳이 비어 있다.
//   빈 카페는 소비자가 "여기가 어떤 곳인지" 한 줄도 못 읽는다.
//   원인은 대부분 옛 규칙으로 합성된 뒤 갱신이 안 된 것 → 저장된 원본에 현행 규칙만 다시 적용하면 된다.
//
// 💰 네이버 쿼터 0 · LLM 0 (refresh:false — 저장된 raw_reviews만 쓴다). 추가 비용 없음.
// 🔒 대량 비공개 차단기 — 100곳 이후 비공개율 20% 넘으면 즉시 중단(cron-resynth와 같은 기준).
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { synthAndStore } = await import("../lib/synthStore.ts");
const APPLY = process.argv.includes("--apply");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split("=")[1]) : d; };
const LIMIT = arg("limit", 3000), CONC = arg("conc", 4);

const rows = await sql`SELECT id, name, area FROM cafes
  WHERE published AND raw_reviews IS NOT NULL
    AND (synth_identity IS NULL OR length(synth_identity) < 10)
  ORDER BY synth_count DESC NULLS LAST LIMIT ${LIMIT}`;
console.log(`정체성 빈칸 공개 카페 ${rows.length.toLocaleString()}곳 · 쿼터 0 · LLM 0`);
if (!APPLY) { console.log("미리보기입니다. 실행은 --apply"); process.exit(0); }

let done = 0, filled = 0, unpub = 0, err = 0;
const changed = [];
const work = [...rows];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (work.length) {
    const c = work.shift(); if (!c) break;
    try {
      await synthAndStore({ id: c.id, name: c.name, area: c.area ?? "" }, { refresh: false });
      const [a] = await sql`SELECT synth_identity i, published p FROM cafes WHERE id=${c.id}`;
      if (a?.i && a.i.length >= 10) filled++;
      if (a && !a.p) { unpub++; changed.push(c.id); }
    } catch { err++; }
    done++;
    if (done === 100 && unpub / done > 0.2) { console.log(`🔴 중단 — 100곳 중 비공개 ${unpub}곳(20% 초과)`); work.length = 0; }
    if (done % 200 === 0) console.log(`  ${done}/${rows.length} · 채움 ${filled} · 비공개 ${unpub} · 오류 ${err}`);
  }
}));
console.log(`\n완료 ${done}곳 — 정체성 채움 ${filled} · 비공개 전환 ${unpub} · 오류 ${err}`);
if (changed.length) {
  const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
  for (let i = 0; i < changed.length; i += 50) await invalidateCafeCaches(changed.slice(i, i + 50)).catch(() => {});
  console.log(`캐시 무효화 ${changed.length}곳`);
}
