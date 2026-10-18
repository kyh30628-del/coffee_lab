#!/bin/zsh
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source /Users/wangwida/coffee-platform/agents/_run.sh
cd /Users/wangwida/coffee-platform/web || exit 1
LOG="/Users/wangwida/coffee-platform/agent-reports/logs/closure-agent-$(date +%Y%m%d-%H%M).log"
claude_run "/Users/wangwida/coffee-platform/agents/closure-investigation-agent.md" "Bash Read Write WebSearch WebFetch" "$LOG" || echo "[러너] closure-agent 2회 실패" >> "$LOG"
