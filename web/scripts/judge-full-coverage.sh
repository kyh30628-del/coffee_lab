#!/bin/zsh
# 🎯 남은 크레딧 전량 집행 — CEO 지시(10-19) "하나도 빼놓지 말고 순서대로 끝까지 완벽하게 모두 진행해"
#
# 순서와 근거(전부 실측):
#   1 세밀 축 전수 재판정 — 현재 커버리지 **1.1%**(556/49,674). 협찬문체·나열글·구체성을 전 공개 카페에 확보.
#     판정은 `llm_judged_at`이 찍힌 곳을 다시 안 본다 → **강제 재판정**이 필요하다(아래 reset 참조).
#   4 판정 미경험 보충 — 공개 49,674곳 중 12,329곳이 한 번도 안 받았다(원본 있는 곳만 가능).
#   5 교차오염 정밀 — 이름 일관성<0.6 공개 카페 1,088곳. Sonnet 5(정확도 목적).
#   ※ 3(시설 태그 교정)은 전용 스크립트(facet-verify-apply.mjs)로 따로 돈다 — 판정 큐와 성질이 다르다.
#
# 모델 배분(실측 단가 Haiku $0.00042 · Sonnet $0.00608):
#   얇은 카페(문턱 근접)·오염 의심 = Sonnet 5 · 나머지 = Haiku 5.5
cd /Users/wangwida/coffee-platform/web
PORT=${PORT:-3221}
run() {
  echo "══════ [$1 · $2] $(date '+%H:%M') ══════"
  JUDGE_MODEL=$2 node --import tsx scripts/judge-run.mjs --scope=$1 --budget=100 --base=http://127.0.0.1:$PORT
}
run thin     claude-sonnet-5     # 문턱 근접 — 비공개 위험 집중
run verified claude-haiku-5-5    # 옥석 코어(평균 후기 101건)
run refine   claude-haiku-5-5    # 나머지 공개
run flip     claude-sonnet-5     # 공개를 만드는 구간
run rescue   claude-haiku-5-5    # 미공개 전수
echo "✅ 전 구간 종료 $(date '+%m-%d %H:%M')"
