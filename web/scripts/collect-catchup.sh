#!/bin/zsh
# 🧵 신규 카페 후기 수집 따라잡기 — 강원 확장 등으로 쌓인 'new' 적체를 소화한다.
#
# 💰 실행 시각이 곧 비용이다(2026-08-25 CEO 지적으로 재설계):
#   Neon은 5분 무활동이면 자동절전이라 **"언제 도느냐"가 가동시간=요금을 정한다.**
#   처음엔 00:10(쿼터 리셋 직후)에 잡았는데, 그러면 몇 시간 연속으로 돌며 새벽의 간헐적 각성을
#   **연속 가동으로 바꿔** 요금이 는다. 내가 "비용 0"이라 한 건 Vercel 함수비만 보고
#   Neon 가동시간을 빼먹은 오판이었다.
#   실측(7일): 06~23시는 7/7일 상시 가동(사람 트래픽+크론) → **얹어도 추가 가동 0**.
#            03~05시는 4~5/7일 → 여기서 돌면 없던 가동이 새로 생긴다.
#   → 이미 깨어 있는 창에만 올라탄다: 08·12·16·20시 시작, 창당 90분 상한으로 새벽 침범 원천 차단.
#
# ⚠️ 네이버 일일 한도 25,000은 앱 전체 공유(발굴 local + 수집 blog/cafearticle 합산)라 샤드는 2개로 고정.
#   쿼터는 적체 가드(discoveryMayRun)가 발굴을 막아 통째로 남겨준다 — 늦게 시작해도 손해가 없다.
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG="/tmp/coffee-collect-catchup.log"
# 창 120분: 4창×120분×(2샤드 ~7곳/분) = 하루 3,360곳으로 **쿼터(2,875곳)가 병목**이 되게 맞춘다.
#   샤드를 늘리는 대신 창을 늘렸다 — 동시성을 키우면 Neon이 오토스케일로 더 큰 컴퓨트를 잡아
#   CU-시간 단가가 오를 수 있다. 창 연장은 단가를 안 건드린다.
#   최대 종료 22:15 — 실측상 23시까지 7/7일 상시 가동이라 새벽 미침범.
DEADLINE=$(( $(date +%s) + 120*60 ))

{
  echo "=== $(date '+%F %T') 수집 따라잡기 시작(창 120분) ==="
  round=0
  while [ "$(date +%s)" -lt "$DEADLINE" ]; do
    round=$((round+1))
    for k in 0 1; do
      node --import tsx scripts/collect-shard.mjs --shard=$k --of=2 &
    done
    wait
    if tail -4 "$LOG" | grep -q "큐 소진"; then echo "큐 소진 — 라운드 ${round}에서 종료"; break; fi
    if tail -4 "$LOG" | grep -q "쿼터 소진 추정"; then echo "쿼터 소진 — 라운드 ${round}에서 종료"; break; fi
  done
  [ "$(date +%s)" -ge "$DEADLINE" ] && echo "120분 창 종료 — 다음 창(4시간 뒤)에 이어감"

  # 📰 수집 큐가 **완전히 비었을 때만** 관광지 캘리브레이션 표본을 뜬다(40콜).
  #   쿼터 소진으로 멈춘 경우엔 돌리지 않는다 — 수집이 우선이고, 뉴스도 같은 25,000을 공유한다.
  #   여기 얹는 이유: 새 잡을 만들면 스케줄·비용 판단이 또 필요하고, 이미 깨어 있는 창을 쓰는 게 공짜다.
  if tail -6 "$LOG" | grep -q "큐 소진"; then
    if [ ! -f /tmp/coffee-tourism-calibrated ]; then
      echo "--- 수집 완료 → 관광지 캘리브레이션 표본 40개(40콜) ---"
      node --import tsx scripts/classify-tourism.mjs --calibrate --limit=40
      touch /tmp/coffee-tourism-calibrated   # 1회만 — 임계 확정 후 사람이 지우고 전체 판정한다
    fi
  fi
  echo "=== $(date '+%F %T') 종료 ==="
} >> "$LOG" 2>&1
node --import tsx scripts/heartbeat.mjs collect-catchup 0 "신규 후기 수집 따라잡기" >> "$LOG" 2>&1 || true
