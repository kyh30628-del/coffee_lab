import { sql } from "@/lib/db";

// 🛑 비용 자동 정지 스위치(CEO 지시 2026-08-03: "컴퓨트/전송이 과다로 오르면 작업하지 말고 멈춰").
//   cron-costwatch가 이상(임계 초과)을 감지하면 halted=true로 세우고, 정상으로 돌아오면 자동 해제.
//   무거운 자율 크론(youtube-backfill·sentinel·resynth·grow 등)은 시작 시 isCostHalted()를 확인해 스킵한다.
//   → 데이터전송/컴퓨트를 올리는 작업 자체를 멈춰 청구 급증을 원천 차단.
let ensured = false;
async function ensure() {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS cost_guard (id INT PRIMARY KEY DEFAULT 1, halted BOOLEAN DEFAULT false, reason TEXT, set_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  ensured = true;
}

export async function isCostHalted(): Promise<boolean> {
  try {
    await ensure();
    const r = (await sql`SELECT halted FROM cost_guard WHERE id = 1`)[0] as any;
    return !!r?.halted;
  } catch { return false; } // 조회 실패 시 막지 않음(가용성 우선)
}

export async function setCostHalt(on: boolean, reason: string): Promise<void> {
  try {
    await ensure();
    await sql`INSERT INTO cost_guard (id, halted, reason, set_at) VALUES (1, ${on}, ${reason.slice(0, 200)}, now())
      ON CONFLICT (id) DO UPDATE SET halted = ${on}, reason = ${reason.slice(0, 200)}, set_at = now()`;
  } catch { /* 무해 실패 */ }
}
