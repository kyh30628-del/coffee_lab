#!/bin/bash
# 판정 전용 루프(다른 배치와 예산 충돌 방지). Max 리셋마다 이어 처리 → backlog 자동 수렴.
# 새벽(23~06시): 판정만 '최대'(한도까지, 4병렬). 낮: ~70%만(80캡, 3병렬) + 그라운딩 보조.
# promo/youtube/그라운딩은 낮 본배치(run-judge, 12:00)에서 따로 → 새벽 판정 예산을 안 빼앗음.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # Max 구독 사용

HOUR=$(date +%H)
if [ "$HOUR" -ge 23 ] || [ "$HOUR" -lt 7 ]; then
  # 새벽: 판정만 최대(다른 것과 충돌 없이 예산 100% 판정에)
  JUDGE_MAX=9999 JUDGE_CONC=4 /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
else
  # 낮: ~70%만 + 그라운딩 보조
  JUDGE_MAX=80 JUDGE_CONC=3 /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
  exec /usr/local/bin/node scripts/verify-grounding.mjs >> /tmp/coffee-grounding.log 2>&1
fi
