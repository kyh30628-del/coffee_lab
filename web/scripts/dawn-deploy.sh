#!/bin/zsh
# 🌅 06시 자동 배포 — CEO 지시(2026-10-16 "배포창 무조건 아침 6시에 자동으로 시작해").
#
# 왜 06시가 안전한가(2026-10-17 실측, traffic_events 최근 7일 시간대별):
#   00~23시 **전 시간대가 7/7일 가동**이다 — DB는 새벽에도 자지 않는다(공개 API를 봇이 24시간 깨운다,
#   메모리 reference_neon_cost_structure의 "62일 중 2.3h만 잠"과 일치).
#   즉 pre-push 훅의 원래 전제("새벽에 DB를 재운다")는 이미 성립하지 않는다.
#   한편 06·07시는 사람 트래픽이 가장 적다(114·128회 vs 낮 피크 535회) →
#   **06시에 배포하면 ISR 재생성 폭풍이 사람이 몰리기 전에 끝난다.** 08시 배포보다 낫다.
#
# 안전장치(하나라도 걸리면 푸시하지 않는다):
#   ① 미푸시 커밋이 없으면 아무것도 하지 않는다(빌드도 안 돈다 = 비용 0)
#   ② 워킹트리에 커밋 안 된 변경이 있으면 중단 — 사람이 작업 중일 수 있다(CLAUDE.md 3항, dev-deploy와 같은 규칙)
#   ③ main 브랜치가 아니면 중단
#   ④ `npm run build` 실패하면 푸시하지 않는다 — 검사가 배포 뒤면 사용자가 첫 검사자다
#   ⑤ 결과는 heartbeat(관제탑) + macOS 알림으로 남긴다. 조용히 실패하지 않는다.
#
# 💰 비용: 미푸시가 없는 날은 0(빌드 안 함). 있는 날만 빌드 1회(≈$0.009) + ISR 재생성(≈$0.018) ≈ $0.03.
#   하루 1회 상한이라 '배포는 묶어서' 원칙과 같은 방향이다(619배포/월 사고의 반대).
export PATH="/Users/wangwida/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REPO=/Users/wangwida/coffee-platform
LOG=$REPO/agent-reports/logs/dawn-deploy.log
mkdir -p "$(dirname "$LOG")"
say() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
beat() { (cd "$REPO/web" && node --import tsx scripts/heartbeat.mjs dawn-deploy "$1" "$2" >> /tmp/coffee-heartbeat.log 2>&1); }
notify() { osascript -e "display notification \"$1\" with title \"동네 커피 노트 — 새벽 배포\"" 2>/dev/null || true; }

cd "$REPO" || { say "🔴 저장소 없음"; beat 1 "저장소 접근 실패"; exit 0; }

BR=$(git rev-parse --abbrev-ref HEAD)
if [ "$BR" != "main" ]; then say "건너뜀 — 현재 브랜치 $BR (main 아님)"; beat 0 "main 아님($BR) — 건너뜀"; exit 0; fi

N=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
if [ "$N" = "0" ]; then say "미푸시 없음 — 할 일 없음(빌드 안 함)"; beat 0 "미푸시 0건 — 건너뜀"; exit 0; fi

# ⚠️ 추적 중인 파일에 커밋 안 된 변경이 있으면 멈춘다(미추적 신규 파일은 무해하므로 통과).
DIRTY=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')
if [ "$DIRTY" != "0" ]; then
  say "🔴 중단 — 커밋 안 된 변경 ${DIRTY}건(사람 작업 보호)"
  git status --porcelain --untracked-files=no >> "$LOG"
  beat 1 "커밋 안 된 변경 ${DIRTY}건으로 배포 보류 — 사람이 정리해야 함"
  notify "커밋 안 된 변경 ${DIRTY}건 때문에 배포를 멈췄습니다"
  exit 0
fi

say "미푸시 ${N}건 — 빌드 시작"
git log --oneline origin/main..HEAD >> "$LOG"
if ! (cd "$REPO/web" && npm run build >> "$LOG" 2>&1); then
  say "🔴 빌드 실패 — 푸시하지 않음"
  beat 1 "빌드 실패로 배포 중단(미푸시 ${N}건 그대로 남음)"
  notify "빌드가 실패해 배포하지 않았습니다"
  exit 0
fi
say "✅ 빌드 통과 — 푸시"

