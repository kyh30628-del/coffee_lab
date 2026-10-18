#!/bin/zsh
# 🧾 공공 인허가 원장 적재(매일 07:00) — 원장의 영업중 커피숍·제과점을 네이버 local 1콜로 확인해 비공개(new)로 적재.
#   2026-09-21 본실행 전환(CEO 승인 09-20): 실측 1.69콜/곳(발굴 스윕 16.9콜 대체). 프랜차이즈·한시 사전 제외, 미발견은 tried.json으로 재질의 금지.
#   3종 세트: 이 러너 + com.coffee.import-permits.plist + web/lib/jobTeams.ts(import-permits=성장본부·EXPECT_MAX_H 30) + SCHEDULE.md.
export PATH="/Users/wangwida/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
cd /Users/wangwida/coffee-platform/web || exit 1
LOG="/Users/wangwida/coffee-platform/agent-reports/logs/import-permits-$(date +%Y%m%d-%H%M).log"
# 💓 하트비트 — 종료(정상·중단·크래시)마다 agent_runs 기록 → 관제탑이 정지/실패 감지.
trap '(node --import tsx scripts/heartbeat.mjs import-permits $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
# ⚖️ 2026-09-24 재배분: 적재 관문을 공개 관문과 통일(공개불가·같은건물 중복 사전 차단) → 적재 2.21콜/곳 · 수집 4.4콜/곳.
#   하루 가용 24,400(크론 예비 600 제외) = 적재 8,100 + 수집 16,300 ≈ 3,690곳이 끝까지 가는 균형점.
#   기본 예산식(25,000−폐업1,200−수집16,000=7,800)이면 수집 쪽이 매일 ~1,000콜 남는다 → 예산을 명시한다.
echo "[$(date)] === 원장 적재 시작(--limit ${LIMIT:-3800} --budget ${BUDGET:-8100}) ===" >> "$LOG"
node --import tsx scripts/import-permits.mjs --apply --limit "${LIMIT:-3800}" --budget "${BUDGET:-8100}" >> "$LOG" 2>&1
echo "[$(date)] === 원장 적재 종료 ===" >> "$LOG"
