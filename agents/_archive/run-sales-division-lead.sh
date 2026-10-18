#!/bin/zsh
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source /Users/wangwida/coffee-platform/agents/_run.sh
cd /Users/wangwida/coffee-platform/web || exit 1
LOG="/Users/wangwida/coffee-platform/agent-reports/logs/sales-division-lead-$(date +%Y%m%d-%H%M).log"
claude_run "/Users/wangwida/coffee-platform/agents/sales-division-lead.md" "Bash Read Write" "$LOG" || echo "[부사장] sales-division-lead 2회 실패" >> "$LOG"
