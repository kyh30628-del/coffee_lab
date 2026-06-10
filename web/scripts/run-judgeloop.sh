#!/bin/bash
# 새벽(00:30~06:00)에만 '판정'을 풀로 실행해 backlog 빠르게 소진. 낮엔 절대 안 돔(토큰 절약).
# 한도 도달 시 우아하게 중단 → 같은 새벽 다음 슬롯(리셋 후)이 이어감. 판정만(그라운딩·promo·youtube 제외).
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1

HOUR=$(date +%H)
# 안전장치: 06시~23시(낮)엔 실행 안 함
if [ "$HOUR" -ge 6 ]; then exit 0; fi

[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # Max 구독 사용
JUDGE_MAX=9999 JUDGE_CONC=4 exec /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
