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
import { readFileSync, createReadStream, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import readline from "node:readline";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { sql } = await import("../lib/db.ts");
const { localSearch, isFranchise, isNonCafe, isSnackStall, isStructuralPhantom, isUnmannedCafe } = await import("../lib/discover.ts");
const { loadLearnedTerms } = await import("../lib/learnedTerms.ts");
const { loadCriteriaLists } = await import("../lib/criteriaLists.ts");
await loadLearnedTerms(); await loadCriteriaLists(); // 공개 관문(synthStore)과 같은 사전으로 판정하려면 먼저 프라임해야 한다
const { naverUsedToday, naverCallsThisProcess, NAVER_DAILY_QUOTA, NAVER_CLOSURE_RESERVE, NAVER_COLLECT_RESERVE, NAVER_GROW_RESERVE } = await import("../lib/naverBudget.ts");
const { SIDO_GU } = await import("../lib/regionList.ts");
const { isNonCafeFnbCategory, brandTokenOverlap, nearDuplicateCafeName } = await import("../lib/reviewQuality.ts");

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const APPLY = process.argv.includes("--apply");
const LIMIT = arg("--limit", 3000);
// 예산: 기본은 '수집 몫'과 '발굴(cron-grow) 몫'을 남기고 쓴다 — 적재만 하고 후기를 못 모으면 사용자에겐 0이다
//   (적체 가드와 같은 사상). 2026-09-24(협업#450·decisions#1241): 예전엔 COLLECT까지만 뺐는데, 그게 cron-grow의
//   유일한 게이트(nonClosureMayUse) 문턱과 같은 값이라 이 스크립트 혼자 매일 07:00 그 몫을 다 써버리면
//   cron-grow가 자정까지 전면 차단됐다 — GROW_RESERVE만큼 더 덜어낸다.
const BUDGET = arg("--budget", 0) || (NAVER_DAILY_QUOTA - NAVER_CLOSURE_RESERVE - NAVER_COLLECT_RESERVE - NAVER_GROW_RESERVE);

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
const own = await sql`SELECT name, address, dong, lat, lng FROM cafes`;
const haveName = new Set(own.map((r) => norm(r.name)).filter(Boolean));
const haveAddr = new Set(own.map((r) => norm(r.address)).filter((x) => x && x.length >= 10));
// 🐛 재발방지(decisions#1207): pm_ place_id는 원장 상호(영문병기 등 표기이형)+좌표해시라 discover의 nl_
//   place_id(네이버 canonical 상호)와 문자열이 달라 ON CONFLICT를 우회 — 855건 cross-source 중복등록 실증.
//   위 haveName/haveAddr는 원장의 원문 이름·주소(Naver 조회 전)로만 걸러 표기이형을 놓친다. 아래에서
//   Naver가 실제로 돌려준 정본 이름·좌표(hit)로 discover.ts와 같은 좌표근접+브랜드토큰겹침 판정을 한 번 더 건다.
const ownPts = own.filter((r) => r.lat != null).map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), name: r.name, dong: r.dong }));
// 🔎 09-21 실증 교훈: 원장 상호(인허가명)와 네이버 간판명은 자주 다르다("카페 OO"↔"OO카페", "(주)…", 지점 표기).
//   이름 완전일치만 보면 74%가 '미발견'으로 새어 곳당 4콜이 됐다. 두 축을 더 본다:
//   ① 도로명+번지 키가 같으면 같은 건물의 같은 가게(가장 강한 신호) ② 업종어·법인어·공백을 뺀 느슨한 이름 포함.
const ROAD = /([가-힣A-Za-z0-9]{2,}(?:로|길))\s*(\d+(?:-\d+)?)/;
const addrKey = (a) => { const m = String(a || "").match(ROAD); return m ? norm(m[1] + m[2]) : null; };
const loose = (n) => norm(String(n || "").replace(/\(주\)|주식회사|\(유\)|유한회사|카페|까페|커피|coffee|cafe|베이커리|bakery|제과|점$/gi, ""));
const nameLoose = (a, b) => { const x = loose(a), y = loose(b); return x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x)); };
// 🏢 같은 건물 중복 사전 차단(2026-09-24) — 09-24 실측: 적재 시도 6,996콜 중 1,155콜(16.5%)이 네이버 조회 후에야
//   '이미 보유'로 판명됐다. 원장엔 좌표가 없지만 도로명+번지는 있다 → 보유 카페와 같은 건물이고 상호가 느슨히 겹치면
//   네이버에 묻지 않는다(남은 후보 44,572곳 중 4,881곳 해당, 표본 전부 같은 가게 표기이형).
const ownByAddrKey = new Map(); for (const r of own) { const k = addrKey(r.address); if (!k) continue; if (!ownByAddrKey.has(k)) ownByAddrKey.set(k, []); ownByAddrKey.get(k).push(r.name); }
console.log(`보유 ${own.length.toLocaleString()}곳(이름 ${haveName.size.toLocaleString()} · 주소 ${haveAddr.size.toLocaleString()})`);

