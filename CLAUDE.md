# CLAUDE.md — Coffee Platform (동네 커피 노트)

> 이 파일은 이 저장소의 **단일 사실 출처**다. 추측하지 말고 이 문서와 아래 참조 문서를 먼저 따른다.
> ⚠️ 2026-07-02 전면 교체: 이전 버전은 폐기된 초기 실험(생두 원가 인텔리전스) 기준이라 실제 서비스와 무관했다.

## 0. 이 프로젝트가 무엇인가

**동네 커피 노트 (dongnecoffeenote.com)** — 서울·수도권 카페를 리뷰 데이터로 검증한 큐레이션 서비스.
- B2C: 지도·검색·카페 상세(옥석 가린 후기), B2B: 사장님 구독(인사이트·노출).
- 1인 운영(CEO) + 자율 에이전트 조직(launchd + Claude Code 헤드리스 + Vercel 크론). 비용 극민감, 한국어.
- 핵심 자산: **진짜 방문 검증 후기만 노출** — 옆가게·광고·동명 오염 0. 발굴은 전수가 아니라 다양성·옥석 큐레이션.

## 1. 구조

```
coffee-platform/
├─ web/          # 실제 서비스 — Next.js 16 App Router·TS·Neon Postgres·Vercel (web/AGENTS.md 필독)
│  ├─ app/       # /(지도·홈), /c/[id](공유·SEO), /admin(관제탑), /admin/org(조직 관제), /api/*
│  ├─ lib/       # issues.ts(RM·결재 — ⚠️동결영역), jobTeams.ts(잡→본부·감시계약 단일출처), synthStore 등
│  └─ scripts/   # 로컬 워커(dev-claim/deploy·make-digest·heartbeat 등, launchd가 실행)
├─ agents/       # 자율 에이전트 헌법(md)+러너(sh) — git 미추적·로컬 전용. ORG-CHARTER.md·SCHEDULE.md 필독
├─ agent-reports/# 에이전트 산출물(gitignore)
├─ data-engine/  # 🗄️ 휴면 레거시(초기 생두원가 실험) — 서비스와 무관, 참조·수정 금지
└─ docs/
```

## 2. 불변 규칙 (어기면 사고)

1. **구독토큰(CLAUDE_CODE_OAUTH_TOKEN)을 서버/백엔드에서 쓰지 않는다** — ToS 위반·계정정지 위험. LLM은 ①프로덕션=콘솔키(ANTHROPIC_API_KEY, Batches 우선) ②로컬 자율 에이전트=공식 `claude -p`(launchd)만.
2. **코드 변경·배포 = CEO(L3) 게이트. 데이터 조작(비공개·재합성 등) = 기조실장(L2) 전결.** 카페 비공개는 autoCorrect L2 레일 또는 CEO 결재로만.
3. **결정론 먼저, LLM은 의미판단만**(승인 후). 측정 전 결론 금지. 프록시 지표는 '주의'까지만(빨강 금지).
4. **RM 이슈↔결재 자동변환 영역(lib/issues.ts) 동결** — 이슈와 결재는 서로를 생성하지 않는다. 새 자동 경로 추가 금지.
5. 카페 공개상태를 바꾸면 **모든 캐시 레이어 무효화**(lib/cafeCacheInvalidate.ts 경유). 공개 API는 always-fresh 유지.
6. launchd 잡 추가 시: 러너에 heartbeat + `web/lib/jobTeams.ts`(팀·EXPECT_MAX_H) 등록 + `agents/SCHEDULE.md` 갱신 — 3종 세트.
7. 카카오 Local/Map API 사용 불가(사업자 승인 필요). 네이버·data.go.kr 사용.
8. Next.js 16은 breaking changes — `web/node_modules/next/dist/docs/` 먼저. 포트 3100(`next dev -p 3100`).
9. 시크릿은 `.env`/`.env.local`에만. 커밋 금지.

## 3. 배포

`git push origin main` → Vercel 자동배포. 자율 개발 파이프라인(dev_task)은 브랜치 구현→검증→CEO 배포확정→dev-deploy.mjs가 merge+push. 메인 워킹트리에 커밋 안 된 변경이 있으면 dev-deploy가 배포를 중단한다(사람 작업 보호).
