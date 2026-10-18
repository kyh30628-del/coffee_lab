#!/bin/zsh
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source /Users/wangwida/coffee-platform/agents/_run.sh
cd /Users/wangwida/coffee-platform/web || exit 1
LOG="/Users/wangwida/coffee-platform/agent-reports/logs/self-audit-agent-$(date +%Y%m%d-%H%M).log"
# 실패를 exit code로 전파(2026-07-02) — trigger-watch가 실패 시 트리거를 un-consume해 사건 유실을 막는다.
claude_run "/Users/wangwida/coffee-platform/agents/self-audit-agent.md" "Bash Read Write" "$LOG" || { echo "[러너] self-audit-agent 3회 실패" >> "$LOG"; exit 1; }
