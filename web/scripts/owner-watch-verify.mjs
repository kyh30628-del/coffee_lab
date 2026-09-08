#!/usr/bin/env node
// 🔍 사장님 감시 알림 검증기 — "새 후기가 올라오면 알려드려요"를 **팔기 전에** 실제로 도는지 확인한다.
//   실행: node --import tsx scripts/owner-watch-verify.mjs
//         node --import tsx scripts/owner-watch-verify.mjs --send=주소@example.com   ← 진짜 1통 발송(사람 확인용)
//
// 🔴 왜 만들었나(2026-09-08): 유료 안내 첫 줄이 이 알림인데 `owner_watch_state`가 0행,
//   `owner_events`에 발송 기록 0건이었다. 활성 구독이 없어서였지만, **한 번도 나간 적 없는 기능을
//   상품의 첫 줄로 팔고 있었다.** 첫 유료 고객이 돈을 내고 아무 알림도 못 받으면 그 자리에서 끝난다.
//   그래서 구독자 없이도 경로를 끝까지 확인할 수 있게 만든다(발송은 명시적으로 요청할 때만).
//
// 이 검증기가 확인하는 것 / 못 하는 것
//   ✅ 변화 감지(diffChanges) · 메일 본문 생성(buildHtml) · 발송 시간대 판정(sendableNow) · 발송 설정(RESEND 키)
//   ✅ --send 를 주면 실제 발송까지(수신자를 사람이 직접 지정해야만 나간다 — 사고 방지)
//   ❌ 구독자 → 스냅샷 → 상태저장 배선은 활성 구독이 있어야 돈다(구독 생기면 첫날 baseline, 다음날부터 알림)
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const { diffChanges, buildHtml, sendableNow } = await import("../lib/ownerWatch.ts");

const CASES = [
  { label: "새 후기 3건", prev: { synth_count: 20, rank: 5, hood_n: 30 }, now: { count: 23, rank: 5, hoodN: 30, area: "성동구" } },
  { label: "순위 2계단 상승", prev: { synth_count: 20, rank: 7, hood_n: 30 }, now: { count: 20, rank: 5, hoodN: 30, area: "성동구" } },
  { label: "순위 하락", prev: { synth_count: 20, rank: 5, hood_n: 30 }, now: { count: 20, rank: 8, hoodN: 30, area: "성동구" } },
  { label: "동네에 새 카페", prev: { synth_count: 20, rank: 5, hood_n: 30 }, now: { count: 20, rank: 5, hoodN: 33, area: "성동구" } },
  { label: "변화 없음(발송 안 해야 정상)", prev: { synth_count: 20, rank: 5, hood_n: 30 }, now: { count: 20, rank: 5, hoodN: 30, area: "성동구" } },
];

console.log("① 변화 감지 — 어떤 변화에 알림이 나가는가");
let ok = 0;
for (const c of CASES) {
  const ch = diffChanges(c.prev, c.now);
  const expectEmpty = c.label.includes("변화 없음");
  const pass = expectEmpty ? ch.length === 0 : ch.length > 0;
  if (pass) ok++;
  console.log(`  ${pass ? "✅" : "❌"} ${c.label.padEnd(22)} → ${ch.length ? ch.map((x) => x.text ?? JSON.stringify(x)).join(" / ") : "(알림 없음)"}`);
}
console.log(`  ${ok}/${CASES.length} 통과\n`);

