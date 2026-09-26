// 🪣 남는 네이버 쿼터 회수 — 원장 추가 적재량을 **스스로 계산**해 채워 넣는다.
//   왜 만들었나(2026-09-26 CEO 지시 "낭비없이 알차게 다 써서 공개 카페 최대로 늘려"):
//   그날 은퇴 잡(discover-sweep) 부활로 쿼터 3,890콜이 새어나가 07:00 적재가 1,855곳에서 멈췄고,
//   남는 쿼터를 사람이 손으로 계산해 두 번 다시 채웠다(740 → 928로 한 번 틀림). 계산을 사람에게 맡기면 또 틀린다.
//
// 🔑 설계 원칙
//   - **적재만 하는 건 낭비다.** 적재한 카페는 그날 수집 창에서 후기까지 모아야 공개된다.
//     그래서 '적재 단가 + 수집 단가'를 한 묶음으로 보고, 수집까지 끝낼 수 있는 양만 적재한다.
//   - **이미 적체된 수집분의 몫을 먼저 뺀다.** 그걸 굶기면 어제 쓴 적재 쿼터가 버려진다.
//   - **단가는 오늘 실측으로 뽑는다.** 하드코딩한 옛 단가(4.4)가 실제(4.7)와 어긋나 과적재되는 것을 막는다.
//   - **남은 수집 창이 없으면 적재하지 않는다.** 오늘 쿼터로 적재해도 내일 수집되면 내일 쿼터가 더 싸다.
//
// 사용: node --import tsx scripts/topup-permits.mjs [--apply] [--min 50]
//   --apply 없으면 계산만 하고 끝낸다(드라이런).
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { NAVER_DAILY_QUOTA, NAVER_CLOSURE_RESERVE } = await import("../lib/naverBudget.ts");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const APPLY = process.argv.includes("--apply");
const MIN = arg("--min", 50);                    // 이보다 적으면 실행비용(DB·기동)이 아까워 건너뛴다
const CRON_RESERVE = Number(process.env.COLLECT_CRON_RESERVE || 600); // collect-shard가 남기는 크론 몫과 같은 값

const T = sql`(date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul')`;
const [now] = await sql`SELECT to_char(now() AT TIME ZONE 'Asia/Seoul','HH24:MI') hm,
  EXTRACT(HOUR FROM now() AT TIME ZONE 'Asia/Seoul')::int h`;

// ── 1) 오늘 실측 단가 ──
//   수집 단가 = (오늘 총 사용 − 적재가 쓴 콜) ÷ 오늘 수집 완료 수.
//   적재가 쓴 콜은 permit 적재분 × 적재단가로 추정하지 않고, 적재 로그가 남긴 실측을 못 믿을 때를 대비해
//   '수집 완료 수'로 나눈 값을 쓴다(폐업 크론 콜이 섞여 약간 보수적 = 과적재 방지 쪽으로 틀린다).
const [m] = await sql`SELECT
  (SELECT COALESCE(used,0) FROM naver_budget WHERE day = to_char(now() AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD')) used,
  (SELECT count(*)::int FROM cafes WHERE pipeline_status='new' AND raw_reviews IS NULL) backlog,
  (SELECT count(*)::int FROM cafes WHERE raw_collected_at >= ${T}) collected_today,
  (SELECT count(*)::int FROM cafes WHERE created_at >= ${T} AND source='permit') imported_today`;

const IMPORT_RATE = Number(process.env.TOPUP_IMPORT_RATE || 2.6);   // 09-26 실측 2.27~2.53 → 안전쪽 2.6
const collectSpend = Math.max(0, m.used - m.imported_today * IMPORT_RATE);
const COLLECT_RATE = m.collected_today >= 200
  ? Math.max(3, Math.min(8, collectSpend / m.collected_today))       // 실측(이상치 방어 3~8콜)
  : Number(process.env.TOPUP_COLLECT_RATE || 4.7);                   // 표본 부족하면 09-26 실측 기본값

