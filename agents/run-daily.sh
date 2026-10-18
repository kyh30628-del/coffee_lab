#!/bin/zsh
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
A=/Users/wangwida/coffee-platform/agents
# 💓 하트비트 — 종료(정상·중단·크래시)마다 agent_runs 기록 → 서버 자율진단이 정지/실패 감지(담당: 기획조정실).
trap '(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs chief-manager $? >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
echo "[$(date)] === 일간 자율 사이클 시작 ===" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
# 🗜️ 공용 관제 다이제스트 1회 사전계산(결정론·토큰0) — 에이전트가 제각각 DB 반복조회하던 걸 대체(턴·토큰 급감)
(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/make-digest.mjs >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1)
# 🎯 조직별 특성 맞춤 케이던스 — 도메인 변화속도에 실행빈도를 맞춰 '품질 완벽 + 토큰 최소'(2026-07-05 CEO).
#   · 오염 방지 3대 가드(정합성·룰갭·레드팀): 오염은 상시 발생 → 매 사이클 3× (촘촘할수록 품질↑)
#   · 자율진단(숨은 문제 넓은 스캔): 풀 사이클 2× (08·17)
#   · 운영·성장·경험(폐업·발굴·검색품질): 도메인 일 단위 변화 → 하루 1×
#   · 마케팅·B2B(연구·기획): 며칠 단위라 하루새 안 바뀜 → 격일 번갈아 로테이션(17시 하나씩)
#   · 심층판정: 격일 짝수일 / 종합·비서실장: 풀 사이클 2× (아래 블록)
#   조간회의 폐지(2026-07-04). 전략·거버넌스 연구는 주간(run-weekly.sh).
HOUR=$(date +%H); DOY=$(date +%j)
# ⚠️ 2026-08-12 사고 수리: 예전엔 저녁 블록 조건이 `HOUR = "17"` 하드코딩이었는데 launchd 스케줄이
#    17:05 → 16:05로 바뀌면서 **조건이 영영 참이 되지 않았다.** 그 결과 08-02 이후 10일간
#    종합 브리핑·비서실장·검색품질·마케팅/B2B가 조용히 하나도 실행되지 않았고,
#    급기야 마지막 브리핑이 API의 10일 창 밖으로 밀려 조직 관제가 통째로 잠겼다.
#    → 시각을 못 박지 않고 **"그날의 마지막 사이클"**로 판정한다(스케줄이 또 바뀌어도 따라간다).
H=$((10#$HOUR))
EVENING=0; [ "$H" -ge 15 ] && EVENING=1
# 💰 2026-09-05 CEO 승인(비용 다이어트): 무결성·레드팀은 공개 2만곳 큰컬럼 전수대조라
#   하루 3×가 전송·가동시간을 통째로 3배로 만들었다(원장 실측: integrity 21,114곳 교차대조 ×3).
#   오염 발견의 실효는 하루 1바퀴로 충분(발견→결재→집행 루프가 어차피 일 단위) → 08시 1×로.
#   rulegap(사전 학습·경량)은 3× 유지. 헌법에도 '변경분 우선' 게이트를 같이 박음.
GUARDS_LIGHT="run-rulegap-agent"                                              # 매 사이클 3× — 경량 가드
GUARDS_HEAVY="run-integrity-agent run-quality-redteam-agent"                  # 08시 1× — 전수대조 무거움
if [ "$HOUR" = "12" ]; then
  echo "[$(date)] 점심 경량 — 경량 가드만(무결성·레드팀은 08시 1×, 09-05 비용 다이어트)" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
  RUN="$GUARDS_LIGHT"
else
  RUN="run-self-audit-agent $GUARDS_LIGHT"                                    # 풀: 자율진단 + 경량 가드
  [ "$HOUR" = "08" ] && RUN="$RUN $GUARDS_HEAVY"                              # 무거운 가드 = 아침 1×
  [ "$HOUR" = "08" ] && RUN="$RUN run-closure-agent run-demand-grow-agent"    # 폐업·발굴 = 아침 1×
  [ "$EVENING" = "1" ] && RUN="$RUN run-search-quality-agent"                 # 검색품질 = 저녁 1×
  if [ "$EVENING" = "1" ]; then                                               # 마케팅·B2B = 격일 번갈아
    if [ $((DOY % 2)) -eq 0 ]; then RUN="$RUN run-marketing-agent"; else RUN="$RUN run-b2b-sales-agent"; fi
  fi
fi
for w in ${(z)RUN}; do bash "$A/$w.sh"; sleep 5; done
# 심층판정·종합은 풀 사이클(08·17시)만 — 점심엔 audit-watch(5분 워처)가 긴급건 커버, 종합은 17시에.
if [ "$HOUR" != "12" ]; then
  # 심층판정은 격일(짝수일)만 — 무거워서 토큰 절약
  if [ $(( $(date +%j) % 2 )) -eq 0 ]; then bash "$A/run-deep-judge-agent.sh"; sleep 5;
  else echo "[$(date)] 심층판정 격일 스킵(홀수일)" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log; fi
  # 종합 + 비서실장 = 저녁(17시) 1회만(2026-07-12 CEO 승인 — 토큰/Max헤드룸 확보).
  #   관리·보고 오버헤드는 소비자 데이터에 안 닿음. 08시엔 모트가드·자율진단·발굴·심층판정은 그대로 돌고
  #   종합 보고만 저녁으로 통합 → CEO는 하루 1회 통합 EXECUTIVE 수신. 소비자 품질 영향 0.
  if [ "$EVENING" = "1" ]; then
    bash "$A/run-chief-manager-agent.sh"; sleep 5
    bash "$A/run-chief-secretary-agent.sh"
  else
    echo "[$(date)] 종합·비서실장 저녁 1회 통합 — 오전/점심 스킵(모트·자율진단은 정상 실행됨)" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
  fi
fi
(cd /Users/wangwida/coffee-platform/web && node scripts/make-dashboard.mjs >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1)
echo "[$(date)] === 일간 사이클 종료 ===" >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log
# 🩺 모델 티어 회귀게이트 — haiku 잡 저하 감지 시 sonnet 자동복귀(결정론·무LLM)
(cd /Users/wangwida/coffee-platform/web && node scripts/modelQualityWatch.mjs >> /Users/wangwida/coffee-platform/agent-reports/logs/orchestrator.log 2>&1)
