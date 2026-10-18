#!/bin/zsh
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
A=/Users/wangwida/coffee-platform/agents
# 💓 하트비트 — 종료마다 agent_runs 기록 → 정지/실패 감지(담당: 기획조정실 직할 자율진단).
trap '(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs self-audit $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
LOCK=/tmp/coffee-selfaudit.lock
# 이전 실행이 아직 돌면 스킵(정기 하루 3회 11:30·15:30·21:30 + 이벤트 기동 겹침 방지)
if [ -e "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "[$(date)] self-audit 이전 실행 진행중 → 스킵" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log; exit 0
fi
echo $$ > "$LOCK"
echo "[$(date)] === 자율진단 사이클(정기 매일 11:30·15:30·21:30) ===" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/make-digest.mjs >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1)
bash "$A/run-self-audit-agent.sh"
rm -f "$LOCK"
