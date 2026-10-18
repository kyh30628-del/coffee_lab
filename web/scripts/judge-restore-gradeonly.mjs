// 🛡️ 판정으로 '등급미달' 단독 사유로 내려간 공개 카페를 되돌린다. (2026-10-19)
//
// CEO 지시: "비공개는 보수적으로 해. 이미 공개된 거고 판정으로 인해 진짜 오염이나 근거 없는 게
//            아니라면 되도록 유지해."
// 실측(판정 집행 6시간): 내려간 799곳 중 **398곳이 '등급미달(후보)' 단독**, 그중 379곳은 근거가
//   1건 이상 남아 있었다 — 오염이 아니라 건수가 문턱(grade.floor.reference=2) 아래로 간 것뿐이다.
// 코드는 고쳤지만(storeResult의 keepLive) **이미 내려간 것은 코드 수정으로 돌아오지 않는다.**
//
// 되돌리지 않는 것(=내리는 게 맞는 것): 근거 0건 · 노이즈(오염) · 비카페 분류 · 프랜차이즈 ·
//   excluded/held · 승인된 비공개 결재(lastUnpublishLocked)
// 🔴 규칙 함수를 못 불러오면 **중단한다** — 2026-10-18에 규칙 0개로 "전부 안전"이라 보고한 사고가 있었다.
//
// 사용: node --import tsx scripts/judge-restore-gradeonly.mjs [--apply] [--hours=12]
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");
const HOURS = Number((process.argv.find((a) => a.startsWith("--hours=")) ?? "").split("=")[1] || 12);
const n = (v) => Number(v ?? 0).toLocaleString();

// 규칙 함수 — 하나라도 없으면 중단
const rules = {};
for (const [name, mod] of [["isFranchise", "../lib/discover.ts"], ["isNonCafe", "../lib/discover.ts"]]) {
  try { const m = await import(mod); if (typeof m[name] === "function") rules[name] = m[name]; } catch {}
}
const missing = ["isFranchise", "isNonCafe"].filter((k) => !rules[k]);
if (missing.length) { console.error(`🔴 규칙 함수를 못 불러왔다: ${missing.join(", ")} — 중단(규칙 0개로 '안전' 판정하는 사고 방지)`); process.exit(1); }
const { loadCriteria, getCriterionSync } = await import("../lib/criteria.ts");
await loadCriteria();
const box = { latMin: getCriterionSync("geo.box.lat_min"), latMax: getCriterionSync("geo.box.lat_max"),
               lngMin: getCriterionSync("geo.box.lng_min"), lngMax: getCriterionSync("geo.box.lng_max") };

const cand = await sql`SELECT id, name, naver_category, synth_count, synth_grade, lat, lng, exclude_reason
  FROM cafes
  WHERE NOT published
    AND exclude_reason = '등급미달(후보)'          -- 단독 사유만(「+ 카테고리」 등 복합은 제외)
    AND COALESCE(synth_count, 0) >= 1              -- 근거가 남아 있어야 한다(0건은 내리는 게 맞다)
    AND exclude_at > now() - (${String(HOURS)} || ' hour')::interval
    AND llm_judged_at IS NOT NULL                  -- 판정 때문에 내려간 것만
    AND (pipeline_status IS NULL OR pipeline_status NOT IN ('excluded','noise'))
    AND lat IS NOT NULL AND lat BETWEEN ${box.latMin} AND ${box.latMax}
    AND lng BETWEEN ${box.lngMin} AND ${box.lngMax}`;

// 승인된 비공개 결재가 있는 카페는 되살리지 않는다.
//   ⚠️ decisions에 cafe_id 칼럼은 **없다** — 대상은 action_params->'ids'(문자열 배열)에 들어 있다
//      (lib/synthStore.ts lastUnpublishLocked와 같은 방식). 칼럼을 추측해서 한 번 틀렸다.
//   같은 카페에 unpublish/restore가 여러 번이면 **가장 최근 것**이 유효하다.
const locked = new Set();
for (const row of await sql`SELECT action_type, action_params FROM decisions
  WHERE action_type IN ('unpublish','restore') AND status = 'done'
  ORDER BY decided_at ASC NULLS FIRST, id ASC`) {
  for (const v of (row.action_params?.ids ?? [])) {
    const id = Number(v);
    if (!Number.isFinite(id)) continue;
    if (row.action_type === 'unpublish') locked.add(id); else locked.delete(id);
  }
}

const keep = [], skip = [];
for (const c of cand) {
  if (locked.has(c.id)) { skip.push([c.name, "승인된 비공개 결재"]); continue; }
  if (rules.isFranchise(c.name)) { skip.push([c.name, "프랜차이즈"]); continue; }
  if (rules.isNonCafe(c.name, c.naver_category ?? "")) { skip.push([c.name, "비카페(이름·카테고리)"]); continue; }
  keep.push(c);
}
console.log(`🛡️ 등급미달 단독 비공개 되돌리기 ${APPLY ? "(실행)" : "(드라이런)"} · 최근 ${HOURS}시간`);
console.log(`   후보 ${n(cand.length)}곳 → 되돌릴 ${n(keep.length)}곳 · 제외 ${n(skip.length)}곳`);
for (const [nm, why] of skip.slice(0, 10)) console.log(`     제외: ${nm} — ${why}`);
console.log(`   근거 건수 분포: ${[1,2,3].map((k) => `${k}건 ${keep.filter((c) => Number(c.synth_count) === k).length}곳`).join(" · ")} · 4건+ ${keep.filter((c) => Number(c.synth_count) >= 4).length}곳`);
console.log(`   표본: ${keep.slice(0, 8).map((c) => `${c.name}(${c.synth_count}건)`).join(" · ")}`);
if (!APPLY) { console.log(`   → 실제로 되돌리려면 --apply`); process.exit(0); }
if (!keep.length) { console.log("   되돌릴 것이 없다."); process.exit(0); }
const ids = keep.map((c) => c.id);
await sql`UPDATE cafes SET published = true, pipeline_status = 'live', synth_grade = '참고',
  exclude_reason = NULL, exclude_at = NULL WHERE id = ANY(${ids})`;
const { invalidateCafeCaches } = await import("../lib/cafeCacheInvalidate.ts");
await invalidateCafeCaches(ids).catch((e) => console.warn(`캐시 무효화 실패(비치명): ${String(e).slice(0, 80)}`));
const [after] = await sql`SELECT count(*)::int c FROM cafes WHERE published`;
console.log(`   ✅ ${n(ids.length)}곳 복구 · 캐시 무효화 완료 · 현재 공개 ${n(after.c)}곳`);
