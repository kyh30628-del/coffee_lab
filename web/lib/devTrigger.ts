// 🔔 결재 승인 → 로컬 dev 잡 즉시 발화 브릿지.
//   Vercel(클라우드)은 CEO 맥을 직접 못 건드림(ToS·구조) → 무료 푸시 중계(ntfy.sh)에 신호 한 줄을 쏘고,
//   맥의 상시 리스너(run-trigger-listener.sh)가 열린 연결로 즉시 수신 → ~/.coffee-dev-trigger touch →
//   launchd WatchPaths가 dev-pipeline·dev-deploy를 그 즉시 실행. 폴링 아님 = Neon 접속 0 = 비용 0.
//   ⚠️ 보내는 건 상수 신호("go")뿐 — 민감정보·시크릿 절대 싣지 않는다. 토픽명이 유일한 공유 시크릿(env).
//   중계 실패해도 무해: 4창 백업 스케줄이 잡고, 헛발화는 스크립트가 즉시 종료(토큰0)라 no-op.
export async function pingDevTrigger(reason: string): Promise<void> {
  const topic = process.env.TRIGGER_NTFY_TOPIC;
  if (!topic) return; // 미설정이면 조용히 skip(백업 스케줄이 처리)
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 2500); // 응답 지연 방지(중계는 best-effort)
    await fetch(`https://ntfy.sh/${topic}`, {
      method: "POST",
      body: "go",
      headers: { Title: "coffee-dev", Tags: reason.slice(0, 40) },
      signal: ac.signal,
    }).catch(() => {});
    clearTimeout(t);
  } catch {
    /* 중계 실패 무시 — 백업 스케줄이 커버 */
  }
}
