#!/usr/bin/env node
// 🗺️ 한국관광공사 랜드마크 수집 — CEO 지시 2026-09-14 "건물·상호·회사·랜드마크 파워풀하게".
//
// 왜: OSM 기반 인덱스(332,148건)에 **정작 사람들이 기준점으로 쓰는 랜드마크가 비어 있었다.**
//   실측 실패: 서울숲 검색 → 카페 1곳 · DDP → 1곳 · 남산타워 → 0곳 · 63빌딩 → 2곳.
//   원인은 데이터가 아니라 **이름**이다. OSM엔 '서울숲'이 아파트 이름으로만 있고 공원으로는 없었다.
//   관광공사 TourAPI에는 서울숲(12)·동대문디자인플라자(DDP)(12)·남산서울타워(12)·성수동 카페거리(12)가 전부 있다.
//
// 라이선스: 공공데이터포털 제공, 공공누리 — **저장·상업 이용 가능**(출처 표시). 사진(firstimage)은 여기서 쓰지 않는다.
// 💰 비용: data.go.kr 약 200콜 1회(쿼터 10,000/일) · DB 미사용 · 런타임 증가 0.
// 수집 대상: 12 관광지 · 14 문화시설 · 28 레포츠.
//   ⚠️ 38(쇼핑)은 **제외** — 실측하면 '나이키 스타필드 코엑스몰점'·'GS25 남산서울타워점' 같은 개별 점포라
//     OSM biz_* 와 같은 잡음이 된다(질의 '코엑스'가 83건 중 대부분 점포였다).
// 실행: node scripts/data/fetch-tour-landmarks.mjs  → data/tour-landmarks.json
import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";

const KEY = (fs.readFileSync(path.join(homedir(), "budongsan-note/.env.local"), "utf8").match(/^DATA_GO_KR_API_KEY=(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
if (!KEY) { console.error("DATA_GO_KR_API_KEY 없음"); process.exit(1); }
const B = "https://apis.data.go.kr/B551011/KorService2";
const TYPES = { 12: "landmark", 14: "culture", 28: "leisure" };
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "../..");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function page(t, p) {
  const u = `${B}/areaBasedList2?serviceKey=${KEY}&numOfRows=100&pageNo=${p}&MobileOS=ETC&MobileApp=dcn&_type=json&contentTypeId=${t}`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(40000) });
      const j = await r.json();
      const b = j?.response?.body ?? {};
      const it = b.items?.item;
      return { total: Number(b.totalCount || 0), items: Array.isArray(it) ? it : it ? [it] : [] };
    } catch { await sleep(1500); }
  }
  return { total: 0, items: [] };
}

const out = [];
for (const [t, kind] of Object.entries(TYPES)) {
  const first = await page(t, 1);
  const pages = Math.ceil(first.total / 100);
  let got = 0;
  for (let p = 1; p <= pages; p++) {
    const d = p === 1 ? first : await page(t, p);
    for (const x of d.items) {
      const name = String(x.title || "").trim();
      const lat = Number(x.mapy), lng = Number(x.mapx);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) continue;
      out.push([name, Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, kind]);
      got++;
    }
    if (p % 20 === 0) { console.log(`  ${kind} ${p}/${pages} (${got})`); await sleep(120); }
  }
  console.log(`✅ ${kind}(type ${t}): ${got}건 / 전체 ${first.total}`);
}
// 이름+좌표 중복 제거(같은 명소가 여러 타입에 중복 등재되는 경우)
const seen = new Set(); const uniq = [];
for (const r of out) { const k = `${r[0]}|${Math.round(r[1] * 100)}|${Math.round(r[2] * 100)}`; if (seen.has(k)) continue; seen.add(k); uniq.push(r); }
fs.writeFileSync(path.join(ROOT, "data/tour-landmarks.json"), JSON.stringify(uniq));
console.log(`\n📦 data/tour-landmarks.json — ${uniq.length.toLocaleString()}건 (중복 ${out.length - uniq.length}건 제거)`);