# 훅의 허용 창은 06~17시로 넓혔다(위 실측 근거). URGENT은 쓰지 않는다 — 창을 우회하지 않고 창 안에서 돈다.
if git push origin main >> "$LOG" 2>&1; then
  SHA=$(git rev-parse --short HEAD)
  say "✅ 푸시 완료 $SHA (${N}건)"

  # 🔴 2026-10-19 — **배포만으로는 사용자 화면에 가지 않는다.** (CEO: "배포하면 사용자 화면까지 가도록 하라")
  #   `/c/[id]`는 ISR 30일(revalidate=2592000)이라 이미 캐시된 페이지는 **배포 전 HTML을 그대로 내보낸다.**
  #   클라이언트 컴포넌트도 예외가 아니다 — 마운트 지점이 그 페이지의 RSC 페이로드에 있어야 한다.
  #   실사고: 사용자 피드백 바를 배포했는데 대부분의 카페 페이지에서 보이지 않았고,
  #   내가 확인한 한 곳은 마침 재생성된 페이지라 "배포 완료"라고 잘못 보고했다.
  #   → 푸시 뒤 Vercel 빌드가 끝나길 기다렸다가 **상세 라우트 캐시를 비운다.**
  #   💰 무효화 자체는 쓰기 0이고, 재생성은 **방문할 때만** 일어난다. 실측: 30일간 실제 방문되는
  #      상세 페이지는 8,853곳으로 평상시 월간 재생성(49,874회)의 17.8%다.
  #      총량이 느는 게 아니라 **30일 주기를 앞당기는 것**이다.
  # .env.local 값은 따옴표가 없거나 큰따옴표만 쓴다 — 읽기 쉬운 형태로 둔다(중첩 따옴표 지옥 금지).
  #   🔴 순서가 생명이다(2026-10-19 수리): **빌드가 끝나기 전에 비우면 옛 HTML이 그대로 다시 캐시된다.**
  #   무효화 엔드포인트는 빌드 중에도 ok:true를 돌려주므로 그 응답만 보고 멈추면 안 된다.
  #   그래서 `/api/version`이 **방금 푸시한 커밋 SHA**를 돌려줄 때까지 기다린 뒤에 비운다.
  SECRET=$(grep -m1 '^CRON_SECRET=' "$REPO/web/.env.local" 2>/dev/null | cut -d= -f2- | tr -d '"')
  if [ -n "$SECRET" ]; then
    FULL=$(git rev-parse HEAD)
    LIVE=0
    for i in $(seq 1 45); do   # 빌드 대기 최대 15분(20초 × 45)
      if curl -s -m 20 "https://dongnecoffeenote.com/api/version" 2>/dev/null | grep -q "$FULL"; then
        LIVE=1; say "✅ 새 빌드가 프로덕션에 올라옴($SHA) — 이제 캐시를 비운다"; break
      fi
      sleep 20
    done
    if [ "$LIVE" = "1" ]; then
      if curl -s -m 30 -H "authorization: Bearer $SECRET" \
           "https://dongnecoffeenote.com/api/purge-detail-route" 2>/dev/null | grep -q '"ok":true'; then
        say "🧹 상세 라우트 캐시 무효화 완료 — 사용자 화면에 반영됨"
      else
        say "🔴 캐시 무효화 실패 — 새 코드는 올라갔지만 캐시된 상세는 옛 화면이다. 수동 호출 필요."
        beat 1 "캐시 무효화 실패($SHA) — 상세 페이지가 옛 화면을 내보낸다"
      fi
      # ☕ 홈 화면 선제 예열(2026-10-24, CEO "로딩 때 커피 내리는 중이 너무 오래 나온다").
      #   원인: 새 배포 직후 /api/discover의 CDN 캐시(s-maxage=300)가 비어 있어, 그 시점의 첫 방문자가
      #   DB 콜드스타트+전체 조회를 그대로 맞는다(실측: 예열 전 6.2초 → 예열 후 0.25초).
      #   여기서 한 번 불러 CDN에 데이터를 채워두면 실제 방문자는 늘 캐시만 본다. 비용: GET 2회뿐.
      curl -s -m 15 "https://dongnecoffeenote.com/" > /dev/null 2>&1
      curl -s -m 15 "https://dongnecoffeenote.com/api/discover" > /dev/null 2>&1
      say "☕ 홈 화면 예열 완료"
    else
      say "🔴 15분 안에 새 빌드가 안 올라옴 — 비우지 않았다(일찍 비우면 옛 HTML이 다시 캐시된다)"
      beat 1 "배포 빌드 미완료($SHA) — 캐시 무효화 보류, 확인 필요"
    fi
  else
    say "⚠️ CRON_SECRET 없음 — 캐시 무효화 생략(UI 변경이 사용자에게 안 갈 수 있다)"
  fi

  beat 0 "자동 배포 ${N}건 푸시 완료($SHA)"
  notify "배포했습니다 — ${N}건 ($SHA)"
else
  say "🔴 푸시 실패"
  beat 1 "푸시 실패 — 미푸시 ${N}건 남음"
  notify "푸시가 실패했습니다"
fi
exit 0
