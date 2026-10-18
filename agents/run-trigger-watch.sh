#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$COFFEE_ROOT/web" || exit 1
# 💓 하트비트 — 5분 주기 종료마다 agent_runs 기록 → 워처 정지 감지(담당: 기획조정실 직할 자율진단).
trap 'c=$?; (cd "$COFFEE_ROOT/web" && node --import tsx scripts/heartbeat.mjs audit-watch $c >> /tmp/coffee-heartbeat.log 2>&1)' EXIT
LOGF=$COFFEE_ROOT/agent-reports/logs/orchestrator.log
RD='const{neon}=require("@neondatabase/serverless");const fs=require("fs");const url=fs.readFileSync(".env.local","utf8").match(/DATABASE_URL="?([^"\n]+)/)[1].trim();const sql=neon(url);'

# 🐶 감시자의 감시자(2026-07-02) — cron-selfaudit(Vercel) 자신이 죽으면 감시망 전체가 무음 소멸하던 P0.
#   13시간+ 미실행이면 ok=false 하트비트로 대리 기록 → 즉시 이슈화(cronfail:cron-selfaudit)·트리거·품질본부 배정.
#   임계값 13h = 스케줄 "20 3,11,23 * * *" UTC 최대공백 12h(11:20→23:20)+버퍼(2026-08-04, decisions#593 집행 —
#   08-03 13:48 8da8c31이 스케줄을 다시 바꿔 11h→12h로 재계산 필요했음. 원래 7h는 구 6h주기 기준으로 매일 오탐).
#   (기록이 ran_at을 갱신하므로 알림은 1회 — 재알림은 실제 복구 후 재정지 시.)
# 🐶 등재 워치독(2026-10-16) — "plist는 있는데 launchd에 안 올라가 있음"을 본다.
#   10-04~15 사고: 파일은 전부 그대로인데 등재만 빠져 조직 실행량이 1/33로 붕괴, 감시자도 같이 죽어 12일 무경보.
#   아래 STALE 검사는 cron-selfaudit '신선도'만 봐서 이 사고를 구조적으로 못 잡는다. 결정론·LLM 0·비용 0.
node --import tsx scripts/watchdog-launchd.mjs >> "$LOGF" 2>&1 || true

STALE=$(node -e "$RD(async()=>{try{const r=await sql\`SELECT EXTRACT(EPOCH FROM (now()-max(ran_at)))/3600 h FROM agent_runs WHERE job='cron-selfaudit'\`;console.log((+r[0].h||0)>13?1:0)}catch(e){console.log(0)}})()" 2>/dev/null)
if [ "${STALE:-0}" = "1" ]; then
  echo "[$(date)] 🐶 워치독: cron-selfaudit 13h+ 미실행 — 대리 실패 기록" >> "$LOGF"
  node --import tsx scripts/heartbeat.mjs cron-selfaudit 1 "13시간+ 미실행 — 로컬 워치독 감지, Vercel 크론/배포 점검 필요" >> /tmp/coffee-heartbeat.log 2>&1
fi

PENDING=$(node -e "$RD(async()=>{try{const r=await sql\`SELECT count(*) c FROM audit_triggers WHERE status='pending'\`;console.log(Number(r[0].c))}catch(e){console.log(0)}})()" 2>/dev/null)
if [ "${PENDING:-0}" -gt 0 ]; then
  # 🕒 이벤트 자율진단 쿨다운 20분(2026-07-12 CEO 승인) — audit-watch가 5분마다 self-audit을 연발
  #   (7/9 52분에 9회=순수 중복. self-audit은 종합 스캔이라 1회면 현재 pending을 다 커버)하던 낭비 차단.
  #   쿨다운 중이면 트리거는 pending 유지 → 다음 적격 틱이 배치 처리(사건 유실 없음). 정기 5회/일은 무관.
  CDF=/tmp/coffee-selfaudit-event-last
  if [ -f "$CDF" ] && [ $(( $(date +%s) - $(stat -f %m "$CDF" 2>/dev/null || echo 0) )) -lt 1200 ]; then
    echo "[$(date)] 🕒 자율진단 쿨다운(20분 내 기동됨) — 이벤트 기동 스킵, 트리거 ${PENDING}건 pending 유지" >> "$LOGF"
  else
  echo "[$(date)] 🔔 이벤트 트리거 ${PENDING}건 → 자율진단 LLM 즉시 기동" >> "$LOGF"
  touch "$CDF"
  # consume 먼저(중복기동 방지). 무엇이 깨웠는지는 consumed_at으로 에이전트가 읽음.
  node -e "$RD(async()=>{try{await sql\`UPDATE audit_triggers SET status='consumed', consumed_at=now() WHERE status='pending'\`}catch(e){}})()" 2>/dev/null
  (node --import tsx scripts/make-digest.mjs >> "$LOGF" 2>&1)
  # 🛡️ 사건 유실 방지(2026-07-02): 에이전트 실패 시 방금 consume한 트리거를 pending으로 복원 —
  #   과거 consume→실패로 사건이 영구 소실(7/1 17:29 실사고). 다음 5분 틱이 재시도.
  #   ⚠️ 재시도 상한 2회(retries<2, 2026-07-02): 무한 복원이 레이트리밋 등 지속 실패 시 5분마다 재시도 폭풍을
  #     만들던 것 차단. 상한 초과분은 consumed로 남겨 종결(근본원인은 issues 보드+정기 self-audit이 백스톱).
  if ! bash $COFFEE_ROOT/agents/run-self-audit-agent.sh; then
    echo "[$(date)] ⚠️ 자율진단 실패 → 트리거 복원(재시도 ≤2회)" >> "$LOGF"
    node -e "$RD(async()=>{try{await sql\`ALTER TABLE audit_triggers ADD COLUMN IF NOT EXISTS retries INT DEFAULT 0\`;await sql\`UPDATE audit_triggers SET status='pending', consumed_at=NULL, retries=COALESCE(retries,0)+1 WHERE status='consumed' AND consumed_at > now() - interval '30 minutes' AND COALESCE(retries,0) < 2\`}catch(e){}})()" 2>/dev/null
  fi
  fi
else
  : # idle — LLM 호출 없음(공짜 종료)
fi
