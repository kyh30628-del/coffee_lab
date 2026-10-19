#!/bin/zsh
# 🎯 남은 크레딧 전량 집행 — CEO 지시(10-19) "남은 크레딧도 사용처를 분석해서 필요한 곳에 전부"
#
# 실측 단가: Haiku 5.5 $0.00042/곳 · Sonnet 5 $0.00608/곳 (곳당 후보 14건 기준)
# 배분(잔여 $65.08):
#   A 공개 카페 판정 완주   14,447곳 Haiku  $6.07  — 공개 49,294곳 **전부**가 AI를 거친 상태로 만든다
#   B 미공개 raw보유 전수   26,320곳 Haiku $11.05  — AI 귀속 99.0% 검증됨(규칙'검증' 922건 재현)
#   C 화면요소 검증 전수    30,820곳 Haiku $12.94  — 패싯·정체성·특징점수(소비자 직접 피해)
#   D 교차오염 정밀          1,445곳 Sonnet $8.79  — 이름일관성<0.6 + 비카페맥락>30%
#   E 규칙갭 발굴 확대       7,000곳 Haiku  $2.94  — 거부사유 전수 → 규칙 보강
#   합계 $41.79 · 여유 $23.28(2차 패스·재측정용)
#
# 순서 = 소비자에게 보이는 것부터. 예산 하드스톱 $100은 집행기 안에 있다.
cd /Users/wangwida/coffee-platform/web
PORT=${PORT:-3219}
run() {
  echo "══════ [판정] $1 · $2 · $(date '+%H:%M') ══════"
  JUDGE_MODEL=$2 node --import tsx scripts/judge-run.mjs --scope=$1 --budget=100 --base=http://127.0.0.1:$PORT
}
# A — 공개 카페 전수(얇은 카페는 좋은 모델, 나머지는 싼 모델)
run thin     claude-sonnet-5
run verified claude-haiku-5-5
run refine   claude-haiku-5-5
# B — 미공개: 공개를 만드는 구간 먼저, 그다음 전체
run flip     claude-sonnet-5
run rescue   claude-haiku-5-5
echo "✅ 판정 전 구간 종료 $(date '+%m-%d %H:%M')"
