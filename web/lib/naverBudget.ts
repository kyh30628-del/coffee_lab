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
  return { ok: !blocked && remaining > NAVER_SWEEP_RESERVE, used, remaining, blocked };
}
