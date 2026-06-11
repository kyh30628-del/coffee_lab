#!/bin/bash
# 새벽: 한도 리셋마다 반복 실행(백로그 최대 소진). 낮: 1회만.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY

HOUR=$(date +%H)
if [ "$HOUR" -lt 7 ]; then
  export JUDGE_CONC=4
  # 새벽: 한도 닿을 때까지 반복(~5시간 리셋 전까지 계속)
  for run in 1 2 3 4 5 6 7 8; do
    export JUDGE_MAX=9999
    /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
    EXIT=$?
    [ $EXIT -ne 0 ] && break          # 한도·에러 → 중단
    REMAIN=$(node -e "const{neon}=require('@neondatabase/serverless');const fs=require('fs');for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/DATABASE_URL=(.*)/);if(m)process.env.DATABASE_URL=m[1].replace(/[\"']/g,'')}neon(process.env.DATABASE_URL)\`SELECT count(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND llm_judged_at IS NULL\`.then(r=>process.stdout.write(String(r[0].n))).catch(()=>process.stdout.write('0'))" 2>/dev/null)
    [ "$REMAIN" -eq 0 ] && break      # 큐 소진 → 종료
    sleep 30                           # 잠깐 쉬고 재시작
  done
else
  # 낮: 1회만(70% 캡)
  export JUDGE_MAX=80 JUDGE_CONC=3
  exec /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
fi
