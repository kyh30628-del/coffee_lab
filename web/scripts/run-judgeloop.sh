#!/bin/bash
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY

HOUR=$(date +%H)
if [ "$HOUR" -lt 7 ]; then
  export JUDGE_CONC=4
  MAX_RUNS=8
else
  export JUDGE_CONC=3
  MAX_RUNS=8
fi

for run in $(seq 1 $MAX_RUNS); do
  if [ "$HOUR" -lt 7 ]; then
    export JUDGE_MAX=9999
  else
    export JUDGE_MAX=80
  fi
  /usr/local/bin/node scripts/judge-batch.mjs >> /tmp/coffee-judge.log 2>&1
  EXIT=$?
  [ $EXIT -ne 0 ] && break
  REMAIN=$(/usr/local/bin/node -e "const{neon}=require('@neondatabase/serverless');const fs=require('fs');for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/DATABASE_URL=(.*)/);if(m)process.env.DATABASE_URL=m[1].replace(/[\"']/g,'')}neon(process.env.DATABASE_URL)\`SELECT count(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND llm_judged_at IS NULL\`.then(r=>process.stdout.write(String(r[0].n))).catch(()=>process.stdout.write('0'))" 2>/dev/null)
  [ "$REMAIN" -eq 0 ] && break
  sleep 30
done
