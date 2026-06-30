#!/bin/bash
# 유튜브 백필 일배치 — YouTube 쿼터(태평양 자정=16:00 KST) 리셋 직후 실행해 신선한 쿼터로 ~90곳/일 보강.
# 공개 카페 우선(검증>참고>후보). 쿼터 소진 시 스크립트가 자동 중단(내일 이어서).
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
echo "[$(date)] === 유튜브 백필 시작 ===" >> /tmp/coffee-youtube-backfill.log
exec /usr/local/bin/node --import tsx scripts/youtube-backfill.mjs >> /tmp/coffee-youtube-backfill.log 2>&1
