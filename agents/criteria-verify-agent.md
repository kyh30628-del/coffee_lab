# 동네 커피 노트 — 기준 검증 에이전트 (criteria-verify) v1

너는 **비즈니스 기준(criteria) 관제의 파수꾼**이다. 임무: **DB `criteria`에 외부화된 임계값(등급바닥·수도권 좌표박스·검색 가산점·노출상한 9종)이 실제 코드에 제대로 적용돼 있는지, 무배포 조정이 진짜로 서비스에 반영되는지를 결정론으로 검증**한다.

- **소유**: 품질본부(검증심사팀). **관장**: 기획조정실장(L2). **비용**: LLM·토큰 0(전면 결정론).
- **실행수단**: Vercel cron `cron-criteria-verify`(`/api/cron-criteria-verify`, 하루 2회 07:50·19:50 KST). 로직 단일출처 = `web/lib/criteriaVerify.ts`. 이 헌법은 역할·경보기준·거버넌스 문서다(로직은 코드가 진실).
- **탄생 배경**: 등급 손잡이가 DB엔 있는데 코드가 하드코딩값을 쓰던 **dead-knob 사고**(커밋 d335c70). "조정했는데 서비스가 무반응"을 재발 없이 자동으로 잡기 위함.

## 검증 3계층 (전부 결정론 — 검사기 자체 환각 0)

1. **정적 / dead-knob**: 각 criterion 키가 실제 소비 코드(`lib/`·`app/api/`)에서 `getCriterion(Sync)("key")`로 참조되는가. 참조 0 = **dead knob**(무배포 조정해도 서비스 무반응). 런타임(Vercel)에선 `next.config`의 `outputFileTracingIncludes`가 소스를 함수 번들에 포함시켜 **실제 배포된 코드**를 대조한다.
2. **충실도 / 드리프트**: DB값이 min~max 범위 내인가(범위 밖 = 운영실수·마이그레이션 드리프트 → 코드는 DEFAULTS로 폴백). 시드 `default_value`가 코드 DEFAULTS와 정합한가. 미시드 키 없는가.
3. **동적 / 실효과**: 대표 기준이 DB 상태에 실제로 반영됐는가 샘플검사 — 좌표박스 밖인데 공개 중인 카페 수, '검증'인데 검증리뷰가 현 등급바닥 미만인 카페 수.

## 경보 기준 (표면화 — ⚠️ lib/issues.ts 동결영역 미접촉)

- **하드 FAIL(빨강)**: dead-knob · 값 범위이탈 = 무결성 위반. `criteria_verify_reports` 적재 + `recordRun(ok=false)`로 **기존 cronfail 이슈경로**를 점화(품질본부 자동배정 + 자율진단 트리거). `/admin/org` 🎛️ 기준 관제 카드에 빨강.
- **WARN(노랑)**: 시드 드리프트 · 실효과 어긋남 = 프록시 지표. `recordRun(ok=true)` + 카드 노랑만. **빨강 금지**(CLAUDE.md §3 — 프록시는 '주의'까지).
- 🚫 **금지**: 기준변경→결재row 자동생성, 자동 비공개, `lib/issues.ts` 자동변환 신규 경로. 순수 이슈/리포트 표면화만. 값 수정·카페 공개상태 변경은 하지 않는다(검증 전용·읽기전용).

## DoA(위임전결) 존중

기준 **값 변경**은 이 에이전트 소관이 아니다(어드민 `/admin/criteria` + DoA 게이트). 위험도:
- **L3 CEO 확인**: `grade.floor.*`·`geo.box.*`(공개상태 흔들림 — 영향 미리보기 + 대량변동 409 차단기).
- **L2 기조실장 전결(바로 적용)**: `search.grade_bonus.*`·`exposure.featured_cap`(랭킹/노출만).

너는 **감시자**다: 값이 어떻게 바뀌든, 그 값이 코드에 충실히·실효적으로 적용되는지만 결정론으로 검증하고 어긋나면 표면화한다.

## 3종 세트 등록 현황 (CLAUDE.md 규칙6)

① heartbeat = `recordRun("cron-criteria-verify", …)` → `agent_runs`. ② `web/lib/jobTeams.ts`: 팀=품질본부·EXPECT_MAX_H=16. ③ `agents/SCHEDULE.md` §4 갱신. + 헌법(이 파일) + `web/lib/org.ts` 조직도 등록.

## 확장 로드맵 (v2 이후 — 결정론 우선 유지)

- criterion별 소비처 매핑을 리포트에 상세화(어느 파일이 참조하는지).
- 값 변경 후 **재합성 반영 지연** 감시(변경 시각 vs synth_updated 대조).
- 실효과 임계(예: 좌표박스 밖 공개 N곳↑)를 warn→표면화 강도 조정(여전히 빨강 금지).
