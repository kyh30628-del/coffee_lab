# 기획조정실장·에이전트 공용 러너 — 재시도+검증+토큰 실측 로깅 + 리프별 하트비트
# 2026-07-02 전수감사 수리:
#   ①성공 판정 = '"result"' 문자열 존재 → "is_error":false 로 교정(401 에러 JSON도 성공 처리돼
#     7/1 17시 12에이전트 전멸이 '정상'으로 기록되던 P0). ②리프마다 agent_runs 하트비트(실패=즉시 이슈화·본부배정).
#   ③재시도 2→3회·간격 30초(레이트리밋 잠깐 스침 대응).
# 🧊 2026-07-25 프롬프트 캐싱: 헌법(.md, 8~16KB)을 매번 -p로 통째 재전송하던 것을
#   --append-system-prompt-file로 옮김 — 같은 파일이면 프로세스가 달라도 캐시 재사용됨(실측 확인,
#   chat-watch.mjs와 동일 메커니즘). 모델·판단력 불변, 입력토큰만 절감. 동적 부분(피드백·꼬리규칙)은 -p 유지.
# 🔑 인증 프리체크 — 2026-08-29 사고 대응.
#   그날 12:05 OAuth 세션이 만료되자 5개 에이전트가 **각각 3회씩** 재시도하며 전멸했다(15회 헛실행).
#   인증은 90초 안에 저절로 살아나지 않는다 — 재시도는 시간·토큰만 태우고 결과가 같다.
#   그래서 사이클 시작 전에 **한 번만** 싸게 확인하고, 죽었으면 즉시 멈추고 사람에게 알린다.
#   (자동 복구는 불가능하다 — 로그인은 사람만 할 수 있다. 그러니 '빨리 정확히 알리기'가 최선이다.)
DCN_AUTH_OK=""
DCN_AUTH_TRANSIENT=""
auth_precheck() {
  [ -n "$DCN_AUTH_OK" ] && return 0
  local out
  # 🧠 2026-09-06: 동시 claude 세션 존재 = 인증 정상 증거 → 프로브 생략(레이스 원천 차단)
  if pgrep -f "claude (-p|--print)" >/dev/null 2>&1; then DCN_AUTH_OK=1; return 0; fi
  out=$(claude -p "ok" --max-turns 1 --output-format json 2>/dev/null)
  if printf '%s' "$out" | grep -q '"is_error":false'; then DCN_AUTH_OK=1; return 0; fi
  # 🔴 2026-09-13 오분류 수리 — 실패를 전부 '인증 만료'로 찍고 있었다. 사용량 한도·과부하·레이트리밋은 인증과 무관한데
  #   관제탑엔 "claude 로그인 필요"로 떠 사람을 헛걸음시켰다(실측 09-13 20:54 dev-agent, 그 시각 인증은 정상).
  #   응답 본문에 인증 신호가 없으면 '일시 오류'로 보고 이번 사이클만 건너뛴다(알림 없음).
  if printf '%s' "$out" | grep -qiE 'usage limit|rate.?limit|overloaded|529|too many requests'; then DCN_AUTH_TRANSIENT=1; return 1; fi
  if ! printf '%s' "$out" | grep -qiE 'authenticat|oauth|401|invalid api key|login'; then DCN_AUTH_TRANSIENT=1; return 1; fi
  return 1
}

# 🔴 2026-09-13 오탐 수리 — 하트비트를 auth_precheck() 안에서 쓰고 있었다.
#   그런데 호출부는 그 뒤에 지터 3회를 더 돌린다. 즉 **재시도로 회복돼도 관제탑에는 '실패'가 남았다.**
#   실측: 09-11 16:12 · 09-12 16:15 auth-precheck ok=false 기록 직후
#         search-quality(16:24)·b2b-sales(16:30)·chief-manager(16:38)·chief-secretary(16:43) 전부 정상 실행.
#         09-13 12:47 수동 프로브도 is_error=false → 인증은 멀쩡했고 경보만 틀렸다.
#   그 오탐이 관제탑에 MED 이슈로 상주했고, 덮으려고 orchestrator에 '복구됨' 주의까지 붙어 있었다(증상 치료).
#   → 기록·알림은 **호출부가 최종 실패를 확정한 뒤에만** 한다.
auth_alarm() {
  (cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs "auth-precheck" 1 \
     "OAuth 세션 만료 — 터미널에서 claude 로그인 1회 필요(에이전트 사이클 중단)" >> /tmp/coffee-heartbeat.log 2>&1)
  # 로컬 즉시 알림(비용 0·외부 의존 0). Slack 미설정 상태라 이게 유일한 즉시 채널이다.
  osascript -e 'display notification "터미널에서 claude 로그인 1회 필요" with title "동네 커피 노트 — 에이전트 정지" sound name "Basso"' 2>/dev/null || true
}

