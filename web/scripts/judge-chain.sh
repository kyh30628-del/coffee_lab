#!/bin/zsh
# 🎯 판정 집행 순서 = **사용자에게 보이는 것부터.** (2026-10-19 CEO 지적)
#   ① refine  — 이미 공개 중인 24,737곳. AI가 본 적 없는 경계 후기가 있는 live 페이지다. 정확도 급소.
#   ② flip    — 네 조건을 통과해 판정 결과가 실제로 공개를 만드는 미공개 847곳.
#   예산 하드스톱 $100은 집행기 안에 있다. 순서가 곧 우선순위다 — 예산이 끊기면 뒤가 안 돌 뿐이다.
cd /Users/wangwida/coffee-platform/web
for S in refine flip; do
  echo "══════ 구간 $S 시작 $(date '+%m-%d %H:%M') ══════"
  node --import tsx scripts/judge-run.mjs --scope=$S --budget=100 --base=http://127.0.0.1:3211
  echo "══════ 구간 $S 종료 $(date '+%m-%d %H:%M') ══════"
done
echo "✅ 전 구간 종료 $(date '+%m-%d %H:%M')"
