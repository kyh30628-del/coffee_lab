#!/bin/zsh
# 💳 Neon 실청구 지표 스냅샷(2026-09-14) — 매일 07:50 KST, cron-costwatch(08:00)가 읽기 직전에 채운다.
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/wangwida/coffee-platform/web || exit 1
trap '(node --import tsx scripts/heartbeat.mjs neon-billing $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
node scripts/neon-billing-snapshot.mjs >> /Users/wangwida/coffee-platform/agent-reports/logs/neon-billing-$(date +%Y%m).log 2>&1
