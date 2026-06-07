#!/bin/bash
# launchd/cron에서 호출하는 래퍼. 환경변수 로드 후 Sonnet 판정 배치 실행.
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # 설정돼 있으면 구독 대신 API키로 가버리므로 해제
exec /usr/bin/env node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
