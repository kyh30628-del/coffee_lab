#!/bin/zsh
# 🏗️ 자율 조직 설치 — launchd 잡을 **이 저장소 위치에 맞춰** 등록한다.
#
# 왜 이 스크립트가 있나(2026-10-18):
#   그때까지 자율 조직의 실체 84개 파일(러너 39·헌법 27·plist 18)이 **git에 하나도 없었다**
#   (`.gitignore`의 `/agents/`). 저장소를 넘겨도 조직이 없었고, 맥북이 고장나면 사라졌다.
#   plist는 경로를 하드코딩하므로 **템플릿(.tmpl)으로 두고 설치 시점에 실제 경로를 채운다.**
#
# 사용:  ./agents/launchd/install.sh            # 활성 잡만 등록
#        ./agents/launchd/install.sh --dry-run  # 무엇을 할지만 보여준다
#        ./agents/launchd/install.sh --all      # .disabled 템플릿까지 등록(권장하지 않음)
#
# ⚠️ macOS 전용(launchd). 리눅스로 옮기려면 같은 스케줄로 cron/systemd timer를 만들어야 한다 —
#    스케줄은 각 .tmpl의 StartCalendarInterval에 그대로 적혀 있다.
set -e
ROOT="$(cd "$(dirname "${0:A}")/../.." && pwd)"
LA="$HOME/Library/LaunchAgents"
DRY=""; ALL=""
for a in "$@"; do [ "$a" = "--dry-run" ] && DRY=1; [ "$a" = "--all" ] && ALL=1; done

echo "📁 저장소 뿌리: $ROOT"
echo "📂 설치 대상:   $LA"
[ -n "$DRY" ] && echo "🔎 (dry-run — 아무것도 바꾸지 않습니다)"
mkdir -p "$LA" "$ROOT/agent-reports/logs"

# 🔑 보류 잡은 **단일 출처에서 읽는다** — web/lib/jobTeams.ts의 RETIRED_JOBS.
#   여기 목록을 따로 적으면 두 곳이 갈라져, 의도적으로 안 켜는 잡(CEO 승인 대기)을 설치가 켜버린다.
RETIRED="$(cd "$ROOT/web" && node --import tsx -e \
  'import("./lib/jobTeams.ts").then(m=>console.log([...m.RETIRED_JOBS].join(" ")))' 2>/dev/null || echo "")"
if [ -z "$RETIRED" ]; then
  echo "🔴 RETIRED_JOBS를 읽지 못했습니다(web/lib/jobTeams.ts). 보류 잡을 켜버릴 위험이 있어 중단합니다."
  echo "   확인: cd $ROOT/web && node --import tsx -e 'import(\"./lib/jobTeams.ts\").then(m=>console.log([...m.RETIRED_JOBS]))'"
  exit 1
fi
echo "⏸ 보류(설치 제외): $RETIRED"

n=0
for t in "$(dirname "${0:A}")"/*.tmpl; do
  base="$(basename "$t" .tmpl)"
  case "$base" in *.disabled) [ -z "$ALL" ] && { echo "  ⏸  건너뜀(비활성 선언): $base"; continue; };; esac
  job="${base#com.coffee.}"; job="${job%.plist}"
  if [ -z "$ALL" ] && echo " $RETIRED " | grep -q " $job "; then
    echo "  ⏸  건너뜀(RETIRED_JOBS — 의도적 보류): $job"; continue
  fi
  out="$LA/$base"
  if [ -n "$DRY" ]; then echo "  → 쓸 것: $out"; else
    sed "s|__COFFEE_ROOT__|$ROOT|g; s|__HOME__|$HOME|g" "$t" > "$out"
    label="${base%.plist}"; label="${label%.disabled}"
    launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$out" 2>/dev/null || echo "  ⚠️ 등재 실패(수동 확인): $label"
    echo "  ✅ $label"
  fi
  n=$((n+1))
done
echo "총 $n개 처리"
[ -z "$DRY" ] && echo "확인: node web/scripts/watchdog-launchd.mjs"
