#!/bin/bash
# 재정비 = 재합성 → AI 판정 → 그라운딩을 '한 흐름'으로 (앞뒤 정합성).
# 재합성이 규칙·dedup·인용을 갱신하고 llm_judged_at을 재큐하면, 곧바로 판정이 이어서 처리한다.
# 수동 전체 재정비나 cron에서 호출. launchd 최소 PATH 대응.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # Max 구독 사용(API키로 새지 않게)
LOG=/tmp/coffee-rebuild.log
echo "=== 재정비 시작 $(date) ===" >> "$LOG"
# 1) 재합성(규칙·dedup·인용 갱신) + 루브릭 변경 반영 위해 전체 재판정 큐 복귀(REJUDGE=1)
REJUDGE=1 /usr/local/bin/node --import tsx scripts/resynth-all.mjs >> "$LOG" 2>&1
# 2) AI 맥락 판정(애매한 후기 재심사 — 상한 크게, 한도 시 우아하게 중단·다음 04:00 이어감)
JUDGE_MAX=${JUDGE_MAX:-3000} /usr/local/bin/node scripts/judge-batch.mjs >> "$LOG" 2>&1
# 3) 그라운딩(환각·업체혼동 재검증)
exec /usr/local/bin/node scripts/verify-grounding.mjs >> "$LOG" 2>&1
