#!/bin/bash
# 공개 카페 판정 — 한도 도달 시 자동 대기 후 재개, 큐 소진까지 반복
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY
export JUDGE_MAX=9999 JUDGE_CONC=4

queue() {
  /usr/local/bin/node -e "
const{neon}=require('@neondatabase/serverless');const fs=require('fs');
for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/DATABASE_URL=(.*)/);if(m)process.env.DATABASE_URL=m[1].replace(/[\"']/g,'')}
neon(process.env.DATABASE_URL)\`SELECT count(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND published=true AND (llm_judged_at IS NULL OR llm_judged_at<raw_collected_at)\`.then(r=>process.stdout.write(String(r[0].n))).catch(()=>process.stdout.write('-1'))
" 2>/dev/null
}

ROUND=0
while true; do
  ROUND=$((ROUND+1))
  Q=$(queue)
  echo "[$(date '+%H:%M')] 라운드 $ROUND — 공개 판정대기 $Q곳"
  [ "$Q" = "0" ] && { echo "큐 소진 — 완료"; break; }
  [ "$Q" = "-1" ] && { echo "DB 조회 실패 — 5분 후 재시도"; sleep 300; continue; }

  /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
  EXIT=$?

  Q2=$(queue)
  # 큐가 줄었으면 바로 다음 라운드, 안 줄었으면 한도 도달로 보고 5시간 대기
  if [ "$Q2" = "$Q" ] || [ "$Q2" = "-1" ]; then
    echo "[$(date '+%H:%M')] 진척 없음(한도 추정) — 5시간 10분 대기 후 재개"
    sleep 18600
  else
    echo "[$(date '+%H:%M')] $((Q-Q2))곳 처리 — 30초 후 다음 라운드"
    sleep 30
  fi
done
echo "[$(date '+%H:%M')] 판정 전체 완료"
