#!/bin/zsh
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
A=/Users/wangwida/coffee-platform/agents
# 💓 하트비트 — 종료(스킵 포함)마다 agent_runs 기록 → 정지/실패 감지(담당: 전략기획본부).
trap '(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs weekly-evaluation $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
DOW=$(date +%u); [ "$DOW" != "1" ] && [ "$DOW" != "4" ] && { echo "[$(date)] 주2회 게이트(월·목만 발행) — 오늘 스킵" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log; exit 0; }  # 라운지 리포트 주 2회(월·목). 관찰은 실시간·상시, 발행만 주2회.
echo "[$(date)] === 주간 거버넌스 사이클 시작 ===" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/make-digest.mjs >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1)  # 🗜️ 공용 다이제스트
# 1) 조직별 케이던스(2026-07-05 CEO): 월=풀 거버넌스(전 팀), 목=시장·리스크 리프레시만.
#    법무·재무·운영·조직평가는 주 단위 변화라 월 1× 충분 / 리스크·전략은 주중 시장변화 커서 월·목 2×.
if [ "$DOW" = "1" ]; then
  WEEKLY="run-evaluation-agent run-team-legal-agent run-team-finance-agent run-team-ops-support-agent run-risk-mgmt-agent run-strategy-agent"
else
  echo "[$(date)] 목요일 리프레시 — 리스크·전략만(안정 도메인은 월 1×)" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
  WEEKLY="run-risk-mgmt-agent run-strategy-agent"
fi
for w in ${(z)WEEKLY}; do bash "$A/$w.sh"; sleep 5; done
# 2) 경영지원본부장 종합(SUPPORT-WEEKLY) — 풀 거버넌스가 도는 월요일만.
[ "$DOW" = "1" ] && bash "$A/run-support-office-director.sh"
# 3) 📤 주간 리포트를 DB(org_reports)로 푸시 — 그날 갱신된 것만(스테일 방지).
#    월요일: 조직평가·경영지원 종합(풀 거버넌스 산출) / 월·목: 전략 밸류업(주2회 발행).
if [ "$DOW" = "1" ]; then
  (cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/push-report.mjs weekly-eval /Users/wangwida/coffee-platform/agent-reports/WEEKLY-EVAL-latest.md "인사팀 주간 조직평가" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1)
  (cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/push-report.mjs support-weekly /Users/wangwida/coffee-platform/agent-reports/SUPPORT-WEEKLY-latest.md "경영지원 주간 리포트" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1)
fi
# 전략기획본부 조직 밸류업·영역확대 제언 → 라운지 공유(월·목 주2회, 전략은 두 날 다 실행됨)
(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/push-report.mjs strategy-valueup /Users/wangwida/coffee-platform/agent-reports/STRATEGY-VALUEUP-latest.md "전략기획본부 · 조직 밸류업·영역확대 제언" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1)
echo "[$(date)] === 주간 사이클 종료 ===" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
