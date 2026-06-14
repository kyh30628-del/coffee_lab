#!/bin/bash
# 네이버 한도 리셋 직후(자정 후) 동 백필 — 신선한 쿼터로 동 채움 우선.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
exec /usr/local/bin/node --import tsx scripts/dong-backfill.mjs >> /tmp/coffee-dong-backfill.log 2>&1
