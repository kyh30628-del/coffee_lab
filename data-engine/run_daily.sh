#!/bin/bash
# run_daily.sh — 매일 수집·계산·export를 순서대로 실행
# cron이 이 파일 하나만 부르면 됨. 로그는 data-engine/daily.log 에 누적.

cd "$(dirname "$0")" || exit 1
source .venv/bin/activate

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 시작 ====="

python collectors/fx_collector.py
python collectors/coffee_c_collector.py
python models/export_cost.py
python models/export_timeseries.py

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 완료 ====="
echo ""
