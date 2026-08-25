#!/bin/zsh
# 🧵 신규 카페 후기 수집 따라잡기 — 강원 확장 등으로 쌓인 'new' 적체를 매일 조금씩 소화한다.
#   ⚠️ 네이버 일일 한도 25,000은 앱 전체 공유(local 발굴 + blog/cafearticle 수집 합산)라
#      샤드를 적게(2) 돌리고, 쿼터가 소진되면 워커가 스스로 멈춘다(collect-shard의 진척 판정).
#   💰 Vercel 함수시간·과금 0(로컬 실행). 후기 출처는 네이버 무료 API뿐(구글 Places는 꺼져 있음).
cd "$(dirname "$0")/.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG="/tmp/coffee-collect-catchup.log"
{
  echo "=== $(date '+%F %T') 수집 따라잡기 시작 ==="
  for k in 0 1; do
    node --import tsx scripts/collect-shard.mjs --shard=$k --of=2 &
  done
  wait
  echo "=== $(date '+%F %T') 종료 ==="
} >> "$LOG" 2>&1
# 하트비트 — 관제탑이 이 잡의 생사를 본다(jobTeams.ts에 등록된 이름과 반드시 같아야 한다)
node --import tsx scripts/heartbeat.mjs collect-catchup 0 "신규 후기 수집 따라잡기" >> "$LOG" 2>&1 || true
