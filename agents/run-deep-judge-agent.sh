#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
source "$COFFEE_ROOT/agents/_run.sh"
cd "$COFFEE_ROOT/web" || exit 1
# ⏸️ AI 판정 정지 존중 — .ai-paused 있으면 심층판정 스킵(CEO 지시·구독한도·콘솔키 비용 보호, '해제 금지').
#   일간 사이클(run-daily.sh)이 격일 짝수일마다 이 스크립트를 호출하는데 pause를 안 막던 갭 차단(2026-07-09).
#   .ai-paused 제거 = CEO의 재개 지시로만 다시 심층판정 실행됨.
if [ -f $COFFEE_ROOT/web/.ai-paused ]; then
  echo "[$(date)] 심층판정 스킵 — .ai-paused(AI 판정·그라운딩 정지·해제 금지)" >> $COFFEE_ROOT/agent-reports/logs/orchestrator.log
  # 🩹 2026-09-29 — 이 스킵이 agent_runs에 전혀 안 남아 81일간 조용히 방치됐다가 정지 감시 밖(EXPECT_MAX_H
  #   미등록)이라 아무 경보도 없이 발견이 지연됐다(대표님 지시로 조사). exit만 하지 않고 "일시정지 유지 중"을
  #   ok=true로 매회 새로 찍는다 — 정지 결정 자체는 안 건드린다(.ai-paused 삭제는 여전히 CEO만).
  node --import tsx $COFFEE_ROOT/web/scripts/heartbeat.mjs "deep-judge-agent" 0 \
    "일시정지 유지 중(2026-07-01 CEO 지시·구독한도/비용 보호, 해제 금지) — .ai-paused 존재로 스킵" >> /tmp/coffee-heartbeat.log 2>&1
  exit 0
fi
LOG="$COFFEE_ROOT/agent-reports/logs/deep-judge-agent-$(date +%Y%m%d-%H%M).log"
claude_run "$COFFEE_ROOT/agents/deep-judge-agent.md" "Bash Read Write" "$LOG" || echo "[기획조정실장] deep-judge-agent 2회 실패" >> "$LOG"
