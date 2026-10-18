#!/bin/zsh
# 개발 빌드 파이프라인 러너(5분) — CEO 승인건을 병렬 디스패처로 브랜치 구현·검증. (배포는 별도 워처가 2분마다)
#   락으로 중첩 방지(빌드 길 수 있음). 대상 없으면 디스패처가 즉시 종료(토큰0).
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOCK=/tmp/coffee-dev-pipeline.lock
if [ -e "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then exit 0; fi
echo $$ > "$LOCK"
# 2026-07-02: $?를 trap 첫 명령에서 즉시 캡처 — 과거 rm 뒤에 평가돼 항상 0(실패도 ok=true 기록)이던 버그.
trap 'c=$?; rm -f "$LOCK"; (cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs dev-pipeline $c >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
# 🛡️ 주간한도 가드 — pause면 비핵심 자율개발(신규 빌드) 보류, throttle면 병렬 축소(핵심 판정 보호)
GLVL=$(cd /Users/wangwida/coffee-platform/web && node scripts/usageGuard.mjs >/dev/null 2>&1; echo $?)
if [ "$GLVL" = 2 ]; then echo "[$(date)] dev-pipeline 주간한도 pause → 신규 빌드 보류" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log; exit 0; fi
if [ "$GLVL" = 1 ]; then export DEV_PARALLEL=1; else export DEV_PARALLEL=2; fi   # 동시 빌드 상한(워크트리 격리+전역 git락으로 병렬 안전)
bash /Users/wangwida/coffee-platform/agents/run-dev-agent.sh
