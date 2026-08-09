// 🔔 결재 승인 → 로컬 dev 잡 즉시 발화 브릿지.
//   Vercel(클라우드)은 CEO 맥을 직접 못 건드림(ToS·구조) → 무료 푸시 중계(ntfy.sh)에 신호 한 줄을 쏘고,
//   맥의 상시 리스너(run-trigger-listener.sh)가 열린 연결로 즉시 수신 → ~/.coffee-dev-trigger touch →
//   launchd WatchPaths가 dev-pipeline·dev-deploy를 그 즉시 실행. 폴링 아님 = Neon 접속 0 = 비용 0.
//   ⚠️ 보내는 건 상수 신호("go")뿐 — 민감정보·시크릿 절대 싣지 않는다. 토픽명이 유일한 공유 시크릿(env).
//   중계 실패해도 무해: 4창 백업 스케줄이 잡고, 헛발화는 스크립트가 즉시 종료(토큰0)라 no-op.
//
// ⚠️ 2026-08-09: 이 경로가 **프로덕션에서 4일간 죽어 있었다.** TRIGGER_NTFY_TOPIC이 로컬 .env.local에만 있고
//   Vercel env에 없어서 아래 early return이 매번 조용히 발동 → 승인해도 다음 창(최대 4h)까지 대기.
//   교훈: **조용한 skip은 죽은 기능을 살아있는 것처럼 보이게 한다.** 이제 결과를 호출부로 돌려주고
//   어드민 토스트에 표시한다(하네스 원칙 "실행했다≠효과가 있었다"의 배포 라인 판).
export type TriggerResult = "sent" | "unconfigured" | "failed";

export async function pingDevTrigger(reason: string): Promise<TriggerResult> {
  const topic = process.env.TRIGGER_NTFY_TOPIC;
  if (!topic) {
    console.warn("[devTrigger] TRIGGER_NTFY_TOPIC 미설정 — 즉시발화 불가, 백업 스케줄 대기");
    return "unconfigured";
  }
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500); // 응답 지연 방지(중계는 best-effort)
    const r = await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      body: "go",
      headers: { Title: "coffee-dev", Tags: reason.slice(0, 40) },
      signal: ac.signal,
    }).catch(() => null);
    clearTimeout(t);
    if (!r?.ok) { console.warn(`[devTrigger] 중계 실패(${r?.status ?? "network"})`); return "failed"; }
    return "sent";
  } catch {
    return "failed"; // 중계 실패해도 배포 자체는 유효 — 백업 스케줄이 커버
  }
}
