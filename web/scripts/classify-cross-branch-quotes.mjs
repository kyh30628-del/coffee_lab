// 결재#395(51그룹/69곳) 후속 — 체인/지점 리뷰 quote 교차매핑 전수 분류. 결정론(LLM 0, API 0), 읽기전용(DB 미변경).
// 같은 quote(공백무시 완전동일)가 2곳 이상 공개 카페에 근거로 동시 귀속된 그룹을 찾아, 각 카페에 대해
// '오늘의' verifyReview(lib/reviewQuality.ts — 실제 합성 파이프라인이 쓰는 그 판정기)를 quote 텍스트에
// 재적용해 지점앵커·프랜차이즈매물 등 현재 규칙 기준으로 그 카페에 여전히 유효한지 재판정한다.
//   ⚠️ synth_reviews에 남은 'quote'는 이미 축약된 대표 문장(원문 title/body 전체가 아님) — title=""·짧은
//   body만으로 재판정하면 실제로는 유효한 매칭도 종합점수(<38, "종합 품질 미달")로 떨어질 수 있다. 이 점수미달
//   사유는 원문 손실 아티팩트라 신뢰도가 낮으므로 별도(④) 버킷으로 분리한다 — ①②는 구조적 사유(지점명 불일치·
//   프랜차이즈매물·이름 자체가 없음 등, 원문 길이와 무관하게 유효)일 때만 확정으로 센다.
//   - 구조적 REJECT 1곳만 매치: 그 반대편은 오귀속 확정 → 제거 대상(정정 SQL은 별도, 이 스크립트는 분류만).
//   - 구조적 REJECT 0곳(둘 다 구조적 무효 신호, 예: 프랜차이즈 점포양도 매물): 양쪽 다 제거 대상.
//   - 둘 다 매치 또는 판정이 '종합 품질 미달'(점수미달) 뿐인 경우: 규칙만으론 확신 불가 → 수동 확인.
const SCORE_ONLY_REASON = "종합 품질 미달"; // 구조적 사유 없이 점수만으로 떨어진 경우(원문 손실 아티팩트 가능성) — 신뢰 낮음
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
delete process.env.ANTHROPIC_API_KEY;
const { sql } = await import("../lib/db.ts");
const { verifyReview, cleanCafeName } = await import("../lib/reviewQuality.ts");

const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, "");

const rows = await sql`
  SELECT c.id, c.name, c.area, c.dong, c.address AS addr, elem->>'quote' AS quote, elem->>'link' AS link, elem->>'trust' AS trust
  FROM cafes c
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(c.synth_reviews) = 'array' THEN c.synth_reviews ELSE '[]'::jsonb END
  ) elem
  WHERE c.published = true AND length(elem->>'quote') >= 8
`;

const byKey = new Map();
for (const r of rows) {
  const key = norm(r.quote);
  const arr = byKey.get(key) || [];
  arr.push(r);
  byKey.set(key, arr);
}
const groups = [...byKey.values()].filter((g) => new Set(g.map((r) => r.id)).size >= 2);

console.log(`대상 그룹: ${groups.length}개 (동일 quote가 2곳+ 공개 카페에 귀속)\n`);

const buckets = { oneStructural: [], zeroStructural: [], needsManual: [] };

for (const g of groups) {
  const judged = g.map((r) => {
    const areaTerms = [r.area, r.dong].filter(Boolean);
    const result = verifyReview({ title: "", body: r.quote, name: cleanCafeName(r.name), areaTerms, addr: r.addr, link: r.link, source: "blog" });
    const why = result.reasons[result.reasons.length - 1] || "";
    const structuralReject = result.verdict === "rejected" && why !== SCORE_ONLY_REASON;
    return { ...r, verdict: result.verdict, why, structuralReject };
  });
  const structuralMatches = judged.filter((j) => !j.structuralReject); // 구조적으로 배제되지 않은(=매치 후보) 쪽
  const entry = { quote: g[0].quote, link: g[0].link, cafes: judged.map((j) => ({ id: j.id, name: j.name, area: j.area, dong: j.dong, trust: j.trust, verdict: j.verdict, structuralReject: j.structuralReject, why: j.why })) };
  if (structuralMatches.length === 1) buckets.oneStructural.push(entry);
  else if (structuralMatches.length === 0) buckets.zeroStructural.push(entry);
  else buckets.needsManual.push(entry);
}

function printBucket(title, arr) {
  console.log(`\n=== ${title} (${arr.length}건) ===`);
  for (const e of arr) {
    console.log(`- quote: "${(e.quote || "").slice(0, 70)}" | link: ${e.link}`);
    for (const c of e.cafes) console.log(`    id=${c.id} [${c.trust}] "${c.name}" (${c.area}/${c.dong}) → ${c.verdict}${c.why ? " — " + c.why : ""}`);
  }
}

printBucket("① 한쪽만 구조적 배제(반대편 오귀속 확정 — 제거 대상)", buckets.oneStructural);
printBucket("② 양쪽 다 구조적 배제(프랜차이즈 매물·이름불일치 등 — 양쪽 다 제거 대상)", buckets.zeroStructural);
printBucket("③ 수동 확인 필요(둘 다 매치 또는 점수미달뿐 — 원문 손실 아티팩트 가능)", buckets.needsManual);

console.log(`\n요약: 전체 ${groups.length}그룹 중 자동분류 ①${buckets.oneStructural.length} ②${buckets.zeroStructural.length} (총 자동확정 ${buckets.oneStructural.length + buckets.zeroStructural.length}) / 수동확인 ③${buckets.needsManual.length}`);
console.log("※ 이 스크립트는 분류만 수행(DB 미변경) — 정정 실행은 기조실장(L2) 전결로 별도 진행.");
process.exit(0);
