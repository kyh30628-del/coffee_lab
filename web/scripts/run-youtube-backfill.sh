#!/bin/bash
# 유튜브 백필 일배치 — YouTube 쿼터(태평양 자정=16:00 KST) 리셋 직후 실행해 신선한 쿼터로 ~90곳/일 보강.
# 공개 카페 우선(검증>참고>후보). 쿼터 소진 시 스크립트가 자동 중단(내일 이어서).
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
echo "[$(date)] === 유튜브 백필 시작 ===" >> /tmp/coffee-youtube-backfill.log
# 2026-07-02: exec 제거 — 크래시 시에도 실패 하트비트를 남긴다(과거: 성공 시에만 mjs가 recordRun → 중도 크래시 무음 실종).
/usr/local/bin/node --import tsx scripts/youtube-backfill.mjs >> /tmp/coffee-youtube-backfill.log 2>&1
c=$?
if [ "$c" -ne 0 ]; then
  /usr/local/bin/node --import tsx scripts/heartbeat.mjs youtube-backfill "$c" "비정상 종료(exit $c) — /tmp/coffee-youtube-backfill.log 확인" >> /tmp/coffee-heartbeat.log 2>&1
fi
exit $c
