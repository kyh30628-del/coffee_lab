#!/bin/zsh
# 개발 배포 워처(2분·결정론·무LLM) — CEO가 '배포' 확정한 건을 빠르게 merge+push(=배포). 대상 없으면 즉시 종료.
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
LOCK=/tmp/coffee-dev-deploy-run.lock
if [ -e "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then exit 0; fi
#  하트비트: 매 실행마다 agent_runs 기록(관제 사각 제거). 종료코드 먼저 캡처 → dev-deploy.mjs 크래시=실패로 기록되어 자동 이슈화.
echo $$ > "$LOCK"; trap 'c=$?; rm -f "$LOCK"; (cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs dev-deploy $c >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
cd /Users/wangwida/coffee-platform/web || exit 1
# 🔴 2026-09-11: 예전엔 deploy_approved만 셌다. 그래서 '병합·푸시는 끝났는데 반영확인만 남은'
#   반영미확인 건이 있어도 게이트에서 0으로 보고 즉시 종료 → dev-deploy.mjs의 재확인(reconcileUnverified)이
#   영원히 안 돌아 결재가 미종결로 남았다(실측: #1042~#1046 5건). 두 상태를 모두 센다.
CNT=$(node -e 'const{neon}=require("@neondatabase/serverless");const fs=require("fs");const url=fs.readFileSync(".env.local","utf8").match(/DATABASE_URL="?([^"\n]+)/)[1].trim();const sql=neon(url);(async()=>{try{const r=await sql`SELECT count(*) c FROM decisions WHERE action_type=\x27dev_task\x27 AND (action_params->>\x27dev_status\x27) IN (\x27deploy_approved\x27,\x27반영미확인\x27)`;console.log(Number(r[0].c))}catch(e){console.log(0)}})()' 2>/dev/null)
if [ "${CNT:-0}" -lt 1 ]; then exit 0; fi
node --import tsx scripts/dev-deploy.mjs >> /tmp/coffee-dev-deploy.log 2>&1
