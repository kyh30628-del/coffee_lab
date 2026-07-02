// 유튜브 백필 — 이미 raw 캐시된 카페에 유튜브만 추가 수집·재합성(로컬, 타임아웃 없음).
// 유튜브 일일 쿼터(~95 검색)가 빡빡해, 인기(리뷰 많은) 카페부터 매일 ~90곳씩 보강.
// 쿼터 소진 시 자동 중단(내일 이어서). 한 번 확인한 카페는 yt_checked_at으로 재시도 안 함.
// 실행(tsx): node --import tsx scripts/youtube-backfill.mjs
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { backfillYouTube } = await import("../lib/synthStore.ts");
const { sql } = await import("../lib/db.ts");
const { recordRun } = await import("../lib/agentLog.ts");

await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS yt_checked_at TIMESTAMPTZ`;
// 유튜브 일일 쿼터 안전선 — 키 1개당 ~95곳. 키 로테이션(YOUTUBE_API_KEY_2·_3…) 개수에 비례해 자동 확장.
const KEY_COUNT = ["YOUTUBE_API_KEY", "YOUTUBE_API_KEY_2", "YOUTUBE_API_KEY_3", "YOUTUBE_API_KEY_4"].filter((k) => (process.env[k] || "").length > 10).length || 1;
const MAX = Number(process.env.YT_MAX || 95 * KEY_COUNT);
let added = 0, none = 0, processed = 0, quota = false;

while (processed < MAX && !quota) {
  // 공개 우선 타깃팅(CEO 결정): 사용자가 실제 보는 카페부터 — 공개 > 비공개, 검증 > 참고 > 후보, 그 안에서 리뷰 많은 순.
  const rows = await sql`
    SELECT id, name, area FROM cafes
    WHERE raw_reviews IS NOT NULL AND yt_checked_at IS NULL
      AND NOT (raw_reviews @> '[{"source":"youtube"}]')
    ORDER BY published DESC NULLS LAST,
             (synth_grade='검증') DESC,
             (synth_grade='참고') DESC,
             synth_count DESC NULLS LAST
    LIMIT 5`;
  if (!rows.length) { console.log("유튜브 백필 대상 없음 — 전체 완료"); break; }
  for (const c of rows) {
    const r = await backfillYouTube(c);
    processed++;
    if (r === "added") { added++; console.log(`  ✓ ${c.name}: 유튜브 추가·재합성`); }
    else if (r === "none") { none++; }
    else if (r === "quota") { quota = true; console.log("유튜브 쿼터 소진 — 중단(내일 이어서)"); break; }
    if (processed >= MAX) break;
    await new Promise((x) => setTimeout(x, 400));
  }
}
const remain = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE raw_reviews IS NOT NULL AND yt_checked_at IS NULL AND NOT (raw_reviews @> '[{"source":"youtube"}]')`)[0].n;
console.log(`\n유튜브 백필 종료: 추가 ${added} · 영상없음 ${none} · 처리 ${processed} · 남은 대상 ${remain}`);
// 자율진단이 정지를 감지하도록 agent_runs에 기록(재발방지). 쿼터소진도 정상 종료로 기록.
await recordRun("youtube-backfill", true, `추가 ${added}·영상없음 ${none}·처리 ${processed}·남은 ${remain}·키${KEY_COUNT}(상한${MAX})${quota ? "·전키소진" : ""}`, processed).catch(() => {});
process.exit(0);
