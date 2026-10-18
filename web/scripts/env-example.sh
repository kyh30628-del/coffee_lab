#!/bin/zsh
# 📋 .env.example 생성 — 양수인이 "무엇을 설정해야 하는가"를 알 수 있게 한다.
#   왜: 2026-10-18 실측에서 코드가 참조하는 env 키가 110개인데 문서는 0개였다(매각 제약 2번: 재현 가능성).
#   값은 절대 쓰지 않는다 — 키 이름만 뽑는다.
cd "$(dirname "$0")/.." || exit 1
{
  echo "# 동네 커피 노트 — 필요한 환경변수 목록 (키만, 값 없음)"
  echo "# 자동 생성: npm run env:example  (scripts/env-example.sh)"
  echo "# ⚠️ 실제 값은 .env.local 에만 둔다. 커밋 금지."
  echo "# 새 환경 세우는 순서: ① db/schema.sql 실행 ② 이 목록 채움 ③ npm run guard 로 검증"
  echo ""
  grep -rhoE "process\.env\.[A-Z_0-9]+" app lib scripts --include='*.ts' --include='*.tsx' --include='*.mjs' \
    | sed 's/process\.env\.//' | sort -u | awk '{print $1"="}'
} > .env.example
echo "✅ .env.example — 키 $(grep -c '=$' .env.example)개"
