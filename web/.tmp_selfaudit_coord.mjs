import { neon } from '@neondatabase/serverless';
import fs from 'fs';
const envText = fs.readFileSync('.env.local', 'utf8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const sql = neon(process.env.DATABASE_URL);

const topic = '[스케줄문서 드리프트] audit-watch/dev-pipeline/dev-deploy plist 실제=4x/일(08:05·12:05·16:05·20:05), SCHEDULE.md는 60분으로 오기재';
const detail = `agents/SCHEDULE.md §1은 audit-watch·dev-pipeline·dev-deploy 3잡을 2026-07-28 CEO승인 60분 폴링(StartInterval 3600)으로 기재 중이나, 실측(~/Library/LaunchAgents/com.coffee.{audit-watch,dev-pipeline,dev-deploy}.plist, mtime 2026-08-03 13:47:31) 결과 셋 다 StartCalendarInterval 08:05/12:05/16:05/20:05(하루 4회)로 이미 08-03에 재설정돼 2주째 미문서화.

실증거: audit_triggers 최근 5건의 created_at→consumed_at 간격이 매번 정확히 ~4시간(예 08-17 03:05:35→07:05:04)으로 캘린더 슬롯과 일치 — 5분/60분 폴링이 아니라 4x/일 캘린더로 실제 동작 중임을 확인.

영향:
① audit-watch — selfaudit_critical/cron_fail 등 긴급 이벤트가 최악 야간구간(20:05~익일08:05) 최대 12시간 지연 후 인지될 수 있음(문서상 "5분 워처" 기대와 실제 최대 12h 갭).
② dev-pipeline/dev-deploy — SCHEDULE.md가 "최대 60분 지연"으로 명시한 CEO 배포확정→실배포 지연이 실제로는 캘린더 슬롯을 놓치면 최대 12시간까지 가능(decision-pipeline-completion 우려와 직결).

파괴적이거나 즉시 장애는 아니라 결재 상신 대상은 아니지만, ①SCHEDULE.md 정정 ②08-03 재클러스터링이 CEO 승인 사안인지 확인 ③야간 긴급이벤트 최대 12h 지연이 허용범위인지 판단이 필요 — SCHEDULE.md 관리 담당(경영지원본부/기획조정실)이 확인 바람.`;

const r = await sql`
  INSERT INTO coordination (from_team, to_team, type, topic, detail, status, created_at)
  VALUES ('전사자율진단', '경영지원본부', 'handoff', ${topic}, ${detail}, 'open', now())
  RETURNING id`;
console.log('OK', JSON.stringify(r));
