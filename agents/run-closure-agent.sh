#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source "$COFFEE_ROOT/agents/_run.sh"
cd "$COFFEE_ROOT/web" || exit 1
LOG="$COFFEE_ROOT/agent-reports/logs/closure-agent-$(date +%Y%m%d-%H%M).log"
claude_run "$COFFEE_ROOT/agents/closure-investigation-agent.md" "Bash Read Write WebSearch WebFetch" "$LOG" || echo "[러너] closure-agent 2회 실패" >> "$LOG"
