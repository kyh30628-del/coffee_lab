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
// 발굴 스윕이 남겨둘 예약분(cron-grow 2h용). 기본 30%(7,500) — 하루 12회 cron-grow가 지역당 ~600콜.
export const NAVER_SWEEP_RESERVE = Number(process.env.NAVER_SWEEP_RESERVE || 7500);
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
//   💡 예산 배분 결과: 스윕 9,300 + grow 7,500 + 수집 7,000 + 폐업 1,200 = 25,000
export const NAVER_COLLECT_RESERVE = Number(process.env.NAVER_COLLECT_RESERVE || 7000);
export const NAVER_RECOLLECT_RESERVE = Number(process.env.NAVER_RECOLLECT_RESERVE || 0);
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
const COLLECT_BACKLOG_STOP = Number(process.env.COLLECT_BACKLOG_STOP || 800);

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
