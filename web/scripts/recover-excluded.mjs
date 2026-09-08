#!/usr/bin/env node
// 🩹 결재 없이 일괄 제외된 우량 카페 복구 — CEO 지시(2026-09-08) "비용 증가 없으면 카페 수 보완".
//   실행: node --import tsx scripts/recover-excluded.mjs            (DRY-RUN, 기본)
//         node --import tsx scripts/recover-excluded.mjs --apply    (실제 복구)
//
// ⚠️ 결론(2026-09-08, 실측 후 **자기 정정**): 이 도구로 **자동 복구하지 않는다.** 진단용으로만 쓴다.
//   처음엔 "2026-07-04 일괄 제외 779곳이 부수피해"로 봤다. synth_count 내림차순 표본에 꽁티드툴레아·
//   카페랄로 같은 최상급이 떠서였다. 전수로 보니 그 표본은 **전부 브런치 카테고리**였고,
//   나머지는 대체로 정당한 제외였다. 규칙을 좁혀 62곳까지 줄인 뒤 62개 이름을 전부 읽어보니
//   북카페 5곳·펜션·물회집·호텔 부속 매장·주소 오염 의심(성북구인데 '만촌', 화성시인데 '영광')이 섞여 있었다.
//   → **일괄 복구는 안전하지 않다.** 진짜 지렛대는 아래 '브런치' 한 덩어리이고 그건 규칙 변경(L3)이다.
//
// 🔴 무엇을 발견했나
//   `pipeline_status='excluded'` 이면서 등급이 검증·참고인 카페가 1,549곳. 그 중 1,041곳의 제외 사유가
//   "사유 미기록"이다(779곳 + 사유 컬럼 도입 이전 262곳).
//   그 1,041곳을 카테고리로 갈라보면 **브런치가 514곳(브런치카페 340 + 음식점>브런치 174)**이다.
//   전체로 넓히면 브런치 카테고리 카페는 **공개 1곳 · 미공개 620곳** — 사실상 전부 막혀 있다.
//   그런데 우리는 2026-08-13에 **브런치를 수요 1위 테마로 신설**해 페이지까지 만들어 뒀다.
//   즉 규칙(isNonCafe가 브런치를 비카페로 봄)과 상품(브런치 테마)이 서로 어긋나 있다. 이게 진짜 병목이다.
//   ⚠️ 규칙 변경 = 코드 변경 = **L3 CEO 게이트**. 이 스크립트는 그 결정을 대신하지 않는다.
//
// 🔒 안전 규칙
//   - **강제 공개하지 않는다.** 게이트와 같은 규칙(비카페·프랜차이즈·간식노점·유령상호·무인·등급·좌표)을
//     그대로 적용해 통과한 것만 되살린다. 하나라도 걸리면 제외 상태로 둔다.
//   - 승인된 unpublish 결재가 있는 카페는 **건드리지 않는다**(lastUnpublishLocked와 같은 근거).
//   - 사유가 기록된 제외(프랜차이즈·북카페·범위 밖 등)는 대상에서 뺀다 — 그건 의도된 제외다.
//   - 복구분은 exclude_reason에 복구 이력을 남긴다(되돌릴 수 있게).
//
// 💰 비용: 네이버·유튜브 API 호출 **0**(재수집·재합성을 하지 않는다).
//   큰 컬럼(raw_reviews·synth_reviews)을 **읽지 않는다** — 이미 계산돼 저장된 작은 컬럼만 본다.
//   전수 스캔이 아니다(대상 1,041곳 = 전체 카페의 3%). 1회성.
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, ""); }
const APPLY = process.argv.includes("--apply");

const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const { isNonCafe, isFranchise, isGenericFoodName, isSnackStall, isStructuralPhantom, isUnmannedCafe } = await import("../lib/discover.ts");

const LAT = [34.5, 38.7], LNG = [124.5, 129.4]; // criteria geo.box (전국 확대 반영)

// 🔑 복구 기준을 **판단이 아니라 일관성**으로 잡는다.
//   "지금 이미 공개 중인 카테고리와 **같은 카테고리**인데 사유 없이 막힌 것"만 되살린다.
//   새 카테고리를 카페로 인정하는 건 규칙 변경(L3 CEO)이라 여기서 하지 않는다.
//   → 임계 100곳: 그 카테고리로 공개 중인 카페가 100곳 이상이면 '이미 확립된 카페 카테고리'로 본다.
const ESTABLISHED_MIN = 100;
const established = new Set((await sql`
  SELECT naver_category c FROM cafes WHERE published=true AND naver_category IS NOT NULL AND naver_category <> ''
  GROUP BY 1 HAVING count(*) >= ${ESTABLISHED_MIN}`).map((r) => r.c));
console.log(`확립된 카페 카테고리(공개 ${ESTABLISHED_MIN}곳 이상): ${established.size}종`);
console.log("  " + [...established].join(" · ") + "\n");

// ① 대상: 사유가 기록되지 않은 제외 + 등급 충분. 사유가 적힌 제외(의도된 것)는 제외한다.
const rows = await sql`
  SELECT id, name, area, synth_grade, synth_count, naver_category, lat, lng,
         embedding IS NOT NULL AS has_embed, exclude_reason
  FROM cafes
  WHERE pipeline_status='excluded' AND published=false
    AND synth_grade IN ('검증','참고')
    AND exclude_reason LIKE '사유 미기록%'`;
