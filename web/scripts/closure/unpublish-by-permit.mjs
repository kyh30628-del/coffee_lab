#!/usr/bin/env node
// 🚪 공공 인허가 원장 '폐업' 기반 비공개 (2026-10-19, CEO "폐업한 곳 보여주는 게 최악")
//
// 왜 필요한가: cron-closure는 **네이버 미발견(misses)** 에만 의존한다. 그 신호는 약해서
//   ("안 나옴 ≠ 폐업") 자동 비공개를 못 한다. 그런데 우리는 **정부 인허가 원장**을 이미 들고 있으면서
//   폐업 판정에 쓰지 않았다. 실측: 원장이 '폐업'인데 공개 중인 카페가 **340곳**이었다.
//
// 🔒 오삭제가 더 큰 신뢰붕괴다 — 세 겹 가드를 전부 통과한 곳만 내린다:
//   ① 원장 status_nm = 폐업  AND  이름 매칭 유사도 sim >= 0.9
//   ② 같은 카페에 '영업' 인허가가 **하나도 없음**(명의변경 재등록이면 영업 중이다)
//   ③ **원본 후기(raw_reviews)** 의 최신 날짜가 폐업일보다 **이전** — 폐업 후에도 후기가 달리면 영업 중이다.
//      ⚠️ review_dates 캐시는 낡을 수 있어 쓰지 않는다(cron-closure가 경고한 그 함정).
//
// 되돌리기: 실행할 때마다 agent-reports/closure-unpublish-<ts>.json 에 id 목록을 남긴다.
//   원복 = node --import tsx scripts/closure/unpublish-by-permit.mjs --revert <그 파일>
//
// 기본은 미리보기. 실제 집행은 --apply.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const env = readFileSync(new URL("../../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../../lib/db.ts");
const APPLY = process.argv.includes("--apply");
const REVERT = process.argv.includes("--revert") ? process.argv[process.argv.indexOf("--revert") + 1] : null;
const norm = (s) => String(s || "").replace(/[^0-9]/g, "").slice(0, 8);

if (REVERT) {
  const ids = JSON.parse(readFileSync(REVERT, "utf8")).ids.map(Number);
  if (!APPLY) { console.log(`원복 대상 ${ids.length}곳 (실행하려면 --apply)`); process.exit(0); }
  await sql`UPDATE cafes SET published=true, pipeline_status='live', exclude_reason=NULL, exclude_at=NULL WHERE id = ANY(${ids})`;
  const { invalidateCafeCaches } = await import("../../lib/cafeCacheInvalidate.ts");
  await invalidateCafeCaches(ids).catch(() => {});
  console.log(`✅ ${ids.length}곳 원복`);
  process.exit(0);
}

const cand = await sql`SELECT c.id, c.name, c.area, p.closed_ymd, p.sim
  FROM cafes c JOIN cafe_permits p ON p.cafe_id = c.id
  WHERE c.published AND p.status_nm LIKE '%폐업%' AND p.sim >= 0.9
    AND NOT EXISTS (SELECT 1 FROM cafe_permits q WHERE q.cafe_id = c.id AND q.status_nm NOT LIKE '%폐업%')`;
const hit = [], alive = [];
for (const r of cand) {   // 🔴 원본은 큰 컬럼이라 한 곳씩 날짜만 뽑는다(전수 blob 조회 금지 — 비용 하드규칙)
  const [d] = await sql`SELECT (SELECT MAX(x) FROM jsonb_array_elements_text(
      jsonb_path_query_array(COALESCE(raw_reviews,'[]'::jsonb), '$[*].date')) x) md FROM cafes WHERE id=${r.id}`;
  const last = norm(d?.md), cl = norm(r.closed_ymd);
  (last && cl && last > cl ? alive : hit).push({ ...r, last });
}
console.log(`원장 폐업 + 유사도0.9+ + 영업허가 없음 : ${cand.length}곳`);
console.log(`  ├ 폐업일 이후 원본 후기 있음(영업 중) → 보존 : ${alive.length}곳`);
console.log(`  └ 비공개 대상 : ${hit.length}곳`);
for (const r of hit.slice(0, 12)) console.log(`     id${String(r.id).padEnd(7)} ${String(r.name).slice(0,18).padEnd(20)} ${r.area}  폐업 ${r.closed_ymd}  최신후기 ${r.last || "없음"}`);
if (!APPLY) { console.log("\n미리보기입니다. 실제 집행은 --apply"); process.exit(0); }

const ids = hit.map((r) => Number(r.id));
mkdirSync(new URL("../../../agent-reports/", import.meta.url), { recursive: true });
const out = new URL(`../../../agent-reports/closure-unpublish-${Date.now()}.json`, import.meta.url);
writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), ids, rows: hit }, null, 1));
await sql`UPDATE cafes SET published=false, pipeline_status='excluded',
  exclude_reason='공공 인허가 원장 폐업(유사도0.9+·영업허가 없음·폐업일 이후 후기 0건)', exclude_at=now()
  WHERE id = ANY(${ids})`;
const { invalidateCafeCaches } = await import("../../lib/cafeCacheInvalidate.ts");
for (let i = 0; i < ids.length; i += 50) await invalidateCafeCaches(ids.slice(i, i + 50)).catch(() => {});
console.log(`\n✅ ${ids.length}곳 비공개 · 캐시 무효화 완료`);
console.log(`   되돌리기: node --import tsx scripts/closure/unpublish-by-permit.mjs --revert ${out.pathname} --apply`);
