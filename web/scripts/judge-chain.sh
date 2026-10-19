#!/bin/zsh
# 🎯 판정 집행 — 구간별 모델. (2026-10-19 4차, 전부 실측 기반)
#   ① thin     공개 중 + 후기 4건 이하 = **Sonnet 5** — 문턱 근접이라 비공개 위험 집중(전환 2.00% vs Haiku 3.0~3.8%)
#   ② verified 공개 '검증' 카페 중 **사람이 90일 내 본 2,309곳** = **Sonnet 5** $14 — 실제 읽히는 최고 품질 페이지
#   ③ verified 나머지 '검증' 카페 = **Haiku 5.5** — 구제/곳 2.34 vs 2.41로 동등한데 14배 싸다
#   ④ refine   나머지 공개 중 = **Haiku 5.5**
#   ⑤ flip     미공개 중 판정이 공개를 만드는 구간 = **Sonnet 5**
#   🔴 ②③을 ②먼저 돌리는 이유: Sonnet으로 본 카페는 llm_judged_at이 찍혀 ③에서 중복으로 사지 않는다.
#      그런데 집행기 scope는 '본 카페만' 거를 수 없다 → ②는 전용 스크립트(judge-viewed.mjs)로 돌린다.
#   예산 하드스톱 $100은 집행기 안에 있다.
cd /Users/wangwida/coffee-platform/web
run() {
  echo "══════ 구간 $1 · 모델 $2 시작 $(date '+%m-%d %H:%M') ══════"
  JUDGE_MODEL=$2 node --import tsx scripts/judge-run.mjs --scope=$1 --budget=100 --base=http://127.0.0.1:$PORT
  echo "══════ 구간 $1 종료 $(date '+%m-%d %H:%M') ══════"
}
PORT=${PORT:-3219}
run thin     claude-sonnet-5
run verified claude-haiku-5-5
run refine   claude-haiku-5-5
run flip     claude-sonnet-5
echo "✅ 전 구간 종료 $(date '+%m-%d %H:%M')"
