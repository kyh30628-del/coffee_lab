#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source "$COFFEE_ROOT/agents/_run.sh"
cd "$COFFEE_ROOT/web" || exit 1
LOG="$COFFEE_ROOT/agent-reports/logs/morning-meeting-agent-$(date +%Y%m%d-%H%M).log"
echo "[$(date)] === 주간 조간회의(월요일 08시) 시작 ===" >> $COFFEE_ROOT/agent-reports/logs/orchestrator.log
# 다이제스트는 run-daily가 이미 생성(중복 제거). 단독 실행 대비 없으면 생성.
[ -f $COFFEE_ROOT/agent-reports/DIGEST.md ] || node --import tsx scripts/make-digest.mjs >> $COFFEE_ROOT/agent-reports/logs/orchestrator.log 2>&1
claude_run "$COFFEE_ROOT/agents/morning-meeting-agent.md" "Bash Read Write" "$LOG" || echo "[조간회의] morning-meeting-agent 2회 실패" >> "$LOG"
echo "[$(date)] === 조간 회의 종료 ===" >> $COFFEE_ROOT/agent-reports/logs/orchestrator.log
