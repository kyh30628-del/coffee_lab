#!/bin/bash
# 판정+그라운딩 자동 루프. Max 한도 ~5시간 리셋마다 이어 처리 → backlog 자동 수렴.
# 예산 정책: 새벽(23~06시)=풀 사용(100%, 한도까지), 낮=~70%만(JUDGE_MAX 캡으로 사용자 몫 남김).
# 동시 판정(JUDGE_CONC=3) + 본문 경량화로 카페당 시간 단축.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # Max 구독 사용

HOUR=$(date +%H)
if [ "$HOUR" -ge 23 ] || [ "$HOUR" -lt 7 ]; then
  export JUDGE_MAX=5000   # 새벽: 한도까지 풀 사용
else
  export JUDGE_MAX=80     # 낮: ~70%만(사용자 인터랙티브 몫 남김)
fi
export JUDGE_CONC=3

/usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
exec /usr/local/bin/node scripts/verify-grounding.mjs >> /tmp/coffee-grounding.log 2>&1
