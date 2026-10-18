// ♻️ 게이트는 통과하는데 재합성이 안 돌아 묶여 있는 미공개 카페를 다시 판정한다. (2026-10-19)
//
// CEO 지시: "수집조차 안 되거나 주제 글이 없어 수집 필요 … 무책임하게 그냥 제외하지 말고. 완벽하게 해."
// 발견 경로: 비공개 35,389곳을 전수 분해하다가, **공개 4조건을 이미 전부 충족한 미공개 카페**가 있었다.
//   조건 = ⓐ주제 글(검증) 1건+ ⓑ채택 후기 2건+ ⓒ카페 카테고리 보유 ⓓ원본 30일 내(또는 통과이력)
//   이들이 왜 미공개인가: pipeline_status가 rejected/null로 남아 있고 **재합성이 다시 돌지 않아서**다.
//   공개 판정(storeResult의 ruleOk)은 재합성할 때만 재평가된다.
//
// 💰 비용: **네이버 콜 0**(refresh:false로 저장된 원본 재사용) · **LLM 0** ·
//   Neon 쓰기 곳당 2~3건 · ISR write는 **실제 공개로 올라간 곳만** 1장.
//   지금까지 찾은 수단 중 단가가 가장 좋다(AI 판정 $29.65 → 약 830곳 / 이건 비용 0 → 약 300곳).
//
// 🔒 안전: 규칙 함수로 **먼저** 프랜차이즈·비카페를 걸러낸다(못 불러오면 중단).
//   공개 여부는 storeResult가 정한다 — 이 스크립트는 published를 직접 쓰지 않는다.
//
// 사용: node --import tsx scripts/resynth-gate-stale.mjs [--apply] [--cap=400]
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { isFranchise, isNonCafe } = await import("../lib/discover.ts");
if (typeof isFranchise !== "function" || typeof isNonCafe !== "function") {
  console.error("🔴 규칙 함수(isFranchise·isNonCafe)를 못 불러왔다 — 중단(규칙 0개로 '안전' 판정하는 사고 방지)");
  process.exit(1);
}
const { synthAndStore } = await import("../lib/synthStore.ts");
const sql = neon(process.env.DATABASE_URL);
// 🔴 2026-10-19 **규칙 사전 프라임 필수** — 안 하면 사전 필터가 공개 관문보다 약하게 돈다.
//   `isFranchise`·`isNonCafe`·`isGenericFoodName`은 하드코딩 목록 **+ 학습 용어(DB)** 를 함께 본다
//   (lib/discover.ts의 `getLearned("franchise")`). 학습 용어는 loadLearnedTerms()로 캐시에 올려야 보인다.
//   실측 증거(2026-10-19): 로드 전 `isFranchise("빵집오빠 수원우만점")=false` → 로드 후 **true**.
//   학습 프랜차이즈가 22개 있었고, 그만큼 사전 필터를 빠져나가 **네이버 콜을 헛썼다**
//   (공개 관문 storeResult는 learnedTerms를 로드하므로 결국 거절한다 — 즉 순수 낭비다).
//   패턴 출처: scripts/import-permits.mjs:32 "공개 관문(synthStore)과 같은 사전으로 판정하려면 먼저 프라임해야 한다"
const { loadLearnedTerms } = await import("../lib/learnedTerms.ts");
const { loadCriteriaLists } = await import("../lib/criteriaLists.ts");
await loadLearnedTerms().catch(() => {});
await loadCriteriaLists().catch(() => {});
const APPLY = process.argv.includes("--apply");
const CAP = Number((process.argv.find((a) => a.startsWith("--cap=")) ?? "").split("=")[1] || 400);
const n = (v) => Number(v ?? 0).toLocaleString();

const rows = await sql`SELECT id, name, area, naver_category cat, synth_count,
  (raw_collected_at > now() - interval '30 day') fresh, (embedding IS NOT NULL) ever
  FROM cafes
  WHERE NOT published AND COALESCE(naver_category, '') <> ''
    AND COALESCE(synth_count, 0) >= 2
    AND COALESCE((synth_quality->>'verified')::int, 0) >= 1
    AND COALESCE(pipeline_status, '') NOT IN ('excluded', 'noise')
    AND lat IS NOT NULL AND raw_reviews IS NOT NULL
  ORDER BY synth_count DESC, id`;
const cand = rows.filter((r) => !isFranchise(r.name) && !isNonCafe(r.name, r.cat) && (r.fresh || r.ever)).slice(0, CAP);
console.log(`♻️ 재합성 재판정 ${APPLY ? "(실행)" : "(드라이런)"} — 후보 ${n(rows.length)}곳 → 규칙 통과 ${n(cand.length)}곳(상한 ${n(CAP)})`);
console.log(`   표본: ${cand.slice(0, 6).map((r) => `${r.name}(${r.synth_count}건)`).join(" · ")}`);
if (!APPLY) { console.log("   → 실제로 돌리려면 --apply"); process.exit(0); }

const [before] = await sql`SELECT count(*)::int c FROM cafes WHERE published`;
let pub = 0, kept = 0, err = 0;
for (const c of cand) {
  try {
    const r = await synthAndStore({ id: c.id, name: c.name, area: c.area ?? "" }, { refresh: false });
    if (r?.published) pub++; else kept++;
  } catch (e) { err++; if (err <= 3) console.log(`   ✗ ${c.name}: ${String(e).slice(0, 60)}`); }
}
const [after] = await sql`SELECT count(*)::int c FROM cafes WHERE published`;
console.log(`   처리 ${n(cand.length)}곳 → 공개 ${n(pub)}곳 · 그대로 ${n(kept)}곳 · 오류 ${n(err)}곳`);
console.log(`   공개 총수 ${n(before.c)} → ${n(after.c)} (${after.c - before.c >= 0 ? "+" : ""}${n(after.c - before.c)})`);
