#!/bin/bash
# 매일 자정 직후 raw 캐시 예열. launchd 최소 PATH 대응.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
exec /usr/local/bin/node scripts/warmup-raw.mjs >> /tmp/coffee-warmup.log 2>&1
