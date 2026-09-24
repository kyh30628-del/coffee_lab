// 🧭 네이버 search/local 일일 할당량(25,000/일·KST 자정 리셋) 예산 관리 — **단일 출처**.
//   문제(2026-07-10): 예산 개념이 없어 discover-sweep이 새벽에 하루치 25k를 통째로 태우면
//   나머지 시간 cron-grow(2h)가 계속 429를 맞아 '발굴 중지'로 보였다("70%만 쓴다"던 약속 위반).
//   → 공용 일일 카운터 + 예약분(reserve): 발굴 스윕은 70%까지만 쓰고 30%는 cron-grow가 하루 종일 쓴다.
//   ⚠️ 버그교정(2026-07-11): markNaverExhausted가 (1)used를 25,000으로 강제하고 (2)exhausted를
//   하루종일 스티키로 남겨, 자정 직후 Naver 리셋 전 '초기 429' 한 번에 온종일 발굴이 잠겼다(스윕이
//   2지역만 돌고 정지, 오늘 신규 1곳). 실측: 잠긴 뒤에도 Naver는 200을 정상 응답(쿼터 있음).
//   → **자가치유**로 교정: ①성공 호출(bumpNaver)이 소진플래그를 해제 ②소진마킹은 used를 조작하지
//   않고 시각만 찍어 **쿨다운(기본 20분) 뒤 자동 만료**(일시·초기 429가 하루를 잠그지 않게).
import { sql } from "./db";

