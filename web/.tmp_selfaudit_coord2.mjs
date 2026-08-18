import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const sql = neon(process.env.DATABASE_URL);

const topic = '[하네스L4] 사람판독 배치 5일 공백 — attraction·noncafe-biz 신규동결 22건 0% 무판독(전사자율진단→품질본부)';
const detail = `오늘(08-18) 12:05 KST 트리거 heal_no_effect 30건(sentinel.attraction 11 · noncafe-biz 11 · generic-term 8)에 사람 확인 필요로 잡혀 조사. heal_attempts 대사 결과:

- 전체 동결(frozen_until>now) 50건 중 [사람판독] 태그 완료 20건, **미판독 30건**.
- 카테고리별: franchise-branch 18건 중 17건 판독완료(정상 가동) · generic-term 10건 중 3건 판독 · **attraction 11건 전부(0/11)·noncafe-biz 11건 전부(0/11) 무판독** — 두 카테고리는 최근 동결분(23:12~03:02 KST, 08-17~08-18 사이 두 sentinel 런에서 신규 발생)이 단 한 건도 리뷰되지 않음.
- 과거 selfaudit 리포트(08-09/08-15/08-16)가 기록한 선례: "사람판독"은 비정형 배치로 사람이 실제 노출후기를 읽어 보존/제거 판정 후 note에 [사람판독 MM-DD] 태그 + 필요시 decisions(L2, action_type unpublish/requeue_resynth, 예: #659/#660/#683) 상신하는 구조. 마지막 배치가 08-13이었고(08-15 리포트 확인), 이후 5일간 신규 동결분이 쌓이기만 하고 배치가 돌지 않음.
- 표본 확인(id3480 다도레 티룸[생성-term]·id4733 풍물기행 한옥카페[attraction]·id6100 일월수목원 카페 데이지원[attraction]·id4008 빠니스비떼[noncafe-biz]·id12968 쁘숑베이커리[noncafe-biz]) — 이름·리뷰 문면상 관광지/베이커리 정체성이 강해 사람 판단이 필요한 전형적 케이스. 힐러 note는 전부 "제거 대상 없음(이미 결정 완료 — 자동으로는 더 못 고침)"으로, 자동 조치가 아니라 실제 육안 재검토(보존/제거)가 필요한 상태.
- 결정론(cron-selfaudit)은 heal_attempts 판독 지연을 감시하지 않아 DIGEST·크론헬스에 안 잡힘 — 이번 이벤트 트리거로만 포착됨.

조치 요청: 품질본부(검증심사팀)가 다음 사람판독 배치(11+11+7=29건, generic-term 나머지 7건 포함)를 진행 — 보존/제거 판정 후 heal_attempts.note 태그 + 제거 대상은 결재(L2, unpublish 또는 requeue_resynth) 상신. 파괴적 판단은 이번 사이클에서 대행하지 않음(읽기전용 조사 범위 준수).`;

const r = await sql`
  INSERT INTO coordination (from_team, to_team, type, topic, detail, status, created_at)
  VALUES ('전사자율진단', '품질본부(검증심사팀)', 'handoff', ${topic}, ${detail}, 'open', now())
  RETURNING id`;
console.log('OK', JSON.stringify(r));