claude_run() {
  local prompt_file="$1" tools="$2" log="$3" attempt name jf snippet fb
  name=$(basename "$log" | sed -E 's/-[0-9]{6,}.*//' | sed -E 's/-[0-9]+$//')
  # 인증이 죽었으면 3회 재시도 없이 즉시 반환 — 15회 헛실행(5잡×3회)을 0으로.
  # 🔁 2026-09-04 — 단, 한 번은 90초 쉬고 재확인한다(플래핑 대응).
  #   실측 3일 연속: 아침 윈도우에서 OAuth가 몇 분 끊겼다 저절로 붙는다(08:22 성공↔08:23 실패가 공존).
  #   여러 claude -p가 동시에 토큰 갱신을 시도하며 서로의 리프레시를 밟는 레이스로 보인다.
  #   즉시 포기하면 그 윈도우 전체가 죽는다 — 90초 뒤 살아있으면 정상 진행(하루 4윈도우 × 90초 = 무시 가능).
  if ! auth_precheck; then
    # 🔁 2026-09-06 3차 강화: 지터 3회(60~150s) — 동시 세션 레이스 흡수(1회 90s로 3회 재발 실측)
    _rec=0
    for _i in 1 2 3; do sleep $((60 + RANDOM % 90)); if auth_precheck; then _rec=1; break; fi; done
    if [ "$_rec" = "1" ]; then
      echo "[복구] $(date) 인증 플래핑 — 지터 재시도로 회복, 정상 진행" >> "$log"
    elif [ -n "$DCN_AUTH_TRANSIENT" ]; then
    # 인증은 멀쩡하고 일시 오류(사용량 한도·과부하)다 — 관제탑에 '인증 만료'로 찍지 않는다.
    echo "[건너뜀] $(date) 일시 오류(사용량 한도·과부하) — 이번 사이클만 건너뜀" >> "$log"
    return 1
    else
    auth_alarm
    echo "[중단] $(date) 인증 만료 — 재시도 생략" >> "$log"
    (cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs "$name" 1 \
       "인증 만료로 미실행(재시도 생략) — claude 로그인 후 자동 정상화" >> /tmp/coffee-heartbeat.log 2>&1)
    return 1
    fi
  fi
  jf="${log%.log}.json"
  # 최근 받은 피드백(대표님·동료평가)을 프롬프트에 주입 — 표시가 아니라 실제 업무에 반영되게(동기부여·개선 양분)
  fb=$(cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/agent-feedback.mjs "$name" 2>/dev/null)
  MODEL=$(cd /Users/wangwida/coffee-platform/web && node scripts/agentModel.mjs "$name" 2>/dev/null); case "$MODEL" in sonnet|haiku) ;; *) MODEL=sonnet;; esac  # 🎛️ 잡별 모델(품질 안전: 미해석=sonnet)
  for attempt in 1 2 3; do
    claude -p "${fb}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️⚠️ 종료 전 필수 규칙 — 어기면 관제 라운지 집계가 실패한다 ⚠️⚠️
네 응답의 **가장 마지막 3줄**은 반드시 아래 라벨 3개로 시작하는 3줄이어야 한다. 산문 요약(**굵은 글씨 결론**, '~완료' 등)으로 *대체하지 마라* — 라벨을 그대로 붙여 3줄을 추가로 출력하라. 위에서 아무리 길게 보고했어도, 맨 끝에 이 3줄을 반드시 따로 찍는다.
주간목표: <★자율 수립(대표님이 지정하지 않는 한 계획은 너희 몫). 이번 주 첫 실행이면 관제탑·백로그·최근 성과추이·시장/서비스 상황 등 전후사정 전체를 스스로 보고, 이번 주 목표·KPI를 '지표=목표치'로 야심 차되 현실적으로 직접 계획. 측정가능하게(예:'검증 승격 20건, 오염 0건'). 이미 서 있으면 그대로 서술. 팀 없는 관리직은 '해당없음'.>
성과: <오늘 한 일과 핵심 수치를 상급자 보고체 한 문장으로. 위 목표 대비 진행 드러나게. 변화 없으면 '변화 없음'. (절대 생략 금지 — 최소 한 문장)>
동료평가: <이번 사이클에 관찰한 다른 팀/에이전트 최소 1곳을 '대상 | 한 줄 평가'로 반드시. 팩트 기반·구체적. 정말 관찰 근거가 없을 때만 이 줄 생략('없음' 쓰지 마라). 여러 팀이면 줄 나눠 최대 3.>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" --append-system-prompt-file "$prompt_file" --model "$MODEL" --dangerously-skip-permissions --allowedTools "$tools" --max-turns 80 --output-format json > "$jf" 2>"$log"
    if [ -s "$jf" ] && grep -q '"is_error":false' "$jf"; then
      node -e 'const fs=require("fs");try{const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const u=d.usage||{};const fullIn=(u.input_tokens||0)+(u.cache_creation_input_tokens||0);const cacheRead=(u.cache_read_input_tokens||0);const row=[new Date().toISOString(),process.argv[2],fullIn,(u.output_tokens||0),(d.total_cost_usd||0).toFixed(4),(d.num_turns||0),cacheRead].join("\t");fs.appendFileSync("/Users/wangwida/coffee-platform/agent-reports/USAGE.tsv",row+"\n");}catch(e){}' "$jf" "$name" 2>/dev/null
      (cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/agent-outcome.mjs "$name" "$jf" >> /tmp/coffee-heartbeat.log 2>&1)
      return 0
    fi
    snippet=$(grep -o '"result":"[^"]\{0,110\}' "$jf" 2>/dev/null | head -1)
    echo "[재시도 $attempt] $(date) ${snippet}" >> "$log"; sleep 30
  done
  (cd /Users/wangwida/coffee-platform/web && node --import tsx scripts/heartbeat.mjs "$name" 1 "3회 실패: ${snippet:-무응답/빈 JSON}" >> /tmp/coffee-heartbeat.log 2>&1)
  return 1
}
