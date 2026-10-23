#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"
# 🔄 사람이 본 카페 원본 재수집(매일 08:30) — 네이버 신규 리뷰 반영.
#   CEO 지시(2026-10-23 "네이버 리뷰는 계속 늘잖아. 효과적으로 가져와야 될거 아냐").
#   대상: 60일간 상세를 연 고유 카페 중 원본 30일+ 지난 곳만(전수 아님 — 트래픽 없는 카페는 득이 없다).
#   안전: synthStore의 mergeRawEvidence(합치기)+shouldBlockShrink(급감차단) 통과분만 쓴다.
#   하루 상한 300곳 · naverBlocked()면 즉시 건너뜀(발굴·수집과 쿼터 공유, 08시 신규 차는 시각 이후 실행).
#   3종 세트: 이 러너 + com.coffee.refresh-viewed.plist + web/lib/jobTeams.ts + SCHEDULE.md.
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"
cd "$COFFEE_ROOT/web" || exit 1
LOG="$COFFEE_ROOT/agent-reports/logs/refresh-viewed-$(date +%Y%m%d-%H%M).log"
trap '(node --import tsx scripts/heartbeat.mjs refresh-viewed $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
echo "[$(date)] === 재수집 시작(--limit ${LIMIT:-300}) ===" >> "$LOG"
node --import tsx scripts/refresh-viewed.mjs --limit "${LIMIT:-300}" >> "$LOG" 2>&1
echo "[$(date)] === 재수집 종료 ===" >> "$LOG"
