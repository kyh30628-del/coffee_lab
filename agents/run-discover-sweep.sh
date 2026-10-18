#!/bin/zsh
# 🧭 발굴 스윕(매일) — 66개 수도권 전 지역을 네이버 한도(search/local 25k/일) 안에서 최대로 순회 발굴.
#   cron-grow(2h/1지역=각 지역 5.5일에 1회)만으론 롱테일 독립카페가 며칠씩 누락(예: 카페 희와) → 매일 전 지역 스윕으로 커버.
#   신규는 pipeline_status='new'(비공개)로 적재 → 합성·게이트 통과 후에만 공개(안전). 네이버 429서 스크립트가 깨끗이 중단.
#   3종 세트: 이 러너 + com.coffee.discover-sweep.plist + web/lib/jobTeams.ts(discover-sweep=성장본부·EXPECT_MAX_H) + SCHEDULE.md.
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/wangwida/coffee-platform/web || exit 1
LOG="/Users/wangwida/coffee-platform/agent-reports/logs/discover-sweep-$(date +%Y%m%d-%H%M).log"
# 💓 하트비트 — 종료(정상·중단·크래시)마다 agent_runs 기록 → 관제탑이 정지/실패 감지.
trap '(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs discover-sweep $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
echo "[$(date)] === 발굴 스윕 시작(매일 네이버 한도 최대 수집) ===" >> "$LOG"
node --import tsx scripts/discover-sweep.mjs >> "$LOG" 2>&1
echo "[$(date)] === 발굴 스윕 종료 ===" >> "$LOG"
