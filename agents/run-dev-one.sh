#!/bin/zsh
# 단일 개발 태스크(병렬 1워커) — 전용 워크트리에서 에이전트가 코딩·빌드만, git 조작은 러너가 전역 락으로 직렬화.
#   git 레이스로 메인 레포가 오염된 사고(2026-07-01) 재발 방지: worktree add/remove/commit 전부 락 안에서만.
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
id=$1
[ -z "$id" ] && exit 1
ROOT=/Users/wangwida/coffee-platform
WT=/tmp/coffee-dev-$id
BR=dev/task-$id
GLOCK=/tmp/coffee-gitrepo.lock   # 메인 레포 git 조작 전역 락(macOS엔 flock 없어서 mkdir 원자성 사용)
LOG="$ROOT/agent-reports/logs/dev-agent-$id-$(date +%Y%m%d-%H%M).log"

glock() { local n=0; while ! mkdir "$GLOCK" 2>/dev/null; do sleep 0.4; n=$((n+1)); [ $n -gt 200 ] && return 1; done; return 0; }
gunlock() { rmdir "$GLOCK" 2>/dev/null; }
dbset() { (cd "$ROOT/web" && node -e 'const{neon}=require("@neondatabase/serverless");const fs=require("fs");const url=fs.readFileSync(".env.local","utf8").match(/DATABASE_URL="?([^"\n]+)/)[1].trim();const sql=neon(url);(async()=>{await sql.query(process.argv[1])})()' "$1"); }

# ── ① 워크트리 준비(락) ──
glock || { echo "[$id] git락 타임아웃" >>"$LOG"; exit 1; }
git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null
git -C "$ROOT" worktree prune 2>/dev/null
git -C "$ROOT" branch -D "$BR" 2>/dev/null
git -C "$ROOT" fetch origin main -q 2>/dev/null
git -C "$ROOT" worktree add -f -b "$BR" "$WT" origin/main >>"$LOG" 2>&1
MB=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)
gunlock
# 🛡️ 안전가드: 메인 레포가 여전히 main인지(오염 감지 시 즉시 복구·중단)
if [ "$MB" != "main" ]; then echo "[$id] 🔴 메인 브랜치 오염($MB) → 복구·중단" >>"$LOG"; glock; git -C "$ROOT" checkout main 2>/dev/null; gunlock; exit 1; fi
if [ ! -d "$WT/web" ]; then echo "[$id] 워크트리 생성 실패" >>"$LOG"; exit 1; fi
# 🔧 node_modules는 심링크 금지 → APFS COW 클론(cp -Rc)으로 실제 디렉토리 배치.
#   Next16 turbopack 빌드가 워크트리 밖을 가리키는 심링크를 "Symlink points out of filesystem root"로 거부해
#   모든 dev/챗 태스크의 `npm run build` 검증이 100% 실패하던 근본버그(#174·#175 폐기 원인) 해결.
#   COW라 6초·실디스크 ~0. 실패 시에만 심링크로 폴백(빌드 못하더라도 tsc는 가능).
rm -f "$WT/web/node_modules" 2>/dev/null
cp -Rc "$ROOT/web/node_modules" "$WT/web/node_modules" 2>/dev/null || ln -sfn "$ROOT/web/node_modules" "$WT/web/node_modules"
ln -sfn "$ROOT/web/.env.local" "$WT/web/.env.local"

