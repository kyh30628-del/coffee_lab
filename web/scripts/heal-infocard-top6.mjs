// 🧹 표시 top6(synth_reviews)에서 광고 정보카드를 밀어내고, 옥석 전체(synth_reviews_all)의
//    깨끗한 인용문으로 교체한다. 2026-08-17, CEO 승인.
//
// 왜 데이터까지 고치나: 지역·테마·컬렉션·포스터·검색 스니펫은 sortReviews를 타지 않고
//   synth_reviews의 **score 최고 1건**을 SQL로 직접 뽑는다(seoData.ts). 정렬 코드만 고쳐선 이 면이 안 바뀐다.
//
// 안전 설계
//   - 공개 카페만 · 공개상태는 절대 건드리지 않는다(L2 데이터 조작 범위 유지)
//   - 배열 길이 보존 · 교체 후보가 없으면 그대로 둔다(줄이지 않는다)
//   - link 기준 중복 금지 · 멱등(두 번 돌려도 무변)
//   - 원본 대비 '정보카드였던 자리'만 바뀐다
//
// 사용: node --import tsx scripts/heal-infocard-top6.mjs [--apply] [--limit N]
import { readFileSync } from "node:fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { isAdTemplateQuote } = await import("../lib/adTemplate.ts");
const { sortReviews } = await import("../lib/exposureOrder.ts");
const NOW = Date.now();
const sql = neon(process.env.DATABASE_URL);

const APPLY = process.argv.includes("--apply");
const li = process.argv.indexOf("--limit");
const LIMIT = li > -1 ? Number(process.argv[li + 1]) : 0;

// ⚠️ 한 번에 다 읽으면 Neon HTTP 응답 상한(64MB)을 넘는다(synth_reviews_all 전체 ≈ 93MB).
//   id 커서로 나눠 읽어 피크 전송량을 낮춘다 — 총 읽기량은 같고 메모리·실패 위험만 줄어든다.
const PAGE = 400;
let cursor = 0, done = false;
let scanned = 0, touched = 0, swapped = 0, partial = 0, none = 0;
const samples = [];
while (!done) {
  const take = LIMIT ? Math.min(PAGE, LIMIT - scanned) : PAGE;
  if (take <= 0) break;
  const rows = await sql`SELECT id, name, area, dong, synth_reviews s, synth_reviews_all a FROM cafes
    WHERE published AND synth_reviews IS NOT NULL AND synth_reviews_all IS NOT NULL AND id > ${cursor}
    ORDER BY id LIMIT ${take}`;
  if (!rows.length) break;
  cursor = rows[rows.length - 1].id;
  if (rows.length < take) done = true;
  for (const r of rows) {
  scanned++;
  const top = Array.isArray(r.s) ? r.s : [];
  const pool = Array.isArray(r.a) ? r.a : [];
  const badIdx = top.map((e, i) => (isAdTemplateQuote(e?.quote) ? i : -1)).filter((i) => i >= 0);
  if (!badIdx.length) continue;

  const usedLinks = new Set(top.map((e) => e?.link).filter(Boolean));
  // ⚠️ 후보를 score로만 고르면 **확신도 낮은 글·타지점 글**을 끌어올 수 있다 — 오염을 오염으로 바꾸는 셈이다.
  //   그래서 런타임 노출과 **같은 함수(sortReviews)**로 풀을 정렬해 그 순서대로 쓴다.
  //   (확신도 → 타지점 → 광고템플릿 → 신뢰등급 → 점수 → 최신성 순으로 이미 걸러진 순서)
  const ranked = sortReviews(pool, r.name ?? "", [r.area, r.dong].filter(Boolean), NOW, r.dong);
  // 한 블로거가 top6를 점령하지 않도록 기존 선정과 같은 원칙(출처당 최대 2건)을 유지한다.
  const srcCount = new Map();
  for (const e of top) { const s = e?.source; if (s) srcCount.set(s, (srcCount.get(s) || 0) + 1); }
  const clean = ranked.filter((e) => e?.quote && !usedLinks.has(e?.link) && !isAdTemplateQuote(e.quote));
  // 짧은 스니펫("여기는 개인이 하시는 카페.")이 정보카드 자리를 대신하면 오히려 나빠져, 읽을 만한 길이를 먼저 쓴다.
  const cands = [...clean.filter((e) => e.quote.length >= 30), ...clean.filter((e) => e.quote.length < 30)];

  if (!cands.length) { none++; continue; }
  const next = top.slice();
  let used = 0, ci = 0;
  for (const i of badIdx) {
    // 교체로 빠지는 자리의 출처는 카운트에서 내려준다(그 블로거 몫이 하나 비므로).
    const outSrc = top[i]?.source;
    if (outSrc) srcCount.set(outSrc, Math.max(0, (srcCount.get(outSrc) || 0) - 1));
    let c = null;
    while (ci < cands.length) {
      const cand = cands[ci++];
      const s = cand?.source;
      if (s && (srcCount.get(s) || 0) >= 2) continue; // 출처당 2건 상한 유지
      c = cand; break;
    }
    if (!c) { if (outSrc) srcCount.set(outSrc, (srcCount.get(outSrc) || 0) + 1); break; } // 되돌림
    next[i] = c; usedLinks.add(c.link);
    if (c.source) srcCount.set(c.source, (srcCount.get(c.source) || 0) + 1);
    used++;
  }
  if (!used) { none++; continue; }
  touched++; swapped += used;
  if (used < badIdx.length) partial++;
  if (samples.length < 3) samples.push({ name: r.name, before: top[badIdx[0]]?.quote?.slice(0, 80), after: next[badIdx[0]]?.quote?.slice(0, 80) });

  if (APPLY) await sql`UPDATE cafes SET synth_reviews = ${JSON.stringify(next)}::jsonb WHERE id = ${r.id}`;
  }
  if (scanned % 2000 === 0) console.log(`  … ${scanned.toLocaleString()}곳 처리(교체 ${touched.toLocaleString()}곳)`);
}

console.log(`${APPLY ? "🟢 실행" : "🔎 드라이런"} — 대상 ${scanned.toLocaleString()}곳`);
console.log(`  교체 카페 ${touched.toLocaleString()}곳 · 교체 인용문 ${swapped.toLocaleString()}건`);
console.log(`  일부만 교체(후보 부족) ${partial}곳 · 교체 후보 전무 ${none}곳`);
for (const s of samples) console.log(`\n  ${s.name}\n   before: "${s.before}"\n   after : "${s.after}"`);
