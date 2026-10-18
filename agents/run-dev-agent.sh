#!/bin/bash
# 개발 실행 디스패처(병렬) — 승인·미빌드 dev_task를 최대 K건 원자적 클레임 → 각각 전용 워크트리에서 동시 구현·검증.
#   대상 없으면 LLM 안 부름(토큰0). 워크트리 격리 + 전역 git락으로 병렬 안전(2026-07-01 레이스 사고 후).
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT=/Users/wangwida/coffee-platform
cd "$ROOT/web" || exit 1
K=${DEV_PARALLEL:-3}   # 동시 빌드 상한
IDS=$(node --import tsx scripts/dev-claim.mjs "$K" 2>/dev/null)
# 🩺 2026-09-06(CEO 3회 지적 사고): 큐가 비면 무기록 종료 → 직전 실패 기록이 관제 화면에 **영구 잔존**.
#   "성공은 침묵, 실패만 기록"은 표시 계약 위반 — 빈 큐도 정상 가동 하트비트를 남긴다.
[ -z "$IDS" ] && { node --import tsx scripts/heartbeat.mjs dev-agent 0 "대기 0건 — 정상 가동(클레임 없음)" >> /tmp/coffee-heartbeat.log 2>&1; exit 0; }
echo "[$(date)] 개발 디스패처 — 병렬 ${K}, 클레임: $IDS" >> "$ROOT/agent-reports/logs/orchestrator.log"
DELAY=0
for id in $IDS; do            # bash 단어분리(공백구분 id) — 포터블
  case "$id" in ''|*[!0-9]*) continue;; esac   # 🛡️ 숫자 TASK_ID만 허용 — stdout 오염→가짜 스폰 방어선(#482, 2026-07-24 토큰폭증 근본차단)
  # ⏲️ 시차 스폰(2026-09-04 실증): 병렬 워커들이 **동시에** claude 인증 프로브를 쏘면 서로의 OAuth
  #   토큰 갱신을 밟아 일부가 '인증 만료'로 오판·미실행된다(979 실패↔987 정상 동시 발생으로 확정).
  #   20초 간격이면 프로브(~7초)가 안 겹친다. 빌드 자체는 수십 분이라 지연 체감 0.
  ( sleep "$DELAY"; bash "$ROOT/agents/run-dev-one.sh" "$id" ) &
  DELAY=$((DELAY+20))
done
wait
