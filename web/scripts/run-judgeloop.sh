#!/bin/bash
# 판정+그라운딩만 하루 여러 번(04:00 본배치 외 09·14·19·23시) 자동 실행.
# Max 한도는 ~5시간마다 갱신되므로, 한도로 멈춰도 다음 슬롯이 큐에서 이어 처리 → backlog 자동 수렴.
# 변경된 카페(llm_judged_at<raw_collected_at)·미판정만 효율 처리. 추가 비용 없음(Haiku, Max 구독).
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # Max 구독 사용
/usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1            # 한도 시 우아하게 중단(진행분 저장)
exec /usr/local/bin/node scripts/verify-grounding.mjs >> /tmp/coffee-grounding.log 2>&1