// ── 2) 여유 계산 ──
const ceiling = NAVER_DAILY_QUOTA - CRON_RESERVE;                    // collect-shard가 멈추는 선
const needBacklog = m.backlog * COLLECT_RATE;                        // 이미 적재된 것들 수집 몫(먼저 확보)
const closure = Math.min(NAVER_CLOSURE_RESERVE, 500);                // 폐업 재확인 실사용 관측치(보수적)
const spare = ceiling - m.used - needBacklog - closure;
const perCafe = IMPORT_RATE + COLLECT_RATE;
const topup = Math.max(0, Math.floor(spare / perCafe));
const budget = Math.ceil(topup * IMPORT_RATE);

console.log(`🪣 쿼터 회수 계산 (${now.hm} KST)`);
console.log(`   오늘 사용 ${m.used.toLocaleString()} / 천장 ${ceiling.toLocaleString()}(크론 ${CRON_RESERVE} 보존)`);
console.log(`   실측 단가 — 적재 ${IMPORT_RATE}콜 · 수집 ${COLLECT_RATE.toFixed(2)}콜(오늘 수집 ${m.collected_today.toLocaleString()}곳 기준)`);
console.log(`   차감 — 적체 ${m.backlog.toLocaleString()}곳 수집 ${Math.round(needBacklog).toLocaleString()}콜 · 폐업예비 ${closure}콜`);
// 🔎 단가가 평소(약 4.7콜)보다 크게 높으면 **적재도 수집도 아닌 제3의 소비자**가 있다는 뜻이다.
//   09-26이 그 경우였다: 은퇴 잡 discover-sweep이 3,890콜을 먹었고, 그게 수집 몫으로 잘못 귀속돼 단가가 6.21로 뛰었다.
//   단가를 높게 보면 적재를 덜 하니 안전한 방향으로 틀리지만, 원인을 모르면 매일 쿼터를 흘린다 → 여기서 말해준다.
if (COLLECT_RATE > 5.5 && m.collected_today >= 200) {
  const unexplained = Math.round(collectSpend - m.collected_today * 4.7);
  console.log(`   ⚠️ 수집 단가 ${COLLECT_RATE.toFixed(2)}콜이 평소(4.7)보다 높다 — 정체불명 소비 약 ${unexplained.toLocaleString()}콜.`);
  console.log(`      적재·수집이 아닌 잡이 쿼터를 쓰고 있는지 확인하라(아침 리포트 ④-b 은퇴 잡 부활 감시).`);
}
console.log(`   → 여유 ${Math.round(spare).toLocaleString()}콜 ÷ 곳당 ${perCafe.toFixed(2)}콜 = 추가 적재 ${topup.toLocaleString()}곳 (예산 ${budget.toLocaleString()}콜)`);

// ── 3) 실행 게이트 ──
//   남은 수집 창(08·12·16·20시 시작, 각 120분)이 없으면 적재하지 않는다 — 내일 수집될 뿐이고 내일 쿼터가 더 싸다.
if (now.h >= 20) { console.log(`⏹ 20시 이후 — 남은 수집 창 없음. 적재하지 않는다(내일 07:00 정규 적재가 더 싸다).`); process.exit(0); }
if (topup < MIN) { console.log(`⏹ 여유 ${topup}곳 < 최소 ${MIN}곳 — 건너뜀(기동비용이 더 아깝다).`); process.exit(0); }
if (!APPLY) { console.log(`▶ 드라이런. 실제 적재는 --apply.`); process.exit(0); }

console.log(`\n▶ 적재 실행 — --limit ${topup} --budget ${budget}`);
const r = spawnSync("node", ["--import", "tsx", "scripts/import-permits.mjs", "--apply", "--limit", String(topup), "--budget", String(budget)],
  { cwd: new URL("..", import.meta.url).pathname, stdio: "inherit" });
process.exit(r.status ?? 1);
