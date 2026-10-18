#!/bin/bash
# ☕ 사장님 주간 당직 보고 발송 — 매주 월 08:40 (v3 템플릿, CEO 확정 2026-09-07)
#   결정론 계산만(LLM 0원)·구독 active 카페 + CEO 미리보기 1부. 비용: Neon 소쿼리 몇 회뿐.
cd /Users/wangwida/coffee-platform/web || exit 1
/usr/local/bin/node --import tsx scripts/owner-weekly-report.mjs >> /tmp/coffee-owner-weekly.log 2>&1
