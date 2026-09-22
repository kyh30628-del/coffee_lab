#!/usr/bin/env node
// 🏛️ 공공 인허가 원장 → 카페 적재 (2026-09-20, 대표님 승인)
//
// 왜 만들었나 — 네이버 쿼터의 2/3를 '카페 이름 찾기'에 쓰고 있었는데, 그 목록은 공짜로 이미 갖고 있었다.
//   실측 09-20: 원장 영업중 커피숍·제과점 74,826건 vs 우리 DB 49,662곳 → **이름 기준 60,972곳이 없다**
//   (경기 18,685 · 서울 16,047 · 경남 5,699 …). 수도권조차 절반이 비어 있었다.
//
// 원가 비교(전부 실측):
//   기존 발굴(discover.ts)  = 키워드로 **탐색** → 카페당 16.9콜(대부분 중복에 태움)
//   이 도구               = 이름을 이미 아니까 **확인만** → 카페당 1콜
//   → 같은 25,000콜로 하루 공개 약 700곳 → 약 1,900곳.
//
// 🔒 옥석 큐레이션은 그대로다. 이 도구는 **이름을 어디서 얻느냐**만 바꾼다.
//   적재는 pipeline_status='new'로만 하고, 후기 수집·검증·등급·오염 게이트는 기존 경로가 전부 그대로 건다.
//   후기 없는 카페는 지금과 똑같이 공개되지 않는다.
//
// 사용: node --import tsx scripts/import-permits.mjs [--apply] [--limit N] [--budget N]
import { readFileSync, createReadStream, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import readline from "node:readline";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { localSearch, isFranchise } = await import("../lib/discover.ts");
const { naverUsedToday, NAVER_DAILY_QUOTA, NAVER_CLOSURE_RESERVE, NAVER_COLLECT_RESERVE } = await import("../lib/naverBudget.ts");
const { SIDO_GU } = await import("../lib/regionList.ts");
const { isNonCafeFnbCategory } = await import("../lib/reviewQuality.ts");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const APPLY = process.argv.includes("--apply");
const LIMIT = arg("--limit", 3000);
// 예산: 기본은 '수집 몫을 남기고' 쓴다 — 적재만 하고 후기를 못 모으면 사용자에겐 0이다(적체 가드와 같은 사상).
const BUDGET = arg("--budget", 0) || (NAVER_DAILY_QUOTA - NAVER_CLOSURE_RESERVE - NAVER_COLLECT_RESERVE);

const PREFIXED = new Set(["인천", "대전", "부산", "대구", "광주", "울산"]);
const ADDR2SIDO = { "제주특별자치도": "제주", "전북특별자치도": "전북", "전라북도": "전북", "전라남도": "전남", "경상남도": "경남", "경상북도": "경북",
  "충청남도": "충남", "충청북도": "충북", "강원특별자치도": "강원", "경기도": "경기", "서울특별시": "서울",
  "인천광역시": "인천", "대전광역시": "대전", "부산광역시": "부산", "대구광역시": "대구", "광주광역시": "광주", "울산광역시": "울산", "세종특별자치시": "세종" };
const norm = (s) => String(s || "").toLowerCase().replace(/[\s()·\-_,.]/g, "");

/** 주소 → area 라벨. 그 시·도의 정당한 시군구일 때만 반환(추측 매핑 없음). */
function areaOf(addr) {
  const parts = String(addr || "").trim().split(/\s+/);
  let sido = ADDR2SIDO[parts[0]];
  if (!sido && parts[0] === "전남광주통합특별시") sido = (SIDO_GU["광주"] ?? []).includes(parts[1]) ? "광주" : "전남"; // 2026 통합 표기 — 다음 토큰이 광주 구면 광주
  if (!sido) return null;
  if (sido === "세종") return "세종시";                                  // 세종은 구가 없다("세종특별자치시 시청대로 …") — 09-22 실측 749곳 중 1곳만 매핑되던 구멍
  const gus = SIDO_GU[sido] ?? [];
  for (const tok of parts.slice(1, 4)) if (gus.includes(tok)) return PREFIXED.has(sido) ? `${sido} ${tok}` : tok;
  return null;
}

// ── 우리가 이미 가진 것(이름+주소 두 축으로 중복 차단) ──
const own = await sql`SELECT name, address FROM cafes`;
const haveName = new Set(own.map((r) => norm(r.name)).filter(Boolean));
const haveAddr = new Set(own.map((r) => norm(r.address)).filter((x) => x && x.length >= 10));
console.log(`보유 ${own.length.toLocaleString()}곳(이름 ${haveName.size.toLocaleString()} · 주소 ${haveAddr.size.toLocaleString()})`);

// ── 원장에서 후보 뽑기(로컬 파일·비용 0) ──
const CAFE_BIZ = new Set(["커피숍", "제과점영업"]);
const cand = []; let skipFranchise = 0, skipOther = 0, skipTried = 0;
// 🧾 시도 캐시 — 네이버에 없던 상호를 매일 다시 묻지 않는다(09-21: 같은 30곳을 세 번 물어 90콜 낭비). 성공분은 DB(haveName)가 막는다.
const TRIED_PATH = `${homedir()}/coffee-platform/agent-reports/permits/tried.json`;
const tried0 = new Set(existsSync(TRIED_PATH) ? JSON.parse(readFileSync(TRIED_PATH, "utf8")) : []);
const triedKey = (nm, addr) => norm(nm) + "|" + norm(addr).slice(0, 20);
for (const fn of ["rest_cafes", "bakeries", "rest_cafes.extra", "bakeries.extra"]) {   // .extra = 09-22 추가 지역분(대구·경북·광주·전남·전북·울산·제주)
  const fp = `${homedir()}/coffee-platform/agent-reports/permits/${fn}.ndjson`; if (!existsSync(fp)) continue;
  const rl = readline.createInterface({ input: createReadStream(fp), crlfDelay: Infinity });
  for await (const line of rl) {
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (!CAFE_BIZ.has(d.biz || "")) continue;
    if (!String(d.st || "").includes("영업")) continue;
    const addr = d.rn || d.ln || "";
    const area = areaOf(addr); if (!area) continue;            // 서비스 범위 밖·주소 파싱 불가 → 건너뜀
    if (haveName.has(norm(d.nm)) || haveAddr.has(norm(addr))) continue;
    // 🚫 헛콜 차단(09-21 실증: 미발견 37 중 프랜차이즈 지점 12·한시 팝업 3·복지관 구내 1) — 서비스가 어차피 안 싣는 것은 검색도 하지 않는다
    if (isFranchise(String(d.nm))) { skipFranchise++; continue; }
    if (/한시적|임시|구내|복지관|휴게소|급식|자활센터/.test(String(d.nm))) { skipOther++; continue; }
    if (tried0.has(triedKey(d.nm, addr))) { skipTried++; continue; }
    cand.push({ nm: d.nm, addr, area, tel: d.tel || null });
  }
}
console.log(`원장 후보 ${cand.length.toLocaleString()}곳 (영업중 커피숍·제과점 중 우리에게 없는 것 · 프랜차이즈 ${skipFranchise.toLocaleString()}·한시/구내 ${skipOther.toLocaleString()}·이미 시도 ${skipTried.toLocaleString()} 제외)`);
const byArea = {}; for (const c of cand) byArea[c.area] = (byArea[c.area] ?? 0) + 1;
// 🔄 지역 라운드로빈(2026-09-21 CEO "모든 지역 극대화") — 원장 파일 순서대로 돌면 한 시군구가 하루치를 독식한다.
//   시군구별 줄을 세워 한 곳씩 번갈아 뽑는다 → 매일 전 지역이 고르게 늘고, 상한이 작아도 특정 지역이 굶지 않는다.
{
  const queues = new Map(); for (const c of cand) { if (!queues.has(c.area)) queues.set(c.area, []); queues.get(c.area).push(c); }
  const keys = [...queues.keys()]; cand.length = 0; let left = keys.length;
  while (left > 0) { left = 0; for (const k of keys) { const q = queues.get(k); if (q.length) { cand.push(q.shift()); if (q.length) left++; } } }
}
console.log("상위 지역:", Object.entries(byArea).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(" · "));

if (!APPLY) { console.log(`\n▶ 드라이런. --apply 로 적재(상한 ${LIMIT}곳 · 예산 ${BUDGET}콜).`); process.exit(0); }

// ── 네이버 local 1콜로 좌표·실재 확인 후 적재 ──
let used0 = await naverUsedToday();
let tried = 0, added = 0, miss = 0, skipNonCafe = 0, calls = 0;
const VERBOSE = process.argv.includes("--verbose");
// 🔎 09-21 실증 교훈: 원장 상호(인허가명)와 네이버 간판명은 자주 다르다("카페 OO"↔"OO카페", "(주)…", 지점 표기).
//   이름 완전일치만 보면 74%가 '미발견'으로 새어 곳당 4콜이 됐다. 두 축을 더 본다:
//   ① 도로명+번지 키가 같으면 같은 건물의 같은 가게(가장 강한 신호) ② 업종어·법인어·공백을 뺀 느슨한 이름 포함.
const ROAD = /([가-힣A-Za-z0-9]{2,}(?:로|길))\s*(\d+(?:-\d+)?)/;
const addrKey = (a) => { const m = String(a || "").match(ROAD); return m ? norm(m[1] + m[2]) : null; };
const loose = (n) => norm(String(n || "").replace(/\(주\)|주식회사|\(유\)|유한회사|카페|까페|커피|coffee|cafe|베이커리|bakery|제과|점$/gi, ""));
const nameLoose = (a, b) => { const x = loose(a), y = loose(b); return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x)); };
for (const c of cand) {
  if (added >= LIMIT) break;
  const spent = (await naverUsedToday()) - used0;
  if (spent >= BUDGET) { console.log(`예산 ${BUDGET}콜 도달 — 중단`); break; }
  tried++; tried0.add(triedKey(c.nm, c.addr));
  // 질의 정리 — "요에라(Yoera)"·"카페:옆집"·"카페cafe 메종@학동" 같은 인허가 표기는 네이버가 0건을 돌려준다(09-21 실증)
  const qn = String(c.nm).replace(/\([^)]*\)/g, " ").replace(/[:@·,\/]+/g, " ").replace(/\s+/g, " ").trim() || c.nm;
  const items = await localSearch(`${qn} ${c.area}`); calls++;
  if (!items) { miss++; continue; }                             // API 오류/쿼터 → 보류
  const ck = addrKey(c.addr);
  const hit = items.find((it) => it.lat != null && (
    norm(it.name) === norm(c.nm) ||                              // 이름 완전일치
    (ck && addrKey(it.address) === ck) ||                        // 도로명+번지 일치(같은 건물)
    nameLoose(it.name, c.nm)));                                  // 업종어·법인어 뺀 느슨한 포함
  if (!hit) { miss++; if (VERBOSE) console.log(`  ✗ ${c.nm} | ${c.area} | 네이버: ${items.slice(0, 2).map((i) => `${i.name} @ ${i.address}`).join(" ; ") || "(결과 없음)"}`); continue; } // 네이버에 없으면 적재하지 않는다(폐업·미등록)
  if (VERBOSE && norm(hit.name) !== norm(c.nm)) console.log(`  ≈ ${c.nm} → ${hit.name} (${addrKey(hit.address) === ck ? "주소일치" : "느슨한 이름"})`);
  if (isNonCafeFnbCategory(hit.category || "")) { skipNonCafe++; continue; }
  const area = areaOf(hit.address) || c.area;
  const pseudoId = `pm_${String(c.nm).replace(/\s/g, "")}_${Math.round(hit.lat * 1e5)}`;
  await sql`INSERT INTO cafes (place_id, name, area, dong, naver_category, address, lat, lng, phone, instagram_url, source, published, roasts_own, pipeline_status)
    VALUES (${pseudoId}, ${hit.name || c.nm}, ${area}, ${hit.dong}, ${hit.category}, ${hit.address || c.addr}, ${hit.lat}, ${hit.lng}, ${hit.phone || c.tel}, ${hit.instagramUrl}, 'permit', false, false, 'new')
    ON CONFLICT (place_id) DO NOTHING`;
  added++;
  if (added % 200 === 0) console.log(`  … ${added}곳 적재 (시도 ${tried} · ${(await naverUsedToday()) - used0}콜)`);
  // 🚨 효율 자동 차단(collect-shard와 같은 사상) — **낭비를 사람이 발견하기 전에 스스로 멈춘다.**
  //   설계 원가는 곳당 1콜이다(이름을 아니까 '확인'만 한다). 3콜을 넘으면 전제가 깨진 것이다:
  //   네이버 미발견이 많아 헛 호출이 쌓이거나, 원장 상호가 간판명과 달라 매칭이 안 되는 경우다.
  //   그대로 두면 기존 발굴(16.9콜)보다 나을 게 없어진다 → 멈추고 사람이 본다.
  if (tried >= 100) {
    const per = calls / Math.max(added, 1); // ⚠️ naverUsedToday는 동시에 도는 크론 콜까지 섞인다 — 이 스크립트의 실제 호출 수로 잰다
    // 한계 4콜(09-21 실측 3.06): 적재 4 + 수집 7 = 11콜/공개 vs 기존 발굴 16.9 + 7 = 24콜. 넘으면 전제가 깨진 것.
    if (per > 4) { console.log(`🚨 효율 이상 — 곳당 ${per.toFixed(2)}콜(설계 1콜, 한계 4콜). 낭비 방지로 중단.`); break; }
  }
}
try { writeFileSync(TRIED_PATH, JSON.stringify([...tried0])); } catch (e) { console.log("시도 캐시 저장 실패:", e?.message); }
const spent = (await naverUsedToday()) - used0;
console.log(`\n적재 ${added}곳 · 시도 ${tried} · 네이버 미발견 ${miss} · 비카페 제외 ${skipNonCafe}`);
console.log(`이 스크립트 호출 ${calls}콜 → 적재 1곳당 ${(calls / Math.max(added, 1)).toFixed(2)}콜 (기존 발굴 16.9콜) · 같은 시간 네이버 전체 사용 ${spent}콜(크론 포함)`);
