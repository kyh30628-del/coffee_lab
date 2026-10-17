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
  beat 0 "자동 배포 ${N}건 푸시 완료($SHA)"
  notify "배포했습니다 — ${N}건 ($SHA)"
else
  say "🔴 푸시 실패"
  beat 1 "푸시 실패 — 미푸시 ${N}건 남음"
  notify "푸시가 실패했습니다"
fi
exit 0
