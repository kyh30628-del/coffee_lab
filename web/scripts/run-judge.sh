#!/bin/bash
# launchd/cron에서 호출하는 래퍼. launchd는 최소 PATH라 node·claude 경로를 명시.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # 설정돼 있으면 구독 대신 API키로 가버리므로 해제
exec /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
