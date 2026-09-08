#!/bin/bash
# 🔁 인허가 수집 이어받기 — CEO 지시(2026-09-08) "내일 쿼터 차면 계획대로 진행".
#   data.go.kr 쿼터는 계정당 10,000회/일, KST 자정에 리셋된다. 일반음식점은 22,954페이지라 하루에 못 끝낸다.
#   매일 00:05 KST에 한 번 돌아 남은 페이지를 이어받고, 쿼터가 마르면 스스로 멈춘다.
#   ⏹️ 수집이 끝나면 매칭까지 돌리고 자기 자신을 해제한다(임시 잡 — 9/11 첫 보고 뒤 남지 않는다).
set -o pipefail   # ⚠️ set -u 금지 — read로 채우는 변수가 비면 스크립트가 통째로 죽는다(2026-09-08 실패 재발 방지)
cd "$HOME/coffee-platform/web" || exit 1
EP="general_restaurants"
STATE="$HOME/coffee-platform/agent-reports/permits/$EP.state.json"
LOG="$HOME/coffee-platform/agent-reports/permits/resume.log"
PLIST="$HOME/Library/LaunchAgents/com.coffee.permit-resume.plist"
say() { echo "[$(date '+%F %H:%M')] $*" | tee -a "$LOG"; }

progress() {
  node -e '
    const fs=require("fs");
    try{ const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      console.log((s.done?.length||0), Math.ceil((s.total||0)/100), (s.kept||0));
    }catch(e){ console.log(0,0,0); }' "$STATE"
}

if pgrep -f "fetch-permits.mjs $EP" >/dev/null 2>&1; then say "이미 수집 중 — 건너뜀"; exit 0; fi

set -- $(progress); DONE=${1:-0}; TOTAL=${2:-0}; KEPT=${3:-0}
say "시작: $DONE / $TOTAL 페이지 · 지역내 ${KEPT}건"
if [ "$TOTAL" -gt 0 ] && [ "$DONE" -ge "$TOTAL" ]; then
  say "✅ 이미 완료 — 임시 잡 해제"; launchctl unload "$PLIST" 2>/dev/null; exit 0
fi

for i in 1 2 3; do
  BEFORE=$DONE
  node scripts/closure/fetch-permits.mjs "$EP" --conc=28 >> /tmp/fetch-$EP.log 2>&1
  set -- $(progress); DONE=${1:-0}; TOTAL=${2:-0}; KEPT=${3:-0}
  say "이어받기 ${i}회차 후: $DONE / $TOTAL 페이지 (+$((DONE-BEFORE))) · 지역내 ${KEPT}건"
  if [ "$TOTAL" -gt 0 ] && [ "$DONE" -ge "$TOTAL" ]; then
    say "✅ 수집 완료 — 매칭 실행"
    node scripts/closure/match.mjs --sample=12 2>&1 | tail -40 | tee -a "$LOG"
    say "⏹️ 임시 잡 해제"; launchctl unload "$PLIST" 2>/dev/null; exit 0
  fi
  if [ "$((DONE-BEFORE))" -le 0 ]; then say "⛔ 진척 없음(쿼터 소진) — 내일 00:05에 이어받는다"; break; fi
  sleep 120
done
say "오늘 몫 종료: $DONE / $TOTAL 페이지 ($([ "$TOTAL" -gt 0 ] && echo $((DONE*100/TOTAL)) || echo 0)%)"
