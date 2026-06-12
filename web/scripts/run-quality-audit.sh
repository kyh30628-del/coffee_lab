#!/bin/bash
export PATH="/usr/local/bin:/Users/wangwida/.local/bin:/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
/usr/local/bin/node --import tsx scripts/quality-audit.mjs >> /tmp/coffee-audit.log 2>&1
/usr/local/bin/node --import tsx scripts/fix-flagged.mjs >> /tmp/coffee-audit.log 2>&1
