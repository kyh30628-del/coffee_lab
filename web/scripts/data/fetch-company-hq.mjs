#!/usr/bin/env node
// 🏢 회사 본사 좌표 수집 — 결재 #1085(CEO 승인 2026-09-14).
//
// 왜: "네이버 본사" 검색이 '네이버타운(아파트)'을 줬다. 회사 POI가 OSM·관광공사 어디에도 없다.
// 소스: 한국거래소 KIND 상장법인목록(공개 페이지, 키 불필요) — 회사명·시장·업종·대표자·홈페이지·지역(시도)
//       + 네이버 지역검색으로 좌표·도로명주소.
// 🔴 교차검증: KRX '지역'(시도)과 네이버 도로명주소의 시도가 **일치할 때만** 채택한다.
//    커버리지보다 정확도. 동명 회사·지점 오매칭을 여기서 끊는다(필드 오해로 89개 지역을 오염시킨 전례가 있다).
// 💰 비용: 네이버 지역검색 약 2,700콜 1회(일 쿼터 25,000 · 220ms 간격) · DB 0 · 런타임 0.
// ⚠️ 약관: 네이버 지역정보 저장은 7.3.③ 회색지대 — 카페 좌표에 이미 쓰는 방식의 연장(결재문에 명시).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "../..");
const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
const pick = (k) => (env.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
const ID = pick("NAVER_CLIENT_ID"), SE = pick("NAVER_CLIENT_SECRET");
if (!ID || !SE) { console.error("네이버 키 없음"); process.exit(1); }

const KRX = "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13";
const strip = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

const res = await fetch(KRX, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
const raw = new TextDecoder("euc-kr").decode(await res.arrayBuffer());
const trs = raw.match(/<tr>[\s\S]*?<\/tr>/g)?.slice(1) ?? [];
let all = trs.map((r) => (r.match(/<td[^>]*>[\s\S]*?<\/td>/g) ?? []).map(strip))
  .filter((c) => c.length >= 10 && c[0])
  .map((c) => ({ name: c[0], market: c[1], code: c[2], induty: c[3], ceo: c[7], url: c[8], sido: c[9] }));
// 🚫 스팩(기업인수목적회사)은 실체가 없는 껍데기 법인이라 '본사'로 검색될 일이 없다 — 인덱스 낭비.
const before = all.length;
all = all.filter((c) => !/스팩|기업인수목적/.test(c.name));
console.log(`KRX 상장법인 ${before}곳 → 스팩 제외 ${all.length}곳`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SIDO_ALIAS = { "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구", "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전", "울산광역시": "울산", "세종특별자치시": "세종", "경기도": "경기", "강원특별자치도": "강원", "강원도": "강원", "충청북도": "충북", "충청남도": "충남", "전라북도": "전북", "전북특별자치도": "전북", "전라남도": "전남", "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주", "제주도": "제주" };
const sidoOf = (s) => { const t = String(s || "").trim(); for (const [k, v] of Object.entries(SIDO_ALIAS)) if (t.startsWith(k) || t.startsWith(v)) return v; return null; };

const out = []; let ok = 0, mismatch = 0, none = 0, err = 0;
for (let i = 0; i < all.length; i++) {
  const c = all[i];
  try {
    const u = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(c.name)}&display=3`;
    const r = await fetch(u, { headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SE }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) { err++; if (r.status === 429) { console.log("  429 — 60초 대기"); await sleep(60000); } continue; }
    const items = (await r.json()).items ?? [];
    const want = sidoOf(c.sido);
    // 후보 중 **시도가 일치하는 첫 건**만. 없으면 버린다(추측 금지).
    const hit = items.find((it) => want && sidoOf(it.roadAddress || it.address) === want);
    if (!hit) { items.length ? mismatch++ : none++; continue; }
    const lat = Number(hit.mapy) / 1e7, lng = Number(hit.mapx) / 1e7;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39) { err++; continue; }
    out.push([c.name, Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5, "company"]);
    ok++;
  } catch { err++; }
  if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${all.length} · 채택 ${ok} · 시도불일치 ${mismatch} · 결과없음 ${none} · 오류 ${err}`);
  await sleep(220);
}
fs.writeFileSync(path.join(ROOT, "data/company-hq.json"), JSON.stringify(out));
console.log(`\n✅ data/company-hq.json — 채택 ${ok}곳 / 대상 ${all.length}곳 (${(ok / all.length * 100).toFixed(0)}%)`);
console.log(`   시도 불일치로 버림 ${mismatch} · 네이버 결과 없음 ${none} · 오류 ${err}`);
