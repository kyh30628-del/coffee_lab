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
LOCK="/tmp/coffee-collect-catchup.lock"

# 🔒 중복 실행 잠금(2026-08-26 사고) — 창이 120분인데 launchd는 4시간마다 뜬다. 수동 실행이 겹치거나
#   앞 창이 안 끝났는데 다음 창이 뜨면 **샤드가 배로 늘어** 같은 큐를 서로 긁고 버스트 429를 유발한다.
#   실제로 07:21 수동 실행 + 08:15 예약이 겹쳐 샤드 4개가 되었고, 1.5시간에 15,000콜을 태우고
#   카페는 352곳만 늘었다(곳당 43콜 — 정상 5콜의 8배). 쿼터가 정해져 있으니 이건 곧 진도 손실이다.
#   ⚠️ 죽은 프로세스의 잠금은 자동 해제한다(PID 확인) — 안 그러면 크래시 한 번에 영영 안 돈다.
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "[$(date '+%F %T')] 이미 실행 중(PID $(cat "$LOCK")) — 이번 창 건너뜀" >> "$LOG"
  exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT
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
      # ⏰ 창 종료 시각을 샤드에 넘긴다(2026-08-27). 예전엔 여기서만 시각을 봐서, 한 라운드가
      #   큐를 다 비울 때까지 4시간+ 돌아 '120분 창'이 무의미했다(적체 2,346곳 유입 때 드러남).
      #   샤드는 배치마다·카페마다 이 시각을 확인해 즉시 멈춘다. 중단해도 손실 0(다음 창이 이어감).
      COLLECT_DEADLINE=$DEADLINE node --import tsx scripts/collect-shard.mjs --shard=$k --of=2 &
    done
    wait
    if tail -4 "$LOG" | grep -q "큐 소진"; then echo "큐 소진 — 라운드 ${round}에서 종료"; break; fi
    if tail -4 "$LOG" | grep -q "쿼터 소진 추정"; then echo "쿼터 소진 — 라운드 ${round}에서 종료"; break; fi
  done
  [ "$(date +%s)" -ge "$DEADLINE" ] && echo "120분 창 종료 — 다음 창(4시간 뒤)에 이어감"

  # 🔎 IndexNow 색인 제출 — 새로 공개된 URL을 네이버·빙에 알린다(구글은 미참여, 구조상 불가).
  #   ⚠️ 키 파일을 막 올린 직후에는 엔진이 아직 검증을 못 해 403(SiteVerificationNotCompleted)이 난다.
  #      실패해도 그냥 넘어가고 다음 창에서 다시 시도한다 — 미제출분만 보내므로 중복도 안 생긴다.
  #   💰 아웃바운드 HTTP 몇 건 + DB 읽기 1회. 로컬 실행이라 Vercel 함수시간 0.
  node --import tsx scripts/indexnow-submit.mjs 2>&1 | tail -4 || true

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
