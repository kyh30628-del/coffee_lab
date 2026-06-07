#!/bin/bash
# 매일 자정 직후 raw 캐시 예열. launchd 최소 PATH 대응.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
# 로컬에서 직접 합성(Vercel 함수 타임아웃 회피). tsx로 TS 라이브러리 로드.
exec /usr/local/bin/node --import tsx scripts/warmup-local.mjs >> /tmp/coffee-warmup.log 2>&1
