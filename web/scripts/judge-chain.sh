#!/bin/zsh
# 🎯 판정 집행 — **위험이 있는 구간에만 좋은 모델.** (2026-10-19 3차 재설계, 전부 실측 기반)
#   ① thin   (공개 중 + 후기 4건 이하 = 공개 문턱 근접) 5,217곳 = **Sonnet 5** $31.72
#      근거: 비공개 전환율이 '얇은 카페 비율'에 정비례했다(4.9%→0.04% · 6.8%→0.20% · 10.9%→0.42%).
#            얇은 카페당 정규화: Haiku 3.0~3.8% vs Sonnet 0.75% — 4~5배 거칠다.
#            CEO 지시 "비공개는 보수적으로 해" → 위험 구간에만 좋은 모델을 쓴다.
#   ② refine (나머지 공개 중) 11,085곳 = **Haiku 5.5** $4.54
#      근거: 구제/곳 2.29~2.39 vs Sonnet 2.41 — 사실상 동등한데 14배 저렴하다.
#            ①이 먼저 돌아 llm_judged_at이 찍히므로 여기서 중복으로 사지 않는다.
#   ③ flip   (미공개 중 판정이 공개를 만드는 구간) 847곳 = **Sonnet 5** 약 $3
#      근거: 공개를 실제로 늘리는 구간이라 채택률 8.7pp가 값어치 있다.
#   합계 약 $39 / 잔여 예산 $78. 예산 하드스톱 $100은 집행기 안에 있다.
cd /Users/wangwida/coffee-platform/web
run() {
  echo "══════ 구간 $1 · 모델 $2 시작 $(date '+%m-%d %H:%M') ══════"
  JUDGE_MODEL=$2 node --import tsx scripts/judge-run.mjs --scope=$1 --budget=100 --base=http://127.0.0.1:$PORT
  echo "══════ 구간 $1 종료 $(date '+%m-%d %H:%M') ══════"
}
PORT=${PORT:-3217}
run thin   claude-sonnet-5
run refine claude-haiku-5-5
run flip   claude-sonnet-5
echo "✅ 전 구간 종료 $(date '+%m-%d %H:%M')"