# ── ② 코딩·빌드(비잠금·병렬) — 에이전트는 git 안 건드림 ──
cd "$WT/web" || exit 1
# 🎯 모델 = agentModel 단일출처. CEO 방침(2026-07-10): 평상시 코드수정=sonnet5, 중대·대규모·복잡(risk=high)=opus.
#   dev_task의 chat_risk를 읽어 넘긴다(없으면 sonnet). overrides(자동 회귀복귀)도 존중. 실패 시 안전하게 sonnet.
RISK=$(cd "$ROOT/web" && node -e 'const{neon}=require("@neondatabase/serverless");const fs=require("fs");const url=fs.readFileSync(".env.local","utf8").match(/DATABASE_URL="?([^"\n]+)/)[1].trim();const sql=neon(url);(async()=>{const r=await sql`SELECT action_params->>\x27chat_risk\x27 rk FROM decisions WHERE id='"$id"'`;console.log(r[0]?.rk||"")})()' 2>/dev/null)
MODEL=$(cd "$ROOT/web" && node scripts/agentModel.mjs dev-agent "$RISK" 2>/dev/null); case "$MODEL" in opus|sonnet|haiku) ;; *) MODEL=sonnet ;; esac
echo "[$id] dev-agent 모델=$MODEL" >>"$LOG"
# 🧊 2026-07-25 프롬프트 캐싱: 헌법(dev-agent-one.md)+운영원칙(CEO-OPERATING-PRINCIPLES.md)을 정적
#   시스템프롬프트로 합쳐 보낸다 — 같은 내용이면 프로세스가 달라도 캐시 재사용됨(실측 확인, _run.sh와 동일 메커니즘).
#   --append-system-prompt-file은 한 개만 적용(중복 지정 시 마지막 것만·병합 안 됨)이라 사전에 두 파일을 합친다.
#   ⚠️워크트리($WT) 밖(/tmp)에 둬야 함 — 안에 두면 git status에 잡혀 스코프가드·커밋 오염 위험. $id로 유니크해
#   병렬 워커(K=2~3) 레이스 없음. 모델·판단력 불변, 입력토큰만 절감.
# 🔑 인증 프리체크(2026-08-29) — dev-agent는 _run.sh의 claude_run을 안 거치고 claude를 직접 부른다.
#   그래서 프리체크가 여기에도 있어야 한다: 최근 7일 실패 11건 중 6건이 이 잡의 "claude-p 무응답"이었고
#   전부 OAuth 만료가 원인이었다(08-27·08-29 두 차례 군집). 죽은 채로 도는 대신 즉시 멈추고 알린다.
# 🧠 2026-09-06 4차(최종) — 다른 claude 세션이 이미 돌고 있으면 그게 곧 인증 정상의 증거다.
#   그때 프로브를 또 쏘면 그 세션과 토큰 갱신 레이스만 만든다(지터 3회로도 장시간 빌드 세션엔 짐, 실측).
#   동시 세션 감지 시 프로브 생략. 프로브는 "아무도 안 돌 때"만 의미가 있다.
_other_claude() { pgrep -f "claude (-p|--print)" 2>/dev/null | grep -v "^$$\$" | head -1 | grep -q .; }
_auth_ok() { _other_claude && return 0; claude -p "ok" --max-turns 1 --output-format json 2>/dev/null | grep -q '"is_error":false'; }
# 🔁 2026-09-04 플래핑 대응(_run.sh와 동일) — 아침 윈도우 OAuth가 몇 분 끊겼다 붙는 레이스 실측 3일.
#   90초 한 번만 재시도: 그 윈도우 전체가 죽는 것을 막는다.
# 🔁 2026-09-06 3차 강화: 1회 재시도(90s)로도 동시 세션 많은 날 레이스에 짐(실측 3회 재발).
#   지터 3회(60~150s 랜덤) — 진짜 만료면 3회 모두 실패(+α 3~7분 후 정직 중단), 레이스면 흡수.
_auth_retry() { for _i in 1 2 3; do _auth_ok && return 0; sleep $((60 + RANDOM % 90)); done; _auth_ok; }
if ! _auth_retry; then
  echo "[중단] $(date) 인증 만료(90초 재시도 포함) — 미실행" >> "$LOG"
  # ♻️ 클레임 반납(2026-09-04 실증): 여기서 exit하면 dev_status='building'이 그대로 남아
  #   stale 리셋(120분)까지 아무 워커도 이 태스크를 못 집는다 — 인증이 1분 뒤 복구돼도 2시간 공전.
  #   미실행 중단이므로 클레임을 즉시 되돌려 다음 디스패처가 바로 재시도하게 한다.
  (cd "$ROOT/web" && node --import tsx -e "
    const { readFileSync } = await import('node:fs');
    for (const l of readFileSync('./.env.local','utf8').split('\n')) { const m = l.match(/^([A-Z_0-9]+)=(.*)\$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^[\"']|[\"']\$/g,''); }
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    await sql\`UPDATE decisions SET action_params = action_params - 'dev_status' - 'dev_claimed' WHERE id = \${Number('$id')} AND action_type='dev_task' AND action_params->>'dev_status'='building'\`;
  " >> "$LOG" 2>&1)
  (cd "$ROOT/web" && node --import tsx scripts/heartbeat.mjs dev-agent 1 \
     "인증 만료로 미실행 — claude 로그인 후 자동 정상화" >> /tmp/coffee-heartbeat.log 2>&1)
  osascript -e 'display notification "터미널에서 claude 로그인 1회 필요" with title "동네 커피 노트 — dev-agent 정지" sound name "Basso"' 2>/dev/null || true
  exit 1
fi

SYSPROMPT="/tmp/coffee-dev-sysprompt-$id.md"
cat "$ROOT/agents/dev-agent-one.md" "$ROOT/docs/CEO-OPERATING-PRINCIPLES.md" > "$SYSPROMPT"
# 터미널 직접작업과 동일 툴셋(탐색 Grep/Glob 포함) + CLAUDE.md·AGENTS.md 자동로드(워크트리 루트에 존재).
claude -p "TASK_ID=$id" --model "$MODEL" --append-system-prompt-file "$SYSPROMPT" --dangerously-skip-permissions --allowedTools "Bash Read Write Edit Grep Glob" --max-turns 80 --output-format json > "${LOG%.log}.json" 2>>"$LOG"
rm -f "$SYSPROMPT"

# 📊 토큰 실측 로깅(7열·캐시읽기 분리) — usageGuard와 동일 원가기준(캐시읽기 0.1x). dev-agent도 정확 계상.
node -e 'const fs=require("fs");try{const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const u=d.usage||{};const fullIn=(u.input_tokens||0)+(u.cache_creation_input_tokens||0);const cacheRead=(u.cache_read_input_tokens||0);const row=[new Date().toISOString(),"dev-agent",fullIn,(u.output_tokens||0),(d.total_cost_usd||0).toFixed(4),(d.num_turns||0),cacheRead].join("\t");fs.appendFileSync("'"$ROOT"'/agent-reports/USAGE.tsv",row+"\n");}catch(e){}' "${LOG%.log}.json" 2>/dev/null

# ── ③ 결과에 따라 커밋(락) — 러너가 안전하게 ──
DS=$(cd "$ROOT/web" && node -e 'const{neon}=require("@neondatabase/serverless");const fs=require("fs");const url=fs.readFileSync(".env.local","utf8").match(/DATABASE_URL="?([^"\n]+)/)[1].trim();const sql=neon(url);(async()=>{const r=await sql`SELECT action_params->>\x27dev_status\x27 ds FROM decisions WHERE id='"$id"'`;console.log(r[0]?.ds||"")})()' 2>/dev/null)
if [ "$DS" = "built" ]; then
  glock
  CHANGED=$(git -C "$WT" status --porcelain | cut -c4- | sed 's/.* -> //')   # 변경·미추적 파일 경로
  if [ -z "$CHANGED" ]; then
    # 실패가 아님 — 코드로 바꿀 게 없거나(이미 반영) 코드작업이 아님. 사실대로 '구현불가'.
    dbset "UPDATE decisions SET action_params = action_params || jsonb_build_object('dev_status','구현불가','summary','코드 변경 불필요/불가 — 이미 반영됐거나 코드로 할 작업이 아님') WHERE id=$id"
  else
    # 🛡️ 스코프 가드: 목적 외 보호파일(빌드·의존성·설정) 건드리면 반려(#64 재발방지). 실패 아님 — 가드 반려.
    SCOPE=$(cd "$ROOT/web" && echo "$CHANGED" | xargs node --import tsx scripts/dev-scopecheck.mjs "$id" 2>/dev/null)
    if echo "$SCOPE" | grep -q VIOLATION; then
      VF=$(echo "$SCOPE" | sed 's/VIOLATION: //')
      dbset "UPDATE decisions SET action_params = action_params || jsonb_build_object('dev_status','스코프반려','summary','목적 외 보호파일 변경 차단 — $VF') WHERE id=$id"
      echo "[$id] 🛡️ 스코프 반려: $SCOPE" >>"$LOG"
    else
      git -C "$WT" add -A >>"$LOG" 2>&1
      git -C "$WT" commit -m "dev(#$id): 자율 개발 — CEO 승인건" >>"$LOG" 2>&1
      dbset "UPDATE decisions SET action_params = action_params || jsonb_build_object('dev_status','배포대기','branch','$BR') WHERE id=$id"
      echo "[$id] ✅ 배포대기(커밋 완료·스코프 OK)" >>"$LOG"
    fi
  fi
  gunlock
fi
# ⛔ 실패 종결(building 좀비 방지) — claude가 'built' 마킹 못하고 에러 종료한 채 'building'이면 종결한다.
#
# 🔴 2026-08-30 수정 — 여기서 태스크 6건이 억울하게 죽었다.
#   예전 코드는 `is_error:true`면 **무조건** '빌드실패'로 못박았다. 그런데 '빌드실패'는 dev-claim이
#   아예 안 집는 종결상태다(재클레임·stale리셋 대상 아님) → **영구 데드엔드**.
#   08-25~27 OAuth 세션이 끊긴 동안 #838·847·848·850·865·866이 전부 여기 걸렸다.
#   실제 기록은 `subtype=success turns=1`(= 인증 막혀 실행조차 못 함)인데
#   요약엔 "태스크 과대/모호 가능"이라고 **사실과 다르게** 남았다. 사람이 보면 태스크가 나쁜 줄 안다.
#
#   구분 원칙: **태스크 잘못이 아닌 실패는 못박지 않는다.**
#     · 환경 장애(인증 만료·사용량 한도·과부하) → dev_status 제거 = 재시도 대기. 태스크는 무결하다.
#     · 태스크 자체 실패(max_turns 등)        → '빌드실패' 유지. 2026-07-24 출혈루프 차단 취지 그대로.
#   그리고 요약에는 **추측이 아니라 실제 subtype·result**를 적는다.
if grep -q '"is_error":true' "${LOG%.log}.json" 2>/dev/null && [ "$DS" = "building" ]; then
  SUB=$(node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((d.subtype||"error")+" turns="+(d.num_turns||0))}catch(e){console.log("error")}' "${LOG%.log}.json" 2>/dev/null)
  # 실패 원문 — SQL·셸 주입 방지로 따옴표·백틱·역슬래시 제거 후 160자 컷.
  RES=$(node -e 'try{const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(String(d.result||"").replace(/[\x27"`\\\\$\n\r]/g," ").slice(0,160))}catch(e){console.log("")}' "${LOG%.log}.json" 2>/dev/null)
  if echo "$SUB $RES" | grep -qiE 'authenticate|oauth|session expired|usage limit|rate.?limit|credit balance|quota|overloaded|529|503'; then
    # 🔁 환경 장애 — 태스크는 멀쩡하다. 재시도 가능 상태로 되돌린다(dev_status 제거 = 개발대기).
    dbset "UPDATE decisions SET action_params = action_params - 'dev_status' - 'dev_claimed' WHERE id=$id AND action_params->>'dev_status'='building'"
    echo "[$id] 🔁 환경장애($SUB) — 태스크 무결, 재시도 대기로 되돌림: $RES" >>"$LOG"
  else
    dbset "UPDATE decisions SET action_params = action_params || jsonb_build_object('dev_status','빌드실패','summary','claude 미완 종료($SUB) — $RES') WHERE id=$id AND action_params->>'dev_status'='building'"
    echo "[$id] ⛔ 빌드실패($SUB) — 자동 재시도 중단(building 좀비 방지): $RES" >>"$LOG"
  fi
fi
# 워크트리 정리(락) — 브랜치·커밋은 유지
glock; git -C "$ROOT" worktree remove --force "$WT" 2>/dev/null; gunlock
# 🩺 관제탑 기록(감시 사각 복구) — dev-agent 실행을 agent_runs에 남긴다(성공=JSON is_error:false / 실패=무응답·에러)
if [ -s "${LOG%.log}.json" ] && grep -q '"is_error":false' "${LOG%.log}.json"; then
  (cd "$ROOT/web" && node --import tsx scripts/heartbeat.mjs "dev-agent" 0 "#$id ${DS:-실행완료}" >/dev/null 2>&1)
else
  (cd "$ROOT/web" && node --import tsx scripts/heartbeat.mjs "dev-agent" 1 "#$id claude-p 무응답/에러" >/dev/null 2>&1)
fi
echo "[$(date)] dev-one #$id 완료(dev_status=$DS)" >>"$ROOT/agent-reports/logs/orchestrator.log"
