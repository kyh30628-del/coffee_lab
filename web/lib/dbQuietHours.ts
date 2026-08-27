// 🌙 Neon 절전 보호 — **무거운 배치 작업이 지켜야 할 시간대 규칙**(2026-08-28 사고 대응).
//
// 왜 필요한가: collect-catchup.sh에는 "이미 깨어 있는 창(08·12·16·20시)에만 올라탄다"는 규칙이
//   주석·코드로 있었는데, **내가 돌린 판정 빌드/적용 스크립트에는 아무 규칙이 없었다.**
//   그 결과 심야에 큰 컬럼(raw_reviews)을 수천 회 읽는 작업을 두 개나 동시에 돌려
//   Neon이 오토스케일로 더 큰 컴퓨트를 잡았고 일일 비용이 급증했다(CEO 지적).
//   원칙을 문서로만 두면 안 지켜진다 — **코드가 거부하게** 만든다.
//
// 규칙(collect-catchup.sh와 동일한 근거):
//   · 03~07시 KST = 실측상 DB가 자는 구간. 여기서 돌면 **없던 가동이 새로 생긴다** → 금지.
//   · 그 외 시간대도 "무거운 작업"은 동시 2개 이상 금지(오토스케일 유발).
//
// 사용: 무거운 로컬 배치 진입점에서 `assertHeavyJobAllowed("작업명")` 한 줄.
//   급할 때만 ALLOW_HEAVY_ANYTIME=1 로 우회 — 우회했다는 사실이 로그에 남는다.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

const LOCK = "/tmp/dcn-heavy-job.lock";
const QUIET_START = 3, QUIET_END = 7; // KST

export function kstHour(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(now));
}

export function inQuietHours(now = new Date()): boolean {
  const h = kstHour(now);
  return h >= QUIET_START && h < QUIET_END;
}

/** 다른 무거운 작업이 이미 돌고 있나(동시 실행 = 오토스케일 유발). 죽은 락은 자동 회수. */
function heldBy(): number | null {
  if (!existsSync(LOCK)) return null;
  try {
    const pid = Number(readFileSync(LOCK, "utf8").trim());
    if (!pid) return null;
    try { process.kill(pid, 0); return pid; } catch { unlinkSync(LOCK); return null; } // 죽은 프로세스 → 회수
  } catch { return null; }
}

/**
 * 무거운 작업 시작 가능 여부를 강제한다. 위반이면 예외를 던져 **작업이 시작조차 못 하게** 한다.
 * 반환된 release()를 끝에서 호출(또는 프로세스 종료 시 자동 회수).
 */
export function assertHeavyJobAllowed(jobName: string): () => void {
  const bypass = process.env.ALLOW_HEAVY_ANYTIME === "1";
  if (inQuietHours() && !bypass) {
    throw new Error(`QUIET_HOURS_BLOCKED: 지금은 DB 절전 보호 구간(KST ${QUIET_START}~${QUIET_END}시)입니다. `
      + `무거운 작업(${jobName})은 08시 이후에 실행하세요. 꼭 지금 해야 하면 ALLOW_HEAVY_ANYTIME=1.`);
  }
  const other = heldBy();
  if (other && !bypass) {
    throw new Error(`HEAVY_JOB_BUSY: 다른 무거운 작업이 이미 실행 중(PID ${other})입니다. `
      + `동시 실행은 Neon 오토스케일을 유발합니다 — 끝난 뒤 실행하세요.`);
  }
  if (bypass) console.warn(`⚠️ [dbQuietHours] ${jobName}: 가드 우회(ALLOW_HEAVY_ANYTIME=1) — 비용 증가 감수`);
  writeFileSync(LOCK, String(process.pid));
  const release = () => { try { if (heldBy() === process.pid) unlinkSync(LOCK); } catch {} };
  process.once("exit", release);
  process.once("SIGINT", () => { release(); process.exit(130); });
  process.once("SIGTERM", () => { release(); process.exit(143); });
  return release;
}
