#!/bin/zsh
# 📋 아침 스윕 보고(매일 08:20) — 07:05 스윕이 끝난 뒤 종합 리포트를 남긴다.
#   3종 세트: 이 러너 + com.coffee.morning-sweep-report.plist + web/lib/jobTeams.ts + SCHEDULE.md
#   왜 잡인가: "내일 아침 보고하겠다"가 반복해서 안 지켜졌다(CEO 2026-09-17). 기억에 기대지 않는다.
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd /Users/wangwida/coffee-platform/web || exit 1
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
