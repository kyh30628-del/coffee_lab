#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source "$COFFEE_ROOT/agents/_run.sh"
cd "$COFFEE_ROOT/web" || exit 1
LOG="$COFFEE_ROOT/agent-reports/logs/team-ops-support-agent-$(date +%Y%m%d-%H%M).log"
claude_run "$COFFEE_ROOT/agents/team-ops-support-agent.md" "Bash Read Write" "$LOG" || echo "[비서실장] team-ops-support-agent 2회 실패" >> "$LOG"
