#!/bin/bash
# 🔭 인허가 수집이 끝나기를 기다렸다가 매칭까지 돌린다.
#   사용: bash scripts/closure/watch-and-match.sh <endpoint> [최대_이어받기_횟수]
#   - 하루 쿼터(1만 회)에 걸려 중간에 멈추면 남은 페이지가 state에 남는다 → 잠시 뒤 한 번 더 이어받아 본다.
#   - 쿼터 소진이면 이어받기도 즉시 실패하므로, 진척이 없으면 그만두고 남은 양을 보고한다(내일 재개용).
set -o pipefail   # ⚠️ set -u 금지: read로 채우는 변수가 비면 스크립트가 통째로 죽는다(2026-09-08 실패)
cd "$(dirname "$0")/../.." || exit 1
EP="${1:-general_restaurants}"
MAX_RETRY="${2:-2}"
STATE="$HOME/coffee-platform/agent-reports/permits/$EP.state.json"

progress() { # "완료페이지 전체페이지"
  node -e '
    const fs=require("fs");
    try{ const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      console.log((s.done?.length||0), Math.ceil((s.total||0)/100), (s.kept||0));
    }catch(e){ console.log(0,0,0); }' "$STATE"
}

for ((i=0; i<=MAX_RETRY; i++)); do
  while pgrep -f "fetch-permits.mjs $EP" >/dev/null 2>&1; do sleep 60; done
  set -- $(progress); DONE=${1:-0}; TOTAL=${2:-0}; KEPT=${3:-0}
  echo "[$EP] $DONE / $TOTAL 페이지 · 지역내 $KEPT건"
  if [ "$TOTAL" -gt 0 ] && [ "$DONE" -ge "$TOTAL" ]; then echo "✅ 수집 완료"; break; fi
  if [ "$i" -lt "$MAX_RETRY" ]; then
    echo "⏸️ 미완 — 5분 뒤 이어받기 시도 ($((i+1))/$MAX_RETRY)"
    sleep 300
    BEFORE=$DONE
    node scripts/closure/fetch-permits.mjs "$EP" --conc=28 >> /tmp/fetch-$EP.log 2>&1
    set -- $(progress); DONE=${1:-0}; TOTAL=${2:-0}; KEPT=${3:-0}
    if [ "$DONE" -le "$BEFORE" ]; then echo "⛔ 진척 없음(쿼터 소진 추정) — 오늘은 여기까지"; break; fi
  fi
done

set -- $(progress); DONE=${1:-0}; TOTAL=${2:-0}; KEPT=${3:-0}
echo "=== 최종 수집 상태: $DONE / $TOTAL 페이지 ($([ "$TOTAL" -gt 0 ] && echo $((DONE*100/TOTAL)) || echo 0)%) · 지역내 $KEPT건"
echo "=== 매칭"
node scripts/closure/match.mjs --sample=12 2>&1 | tail -40
