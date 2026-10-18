#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
# 🔁 파기 재수집(매일) — 90일 파기로 원본 잃은 '검증' 등급 공개 카페의 후기를 다시 모은다.
#   3종 세트: 이 러너 + com.coffee.recollect-purged.plist + web/lib/jobTeams.ts + SCHEDULE.md
#   왜 로컬인가: cron-resynth(maxDuration 300s)에 얹으면 타임아웃으로 죽고 기록조차 안 남는다.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$COFFEE_ROOT/web" || exit 1
LOG="$COFFEE_ROOT/agent-reports/logs/recollect-purged-$(date +%Y%m%d-%H%M).log"
trap '(node --import tsx scripts/heartbeat.mjs recollect-purged $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
echo "[$(date)] === 파기 재수집 시작 ===" >> "$LOG"
node --import tsx scripts/recollect-purged.mjs >> "$LOG" 2>&1
echo "[$(date)] === 파기 재수집 종료 ===" >> "$LOG"
