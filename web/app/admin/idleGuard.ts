// 💰 관제탑 폴링 유휴 차단 (2026-08-18, CEO 지시: 불필요한 DB 조회로 DB를 깨우지 말 것)
//
// 문제: 관제탑은 15~30초마다 갱신한다. `visibilityState === "visible"` 가드는 있지만,
//   **탭을 열어둔 채 자리를 비우면** 화면은 계속 'visible'이라 폴링이 종일 돈다.
//   Neon은 깨어 있는 시간으로 과금되므로(5분 무활동 시 자동 정지), 이 폴링 하나가
//   DB를 하루 종일 못 자게 만든다. 실측에서도 관제탑 집계 쿼리들이 실행시간 상위권이었다.
//
// 해결: 마지막 **사람의 조작**으로부터 IDLE_MS가 지나면 폴링을 건너뛴다.
//   화면을 다시 만지는 순간 자동으로 재개되므로 쓰는 사람 입장에선 달라지는 게 없다.
const IDLE_MS = 3 * 60 * 1000; // 3분 — Neon 자동정지(5분)보다 짧게 잡아 잠들 틈을 준다
let lastAct = Date.now();

function touch() { lastAct = Date.now(); }
let bound = false;
function bind() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(ev, touch, { passive: true });
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") touch(); });
}

/** 폴링을 지금 돌려도 되는가 — 화면이 보이고, 최근 3분 안에 사람이 만졌을 때만 true. */
export function shouldPoll(): boolean {
  bind();
  if (typeof document === "undefined") return false;
  if (document.visibilityState !== "visible") return false;
  return Date.now() - lastAct < IDLE_MS;
}

/** 가시성 무관, 최근 idleMs 안에 사람이 이 탭을 만졌는가 — 백그라운드 알림 폴링(ChatWidget)용. */
export function recentlyActive(idleMs: number): boolean {
  bind();
  return Date.now() - lastAct < idleMs;
}
