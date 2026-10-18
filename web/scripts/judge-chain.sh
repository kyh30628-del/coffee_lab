#!/bin/zsh
# 🎯 판정 집행 — **구간별로 모델을 달리 쓴다.** (2026-10-19 재설계, 실측 비용 기반)
#   ① refine (공개 중 21,676곳) = **Haiku 5.5**
#      이유: 실측 곳당 Sonnet 5 $0.00608 → 전량 $131.8 로 예산($79 잔여) 초과다.
#      CEO 1순위 지시는 "예산 안에서 **전부** 돌려"다. Haiku 5.5는 곳당 약 $0.0003 → 전량 **$6.6**.
#      모델 비교 실측(후기 46건): 일치 91.3% · Sonnet이 4건 더 살림 — 표본이 작고 차이도 작다.
#      그리고 오늘 확인된 정확성 핵심 결함(파싱 실패 10.3%·출력 잘림)은 **모델이 아니라 코드** 문제였다.
#   ② flip (미공개 중 판정이 공개를 만들 수 있는 847곳) = **Sonnet 5**
#      이유: 공개를 실제로 늘리는 구간이라 채택률 8.7pp 차이가 값어치가 있다. 비용 약 $3.
#   예산 하드스톱 $100은 집행기 안에 있다. 순서가 곧 우선순위다(사용자에게 보이는 것부터).
cd /Users/wangwida/coffee-platform/web
run() {  # run <scope> <model>
  echo "══════ 구간 $1 · 모델 $2 시작 $(date '+%m-%d %H:%M') ══════"
  JUDGE_MODEL=$2 node --import tsx scripts/judge-run.mjs --scope=$1 --budget=100 --base=http://127.0.0.1:$PORT
  echo "══════ 구간 $1 종료 $(date '+%m-%d %H:%M') ══════"
}
PORT=${PORT:-3215}
run refine claude-haiku-5-5
run flip claude-sonnet-5
echo "✅ 전 구간 종료 $(date '+%m-%d %H:%M')"