// 🚨 **이 카운터는 search/local(발굴) 전용이다 — 네이버 전체 사용량이 아니다.**
//   bumpNaver는 lib/discover.ts 한 곳에서만 호출된다. 후기 수집(lib/webSearchCollector.ts의
//   blog·cafearticle)은 여기 안 잡힌다 — 네이버는 **API별로 한도가 따로**라 그게 맞다.
//   ⚠️ 2026-08-25 사고: 이 값(21,906)을 '네이버 전체 잔여'로 오해해 후기 수집을 스스로 멈췄다.
//      실제로는 local·blog·webkr 모두 200 정상이었다. 이 숫자로 수집 경로를 막지 말 것.
export const NAVER_DAILY_QUOTA = 25000;
// 🔴 2026-09-20 배분 재설계(대표님 지시 "낭비 없이 정확하게") — cron-grow 예약 7,500 → 0.
//   실측(09-20 오전): 스윕 9,411콜 → 849곳(카페당 11.1콜) vs cron-grow 등 4,593콜 → 63곳(72.9콜).
//   **6.6배 비효율인데, 스윕이 그 예약에 막혀 정지하고 있었다** — 효율 나쁜 쪽을 위해 좋은 쪽을 멈춘 구조.
//   cron-grow는 고갈된 기존 182개 지역(평균 수확률 2.2%)을 훑기 때문이다.
//   ⚠️ cron-grow를 죽인 게 아니다. nonClosureMayUse가 COLLECT+CLOSURE 예약선을 보므로
//      수집·폐업 몫이 남아 있는 동안엔 돌고, 스윕과 같은 선에서 함께 멈춘다.
export const NAVER_SWEEP_RESERVE = Number(process.env.NAVER_SWEEP_RESERVE || 0);
// 🚪 폐업 재확인 예약(2026-09-13 결재 #1070): 하루 25,000 중 1,200(4.8%)은 발굴·스윕이 못 쓴다.
//   폐업 크론(카페당 1~3호출, 하루 ~220곳)이 '쿼터중단'으로 굶던 것을 끝낸다. 예약은 상한이 아니라 최소 보장 —
//   폐업 크론이 덜 쓰면 남은 몫은 자정 리셋까지 그냥 남는다(발굴이 예약선까지는 계속 쓴다).
export const NAVER_CLOSURE_RESERVE = Number(process.env.NAVER_CLOSURE_RESERVE || 1200);
// 🔁 파기 재수집 예약(2026-09-16 결재 승인 B안): 하루 25,000 중 1,500(5.9%)은 발굴·스윕이 못 쓴다.
//   왜: raw는 약관 준수로 90일에 파기되는데(cron-resynth), 그 짝인 재수집 장치 `warmup`이
//   **어느 스케줄러에도 존재하지 않았다**(코드엔 주석만 남음). 파기만 돌았다.
//   실측 2026-09-16: 하루 파기 604곳 vs 재수집 24곳 — 25배 격차.
//   원본이 없으면 cron-resynth 선정조건(raw_reviews IS NOT NULL)에 안 걸려
//   **규칙이 바뀌어도 영영 재검이 안 된다**(광고 규칙도 안 퍼진다).
//   이미 784곳이 그 상태고 그중 254곳이 '검증' 등급이다. 7일이면 약 5,000곳이 된다.
//   CEO 승인 = **검증 등급 우선**(2026-09-16).
//   ⚠️ 최초 결재 때 내가 카페당 6콜로 계산해 1,500콜(5.9%)을 올렸는데 **스모크 테스트 실측은 8콜**이었다
//     (3곳에 24콜). 1,500이면 하루 187곳뿐이라 정상 파기분 246곳/일에 미달 — 매일 59곳씩 밀린다.
//     실측 보고 후 CEO가 2,300콜(9.2%)로 상향 승인 → 하루 287곳, 7일 내 백로그 소진 후 유지.
//   ⚠️ 보관기간 연장(90→180일)은 선택지가 아니다 — 네이버 약관 7.3.③ 방어선이자 /terms 공개 약속이다.
// 🔴 2026-09-17 폐지(CEO 승인) — 0으로 내린다. 이유는 **유입 우선**이라는 대전제다.
//   실측으로 카페 수 ↔ 방문자 연결이 확인됐다(1,000카페당 방문자 53.8 → 116.1 → 133.1 상승 추세).
//   그 기준으로 재수집 2,300콜의 기회비용을 계산하면:
//     2,300콜 ÷ 스윕 실효 22콜 = 신규 약 105곳/일 = 월 3,150곳 ≈ **월 419 방문자**
//   반면 재수집이 지키는 것은 유입과 무관하다 — raw가 없어도 카페 페이지는 그대로 노출된다
//   (인용문은 synth_reviews에 따로 저장). 재수집은 '규칙이 바뀌었을 때 재판정할 수 있게' 하는 것뿐이다.
//   ⚠️ 내가 09-16에 이 예약을 받아낸 근거("검증 등급이 재검 불가가 된다")는 유입과 무관했다. 전제가 틀렸다.
//   → 0. 전수 재검이 꼭 필요한 시점엔 scripts/recollect-purged.mjs를 수동으로 돌린다(스크립트·레인은 보존).
// 📥 후기 수집 예약(2026-09-17 CEO 승인): 하루 25,000 중 7,000(28%)은 **발굴이 못 쓴다.**
//   왜: 09-17 전국 개방 첫날 실측 — 적재 1,114곳인데 수집 완료 370곳(33%)뿐이고 적체가 744곳까지 갔다
//     (차단 임계 800). 발굴이 쿼터를 먼저 다 써서 수집이 남는 걸로 연명하는 구조였다.
//   🔑 판단 근거: **수집이 곧 유입이다.** 후기가 없으면 공개가 안 되고, 공개가 안 되면 페이지가 없고,
//     페이지가 없으면 유입이 0이다. 많이 캐고 3분의 1만 쓰는 것보다 적게 캐고 다 쓰는 게 낫다.
//     (같은 날 폐지한 재수집 예약과는 다르다 — 그건 이미 공개된 카페의 원본 보존이라 유입과 무관했다.)
//   ⚠️ 이 예약은 **발굴 경로에만** 건다: sweepMayContinue(스윕) · nonClosureMayUse(cron-grow 발굴 루프).
//     수집 경로(webSearchCollector)는 이 가드를 호출하지 않으므로 스스로 막히지 않는다.
//   🔴 2026-09-20 재설계 — **발굴과 수집을 2.3:1로 묶는다.**
//   왜 이 비율인가(전부 실측): 카페 1곳을 공개까지 보내는 원가 = 발굴 16.9콜 + 수집 7콜 = 23.9콜.
//   즉 발굴에 쓴 만큼의 0.44배를 수집에 써야 **그날 캔 걸 그날 공개**까지 보낸다.
//   09-20 사고: 발굴 20,507콜(82%) : 수집 1,743콜(7%) = **12:1**로 깨져, 1,292곳을 캐놓고 249곳만
//   수집했다. 나머지 1,040곳이 적체로 묶여 그날 공개가 553곳에 그쳤다(같은 쿼터로 694곳이 가능했다).
//   배분: 폐업 1,200 + 수집 7,200 + 발굴 16,600 = 25,000
//     발굴 16,600 ÷ 16.9콜 = 982곳  ·  수집 7,200 ÷ 7콜 = 1,029곳  → 수집이 발굴을 앞서 적체가 줄어든다.
//   ⚠️ 단가가 바뀌면 이 비율도 바뀐다. 미개척지는 발굴 3.4콜(09-18 전북)이라 그때는 발굴 몫을 늘려야 한다.
// 🔁 2026-09-21 공공원장 전환(CEO 승인 09-20): 발굴(스윕)을 원장 적재로 바꿨다. 실측 적재 1.69콜/곳·수집 7콜/곳 →
//   하루 2,700곳 = 적재 4,600 + 수집 18,900 + 폐업 1,200 ≈ 24,700. 수집 몫을 7,200 → 19,000으로 올려 배분을 강제한다.
//   (import-permits 예산 = 25,000 − 폐업 − 이 값 = 4,800콜, 스윕도 같은 선에서 자동 정지)
// 🔢 2026-09-23 재배분(CEO "쿼터 써서 카페 수 늘려") — 예약이 과했다. 실측 단가: 적재 1.91콜/곳 · 수집 4.5콜/곳 = 곳당 6.4콜.
//   09-22·23 이틀 모두 **적재가 예산(4,800콜)에서 먼저 멈췄고** 수집은 예약 19,000 중 8,000대만 썼다(하루 9,000콜 유휴).
//   끝까지(적재→수집→공개) 가는 하루 처리량 = (25,000 − 폐업 1,200) / 6.7콜 ≈ 3,550곳.
//   → 수집 예약을 16,000으로 낮춰 적재 예산을 7,800콜로 키운다(2,517 → 약 3,600곳/일). 수집은 창 3개(12·16·20시)로 충분.
export const NAVER_COLLECT_RESERVE = Number(process.env.NAVER_COLLECT_RESERVE || 16000);
export const NAVER_RECOLLECT_RESERVE = Number(process.env.NAVER_RECOLLECT_RESERVE || 0);
// 🌱 2026-09-24 재도입(협업#450 진단 → decisions#1241 승인): import-permits(매일 07:00 1회, scripts/import-permits.mjs)의
//   BUDGET이 그동안 QUOTA − CLOSURE − COLLECT 전부(=nonClosureMayUse 게이트의 문턱과 정확히 같은 값)였다 —
//   import-permits가 그 몫을 아침에 한 번에 몰아 쓰면(실측 09-24 08:49 이미 47% 소진) 같은 날 나머지 시간 내내
//   nonClosureMayUse가 닫혀 cron-grow discoverRegion 루프(app/api/cron-grow/route.ts:129)가 하루 대부분
//   전면 차단됐다(discovery_state.last_run 60시간+ 정지, decisions#1224). mineArea(리뷰 속 숨은 카페 채굴)는
//   이 게이트를 안 타 계속 돌아 발굴이 살아있는 것 같은 착시만 남겼다.
//   → import-permits 자기 예산에서만 이만큼 덜어내(import-permits.mjs BUDGET 계산) cron-grow에게 하루 전
//   구간에 걸쳐 쓸 여지를 되돌려준다. nonClosureMayUse 게이트(CLOSURE+COLLECT 문턱)는 그대로 두므로 폐업·
//   수집 예약의 기존 보장은 안 건드린다.
export const NAVER_GROW_RESERVE = Number(process.env.NAVER_GROW_RESERVE || 3000);
/** 발굴(cron-grow)·재수집 등 '폐업 아닌' 소비자가 지금 더 써도 되는가 — 예약분 1,200을 남긴다. */
export async function nonClosureMayUse(): Promise<{ ok: boolean; remaining: number }> {
  const used = await naverUsedToday();
  const remaining = Math.max(0, NAVER_DAILY_QUOTA - used);
  // 발굴(cron-grow)은 폐업 예약 + **수집 예약**을 둘 다 남긴다. 수집은 이 함수를 호출하지 않으므로 안 막힌다.
  return { ok: remaining > NAVER_CLOSURE_RESERVE + NAVER_COLLECT_RESERVE, remaining };
}

