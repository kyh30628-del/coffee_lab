import fs from 'fs';
import { neon } from '@neondatabase/serverless';
const env = fs.readFileSync('.env.local', 'utf8');
const m = env.match(/^DATABASE_URL=(.*)$/m);
const url = m[1].replace(/^['"]|['"]$/g, '');
const sql = neon(url);

const note320 = "\n\n[레드팀 12:19 검증] 3곳 중 2곳(id7202 리셉션·id11117 도쿄팡야 판교도서관점)은 현재 synth_reviews 6건 전수 재확인 결과 채용공고 문구 없음(이미 정상화 — 03:12 진단 이후 재합성 등으로 해소 추정, 코드갭 진단 필요성 자체는 유효하나 이 2곳은 재조치 불요). id18295 어썸블리스(참고등급)는 현재도 [5]번 리뷰에 '월급240만원 제과제빵사 채용' 문구 생존 확인 — redteam-proposals-20260818-1219.md로 requeue_resynth 제안 상신.";
await sql`UPDATE coordination SET stage='수신확인', accepted_at=now(), detail=detail||${note320} WHERE id=320`;
console.log('320 updated');

const note319 = "\n\n[레드팀 12:19 접수] noncafe-biz 11건 중 3건(id7202·11117·18295, coord#320 명시분)은 레드팀이 직접 재검증 완료(2곳 이미 정상화, 1곳 어썸블리스만 제안 상신). 나머지 attraction 11 + noncafe-biz 8 + generic-term 7 = 26건은 레드팀 표본조사 범위(회차당 제한적) 밖 — 전담 사람판독 배치가 별도로 필요, 품질본부(검증심사팀) 본배치 트랙에서 이어서 처리 요망.";
await sql`UPDATE coordination SET stage='수신확인', accepted_at=now(), detail=detail||${note319} WHERE id=319`;
console.log('319 updated');
