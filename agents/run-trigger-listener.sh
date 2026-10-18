#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
# 🔔 결재 승인 → 즉시 발화 리스너(상시). Vercel이 승인 시 ntfy.sh 토픽에 신호 한 줄을 쏘면,
#   이 스크립트가 '열린 연결'로 즉시 수신 → ~/.coffee-dev-trigger touch → launchd WatchPaths가
#   dev-pipeline·dev-deploy를 그 즉시 실행. **폴링 아님(Neon 접속 0) = 비용 0.**
#   토픽은 로컬 시크릿(공개 repo 아님). curl은 --max-time로 주기 재연결(신선도), launchd KeepAlive가 죽으면 재시작.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
TOPIC="coffee-dev-31ad788695d045f78fab"
TRIGGER=$HOME/.coffee-dev-trigger
LOG=/tmp/coffee-trigger-listener.log
echo "[$(date '+%m-%d %H:%M:%S')] 리스너 시작(topic=$TOPIC)" >> "$LOG"
while true; do
  # /raw: 메시지 본문만 줄단위 스트리밍, keepalive는 빈 줄 → 빈 줄은 무시하고 실제 신호만 touch.
  curl -sN --max-time 3300 "https://ntfy.sh/${TOPIC}/raw" 2>>"$LOG" | while IFS= read -r line; do
    if [ -n "$line" ]; then
      touch "$TRIGGER"
      echo "[$(date '+%m-%d %H:%M:%S')] 신호 수신($line) → 트리거 발화" >> "$LOG"
    fi
  done
  sleep 2   # 연결 끊기면 잠깐 쉬고 재연결
done
