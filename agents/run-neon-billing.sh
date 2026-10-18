#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
# 💳 Neon 실청구 지표 스냅샷(2026-09-14) — 매일 07:50 KST, cron-costwatch(08:00)가 읽기 직전에 채운다.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$COFFEE_ROOT/web" || exit 1
trap '(node --import tsx scripts/heartbeat.mjs neon-billing $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
node scripts/neon-billing-snapshot.mjs >> $COFFEE_ROOT/agent-reports/logs/neon-billing-$(date +%Y%m).log 2>&1
