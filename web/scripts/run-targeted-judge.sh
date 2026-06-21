#!/bin/bash
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY
export APP_URL="${APP_URL:-https://dongnecoffeenote.com}"
echo "=== 하츠베이커리 타겟 재판정(지점 구분) ==="
JUDGE_CAFE_ID=648 /usr/local/bin/node scripts/judge-batch.mjs
JUDGE_CAFE_ID=6542 /usr/local/bin/node scripts/judge-batch.mjs
echo "=== 우선순위 판정(기존공개 먼저=재큐된 의심 포함) cap 200 ==="
JUDGE_MAX=200 JUDGE_CONC=3 /usr/local/bin/node scripts/judge-batch.mjs
echo "=== 그라운딩(판정완료분 재검) cap 250 ==="
GROUNDING_MAX=250 /usr/local/bin/node scripts/verify-grounding.mjs
echo "=== 처리 끝 → 일시정지 재적용(주간한도 보호) ==="
touch scripts/.ai-paused
echo "DONE"