// ⚠️ 링크가 향할 카페는 **실제 공개 카페**여야 한다 — 2026-09-08 첫 테스트 발송에서 없는 번호(12345)를 써서
//    사장님이 링크를 눌렀다가 "아직 공개 전이거나 찾을 수 없는 카페예요"를 봤다. 기본값을 실제 카페로 둔다.
const cafeId = Number((process.argv.find((a) => a.startsWith("--cafe=")) || "").split("=")[1] || 8118);
// 카페 이름·지역은 DB에서 실제 값을 읽는다 — 본문의 "OO 순위가…"가 그 카페의 실제 동네와 어긋나면
//   사장님 눈에는 또 하나의 결함으로 보인다(2026-09-08 실측: 양평군 카페인데 본문은 성동구였다).
let cafeName = (process.argv.find((a) => a.startsWith("--name=")) || "").split("=")[1] || "";
let cafeArea = "";
try {
  const { neon } = await import("@neondatabase/serverless");
  const rows = await neon(process.env.DATABASE_URL)`SELECT name, area FROM cafes WHERE id=${cafeId}`;
  if (rows[0]) { cafeName = cafeName || rows[0].name; cafeArea = rows[0].area || ""; }
} catch { /* DB 없이도 검증기는 돌아야 한다 */ }
cafeName = cafeName || "테스트카페";
cafeArea = cafeArea || "성동구";

console.log("② 메일 본문 생성");
const changes = diffChanges({ synth_count: 20, rank: 7, hood_n: 30 }, { count: 23, rank: 5, hoodN: 33, area: cafeArea });
const html = buildHtml(cafeName, cafeId, changes, "verify@example.com");
// ⚠️ 확인 문자열은 실제 본문 규약과 맞춰야 한다 — 처음에 /c/ 링크와 '수신거부'를 찾다가 멀쩡한 코드를 결함으로 오판했다.
const checks = [
  ["카페명", html.includes(cafeName)],
  [`사장님 리포트 링크(/owner/r/${cafeId})`, html.includes(`/owner/r/${cafeId}`)],
  ["알림 그만 받기(수신거부)", html.includes("알림 그만 받기") && html.includes("newsletter-optout")],
  ["지역명이 undefined 아님", !html.includes("undefined")],
];
console.log(`  길이 ${html.length}자`);
for (const [k, v] of checks) console.log(`  ${v ? "✅" : "❌"} ${k}`);
console.log("  본문 미리보기: " + html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150));

console.log("\n③ 발송 조건");
console.log(`  지금 발송 가능 시간대(21~08 KST 제외): ${sendableNow()}`);
console.log(`  RESEND_API_KEY 설정: ${!!process.env.RESEND_API_KEY} · 발신주소: ${process.env.RESEND_FROM || "(기본값 onboarding@resend.dev)"}`);

// 발송 전 사전점검 — 링크가 실제로 열리는 페이지인지 확인한다(깨진 링크를 사장님께 보내지 않기 위해)
try {
  const probe = await fetch(`https://dongnecoffeenote.com/owner/r/${cafeId}`, { signal: AbortSignal.timeout(15000) });
  const body = await probe.text();
  const broken = body.includes("아직 공개 전이거나 찾을 수 없는");
  console.log(`  ${broken ? "❌" : "✅"} 링크 대상 /owner/r/${cafeId} ${broken ? "— 미공개·없는 카페! 발송하면 안 된다" : "정상 열림"}`);
  if (broken && process.argv.some((a) => a.startsWith("--send="))) { console.error("⛔ 링크가 깨져 발송을 중단한다. --cafe=공개된카페번호 로 지정할 것."); process.exit(1); }
} catch (e) { console.log(`  ⚠️ 링크 확인 실패(${String(e).slice(0, 40)}) — 발송 전 사람이 직접 확인할 것`); }

const to = (process.argv.find((a) => a.startsWith("--send=")) || "").split("=")[1];
if (to) {
  console.log(`\n④ 실제 발송 → ${to}`);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject: `[검증] ${cafeName} — 새로운 변화가 있어요`, html }),
  });
  const body = await r.text();
  console.log(`  ${r.ok ? "✅ 발송 성공" : "❌ 실패"} (${r.status}) ${body.slice(0, 160)}`);
} else {
  console.log("\n④ 실제 발송: 건너뜀 — 보내려면 --send=받는주소 를 직접 지정할 것(사고 방지)");
}
