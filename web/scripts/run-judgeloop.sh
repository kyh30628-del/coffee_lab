#!/bin/bash
# AI 판정 하루 종일 가동(백로그 빨리 소진).
#  - 새벽(00~06시): 풀 사용(한도까지, 4병렬)
#  - 오전·오후·저녁(07~23시): 70%만(80캡, 3병렬) — 사장님 인터랙티브 몫 남김
# Max 한도 ~5시간 리셋마다 이어 처리. 판정만(그라운딩·promo는 별도).
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # Max 구독 사용

HOUR=$(date +%H)
if [ "$HOUR" -lt 7 ]; then
  export JUDGE_MAX=9999 JUDGE_CONC=4   # 새벽: 풀
else
  export JUDGE_MAX=80 JUDGE_CONC=3      # 낮: ~70%
fi
exec /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
