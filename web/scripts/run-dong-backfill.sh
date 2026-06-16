#!/bin/bash
# 네이버 한도 리셋 직후(자정 후) 동 백필 — 신선한 쿼터로 동 채움 우선.
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
# 1) 네이버로 동·카테고리 채움(카테고리는 네이버만 가능)
/usr/local/bin/node --import tsx scripts/dong-backfill.mjs >> /tmp/coffee-dong-backfill.log 2>&1
# 2) 좌표→법정동으로 남은 미스 100% 마감(이름검색 미스 없음, 안전: dong 컬럼만)
exec /usr/local/bin/node scripts/dong-by-coords.mjs >> /tmp/coffee-dong-coords.log 2>&1
