#!/bin/zsh
COFFEE_ROOT="${COFFEE_ROOT:-${0:A:h:h}}"   # 📦 2026-10-18 이식성 — 러너는 agents/ 안에 있으므로 두 단계 위가 저장소 뿌리.
# 개발/배포 즉시 발화 트리거 — 이 파일을 touch하면 launchd WatchPaths가 dev-pipeline·dev-deploy를 그 즉시 실행.
#   폴링이 아니라 이벤트 방식 → Neon 안 깨움(비용 0). CEO 결재 직후 "지금 실행"용.
#   일감 없으면 스크립트가 즉시 종료(토큰0)라 헛발화도 무해.
touch $HOME/.coffee-dev-trigger
echo "[$(date '+%H:%M:%S')] dev 트리거 발화 → dev-pipeline·dev-deploy 즉시 실행 예약됨"
