#!/bin/bash
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
[ -f scripts/.judge.env ] && source scripts/.judge.env
unset ANTHROPIC_API_KEY
export GROUNDING_MAX=40
for i in $(seq 1 120); do
  OUT=$(/usr/local/bin/node scripts/verify-grounding.mjs 2>&1)
  echo "$OUT" | tail -2 >> /tmp/coffee-grounding.log
  echo "$OUT" | grep -q "구독 한도" && { echo "[drain] 구독 한도 도달 — 중단(새벽 재개)" >> /tmp/coffee-grounding.log; break; }
  REMAIN=$(/usr/local/bin/node -e "const{neon}=require('@neondatabase/serverless');const fs=require('fs');for(const l of fs.readFileSync('.env.local','utf8').split('\n')){const m=l.match(/DATABASE_URL=(.*)/);if(m)process.env.DATABASE_URL=m[1].replace(/[\"']/g,'')}neon(process.env.DATABASE_URL)\`SELECT count(*)::int n FROM cafes c LEFT JOIN grounding_checks g ON g.cafe_id=c.id WHERE (c.published OR c.pipeline_status='held') AND c.raw_reviews IS NOT NULL AND c.synth_identity IS NOT NULL AND c.llm_judged_at IS NOT NULL AND c.llm_judged_at >= c.raw_collected_at AND (g.checked_at IS NULL OR g.checked_at < c.synth_updated)\`.then(r=>process.stdout.write(String(r[0].n))).catch(()=>process.stdout.write('-1'))" 2>/dev/null)
  echo "[drain] 반복 $i 끝, 판정완료·그라운딩대기 남음 $REMAIN ($(date +%H:%M))" >> /tmp/coffee-grounding.log
  [ "$REMAIN" = "0" ] && { echo "[drain] 전량 완료" >> /tmp/coffee-grounding.log; break; }
  sleep 3
done
