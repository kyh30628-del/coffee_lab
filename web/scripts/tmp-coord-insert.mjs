import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const env = fs.readFileSync('.env.local','utf8');
const url = env.match(/DATABASE_URL="?([^"\n]+)"?/)[1];
const sql = neon(url);

const topic = "[하네스L4] 사람판독 배치 7일째 미착수 — attraction 0/33(+22)·noncafe-biz 0/11 무판독, coord#319 수신확인만 되고 미실행";
const detail = `08-18 coord#319(사람판독 배치 요청, attraction 0/11·noncafe-biz 0/11·generic-term 3/10)가 08-18 23:13 "resolved"(stage=수신확인) 처리됐으나, 08-20 03:05 재확인 결과 실제 판독 배치는 착수되지 않음:
- attraction: 0/11 → 0/33 (동결 22건 순증, 판독 0건 그대로)
- noncafe-biz: 0/11 (변동 없음, coord#320에서 레드팀이 3건만 별도 직접조사·나머지 8건은 미착수)
- generic-term: 3/10 → 3/15 (신규 5건 추가, 판독 진행 없음)
- 마지막 [사람판독] 태그 시각 = 2026-08-13(여전히 최신, 7일째 batch 미가동)
읽기전용 조사 범위라 직접 판독 대행 불가. coord#319가 "resolved" 처리됐지만 실행이 뒤따르지 않은 것으로 보여, 단순 재알림이 아니라 배치 착수 자체가 막혀있는지(담당자 미배정·우선순위 밀림 등) 확인이 필요해 보임을 명시적으로 재상신함.
권장: 품질본부(검증심사팀)가 다음 배치에서 attraction 33 + noncafe-biz 11 + generic-term 12(미판독분) = 56건 판독 착수. 08-18 coord#319 부속 지침(베이커리/한옥·수목원 부속카페류는 업종명이 아닌 실제 카페기능 여부로 개별판단, decision#32 선례 참고) 동일 적용.`;

const ins = await sql`
  INSERT INTO coordination (from_team, to_team, type, status, stage, topic, detail, created_at)
  VALUES ('전사자율진단', '품질본부(검증심사팀)', 'handoff', 'open', '신규', ${topic}, ${detail}, now())
  RETURNING id
`;
console.log('inserted coordination id:', ins[0].id);
