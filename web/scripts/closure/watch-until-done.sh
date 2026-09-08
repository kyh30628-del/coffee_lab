#!/bin/bash
# 👀 일반음식점 수집이 끝나면 **바로 매칭률을 낸다** — CEO 지시(2026-09-09) "수집 끝나면 매칭률 보고해".
#   5분마다 상태만 본다(API 호출 0·DB 접속 0). 완료되면 match.mjs를 돌리고 결과를 찍은 뒤 종료한다.
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"   # launchd·백그라운드 환경 대비(2026-09-09 실패 재발 방지)
set -o pipefail
cd "$HOME/coffee-platform/web" || exit 1
STATE="$HOME/coffee-platform/agent-reports/permits/general_restaurants.state.json"
LOG="$HOME/coffee-platform/agent-reports/permits/resume.log"
DEADLINE=$(( $(date +%s) + 30*3600 ))   # 30시간 안에 안 끝나면 그대로 보고하고 종료

progress() {
  node -e '
    const fs=require("fs");
    try{ const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      console.log((s.done?.length||0), Math.ceil((s.total||0)/100), (s.kept||0));
    }catch(e){ console.log(0,0,0); }' "$STATE"
}

while :; do
  set -- $(progress); DONE=${1:-0}; TOTAL=${2:-0}; KEPT=${3:-0}
  if [ "$TOTAL" -gt 0 ] && [ "$DONE" -ge "$TOTAL" ]; then
    echo "✅ 수집 완료: ${DONE}/${TOTAL} 페이지 · 지역내 ${KEPT}건"
    echo "[$(date '+%F %H:%M')] 수집 완료 — 매칭 시작" >> "$LOG"
    node scripts/closure/match.mjs --sample=12 2>&1 | tee -a "$LOG"
    exit 0
  fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    echo "⏰ 30시간 경과 — 미완 상태로 보고: ${DONE}/${TOTAL} 페이지 ($([ "$TOTAL" -gt 0 ] && echo $((DONE*100/TOTAL)) || echo 0)%) · 지역내 ${KEPT}건"
    exit 2
  fi
  sleep 300
done
