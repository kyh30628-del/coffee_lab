#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
# 🔎 IndexNow 일일 제출(2026-09-13, CEO "인덱스나우 등록해") — 라이브 사이트맵의 **미제출 URL만** 네이버·빙 등에 알린다.
#   왜: 부산·경남(09-06 편입) 색인 지연 조사에서 이 스크립트가 스케줄 없이 수동으로만 돌던 것을 발견. 새 지역이 열릴 때마다
#       사람이 기억해서 돌려야 했다 → 매일 자동으로. 이미 제출한 URL은 indexnow_log로 걸러 스팸 취급을 피한다.
#   비용: 사이트맵 1회 fetch(ISR 캐시) + indexnow_log 1회 읽기 + 신규분 INSERT. Vercel 함수시간 0(로컬 실행).
#   3종 세트: 이 러너 + com.coffee.indexnow.plist + web/lib/jobTeams.ts(indexnow=성장본부) + SCHEDULE.md.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$COFFEE_ROOT/web" || exit 1
LOG="$COFFEE_ROOT/agent-reports/logs/indexnow-$(date +%Y%m%d-%H%M).log"
trap '(node --import tsx scripts/heartbeat.mjs indexnow $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
echo "[$(date)] === IndexNow 제출 시작(미제출분만) ===" >> "$LOG"
node --import tsx scripts/indexnow-submit.mjs >> "$LOG" 2>&1
echo "[$(date)] === IndexNow 제출 종료 ===" >> "$LOG"
