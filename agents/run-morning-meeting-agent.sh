#!/bin/zsh
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source /Users/wangwida/coffee-platform/agents/_run.sh
cd /Users/wangwida/coffee-platform/web || exit 1
LOG="/Users/wangwida/coffee-platform/agent-reports/logs/morning-meeting-agent-$(date +%Y%m%d-%H%M).log"
echo "[$(date)] === 주간 조간회의(월요일 08시) 시작 ===" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
# 다이제스트는 run-daily가 이미 생성(중복 제거). 단독 실행 대비 없으면 생성.
[ -f /Users/wangwida/coffee-platform/agent-reports/DIGEST.md ] || node --import tsx scripts/make-digest.mjs >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1
claude_run "/Users/wangwida/coffee-platform/agents/morning-meeting-agent.md" "Bash Read Write" "$LOG" || echo "[조간회의] morning-meeting-agent 2회 실패" >> "$LOG"
echo "[$(date)] === 조간 회의 종료 ===" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
