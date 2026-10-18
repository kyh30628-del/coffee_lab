#!/bin/zsh
# 🏪 소상공인 상가업소정보 수도권 롤아웃(매일 07:00) — 인허가 원장과 다른 별도 공공데이터로 카페 발굴.
#   2026-10-02 CEO 지시("자동으로 7시에 시작해, 정확하게 해"). 적재→실제 수집·합성까지 돌려 진짜 통과수만 보고
#   (적재=통과로 보고하지 않는다, 09-30 사고 재발방지). 66개 지역 다 돌면 자동으로 '할 일 없음'으로 끝난다.
#   3종 세트: 이 러너 + com.coffee.sangga-rollout.plist + web/lib/jobTeams.ts(sangga-rollout=성장본부·EXPECT_MAX_H 30) + SCHEDULE.md.
export PATH="/Users/wangwida/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
cd /Users/wangwida/coffee-platform/web || exit 1
LOG="/Users/wangwida/coffee-platform/agent-reports/logs/sangga-rollout-$(date +%Y%m%d-%H%M).log"
# 💓 하트비트 — 종료(정상·중단·크래시)마다 agent_runs 기록 → 관제탑이 정지/실패 감지.
trap '(node --import tsx scripts/heartbeat.mjs sangga-rollout $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
echo "[$(date)] === 상가업소정보 롤아웃 시작(--budget ${BUDGET:-10000}) ===" >> "$LOG"
node --import tsx scripts/sangga-rollout.mjs --budget "${BUDGET:-10000}" >> "$LOG" 2>&1
echo "[$(date)] === 상가업소정보 롤아웃 종료 ===" >> "$LOG"
