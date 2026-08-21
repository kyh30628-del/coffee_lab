import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
const sql = neon(process.env.DATABASE_URL);

const ik = 'selfaudit-llm:coord325-11853-resynth-20260821';
const dup = await sql`SELECT id, status FROM decisions WHERE action_params->>'ikey' = ${ik}`;
if (dup.length) {
  console.log('DUP EXISTS, skip insert:', JSON.stringify(dup));
} else {
  const ins = await sql`
    INSERT INTO decisions (title, detail, team, severity, tier, action_type, action_params, recommendation)
    VALUES (
      ${'[협업#325 지연 해소] id11853 커피마을 — decision#777 배포 타이밍 갭으로 재합성 미반영, 재큐 요청'},
      ${'협업#325(기획조정실→리뷰품질팀, 24h+ 지연·escalated)의 근본원인은 협업#328(품질본부 룰갭발굴팀)이 이미 규명: decision#777(접두 결합 합성상호 게이트) 코드는 08-20 07:06 KST 배포 완료됐으나, id11853의 마지막 재합성(synth_updated=08-20 07:03:16)이 배포 3분 전에 실행돼 새 규칙이 반영 안 됨. DB 재확인 결과(2026-08-21 16:06 KST) synth_updated 그대로·offctx_ok=false 잔류 — 13시간째 재합성 미실행. 코드는 정상 동작 확인됐고(60개 카페 회귀샘플 통과) 필요한 조치는 단일 카페 재합성 큐 등록뿐, decision#792 선례와 동일 패턴.'},
      ${'리뷰품질팀'},
      ${'MED'},
      ${'L2'},
      ${'requeue_resynth'},
      ${JSON.stringify({ ids: [11853], ikey: ik })}::jsonb,
      ${'승인 권합니다 — 이유: 원인 이미 확정(배포 타이밍 갭, 코드결함 아님), 조치는 synth_updated NULL화로 재합성 큐 등록뿐이라 위험 0. L2 전결 자동집행 대상(unpublish/requeue_resynth와 동일 레일)이라 승인 즉시 다음 사이클(~10분)에 자동 실행되고 협업#325·#328 동시 해소됨.'}
    )
    RETURNING id`;
  console.log('INSERTED:', JSON.stringify(ins));
}
