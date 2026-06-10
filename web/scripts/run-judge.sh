#!/bin/bash
# launchd/cron에서 호출하는 래퍼. launchd는 최소 PATH라 node·claude 경로를 명시.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY   # 설정돼 있으면 구독 대신 API키로 가버리므로 해제
# 낮 12:00 보조 배치(판정과 예산 분리 — 판정은 judgeloop 전담). promo는 대기 시만, youtube는 쿼터 내.
/usr/local/bin/node scripts/promo-batch.mjs >> /tmp/coffee-promo.log 2>&1
/usr/local/bin/node --import tsx scripts/youtube-backfill.mjs >> /tmp/coffee-yt.log 2>&1
# 🧠 레드팀 2층: LLM 그라운딩(환각·업체혼동 검증) — 매일 1회 상시 검증
exec /usr/local/bin/node scripts/verify-grounding.mjs >> /tmp/coffee-grounding.log 2>&1
