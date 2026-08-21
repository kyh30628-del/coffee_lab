import { neon } from '@neondatabase/serverless';
import fs from 'fs';
for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const m = line.match(/^DATABASE_URL=(.*)$/);
  if (m) process.env.DATABASE_URL = m[1].replace(/^"|"$/g,'');
}
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  INSERT INTO coordination (from_team, to_team, type, topic, detail, status, stage, created_at)
  VALUES (
    '품질본부 룰갭발굴팀',
    '리뷰품질팀',
    'info',
    '[협업#325 원인규명] id11853 커피마을 재합성 지연 아님 — 배포 타이밍 갭',
    '협업#325(29h+ stage=조율)의 근본원인 확인: decision#777(접두 결합 합성상호 게이트) 코드는 이미 배포 완료(git aadaf18, 08-20 07:06 KST). 그런데 id11853의 synth_updated=08-20 07:03:16으로 배포 3분 전에 재합성이 실행되어 새 규칙이 반영되지 못함(offctx_ok=false 잔류, synth_reviews[1]에 두레커피마을 문구 그대로). 재합성 파이프라인이 막힌 게 아니라 "배포 직전 재합성 → 신규 규칙 미반영" 타이밍 갭이 원인. id11853 1건만 재합성 재실행하면 즉시 해소됨(코드는 이미 정상 동작 확인).',
    'open',
    '신규',
    now()
  )
  RETURNING id
`;
console.log(JSON.stringify(rows));
