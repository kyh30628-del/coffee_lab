// 🧭 네이버 search/local 일일 할당량(25,000/일·KST 자정 리셋) 예산 관리 — **단일 출처**.
//   문제(2026-07-10): 예산 개념이 없어 discover-sweep이 새벽에 하루치 25k를 통째로 태우면
//   나머지 시간 cron-grow(2h)가 계속 429를 맞아 '발굴 중지'로 보였다("70%만 쓴다"던 약속 위반).
//   → 공용 일일 카운터 + 예약분(reserve): 발굴 스윕은 70%까지만 쓰고 30%는 cron-grow가 하루 종일
//   쓰도록 남긴다. 429를 실제로 만나면 소진으로 마킹해 전 잡이 즉시 우아하게 멈춘다(에러 아님·정상).
import { sql } from "./db";

export const NAVER_DAILY_QUOTA = 25000;
// 발굴 스윕이 남겨둘 예약분(cron-grow 2h용). 기본 30%(7,500) — 하루 12회 cron-grow가 지역당 ~600콜.
export const NAVER_SWEEP_RESERVE = Number(process.env.NAVER_SWEEP_RESERVE || 7500);

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

export async function naverUsedToday(): Promise<number> {
  await ensure();
  const r = (await sql`SELECT used, exhausted FROM naver_budget WHERE day=${kstDay()}`.catch(() => [])) as any[];
  if (r[0]?.exhausted) return NAVER_DAILY_QUOTA; // 실측 429 마킹되면 소진으로 간주
  return r[0]?.used ?? 0;
}

export async function naverRemaining(): Promise<number> {
  return Math.max(0, NAVER_DAILY_QUOTA - (await naverUsedToday()));
}

// 성공 호출 1건(또는 n건) 계상. 성공 쿼리만 카운트(429는 거부라 소비 안 함).
export async function bumpNaver(n = 1): Promise<void> {
  await ensure();
  await sql`INSERT INTO naver_budget (day, used) VALUES (${kstDay()}, ${n})
    ON CONFLICT (day) DO UPDATE SET used = naver_budget.used + ${n}, updated_at = now()`.catch(() => {});
}

// 실제 429(한도초과)를 만났을 때 — 오늘을 '소진'으로 마킹해 모든 잡이 즉시 멈추게(불필요한 429 폭탄 방지).
export async function markNaverExhausted(): Promise<void> {
  await ensure();
  await sql`INSERT INTO naver_budget (day, used, exhausted) VALUES (${kstDay()}, ${NAVER_DAILY_QUOTA}, true)
    ON CONFLICT (day) DO UPDATE SET exhausted = true, used = GREATEST(naver_budget.used, ${NAVER_DAILY_QUOTA}), updated_at = now()`.catch(() => {});
}

// 발굴 스윕용: 예약분을 남기고도 더 써도 되나? (remaining > reserve)
export async function sweepMayContinue(): Promise<{ ok: boolean; used: number; remaining: number }> {
  const used = await naverUsedToday();
  const remaining = NAVER_DAILY_QUOTA - used;
  return { ok: remaining > NAVER_SWEEP_RESERVE, used, remaining: Math.max(0, remaining) };
}