// ── 원장에서 후보 뽑기(로컬 파일·비용 0) ──
const CAFE_BIZ = new Set(["커피숍", "제과점영업"]);
// ☕ 일반음식점 원장 속 카페 겸업(2026-09-22 CEO "준비해") — 실측: 영업중 501,650건 중 업태 '까페' 17,034 + 카페형 상호 18,490(비카페어 제외).
//   업태가 '까페'이거나, 상호에 카페·커피·로스터·베이커리·디저트·브런치·티룸 같은 말이 있고 식당·주점·치킨 같은 말이 없을 때만 후보.
//   정밀도가 낮은 소스라 같은 시군구 줄에서 커피숍·제과점 뒤에 선다. 네이버 카테고리(isNonCafeFnbCategory)가 마지막 관문.
const GR_CAFE_RE = /카페|까페|카훼|커피|coffee|cafe|caffe|로스터|로스팅|roaster|베이커리|bakery|디저트|dessert|브런치|brunch|티룸|tea ?room|찻집|에스프레소|espresso|라떼|latte|마카롱|케이크|cake|도넛|donut|와플|waffle|크로플|빙수|스콘/i;
const GR_NONCAFE_RE = /치킨|호프|주점|포차|술집|맥주|bar$|삼겹|갈비|곱창|족발|보쌈|국밥|국수|칼국수|냉면|분식|떡볶이|김밥|피자|pizza|버거|burger|돈까스|돈가스|초밥|스시|횟집|해장|감자탕|찜닭|고기|정육|뷔페|식당|반점|중국집|짬뽕|짜장|쌀국수|파스타|이자카야|노래|클럽|게임|pc방|라이브/i;
const isGeneralCafe = (d) => d.biz === "까페" ? !GR_NONCAFE_RE.test(String(d.nm || "")) : (GR_CAFE_RE.test(String(d.nm || "")) && !GR_NONCAFE_RE.test(String(d.nm || "")));
let grCand = 0;
const cand = []; let skipFranchise = 0, skipOther = 0, skipTried = 0, skipNameNonCafe = 0, skipBldgDup = 0;
// 🧾 시도 캐시 — 네이버에 없던 상호를 매일 다시 묻지 않는다(09-21: 같은 30곳을 세 번 물어 90콜 낭비). 성공분은 DB(haveName)가 막는다.
const TRIED_PATH = `${homedir()}/coffee-platform/agent-reports/permits/tried.json`;
const tried0 = new Set(existsSync(TRIED_PATH) ? JSON.parse(readFileSync(TRIED_PATH, "utf8")) : []);
const triedKey = (nm, addr) => norm(nm) + "|" + norm(addr).slice(0, 20);
for (const fn of ["rest_cafes", "bakeries", "rest_cafes.extra", "bakeries.extra", "general_restaurants", "general_restaurants.extra"]) {   // .extra = 09-22 추가 지역분 · general_restaurants = 일반음식점 카페 겸업(뒤에 선다)
  const fp = `${homedir()}/coffee-platform/agent-reports/permits/${fn}.ndjson`; if (!existsSync(fp)) continue;
  const rl = readline.createInterface({ input: createReadStream(fp), crlfDelay: Infinity });
  for await (const line of rl) {
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (!String(d.st || "").includes("영업")) continue;
    const fromGeneral = fn.startsWith("general_restaurants");
    if (fromGeneral ? !isGeneralCafe(d) : !CAFE_BIZ.has(d.biz || "")) continue;
    if (fromGeneral) grCand++;
    const addr = d.rn || d.ln || "";
    const area = areaOf(addr); if (!area) continue;            // 서비스 범위 밖·주소 파싱 불가 → 건너뜀
    if (haveName.has(norm(d.nm)) || haveAddr.has(norm(addr))) continue;
    // 🚫 헛콜 차단(09-21 실증: 미발견 37 중 프랜차이즈 지점 12·한시 팝업 3·복지관 구내 1) — 서비스가 어차피 안 싣는 것은 검색도 하지 않는다
    if (isFranchise(String(d.nm))) { skipFranchise++; continue; }
    if (/한시적|임시|구내|복지관|휴게소|급식|자활센터/.test(String(d.nm))) { skipOther++; continue; }
    if (tried0.has(triedKey(d.nm, addr))) { skipTried++; continue; }
    // 🚫 상호만으로 공개 불가가 확정인 곳(09-24 실측: 공개 3,562곳 중 오탐 1곳·그마저 브런치 정책 위반, 공개불가 144곳 적중)
    if (isNonCafe(String(d.nm), "")) { skipNameNonCafe++; continue; }
    { const same = ownByAddrKey.get(addrKey(addr)); if (same && same.some((n) => nameLoose(n, d.nm))) { skipBldgDup++; continue; } }
    cand.push({ nm: d.nm, addr, area, tel: d.tel || null, opn: d.opn || null, biz: d.biz || null });
  }
}
console.log(`  (일반음식점 카페 겸업 후보 ${grCand.toLocaleString()}곳 포함 — 필터 통과·미보유·미시도)`);
console.log(`원장 후보 ${cand.length.toLocaleString()}곳 (영업중 커피숍·제과점 중 우리에게 없는 것 · 프랜차이즈 ${skipFranchise.toLocaleString()}·한시/구내 ${skipOther.toLocaleString()}·이미 시도 ${skipTried.toLocaleString()}·상호상 비카페 ${skipNameNonCafe.toLocaleString()}·같은건물 보유 ${skipBldgDup.toLocaleString()} 제외)`);
const byArea = {}; for (const c of cand) byArea[c.area] = (byArea[c.area] ?? 0) + 1;
// 🔄 지역 라운드로빈(2026-09-21 CEO "모든 지역 극대화") — 원장 파일 순서대로 돌면 한 시군구가 하루치를 독식한다.
//   시군구별 줄을 세워 한 곳씩 번갈아 뽑는다 → 매일 전 지역이 고르게 늘고, 상한이 작아도 특정 지역이 굶지 않는다.
// ⚖️ 신규 지역 가중치(2026-09-22 CEO "신규 지역 가중치 두 배로 바로 적용"): 원장이 늦게 들어온 시·도는 아직 얇으니
//   한 라운드에 두 곳씩 뽑는다. 기간·대상은 env로 조정(기본 09-29까지, 대구·경북·광주·전남·전북·울산·제주).
const BOOST_SIDOS = new Set((process.env.PERMIT_BOOST_SIDOS || "대구,경북,광주,전남,전북,울산,제주").split(",").map((x) => x.trim()).filter(Boolean));
const BOOST_UNTIL = process.env.PERMIT_BOOST_UNTIL || "2026-09-29";
const BOOST_ON = new Date().toISOString().slice(0, 10) <= BOOST_UNTIL;
const GU2SIDO = new Map(); for (const [sd, gus] of Object.entries(SIDO_GU)) for (const g of gus) GU2SIDO.set(PREFIXED.has(sd) ? `${sd} ${g}` : g, sd);
const weightOf = (area) => (BOOST_ON && BOOST_SIDOS.has(GU2SIDO.get(area) ?? "") ? 2 : 1);
{
  const queues = new Map(); for (const c of cand) { if (!queues.has(c.area)) queues.set(c.area, []); queues.get(c.area).push(c); }
  const keys = [...queues.keys()]; cand.length = 0; let left = keys.length;
  while (left > 0) { left = 0; for (const k of keys) { const q = queues.get(k); for (let i = 0; i < weightOf(k) && q.length; i++) cand.push(q.shift()); if (q.length) left++; } }
  const boosted = keys.filter((k) => weightOf(k) === 2).length;
  console.log(`지역 라운드로빈: 시군구 ${keys.length}개 · 가중치 2배 ${boosted}개(${BOOST_ON ? [...BOOST_SIDOS].join("·") + " · " + BOOST_UNTIL + "까지" : "꺼짐"})`);
}
console.log("상위 지역:", Object.entries(byArea).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(" · "));

