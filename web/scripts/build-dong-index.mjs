#!/usr/bin/env node
// 🧭 전국 동·읍·면 사전 생성(2026-09-24) — 검증 엔진의 '다른 동네 동명 가게' 판정용(reviewQuality).
//   출처: 인허가 원장 지번 주소(agent-reports/permits/*.ndjson의 ln) — 로컬 파일만, 비용 0.
//   산출: lib/data/dong-index.json { "청담동": ["서울|강남구"], ... } — 시군구는 regionList.SIDO_GU 표기와 같게.
//   재생성: node --import tsx scripts/build-dong-index.mjs (원장을 새로 받았을 때)
import { createReadStream, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os"; import readline from "node:readline";
const { SIDO_GU, sidoFromAddress } = await import("../lib/regionList.ts");
const idx = new Map(); let lines = 0, used = 0;
for (const fn of ["rest_cafes", "rest_cafes.extra", "bakeries", "bakeries.extra", "general_restaurants", "general_restaurants.extra"]) {
  const fp = `${homedir()}/coffee-platform/agent-reports/permits/${fn}.ndjson`; if (!existsSync(fp)) continue;
  const rl = readline.createInterface({ input: createReadStream(fp), crlfDelay: Infinity });
  for await (const line of rl) {
    lines++; let d; try { d = JSON.parse(line); } catch { continue; }
    const ln = String(d.ln || ""); if (!ln) continue;
    const sido = sidoFromAddress(ln); if (!sido) continue;
    const parts = ln.split(/\s+/); const gus = SIDO_GU[sido] ?? [];
    const gi = parts.findIndex((p, i) => i > 0 && i < 4 && gus.includes(p)); if (gi < 0) continue;
    for (const p of parts.slice(gi + 1, gi + 4)) {
      // "율량동" · "삼덕동1가"(대구 중구) · "종로1가동" · "신당5동" · "엄사면" · "진접읍" → 기본형 동/읍/면
      const m = p.match(/^([가-힣]{1,6}?)\d*가?(동|읍|면)$/) || p.match(/^([가-힣]{1,6}?동)\d+가$/);
      if (!m) continue;
      const dong = m[2] ? m[1] + m[2] : m[1];
      if (dong.length < 3) break;
      if (!idx.has(dong)) idx.set(dong, new Set()); idx.get(dong).add(`${sido}|${gus[gus.indexOf(parts[gi])]}`); used++; break;
    }
  }
}
const out = Object.fromEntries([...idx.entries()].sort().map(([k, v]) => [k, [...v].sort()]));
writeFileSync(new URL("../lib/data/dong-index.json", import.meta.url), JSON.stringify(out));
console.log(`원장 ${lines.toLocaleString()}줄 · 사용 ${used.toLocaleString()} · 동읍면 ${idx.size.toLocaleString()}개`);
