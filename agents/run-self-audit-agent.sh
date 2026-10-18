#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source "$COFFEE_ROOT/agents/_run.sh"
cd "$COFFEE_ROOT/web" || exit 1
LOG="$COFFEE_ROOT/agent-reports/logs/self-audit-agent-$(date +%Y%m%d-%H%M).log"
# 실패를 exit code로 전파(2026-07-02) — trigger-watch가 실패 시 트리거를 un-consume해 사건 유실을 막는다.
claude_run "$COFFEE_ROOT/agents/self-audit-agent.md" "Bash Read Write" "$LOG" || { echo "[러너] self-audit-agent 3회 실패" >> "$LOG"; exit 1; }
