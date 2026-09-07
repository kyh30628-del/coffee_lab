#!/usr/bin/env node
// 🔗 카페 ↔ 인허가 원장 매칭 — "공식 폐업인데 지도에 살아있는 카페"를 찾아낸다.
//   실행: node scripts/closure/match.mjs [--sample=10]
//   입력: agent-reports/permits/{cafes,rest_cafes,bakeries,general_restaurants}.ndjson (전부 로컬)
//   출력: agent-reports/permits/match-report.json + 콘솔 요약. **DB에 아무것도 쓰지 않는다.**
//
// 🔴 설계 근거(사고 이력에서 나온 규칙):
//  1) **주소 우선·이름 보조**([[project_localdata_closure_plan]]) — 인허가 상호는 등기명이라 간판명과 다르다("주식회사 OO").
//  2) 한 주소에 여러 사업장이 있다(빌딩·상가). 제과점 원장만 봐도 **72%가 폐업 이력**이라, 주소만으로 붙이면
//     "옛날에 망한 다른 가게"를 우리 카페에 덮어씌운다 → 이름 유사도 게이트를 반드시 통과해야 한다.
//  3) 같은 자리에 영업 기록과 폐업 기록이 함께 있으면 **영업이 이긴다**(업종 변경·재등록·양도).
//  4) 판정은 보고까지만. 자동 비공개는 금지(CEO 지시) — 기존 cron-closure 증거 체계에 신호로만 넣는다.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DIR = path.join(homedir(), "coffee-platform/agent-reports/permits");
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const SAMPLE_N = Number(arg("sample", 10));

const SIDO = { "서울특별시": "서울", "인천광역시": "인천", "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원", "대전광역시": "대전", "세종특별자치시": "세종", "충청남도": "충남", "충청북도": "충북", "부산광역시": "부산", "경상남도": "경남" };

/** 도로명주소 → 정규화 키(시도|시군구|도로명|건물번호). 뒤에 붙는 건물명·호수·괄호는 버린다. */
function roadKey(addr) {
  if (!addr) return null;
  const head = String(addr).split(",")[0].trim();          // "…상도로50길 34, 1층 103호 (상도동)" → "…상도로50길 34"
  const t = head.split(/\s+/);
  const sido = SIDO[t[0]] || (t[0]?.length <= 3 ? t[0] : null);
  if (!sido) return null;
  const sgg = sido === "세종" ? "세종" : (t[1] || "");
  // 도로명+번호는 마지막 것을 취한다 — 군 지역은 "상면 조종로 1806"처럼 읍면이 앞에 끼어든다.
  const m = [...head.matchAll(/([가-힣A-Za-z0-9]+(?:대?로|길))\s+(\d+(?:-\d+)?)/g)];
  if (!m.length) return null;
  const last = m[m.length - 1];
  return `${sido}|${sgg}|${last[1]}|${last[2]}`;
}
/** 지번주소 → 보조 키(시도|시군구|법정동|번지) */
function lotKey(addr) {
  if (!addr) return null;
  const head = String(addr).split(",")[0].trim();
  const t = head.split(/\s+/);
  const sido = SIDO[t[0]] || null;
  if (!sido) return null;
  const m = [...head.matchAll(/([가-힣]+(?:동|리|가))\s+(?:산\s*)?(\d+(?:-\d+)?)/g)];
  if (!m.length) return null;
  const last = m[m.length - 1];
  return `${sido}|${t[1] || ""}|${last[1]}|${last[2]}`;
}

const STOP = /(주식회사|㈜|\(주\)|유한회사|합자회사|사업자|영업소|주\)|커피전문점)/g;
const normName = (s) => String(s || "").replace(STOP, "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
/** 글자 2-gram 자카드 — 짧은 상호에도 안정적이고 오탈자·공백 차이에 강하다. */
function nameSim(a, b) {
  const A = normName(a), B = normName(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.length >= 3 && B.length >= 3 && (A.includes(B) || B.includes(A))) return 0.9;
  const g = (s) => { const set = new Set(); for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2)); return set.size ? set : new Set([s]); };
  const ga = g(A), gb = g(B);
  let inter = 0; for (const x of ga) if (gb.has(x)) inter++;
  return inter / (ga.size + gb.size - inter);
}

