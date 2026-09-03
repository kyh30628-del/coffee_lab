// 🛑 영구 정지(CEO 지시 2026-08-12 은퇴 + 2026-09-03 재확인 "무조건 멈춰").
//   launchd는 .disabled지만 수동 실행까지 막는다 — 실수로도 못 돌게.
console.error("🛑 youtube-backfill은 CEO 지시로 영구 정지됐습니다(2026-09-03). 재개는 CEO 승인 + 이 가드 제거 필요.");
process.exit(1);

// 유튜브 백필 — 이미 raw 캐시된 카페에 유튜브만 추가 수집·재합성(로컬, 타임아웃 없음).
// 유튜브 일일 쿼터(~95 검색)가 빡빡해, 인기(리뷰 많은) 카페부터 매일 ~90곳씩 보강.
// 쿼터 소진 시 자동 중단(내일 이어서). 한 번 확인한 카페는 yt_checked_at으로 재시도 안 함.
// 실행(tsx): node --import tsx scripts/youtube-backfill.mjs
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { backfillYouTube } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");
const { recordRun } = await import("../lib/agentLog.ts");

await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS yt_checked_at TIMESTAMPTZ`;
// 🛑 비용 자동정지(CEO 2026-08-03): cron-costwatch가 이상 감지 시 halted=true → 전송 1위 주범인 이 배치를 멈춘다.
const halted = (await sql`SELECT halted FROM cost_guard WHERE id=1`.catch(() => []))[0]?.halted;
if (halted) { await recordRun("youtube-backfill", true, "🛑 비용 자동정지 중 — 스킵", 0).catch(() => {}); console.log("비용 자동정지 중 — youtube-backfill 스킵"); process.exit(0); }
const MAX = Number(process.env.YT_MAX || 90); // 유튜브 일일 쿼터 안전선
let added = 0, none = 0, processed = 0, quota = false;

// ⚠️ 2026-07-29 수정: 예전엔 이 무거운 쿼리(raw_reviews 큰 컬럼을 훑는 필터)를 LIMIT 5로 18번(90/5) 반복 호출해
//   Neon 데이터전송비 폭증의 주범이었다(실측: 508콜·~660GB, 청구서 663GB와 거의 일치). MAX(90)를 한 번에 가져오는
//   걸로 바꿔 이 쿼리 호출을 18분의 1로 줄인다 — 이미 처리한 카페는 아래 루프에서 yt_checked_at이 찍히므로
//   재조회 없이도 중복처리 걱정 없음(한 번의 스냅샷을 그대로 순회).
// 💰 2026-08-12 수리(CEO 지적): `NOT (raw_reviews @> ...)`를 WHERE에 두면 **13,495행 전부의 raw_reviews(1.27GB)를
//   디토스트**해야 한다 — 실측 한 번 실행에 2.67GB 판독. 2026-07-29에 호출 횟수는 줄였지만 이 조건 자체가
//   남아 있어 매 실행 전수 판독은 그대로였다(같은 병의 다른 쿼리).
//   → 후보는 **작은 컬럼만으로** 뽑고, 무거운 JSON 포함검사는 **뽑힌 90건에만** 건다. 판독량 GB → MB.
const cand = await sql`
  SELECT id, name, area FROM cafes
  WHERE raw_reviews IS NOT NULL AND yt_checked_at IS NULL
  ORDER BY published DESC NULLS LAST,
           (synth_grade='검증') DESC,
           (synth_grade='참고') DESC,
           synth_count DESC NULLS LAST
  LIMIT ${MAX}`;
// 이미 유튜브가 들어간 카페 걸러내기 — 후보 90건에만 디토스트되므로 저렴하다.
const candIds = cand.map((c) => c.id);
const already = candIds.length
  ? new Set((await sql`SELECT id FROM cafes WHERE id = ANY(${candIds}) AND raw_reviews @> '[{"source":"youtube"}]'`).map((r) => String(r.id)))
  : new Set();
// 이미 보유한 건 다시 안 잡히도록 확인시각만 찍고 제외(다음 실행에서 후보에서 빠진다).
if (already.size) await sql`UPDATE cafes SET yt_checked_at = now() WHERE id = ANY(${[...already]})`.catch(() => {});
const rows = cand.filter((c) => !already.has(String(c.id)));
if (!rows.length) console.log("유튜브 백필 대상 없음 — 전체 완료");
for (const c of rows) {
  if (quota) break;
  const r = await backfillYouTube(c);
  processed++;
  if (r === "added") { added++; console.log(`  ✓ ${c.name}: 유튜브 추가·재합성`); }
  else if (r === "none") { none++; }
  else if (r === "quota") { quota = true; console.log("유튜브 쿼터 소진 — 중단(내일 이어서)"); break; }
  if (processed >= MAX) break;
  await new Promise((x) => setTimeout(x, 400));
}
// 남은 대상 수 — 로그용 상한치. 여기서도 `@>`를 쓰면 또 전수 디토스트라 작은 컬럼만으로 센다(실제보다 약간 많게 나옴).
const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND yt_checked_at IS NULL`)[0].n;
console.log(`\n유튜브 백필 종료: 추가 ${added} · 영상없음 ${none} · 처리 ${processed} · 남은 대상 ${remain}`);
// 자율진단이 정지를 감지하도록 agent_runs에 기록(재발방지). 쿼터소진도 정상 종료로 기록.
await recordRun("youtube-backfill", true, `추가 ${added}·영상없음 ${none}·처리 ${processed}·남은 ${remain}${quota ? "·쿼터소진" : ""}`, processed).catch(() => {});
process.exit(0);
