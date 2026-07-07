# 개발 배포 아카이브 (자동 누적)

> dev-deploy 파이프라인이 배포 확정(main merge·push) 시 한 줄씩 자동 append한다. **수동 편집 금지** — dev_task 레코드(decisions)가 소스오브트루스이고 이 파일은 그 미러다.
> 조회 전용 로그. 컬럼: 배포일시(UTC) · 이슈# · 제목 · 커밋 · risk · 요청요약

| 배포일시(UTC) | 이슈 | 제목 | 커밋 | risk | 요청요약 |
|---|---|---|---|---|---|
| 2026-07-06 14:09 | #180 | 챗 일반탭 답변 | 61ffd3a7 | med | route.ts: 일반탭 GET?region=에 결정론 지식응답(answerKnowledge: 서비스/조직/관제/라운지/구독/파이프라인/MY PIN→CLAUDE·SERVICE_OV |
| 2026-07-06 14:45 | #181 | 챗 질문6개 | f417a2f7 | low | app/admin/org/page.tsx: 일반(region)탭 추천칩 3→6개(성수동·강남구·블루보틀·서비스가 뭐야?·MY PIN이 뭐야?·구독은 어떻게 해? — 모두 결정론 즉 |
| 2026-07-06 15:00 | #182 | 관제 UI 가독성 | 4e4f1d6f | med | 관제 UI 가독성(스타일 전용). app/admin/org/page.tsx: 핵심수치 스타일(big/lbl/sub)에 tabular-nums·볼드·진한대비·넘침방지(ellipsis |
| 2026-07-06 21:53 | #183 | 직할 분리표시 | ad85067b | low | app/admin/org/page.tsx: 조직도 모달에서 기조실장 직할(비서실장·자율진단감사실·개발실행유닛)을 라인 본부와 분리. note='기조실장 직속'으로 staff/lin |
| 2026-07-07 02:15 | #186 | [룰갭 제안6] COMMON_WORD_NAMES 4건 추가 — 소소한일상·하루에·여기서·인디고 | abbc58af | - | lib/reviewQuality.ts: COMMON_WORD_NAMES에 소소한일상·하루에·여기서·인디고 4건 추가(제안6, offctx 동명 오염 nameAsWord 게이트).  |
| 2026-07-07 02:16 | #187 | [룰갭 제안7·구조] CAFE_CONTEXT 게이트를 nameInBody-only(참고등급) 경로까지 확장 | 1f94fd18 | - | lib/reviewQuality.ts: 제안1의 inTitleFull CAFE_CONTEXT 게이트를 nameInBody-only 참고등급 경로로 대칭 확장. 점수화 직전 !nam |