const load = (f) => existsSync(path.join(DIR, f)) ? readFileSync(path.join(DIR, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

const cafes = load("cafes.ndjson");
const permitFiles = ["rest_cafes.ndjson", "bakeries.ndjson", "general_restaurants.ndjson"].filter((f) => existsSync(path.join(DIR, f)));
const byRoad = new Map(), byLot = new Map();
let permits = 0;
for (const f of permitFiles) {
  for (const p of load(f)) {
    permits++;
    const rk = roadKey(p.rn), lk = lotKey(p.ln);
    if (rk) { if (!byRoad.has(rk)) byRoad.set(rk, []); byRoad.get(rk).push(p); }
    if (lk) { if (!byLot.has(lk)) byLot.set(lk, []); byLot.get(lk).push(p); }
  }
}
console.log(`인허가 ${permits.toLocaleString()}건(${permitFiles.map((f) => f.replace(".ndjson", "")).join("+")}) · 도로명키 ${byRoad.size.toLocaleString()} · 카페 ${cafes.length.toLocaleString()}곳`);

const SIM_UNIQUE = 0.45;  // 후보가 하나뿐이면 조금 느슨하게(등기명 차이 흡수)
const SIM_MULTI = 0.62;   // 여러 사업장이 같은 주소면 엄격하게(옆가게 오매칭 방지)

const out = { matched: 0, unmatched: 0, closedPublished: [], matchedRows: [], byWay: { road: 0, lot: 0 } };
for (const c of cafes) {
  const rk = roadKey(c.address), lk = lotKey(c.address);
  let cands = (rk && byRoad.get(rk)) || null, way = "road";
  if (!cands && lk) { cands = byLot.get(lk) || null; way = "lot"; }
  if (!cands || !cands.length) { out.unmatched++; continue; }
  const scored = cands.map((p) => ({ p, s: nameSim(c.name, p.nm) })).sort((a, b) => b.s - a.s);
  const need = cands.length === 1 ? SIM_UNIQUE : SIM_MULTI;
  const best = scored[0];
  if (!best || best.s < need) { out.unmatched++; continue; }
  // 같은 상호가 그 자리에 영업·폐업 둘 다 있으면 영업이 이긴다(재등록·양도)
  const sameName = scored.filter((x) => x.s >= Math.min(need, best.s));
  const live = sameName.find((x) => x.p.cd === "01");
  const chosen = live ? live.p : best.p;
  out.matched++; out.byWay[way]++;
  const row = { id: c.id, name: c.name, addr: c.address, published: c.published, permit: chosen.nm, status: chosen.st, closed: chosen.cl, sim: +best.s.toFixed(2), way, cands: cands.length };
  out.matchedRows.push(row);
  if (chosen.cd === "02" && c.published) out.closedPublished.push(row);
}

const pub = cafes.filter((c) => c.published).length;
const matchedPub = out.matchedRows.filter((r) => r.published).length;
console.log(`\n📊 매칭 결과`);
console.log(`  전체 ${cafes.length.toLocaleString()}곳 중 매칭 ${out.matched.toLocaleString()} (${(out.matched / cafes.length * 100).toFixed(1)}%) · 도로명 ${out.byWay.road.toLocaleString()} / 지번 ${out.byWay.lot.toLocaleString()}`);
console.log(`  공개 ${pub.toLocaleString()}곳 중 매칭 ${matchedPub.toLocaleString()} (${(matchedPub / pub * 100).toFixed(1)}%)  ← 목표 85%+`);
console.log(`  🚪 공식 폐업인데 공개 중: ${out.closedPublished.length.toLocaleString()}곳`);

out.closedPublished.sort((a, b) => String(b.closed).localeCompare(String(a.closed)));
console.log(`\n🔎 수동 대조용 표본 ${SAMPLE_N}건(폐업 판정분 최신순)`);
for (const r of out.closedPublished.slice(0, SAMPLE_N)) {
  console.log(`  #${r.id} ${r.name}  ←→ 인허가 "${r.permit}" (유사도 ${r.sim}, 후보 ${r.cands}건)`);
  console.log(`      폐업일 ${r.closed} · ${r.addr}`);
}
writeFileSync(path.join(DIR, "match-report.json"), JSON.stringify({ at: new Date().toISOString(), permits, cafes: cafes.length, published: pub, matched: out.matched, matchedPublished: matchedPub, closedPublished: out.closedPublished, byWay: out.byWay }, null, 1));
console.log(`\n저장: ${path.join(DIR, "match-report.json")} (DB 반영 없음)`);