if (!APPLY) { console.log(`\n▶ 드라이런. --apply 로 적재(상한 ${LIMIT}곳 · 예산 ${BUDGET}콜).`); process.exit(0); }

// ── 네이버 local 1콜로 좌표·실재 확인 후 적재 ──
let used0 = await naverUsedToday();        // 전역 기준선 — 보고용(같은 시간 다른 잡 포함)
const mine0 = naverCallsThisProcess();     // 자기 기준선 — 예산 판정용(이 프로세스의 콜만)
const OFFCONCEPT_CAT = /(애견|애완|반려동물|펫카페|고양이카페|동물카페|키즈|실내놀이터|놀이방|스터디카페|독서실|만화방|만화카페|룸카페|멀티방|파티룸|방탈출|보드게임|보드카페|볼링|당구|스크린골프|골프연습|코인노래|노래방|찜질방|사우나|클라이밍|트램폴린|트램펄린|서점|북카페|도서관)/;
let tried = 0, added = 0, miss = 0, skipNonCafe = 0, skipRuleDead = 0, skipDup = 0, calls = 0;
// 🔬 09-25 결과 기록(동작 무변경) — 미발견(오늘 2,492콜·31%)이 개업시기·업종·전화 유무에 몰리는지 보려면 항목별 결과가 필요하다.
const OUT_PATH = `${homedir()}/coffee-platform/agent-reports/permits/outcome-${new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "")}.ndjson`;
const outcome = (c, r) => { try { appendFileSync(OUT_PATH, JSON.stringify({ r, nm: c.nm, area: c.area, opn: c.opn ?? null, biz: c.biz ?? null, tel: c.tel ? 1 : 0 }) + "\n"); } catch {} };
const VERBOSE = process.argv.includes("--verbose");
for (const c of cand) {
  if (added >= LIMIT) break;
  // 💰 자기 몫 예산 = **내가 쓴 콜**로 잰다(2026-09-26 수리). 전역 증가분으로 재면 동시에 도는 잡의 콜까지
  //   내가 쓴 것으로 계산돼 절반에서 멈춘다(09-26 07:00: 자기 4,212콜인데 전역 8,102 → 조기중단, 적재 52%).
  const mine = naverCallsThisProcess() - mine0;
  if (mine >= BUDGET) { console.log(`예산 ${BUDGET}콜 도달(자기 호출 ${mine}콜) — 중단`); break; }
  // 🛑 전역 한도 백스톱 — 자기 예산이 남아도 하루 총량을 넘겨선 안 된다(폐업 크론 몫은 남긴다).
  //   전역 절대값으로 재는 게 맞는 유일한 지점(용도가 '내 몫'이 아니라 '하루 천장'이라서).
  if (tried % 50 === 0) {
    const g = await naverUsedToday();
    if (g >= NAVER_DAILY_QUOTA - NAVER_CLOSURE_RESERVE) { console.log(`전역 한도 근접(${g}/${NAVER_DAILY_QUOTA}, 폐업예약 ${NAVER_CLOSURE_RESERVE} 보존) — 중단`); break; }
  }
  tried++; tried0.add(triedKey(c.nm, c.addr));
  // 질의 정리 — "요에라(Yoera)"·"카페:옆집"·"카페cafe 메종@학동" 같은 인허가 표기는 네이버가 0건을 돌려준다(09-21 실증)
  const qn = String(c.nm).replace(/\([^)]*\)/g, " ").replace(/[:@·,\/]+/g, " ").replace(/\s+/g, " ").trim() || c.nm;
  const items = await localSearch(`${qn} ${c.area}`); calls++;
  if (!items) { miss++; outcome(c, "api"); continue; }                             // API 오류/쿼터 → 보류
  const ck = addrKey(c.addr);
  const hit = items.find((it) => it.lat != null && (
    norm(it.name) === norm(c.nm) ||                              // 이름 완전일치
    (ck && addrKey(it.address) === ck) ||                        // 도로명+번지 일치(같은 건물)
    nameLoose(it.name, c.nm)));                                  // 업종어·법인어 뺀 느슨한 포함
  if (!hit) { miss++; outcome(c, items.length ? "miss_nomatch" : "miss_empty"); if (VERBOSE) console.log(`  ✗ ${c.nm} | ${c.area} | 네이버: ${items.slice(0, 2).map((i) => `${i.name} @ ${i.address}`).join(" ; ") || "(결과 없음)"}`); continue; } // 네이버에 없으면 적재하지 않는다(폐업·미등록)
  if (VERBOSE && norm(hit.name) !== norm(c.nm)) console.log(`  ≈ ${c.nm} → ${hit.name} (${addrKey(hit.address) === ck ? "주소일치" : "느슨한 이름"})`);
  if (isNonCafeFnbCategory(hit.category || "")) { skipNonCafe++; outcome(c, "noncafe"); continue; }
  const hitName = hit.name || c.nm, hitAddr = hit.address || c.addr;
  // 🔒 공개 관문과 같은 규칙으로 적재 전에 거른다(2026-09-24 CEO "낭비 막아").
  //   실측 09-21~24: 적재 12,910곳 중 2,549곳(프랜차이즈 302·비카페 업종 2,247)이 네이버 정본 상호·업종만으로
  //   공개 불가가 확정인데 적재돼 수집 쿼터(곳당 ~4.4콜)를 태웠다 — 그중 공개 1곳. 약 2,800콜/일 낭비.
  //   원인: 여기는 isFranchise(원장 상호)+isNonCafeFnbCategory만, 공개 관문(synthStore ruleOk)은
  //   isFranchise(정본 상호)+isNonCafe(상호,업종)+노점/유령/무인을 본다. 두 관문을 같은 함수로 맞춘다.
  // 📚 09-25: 공개 단계 오프콘셉 제외(synthStore healNonCafeCategory — 북카페·서점·애견·키즈·보드게임 등, CEO 2026-06 지시)와 같은 기준.
  //   실측: 북카페 0/256·서점 0/80·독립서점 0/45·보드카페 0/33 공개 — 적재하면 수집 쿼터(곳당 ~4.4콜)만 탄다. ⚠️ 정규식은 synthStore와 짝으로 유지.
  if (OFFCONCEPT_CAT.test(hit.category || "") || /북 ?카페/.test(hitName)) { skipRuleDead++; outcome(c, "offconcept"); continue; }
  if (isFranchise(hitName) || isNonCafe(hitName, hit.category || "") || isSnackStall(hitName) || isStructuralPhantom(hitName) || isUnmannedCafe(hitName)) { skipRuleDead++; outcome(c, "ruledead"); continue; }
  // ★ 정본(Naver) 이름·주소·좌표로 최종 재확인 — discover.ts와 동일 판정(이름 완전일치 → 좌표근접+브랜드토큰겹침/근접중복 → 주소완전일치).
  let dup = haveName.has(norm(hitName)) || (hitAddr && haveAddr.has(norm(hitAddr)));
  if (!dup && hit.lat != null) {
    const near = ownPts.find((p) => Math.abs(p.lat - hit.lat) < 0.0005 && Math.abs(p.lng - hit.lng) < 0.0005);
    if (near && (brandTokenOverlap(near.name, hitName, [c.area, near.dong, hit.dong].filter(Boolean)) || nearDuplicateCafeName(near.name, hitName))) dup = true;
  }
  if (dup) { skipDup++; outcome(c, "dup"); if (VERBOSE) console.log(`  ⊘ 교차소스 중복(기존 보유) ${hitName} @ ${hitAddr}`); continue; }
  const area = areaOf(hit.address) || c.area;
  const pseudoId = `pm_${String(c.nm).replace(/\s/g, "")}_${Math.round(hit.lat * 1e5)}`;
  await sql`INSERT INTO cafes (place_id, name, area, dong, naver_category, address, lat, lng, phone, instagram_url, source, published, roasts_own, pipeline_status)
    VALUES (${pseudoId}, ${hitName}, ${area}, ${hit.dong}, ${hit.category}, ${hitAddr}, ${hit.lat}, ${hit.lng}, ${hit.phone || c.tel}, ${hit.instagramUrl}, 'permit', false, false, 'new')
    ON CONFLICT (place_id) DO NOTHING`;
  added++; outcome(c, "added");
  // 같은 실행 내 후속 후보와도 대조(직전에 넣은 것도 대조 대상에 추가)
  haveName.add(norm(hitName)); if (hitAddr) haveAddr.add(norm(hitAddr));
  if (hit.lat != null) ownPts.push({ lat: hit.lat, lng: hit.lng, name: hitName, dong: hit.dong });
  if (added % 200 === 0) console.log(`  … ${added}곳 적재 (시도 ${tried} · 자기 ${naverCallsThisProcess() - mine0}콜 / 전역 ${(await naverUsedToday()) - used0}콜)`);
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
console.log(`\n적재 ${added}곳 · 시도 ${tried} · 네이버 미발견 ${miss} · 비카페 제외 ${skipNonCafe} · 공개규칙 불가 제외 ${skipRuleDead} · 교차소스 중복 제외 ${skipDup}`);
console.log(`이 스크립트 호출 ${calls}콜(예산 계상 ${naverCallsThisProcess() - mine0}콜 / 한도 ${BUDGET}) → 적재 1곳당 ${(calls / Math.max(added, 1)).toFixed(2)}콜 (기존 발굴 16.9콜)`);
// 전역과 자기 몫이 크게 벌어지면 **다른 잡이 같은 시간에 쿼터를 먹고 있다** — 09-26 스윕 부활을 이 차이로 잡았다.
const other = spent - (naverCallsThisProcess() - mine0);
console.log(`같은 시간 네이버 전체 사용 ${spent}콜${other > 200 ? ` · ⚠️ 그중 다른 잡이 ${other}콜 — 동시 실행 잡을 확인하라` : ""}`);