// 🚦 적체 가드(2026-08-25) — **발굴이 쿼터를 독식해 수집이 굶던 구조를 끊는다.**
//   기존 설계는 25,000을 전부 발굴에 배정했다(스윕 17,500 + cron-grow 예약 7,500).
//   후기 수집 몫은 예약이 없어 '남으면 하는' 신세였다. 그동안 문제가 안 된 건 밀도 버그(decisions#814)로
//   발굴 수확이 하루 15~35곳뿐이라 수집할 게 없었기 때문이다. 그 버그가 풀리자 하루 2,000~4,500곳이
//   들어오는데 수집 몫이 없어 **적체만 쌓였다**(실측: 발굴 22,981콜 소모 후 수집엔 2,019콜만 남아 205곳).
//   발굴만 해봐야 후기가 없으면 공개가 안 되니 사용자에겐 0이다 — 그래서 적체가 크면 발굴을 멈춘다.
// 🔴 2026-09-18 대표님 지시로 800 → 1,500.
//   800은 하루 수집 처리량보다 낮게 잡혀 있어서, 발굴이 성공할수록 다음날 발굴이 막히는 진동을 만들었다.
//   실측: 09-17 발굴 687곳 → 적체 818 → **09-18 07:05 스윕 스킵(발굴 0)** → 수집이 쿼터 21,074콜 독식.
//   같은 날 오후 수집으로 적체를 626까지 내리고 스윕을 수동 실행하니 2,898콜에 862곳(카페당 3.4콜).
//   즉 가드가 지키려던 것(후기 없는 카페 양산)보다 막아버린 것(발굴 자체)이 컸다.
//   기준: 하루 수집 소화량 실측 1,447곳(09-18)의 약 1배 — 하루 안에 따라잡을 수 있는 양까지는 허용한다.
const COLLECT_BACKLOG_STOP = Number(process.env.COLLECT_BACKLOG_STOP || 1500);

