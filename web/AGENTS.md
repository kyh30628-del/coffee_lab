<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 스크래치 조사 스크립트 컨벤션

레드팀·룰갭 등 조사용으로 임시로 짜는 1회성 쿼리 스크립트(`_redteam_query*.mjs`, `_rulegap_*.mjs`, `_rg_*.mjs` 등)는 **`scripts/` 바로 밑에 커밋하지 않는다.**

- 임시 스크립트는 `scripts/tmp/`(gitignore됨) 아래에 만든다. `scripts/` 루트에 `_`로 시작하는 파일도 gitignore 처리되어 있다.
- `published` 전수 스캔 + `jsonb_array_elements(c.synth_reviews)` 같은 고비용 패턴은 임시 스크립트라도 반드시 `WHERE`로 대상 카페를 좁히거나 `LIMIT`을 건다 — 09-09 204.3GB 비용 경보 재발 원인이 바로 이 패턴을 스크래치 스크립트 200개+가 반복 실행한 것이었다(협업 #387).
- 조사가 끝난 세션에서는 그 세션이 만든 스크래치 스크립트를 삭제한다(디스크에 안 쌓이게).
