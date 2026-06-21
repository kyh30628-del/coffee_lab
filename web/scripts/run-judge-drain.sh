#!/bin/bash
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY
export APP_URL="${APP_URL:-https://dongnecoffeenote.com}"
for i in $(seq 1 10); do
  OUT=$(JUDGE_MAX=50 JUDGE_CONC=3 /usr/local/bin/node scripts/judge-batch.mjs 2>&1)
  echo "$OUT" | grep -E "완료:|구독 한도" | tail -1
  echo "$OUT" | grep -q "구독 한도" && { echo "[drain] 한도 도달 — 판정 중단"; break; }
  sleep 5
done
echo "=== 그라운딩(판정완료분 재검) ==="
GROUNDING_MAX=300 /usr/local/bin/node scripts/verify-grounding.mjs 2>&1 | tail -2
echo "=== 처리 끝 → 일시정지 재적용 ==="
touch scripts/.ai-paused
echo "DRAIN_DONE"
