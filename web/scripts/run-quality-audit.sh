#!/bin/bash
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
# 💓 하트비트 — 종료마다 agent_runs 기록 → 정지/실패 감지(담당: 품질본부).
trap '/usr/local/bin/node --import tsx scripts/heartbeat.mjs qualityaudit $? >> /tmp/coffee-heartbeat.log 2>&1' EXIT
/usr/local/bin/node --import tsx scripts/quality-audit.mjs >> /tmp/coffee-audit.log 2>&1
/usr/local/bin/node --import tsx scripts/fix-flagged.mjs >> /tmp/coffee-audit.log 2>&1