/** 후기 수집 대기(적재만 되고 후기 없는 카페) 수. */
export async function collectBacklog(): Promise<number> {
  const r = (await sql`SELECT count(*)::int n FROM cafes WHERE pipeline_status='new' AND raw_reviews IS NULL`
    .catch(() => [])) as any[];
  return Number(r[0]?.n ?? 0);
}

/** 발굴을 더 해도 되나 — 적체가 임계 미만일 때만. 임계 초과면 남은 쿼터는 수집이 쓴다. */
export async function discoveryMayRun(): Promise<{ ok: boolean; backlog: number; limit: number }> {
  const backlog = await collectBacklog();
  return { ok: backlog < COLLECT_BACKLOG_STOP, backlog, limit: COLLECT_BACKLOG_STOP };
}
// 실측 429 후 '차단'으로 볼 시간(분). 이 시간이 지나면 자동으로 재시도 허용(자가치유). 진짜 소진이면 다음 콜이 또 429→재마킹.
const EXHAUST_COOLDOWN_MIN = Number(process.env.NAVER_EXHAUST_COOLDOWN_MIN || 20);

// KST 기준 '오늘'(자정 리셋과 정렬)
function kstDay(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

let ensured = false;
async function ensure() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS naver_budget (day TEXT PRIMARY KEY, used INT NOT NULL DEFAULT 0, exhausted BOOLEAN DEFAULT false, updated_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  ensured = true;
}

// 오늘 성공 호출 누계(실측). ⚠️ 더 이상 exhausted로 25k를 강제 반환하지 않는다(스티키 소진 버그 교정).
export async function naverUsedToday(): Promise<number> {
  await ensure();
  const r = (await sql`SELECT used FROM naver_budget WHERE day=${kstDay()}`.catch(() => [])) as any[];
  return r[0]?.used ?? 0;
}

export async function naverRemaining(): Promise<number> {
  return Math.max(0, NAVER_DAILY_QUOTA - (await naverUsedToday()));
}

// 최근 실측 429로 '차단' 상태인가? — exhausted=true이고 마지막 마킹이 쿨다운 이내일 때만. 쿨다운 지나면 자동 만료.
export async function naverBlocked(): Promise<boolean> {
  await ensure();
  const r = (await sql`SELECT exhausted, (updated_at > now() - make_interval(mins => ${EXHAUST_COOLDOWN_MIN})) AS recent
    FROM naver_budget WHERE day=${kstDay()}`.catch(() => [])) as any[];
  return !!(r[0]?.exhausted && r[0]?.recent);
}

// 성공 호출 1건(또는 n건) 계상 + 소진플래그 해제(성공 = Naver가 응답 = 쿼터 있음 → 자가치유).
export async function bumpNaver(n = 1): Promise<void> {
  await ensure();
  await sql`INSERT INTO naver_budget (day, used, exhausted) VALUES (${kstDay()}, ${n}, false)
    ON CONFLICT (day) DO UPDATE SET used = naver_budget.used + ${n}, exhausted = false, updated_at = now()`.catch(() => {});
}

// 실제 429(한도초과)를 만났을 때 — used는 건드리지 않고(강제 25k 금지) 시각만 찍어 쿨다운 차단. 성공 콜이 오면 즉시 해제된다.
export async function markNaverExhausted(): Promise<void> {
  await ensure();
  await sql`INSERT INTO naver_budget (day, used, exhausted) VALUES (${kstDay()}, 0, true)
    ON CONFLICT (day) DO UPDATE SET exhausted = true, updated_at = now()`.catch(() => {});
}

// 발굴 스윕용: (최근 429로 차단 아님) AND (예약분 남기고도 더 쓸 여유 있음).
export async function sweepMayContinue(): Promise<{ ok: boolean; used: number; remaining: number; blocked: boolean }> {
  const used = await naverUsedToday();
  const blocked = await naverBlocked();
  const remaining = Math.max(0, NAVER_DAILY_QUOTA - used);
  // 스윕은 발굴(cron-grow)·폐업·파기재수집·**수집** 예약을 모두 남긴다
  return { ok: !blocked && remaining > NAVER_SWEEP_RESERVE + NAVER_CLOSURE_RESERVE + NAVER_RECOLLECT_RESERVE + NAVER_COLLECT_RESERVE, used, remaining, blocked };
}

/** 파기 재수집 전용: 자기 예약분(1,500) 안에서만 쓴다 — 폐업 예약은 건드리지 않는다. */
export async function recollectMayUse(): Promise<{ ok: boolean; remaining: number }> {
  const used = await naverUsedToday();
  const remaining = Math.max(0, NAVER_DAILY_QUOTA - used);
  return { ok: !(await naverBlocked()) && remaining > NAVER_CLOSURE_RESERVE, remaining };
}
