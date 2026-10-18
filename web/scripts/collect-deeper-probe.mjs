// 🔬 깊은 수집 수확률 실측 — 27,126곳에 쿼터를 쏟기 전에 **정말 주제 글이 나오는지** 잰다. (2026-10-19)
//
// CEO 지시: "수집조차 안 되거나 주제 글이 없어 수집 필요, 검색에 글이 0건 이런 거는 네이버 쿼터랑
//            연계해서 좀 하라고! 무책임하게 그냥 제외하지 말고! 좀 완벽하게 해!"
//
// 왜 먼저 재는가: 비공개 27,126곳(수집無 4,796 + 글0건 6,212 + 주제글無 16,118)에 곳당 5콜이면
//   135,630콜 = 쿼터 5.4일치다. 현행 질의가 이미 다 긁었다면 그 전부가 낭비다.
//   쿼터는 **앱 전체 공유 25,000/일**이고 최근 13일 평균 37%(매일 ~15,700콜 유휴)다 — 여유는 있지만
//   효과가 없는 데 쓰면 유휴로 두는 것보다 나쁘다(발굴 몫을 빼앗으므로).
//
// 현행 질의(lib/webSearchCollector.ts): `{이름} {지역}` · `{이름} {동}` · +카페 · +후기 · +리뷰
//   · cafearticle은 첫 질의 1콜만 · 첫 질의가 100건 미만이면 나머지 생략(포화 조기중단)
//   · **start=1 고정(1페이지), sort=sim 고정** ← 여기가 미탐색 영역이다
//
// 추가로 시험하는 전략 3종:
//   ① 2페이지(start=101) — 포화된 질의는 101위 아래에 주제 글이 있을 수 있다
//   ② sort=date — 관련도순과 다른 글이 올라온다(최신 후기)
//   ③ 이름 단독(`{이름}` / `{이름} 카페 후기`) — 지역을 붙이면 지역명을 안 쓴 글이 빠진다
//
// 판정: verifyReview로 **verdict==='verified'(주제 글)** 가 새로 생기는지 본다. 그게 공개 게이트의 급소다.
// 💾 DB는 쓰지 않는다(측정 전용). 소비 콜 수를 끝에 보고한다.
//
// 사용: node --import tsx scripts/collect-deeper-probe.mjs [--n=20]
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { verifyReview } = await import("../lib/reviewQuality.ts");
const { areaTermsFor } = await import("../lib/synthStore.ts").catch(() => ({ areaTermsFor: null }));
if (typeof verifyReview !== "function") { console.error("🔴 verifyReview 로드 실패 — 중단"); process.exit(1); }
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
const ID = process.env.NAVER_CLIENT_ID, SECRET = process.env.NAVER_CLIENT_SECRET;
if (!ID || !SECRET) { console.error("🔴 네이버 키 미설정 — 중단"); process.exit(1); }
const N = Number((process.argv.find((a) => a.startsWith("--n=")) ?? "").split("=")[1] || 20);
const n = (v) => Number(v ?? 0).toLocaleString();
let calls = 0;

async function search(kind, query, start = 1, sort = "sim") {
  const url = `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(query)}&display=100&start=${start}&sort=${sort}`;
  const r = await fetch(url, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SECRET } });
  calls++;
  if (!r.ok) return { items: [], ok: false, status: r.status };
  const j = await r.json();
  await new Promise((x) => setTimeout(x, 150));
  return { items: (j.items ?? []).map((it) => ({
    title: String(it.title ?? "").replace(/<[^>]+>/g, ""),
    body: String(it.description ?? "").replace(/<[^>]+>/g, ""),
    link: it.link,
  })), ok: true };
}
const strip = (s) => String(s ?? "").replace(/\s+/g, "");
// 주제 글 = verifyReview가 verified로 본 글(제목이 이 카페인 글)
const subjectHits = (items, name, areaTerms) => items.filter((it) => {
  try { return verifyReview({ title: it.title, body: it.body, name, areaTerms, source: "blog" }).verdict === "verified"; }
  catch { return false; }
}).length;

const GROUPS = {
  "수집無(raw NULL)": `raw_reviews IS NULL`,
  "글0건(raw 비었음)": `raw_reviews IS NOT NULL AND COALESCE(jsonb_array_length(raw_reviews),0) = 0`,
  "주제글無(raw 있음)": `raw_reviews IS NOT NULL AND COALESCE(jsonb_array_length(raw_reviews),0) > 0
      AND COALESCE((synth_quality->>'verified')::int, 0) = 0`,
};
for (const [label, cond] of Object.entries(GROUPS)) {
  const rows = (await sql.query(`SELECT id, name, area, dong FROM cafes
    WHERE NOT published AND (pipeline_status IS NULL OR pipeline_status NOT IN ('excluded','noise'))
      AND ${cond} ORDER BY random() LIMIT ${N}`));
  const res = { base: 0, page2: 0, date: 0, nameonly: 0, any: 0 };
  const c0 = calls;
  for (const c of rows) {
    const area = String(c.area ?? ""), dong = String(c.dong ?? "");
    const areaTerms = [area, dong].filter((x) => x && x.length >= 2);
    const baseQ = area ? `${c.name} ${area}` : `${c.name} 카페`;
    const b = await search("blog", baseQ);
    const hBase = subjectHits(b.items, c.name, areaTerms);
    let h2 = 0, hd = 0, hn = 0;
    if (b.ok && b.items.length >= 100) { const p = await search("blog", baseQ, 101); h2 = subjectHits(p.items, c.name, areaTerms); }
    const d = await search("blog", baseQ, 1, "date"); hd = subjectHits(d.items, c.name, areaTerms);
    const o = await search("blog", `${c.name} 카페 후기`); hn = subjectHits(o.items, c.name, areaTerms);
    if (hBase) res.base++;
    if (h2) res.page2++;
    if (hd) res.date++;
    if (hn) res.nameonly++;
    if (hBase || h2 || hd || hn) res.any++;
  }
  const used = calls - c0;
  console.log(`\n[${label}] 표본 ${n(rows.length)}곳 · 소비 ${n(used)}콜(곳당 ${(used/Math.max(rows.length,1)).toFixed(1)})`);
  console.log(`   현행 질의로 주제 글 발견 ......... ${res.base}곳 (${(res.base/Math.max(rows.length,1)*100).toFixed(0)}%)`);
  console.log(`   ① 2페이지에서 발견 .............. ${res.page2}곳`);
  console.log(`   ② sort=date에서 발견 ............ ${res.date}곳`);
  console.log(`   ③ 이름+카페후기에서 발견 ........ ${res.nameonly}곳`);
  console.log(`   ⇒ 하나라도 발견 ................. ${res.any}곳 (${(res.any/Math.max(rows.length,1)*100).toFixed(0)}%)`);
}
console.log(`\n총 소비 ${n(calls)}콜 (일 한도 25,000 · 측정 전용 · DB 미반영)`);
