// 🔓 '서비스 범위 밖' 제외 해제 — 지역을 새로 편입했을 때 쓰는 **상비 도구**.
//
//   왜 필요한가: 지역을 열어도 예전에 `exclude_reason='서비스 범위 밖 시·도 주소'`로 굳은 카페는
//   **자동으로 안 풀린다.** 2026-09-12 대구·경북 때도, 2026-09-17 전국 개방 때도 그랬다(740곳).
//   그때마다 손으로 스크립트를 짰다 — 그러면 매번 규칙이 조금씩 달라지고 검증도 들쭉날쭉해진다.
//
//   🔒 안전장치
//     ① 기본은 **미리보기**다. 실제 변경은 `--apply`를 붙여야 한다.
//     ② 주소를 **한 건씩 addressSidoScope로 재검증**한다. 'in'이 아닌 건 손대지 않는다
//        (목록만 믿고 풀면 진짜 범위 밖 카페가 공개된다).
//     ③ 등급별 복구 규칙은 memory(project_region_expansion_pairs)의 09-12 복구 절차를 그대로 따른다:
//        검증·참고 → pending(승격 대상) · 후보 → rejected(설계상 비공개) · 등급없음 → new(재수집부터)
//     ④ 공개(published)는 직접 건드리지 않는다 — cron-embed의 finalizePipeline이 게이트를 거쳐 승격한다.
//
//   실행:  node --import tsx scripts/release-scope-excluded.mjs          (미리보기)
//          node --import tsx scripts/release-scope-excluded.mjs --apply  (집행)
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { addressSidoScope } = await import("../lib/discover.ts");

const APPLY = process.argv.includes("--apply");
// 🔴 2026-09-18 — 정확일치로 보다가 **56곳을 통째로 놓쳤다.** 같은 성격인데 문구가 달랐다:
//   "서비스 범위 밖 — 주소 시도가 미편입 지역인데 area가 동명 시군구로 오분류됨(2026-09-14 확인)"
//   제외 사유 문구는 사람이 그때그때 쓰므로 정확일치는 반드시 샌다. 접두로 본다.
//   ⚠️ 그래도 안전하다 — 아래에서 **주소를 다시 검증**해 현재 서비스 범위 안인 것만 푼다.
const REASON_PREFIX = "서비스 범위 밖";

const rows = await sql`SELECT id, name, address, synth_grade FROM cafes
  WHERE pipeline_status='excluded' AND exclude_reason LIKE ${REASON_PREFIX + '%'}`;
if (!rows.length) { console.log("✅ '범위 밖'으로 제외된 카페가 없다 — 할 일 없음."); process.exit(0); }

const inNow = [], stillOut = [];
for (const r of rows) (addressSidoScope(r.address ?? "").scope === "in" ? inNow : stillOut).push(r);

const bucket = (g) => (g === "검증" || g === "참고") ? "pending" : g === "후보" ? "rejected" : "new";
const plan = inNow.reduce((m, r) => { const b = bucket(r.synth_grade); (m[b] ??= []).push(r.id); return m; }, {});

console.log(`'범위 밖' 제외 ${rows.length.toLocaleString()}곳`);
console.log(`  지금 범위 안 ${inNow.length.toLocaleString()}곳 · 여전히 범위 밖/판정불가 ${stillOut.length.toLocaleString()}곳(건드리지 않음)`);
for (const [k, v] of Object.entries(plan)) console.log(`   → ${k.padEnd(9)} ${v.length.toLocaleString()}곳`);
if (stillOut.length) console.log(`  손대지 않는 표본: ${stillOut.slice(0, 3).map((x) => `${x.name}(${String(x.address).slice(0, 20)})`).join(" · ")}`);

if (!APPLY) { console.log("\n▶ 미리보기다. 실제로 바꾸려면 --apply 를 붙여라."); process.exit(0); }

let done = 0;
for (const [status, ids] of Object.entries(plan)) {
  const r = await sql`UPDATE cafes SET pipeline_status=${status}, exclude_reason=NULL, exclude_at=NULL, updated_at=now()
    WHERE id = ANY(${ids}) RETURNING id`;
  done += r.length;
  console.log(`  ✅ ${status} ${r.length.toLocaleString()}곳`);
}
const [left] = await sql`SELECT count(*)::int n FROM cafes WHERE exclude_reason LIKE ${REASON_PREFIX + '%'}`;
console.log(`\n해제 ${done.toLocaleString()}곳 · 잔여 ${left.n.toLocaleString()}곳`);
console.log("공개 승격은 cron-embed(08:01·12:01·16:01·20:03)의 finalizePipeline이 게이트를 거쳐 처리한다.");
