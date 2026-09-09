#!/usr/bin/env node
// 🔎 폐업 판정 **독립 검증** — 후기 날짜 말고 바깥 근거(네이버 지역검색)로 대조한다.
//   기각 규칙과 검증기가 **같은 신호(후기 날짜)**를 쓰면 정확도 100%는 순환 논리다. 그래서 밖을 본다.
//   실행: node scripts/closure/spotcheck-naver.mjs [--n=12]
//   💰 표본 n건만 호출(기본 12). 네이버 일일 25,000 중 무시할 양.
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
const val = (k) => (env.match(new RegExp(`^${k}=(.+)$`, "m")) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
const ID = val("NAVER_CLIENT_ID"), SEC = val("NAVER_CLIENT_SECRET");
const N = Number((process.argv.find((a) => a.startsWith("--n=")) || "").split("=")[1] || 12);

const rep = JSON.parse(readFileSync(new URL("../../../agent-reports/permits/match-report.json", import.meta.url), "utf8"));
const list = rep.closedPublished ?? [];
// 무작위 표본 — 최신순만 보면 편향된다
const pick = [...list].sort(() => Math.random() - 0.5).slice(0, N);
const strip = (s) => String(s || "").replace(/<[^>]*>/g, "");
const norm = (s) => strip(s).replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();

console.log(`독립 대조: 고신뢰 폐업 판정 ${list.length}곳 중 무작위 ${pick.length}곳을 네이버에서 확인\n`);
let still = 0, gone = 0;
for (const c of pick) {
  const q = `${c.name} ${String(c.addr).split(" ")[1] ?? ""}`.trim();
  const r = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=5`,
    { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SEC } });
  const items = r.ok ? ((await r.json()).items ?? []) : [];
  const hit = items.find((it) => norm(it.title) === norm(c.name) || norm(it.title).includes(norm(c.name)));
  if (hit) { still++; console.log(`  ⚠️ ${c.name.padEnd(14)} 폐업 ${c.closed} · 최근후기 ${c.lastReview ?? "-"} → 네이버에 아직 있음 "${strip(hit.title)}" (${strip(hit.category)})`); }
  else { gone++; console.log(`  ✅ ${c.name.padEnd(14)} 폐업 ${c.closed} · 최근후기 ${c.lastReview ?? "-"} → 네이버 결과 없음(폐업과 일치)`); }
  await new Promise((s) => setTimeout(s, 250));
}
console.log(`\n▶ 네이버에서 사라짐 ${gone} / 아직 있음 ${still} (표본 ${pick.length})`);
console.log(`  ※ 네이버는 폐업 후에도 한동안 등록을 남긴다 — '아직 있음'이 곧 오판은 아니다. 사람이 눈으로 볼 목록이다.`);