console.log(`대상(사유 미기록 제외 · 등급 검증/참고): ${rows.length}곳 · ${APPLY ? "APPLY(복구)" : "DRY-RUN(변경 없음)"}\n`);

// ② 승인된 unpublish 결재가 있는 카페는 제외(게이트의 lastUnpublishLocked와 같은 근거)
const locked = new Set((await sql`
  SELECT DISTINCT e.v AS id FROM decisions d, jsonb_array_elements_text(COALESCE(d.action_params->'ids','[]'::jsonb)) e(v)
  WHERE d.action_type='unpublish' AND d.status='done'`.catch(() => [])).map((r) => String(r.id)));

const reasons = {};
const pass = [];
for (const c of rows) {
  const n = String(c.name || "");
  let why = null;
  if (locked.has(String(c.id))) why = "승인된 비공개 결재 있음";
  else if (!c.naver_category) why = "네이버 카테고리 없음(비카페 차단 장치)";
  else if (!established.has(c.naver_category)) why = `확립된 카페 카테고리 아님 (${c.naver_category})`;
  // 상호 자체가 비카페인 것(펜션·브런치 등)은 카테고리가 확립돼 있어도 되살리지 않는다.
  //   게이트가 파이프라인 밖 카페에 쓰는 이름 전용 판정과 같은 함수다(synthStore의 isNonCafe(name,"")).
  else if (isNonCafe(n, "")) why = "상호가 비카페(이름 판정)";
  else if (isFranchise(n)) why = "프랜차이즈";
  else if (isGenericFoodName(n)) why = "일반 음식점 이름";
  else if (isSnackStall(n)) why = "간식 노점";
  else if (isStructuralPhantom(n)) why = "유령 상호";
  else if (isUnmannedCafe(n)) why = "무인 카페";
  else if (c.lat == null || c.lng == null) why = "좌표 없음";
  else if (!(c.lat >= LAT[0] && c.lat <= LAT[1] && c.lng >= LNG[0] && c.lng <= LNG[1])) why = "서비스 좌표박스 밖";
  else if (!c.has_embed) why = "임베딩 없음(검색에 안 잡힘)";
  if (why) { reasons[why] = (reasons[why] || 0) + 1; continue; }
  pass.push(c);
}

console.log("── 게이트에서 계속 막히는 것 ──");
const notEstab = Object.entries(reasons).filter(([k]) => k.startsWith("확립된 카페 카테고리 아님"));
for (const [k, v] of Object.entries(reasons).filter(([k]) => !k.startsWith("확립된")).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(v).padStart(5)}곳  ${k}`);
if (notEstab.length) {
  console.log(`  ${String(notEstab.reduce((a, b) => a + b[1], 0)).padStart(5)}곳  확립되지 않은 카테고리 — 규칙 변경(L3)이 필요한 몫:`);
  for (const [k, v] of notEstab.sort((a, b) => b[1] - a[1]).slice(0, 10))
    console.log(`         ${String(v).padStart(4)}곳  ${k.replace("확립된 카페 카테고리 아님 ", "")}`);
}
console.log(`\n── 복구 대상(게이트 전부 통과) : ${pass.length}곳 ──`);
const byGrade = {}; const byArea = {};
for (const c of pass) { byGrade[c.synth_grade] = (byGrade[c.synth_grade] || 0) + 1; byArea[c.area] = (byArea[c.area] || 0) + 1; }
console.log("  등급:", Object.entries(byGrade).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log("  지역 상위:", Object.entries(byArea).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log("  표본:", pass.slice(0, 12).map((c) => `${c.name}(${c.area}·${c.synth_grade}·${c.synth_count})`).join(", "));

if (!APPLY) { console.log("\nDRY-RUN. --apply 는 CEO 승인 후에만 쓸 것(위 헤더의 자기 정정 참고)."); process.exit(0); }
console.error("⛔ --apply 는 잠겨 있다. 62곳 목록에 북카페·펜션·음식점이 섞여 있음을 확인했다(2026-09-08).");
console.error("   되살릴 대상을 사람이 지정한 뒤에만 열 것. 지금 상태로 일괄 적용하면 큐레이션이 깨진다.");
process.exit(1);

// ③ 복구 — 게이트를 통과한 것만. 되돌릴 수 있게 사유를 남긴다.
const ids = pass.map((c) => Number(c.id));
let done = 0;
for (let i = 0; i < ids.length; i += 200) {
  const chunk = ids.slice(i, i + 200);
  const r = await sql`UPDATE cafes SET published=true, pipeline_status='live',
      exclude_reason = '2026-09-08 복구: 사유 미기록 일괄 제외분을 게이트 재적용으로 되살림(결재 없는 제외였음)',
      exclude_at = NULL, updated_at = now()
    WHERE id = ANY(${chunk}) AND pipeline_status='excluded' RETURNING id`;
  done += r.length;
}
console.log(`\n✅ 복구 ${done}곳`);
try {
  const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
  await invalidateCafeCaches(ids);
  console.log("🧹 캐시 무효화 완료(지도·목록·상세)");
} catch (e) { console.log("⚠️ 캐시 무효화 실패 — 수동 확인 필요:", String(e).slice(0, 80)); }
const after = (await sql`SELECT count(*)::int n FROM cafes WHERE published=true`)[0].n;
console.log(`공개 카페 합계: ${after.toLocaleString()}곳`);
