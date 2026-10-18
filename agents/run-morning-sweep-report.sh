#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
# 📋 아침 스윕 보고(매일 08:20) — 07:05 스윕이 끝난 뒤 종합 리포트를 남긴다.
#   3종 세트: 이 러너 + com.coffee.morning-sweep-report.plist + web/lib/jobTeams.ts + SCHEDULE.md
#   왜 잡인가: "내일 아침 보고하겠다"가 반복해서 안 지켜졌다(CEO 2026-09-17). 기억에 기대지 않는다.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$COFFEE_ROOT/web" || exit 1
trap '(node --import tsx scripts/heartbeat.mjs morning-sweep-report $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
node --import tsx scripts/morning-sweep-report.mjs
# 깊은 수집 일일 보고(2026-10-17, CEO 요구) — 처리 수·검증 후기 증감·ISR write·Neon 쓰기·네이버 사용률.
#   기억에 기대지 않는다: 같은 아침 잡에 얹어 매일 자동으로 나온다. 집계 쿼리만(큰 blob 미접촉).
node --import tsx scripts/deep-report.mjs || true
# 효과 검증(2026-10-17) — 북극성은 사람 유입이다. 처리군 vs 대조군 증감률로 판정한다.
#   하네스 3원칙: 실행이 아니라 **효과**가 성공. 10/24 이후부터 판정이 의미를 갖는다.
node --import tsx scripts/deep-effect.mjs || true
# 🛡️ 스키마 관문(2026-10-18) — "없는 테이블·컬럼을 조회하는데 .catch가 삼켜 화면엔 0으로 보이는" 결함 감시.
#   왜 상시화: 측정 오류 15건 중 4건이 '이름을 확인 없이 지어 쓴 것'이었다. 사람 눈으로는 못 찾는다.
#   비용 0: sql 템플릿 952개를 EXPLAIN만 건다(계획만 세우고 행을 읽지 않음). 로컬 실행 → Vercel 0.
node scripts/schema-guard.mjs || true
# 🔭 효과 판정 확인(2026-10-18) — 하네스 1원칙이 **실제로 기록되는지** 매일 본다.
#   그 전까지 effect_ok가 30일 2,372건 전부 NULL이었다(선언만 있고 계산 안 됨). 고쳤으니 증거를 매일 남긴다.
#   비용 0: 집계 쿼리 2개(작은 컬럼). 로컬 실행 → Vercel 0.
node --import tsx scripts/effect-watch.mjs || true
# 🪜 파이프라인 적체 보고(2026-10-18) — 단계별 '남은 일'과 추세. 적체가 줄지 않으면 그 단계가 막힌 것이다.
#   왜: 계량을 남긴 잡 42종 중 '남은 일'을 보고하는 건 2종뿐이었다 → 어느 단계가 막혔는지 알 수 없었다.
#   비용: 단계별 COUNT 7회(작은 컬럼) + 스냅샷 7행. 하루 1회. 로컬 실행 → Vercel 0.
node --import tsx scripts/pipeline-report.mjs || true
