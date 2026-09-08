#!/usr/bin/env node
// 🎭 사장님 감시 알림 **예행 검증** — "다음 체험이 들어오면 알림이 실제로 나가는가"를 미리 확인한다.
//   실행: node --import tsx scripts/owner-watch-rehearse.mjs [--cafe=1134] [--to=주소] [--live-mail]
//
// 🔴 왜 필요한가(2026-09-08 발견): cron-billing이 `paymentsLive()` 조기 반환 **뒤에서** runOwnerWatch를
//   호출하고 있었다. PAYMENTS_LIVE는 2026-07-16부터 계속 꺼져 있어서 agent_runs의 cron-billing 기록이
//   전부 "skipped: PAYMENTS_LIVE off" — 감시 알림이 **단 한 번도 실행된 적이 없었다.**
//   구독자가 없어서가 아니라 코드가 그 앞에서 멈췄다. 고친 뒤 실제로 도는지 증명이 필요하다.
//
// 🔒 안전 규칙(실제 사장님을 건드리지 않는다):
//   - 기존 구독(5621·8118)은 **실제 사장님 메일**이라 절대 건드리지 않는다. 임시 구독 행을 새로 만든다.
//   - 임시 행은 끝나면 무조건 지운다(성공·실패·중단 모두 finally에서).
//   - OWNER_WATCH_REFRESH_CAP=0 으로 synthAndStore를 막는다 — 네이버·유튜브 쿼터를 쓰지 않고
//     실제 카페의 후기 데이터를 다시 쓰지 않는다.
//   - 메일은 `--to`로 사람이 직접 지정한 주소로만 나간다.
//   ⚠️ 임시 구독이 사는 동안(수십 초) 그 카페에 「사장님이 직접 관리」 배지가 뜰 수 있다(캐시 60초).
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}
process.env.OWNER_WATCH_REFRESH_CAP = "0"; // 🔒 후기 재합성·쿼터 소모 차단

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const CAFE = Number(arg("cafe", 1134));
const TO = arg("to", "");
const LIVE_MAIL = process.argv.includes("--live-mail");

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const { encryptPII } = await import("../lib/crypto.ts");
const { runOwnerWatch, buildHtml, diffChanges, sendableNow } = await import("../lib/ownerWatch.ts");

const cafe = (await sql`SELECT id, name, area, published FROM cafes WHERE id=${CAFE}`)[0];
if (!cafe || !cafe.published) { console.error(`카페 ${CAFE}가 없거나 비공개다. 공개 카페를 지정할 것.`); process.exit(1); }
const existing = (await sql`SELECT status FROM subscriptions WHERE cafe_id=${CAFE}`)[0];
if (existing) { console.error(`⛔ ${CAFE}에 이미 구독 행이 있다(${existing.status}). 실제 사장님일 수 있으니 다른 카페를 쓸 것.`); process.exit(1); }

console.log(`🎭 예행 대상: #${cafe.id} ${cafe.name} (${cafe.area}) · 수신 ${TO || "(발송 안 함)"}`);
console.log(`   지금 발송 가능 시간대(08~21 KST): ${sendableNow()}\n`);

let cleaned = false;
const cleanup = async () => {
  if (cleaned) return; cleaned = true;
  await sql`DELETE FROM owner_watch_state WHERE cafe_id=${CAFE}`.catch(() => {});
  await sql`DELETE FROM subscriptions WHERE cafe_id=${CAFE} AND cafe_name LIKE '%[예행]%'`.catch(() => {});
  const left = await sql`SELECT count(*)::int n FROM subscriptions WHERE cafe_id=${CAFE}`;
  console.log(`\n🧹 정리: 임시 구독 ${left[0].n === 0 ? "삭제 확인 ✅" : "❌ 남아 있음 — 수동 확인 필요"} · 감시상태 행 삭제`);
};
process.on("SIGINT", async () => { await cleanup(); process.exit(130); });

try {
  // ① 체험 신청이 들어온 상태를 만든다(실제 신청과 같은 모양: status='active' + 만료일 미래)
  await sql`INSERT INTO subscriptions (cafe_id, cafe_name, email, status, expires_at, created_at, updated_at)
            VALUES (${CAFE}, ${`[예행] ${cafe.name}`}, ${encryptPII(TO || "rehearsal@example.com")}, 'active', now() + interval '15 days', now(), now())`;
  console.log("① 체험 신청 발생 → 구독 status='active' 생성");

  // ② 첫 실행 = 기준선만. 여기서 메일이 나가면 오히려 버그다(가입 직후 오알림).
  const r1 = await runOwnerWatch();
  console.log(`② 첫 실행(가입 당일): 구독 ${r1.subs} · 기준선 ${r1.baseline} · 발송 ${r1.sent}` +
    `  ${r1.subs === 1 && r1.baseline === 1 && r1.sent === 0 ? "✅ 기준선만 저장(정상)" : "❌ 예상과 다름"}`);

  // ③ 다음 날 변화가 생긴 상황을 만든다 — 기준선을 과거값으로 낮춘다(카페 데이터는 안 건드린다)
  const st = (await sql`SELECT synth_count, rank, hood_n FROM owner_watch_state WHERE cafe_id=${CAFE}`)[0];
  await sql`UPDATE owner_watch_state SET synth_count=${Math.max(0, st.synth_count - 3)}, rank=${st.rank + 2}, hood_n=${Math.max(0, st.hood_n - 1)} WHERE cafe_id=${CAFE}`;
  console.log(`③ 다음 날 상황 조성: 후기 ${st.synth_count - 3}→${st.synth_count} · 순위 ${st.rank + 2}위→${st.rank}위 · 동네 ${st.hood_n - 1}→${st.hood_n}곳`);

  // ④ 두 번째 실행 = 변화 감지 → (발송 시간대면) 실제 발송
  const r2 = await runOwnerWatch();
  console.log(`④ 다음 날 실행: 변화 ${r2.changed} · 발송 ${r2.sent}` +
    (r2.changed === 1 ? "  ✅ 변화 감지됨" : "  ❌ 변화를 못 잡았다") +
    (r2.sent === 0 && !sendableNow() ? "  · 야간(21~08)이라 발송 보류 — 설계대로" : ""));

  // ⑤ 야간이라 파이프라인이 보류했으면, **같은 본문**을 사람이 지정한 주소로 한 통 보내 눈으로 확인한다.
  if (LIVE_MAIL && TO && r2.sent === 0) {
    const changes = diffChanges({ synth_count: st.synth_count - 3, rank: st.rank + 2, hood_n: st.hood_n - 1 },
      { count: st.synth_count, rank: st.rank, hoodN: st.hood_n, area: cafe.area });
    const html = buildHtml(cafe.name, CAFE, changes, TO);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [TO], subject: `[예행] ${cafe.name} — 새로운 변화가 있어요`, html }),
    });
    console.log(`⑤ 같은 본문 실제 발송 → ${TO}: ${res.ok ? "✅ 성공" : "❌ 실패"} (${res.status})`);
  }
} finally {
  await cleanup();
}
