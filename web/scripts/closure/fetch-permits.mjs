#!/usr/bin/env node
// 🏛️ 인허가(지방행정) 원장 수집기 — data.go.kr 1741000 계열을 통째로 훑어 우리 서비스 지역분만 로컬에 적재한다.
//   실행: node scripts/closure/fetch-permits.mjs rest_cafes|bakeries|general_restaurants [--conc=16] [--reset]
//   산출: ~/coffee-platform/agent-reports/permits/<ep>.ndjson (+ .state.json) — gitignore 영역, Vercel 배포와 무관.
//
// 🔴 왜 이렇게 하나(2026-09-08 실측):
//   - 이 API는 **필터 파라미터가 없다**. DTL_SALS_STTS_CD·주소·localCode·수정일 전부 무시되고 항상 전체가 나온다(11종 실험).
//   - numOfRows는 **100이 상한**(1000·5000을 넣어도 100건). 호출당 지연 12~22초.
//   - 그래서 '한 건씩 조회'도 '조건 조회'도 불가능하고, 통째로 페이징한 뒤 **로컬에서 거르는 것**이 유일한 길이다.
//   - 다행히 동시 호출은 허용된다(16/16 성공) → 휴게음식점 6,460페이지 ≈ 2.5시간.
//   - 쿼터: 계정당 10,000회/일. 휴게(6,460)+제과(695)=7,155로 하루 안에 끝난다. 일반음식점(22,954)은 별도 날.
//
// 비용: 외부 공공 API + 로컬 디스크만 사용. Neon·Vercel 접촉 0.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const EP = process.argv[2];
const ENDPOINTS = { rest_cafes: "휴게음식점", bakeries: "제과점영업", general_restaurants: "일반음식점" };
if (!ENDPOINTS[EP]) { console.error("사용법: node scripts/closure/fetch-permits.mjs <rest_cafes|bakeries|general_restaurants>"); process.exit(1); }
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const CONC = Number(arg("conc", 16));
const RESET = process.argv.includes("--reset");

const KEY = (readFileSync(path.join(homedir(), "budongsan-note/.env.local"), "utf8").match(/^DATA_GO_KR_API_KEY=(.+)$/m) || [])[1]?.trim().replace(/^['"]|['"]$/g, "");
if (!KEY) { console.error("DATA_GO_KR_API_KEY 없음(~/budongsan-note/.env.local)"); process.exit(1); }

const OUT_DIR = path.join(homedir(), "coffee-platform/agent-reports/permits");
mkdirSync(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, `${EP}.ndjson`);
const STATE = path.join(OUT_DIR, `${EP}.state.json`);

// 우리가 서비스하는 시·도만 남긴다(전국 300만 건을 다 들고 있을 이유가 없다). 주소 표기는 API 원문 기준.
const REGIONS = ["서울특별시", "인천광역시", "경기도", "강원특별자치도", "강원도", "대전광역시", "세종특별자치시", "충청남도", "충청북도", "부산광역시", "경상남도"];
const inScope = (addr) => !!addr && REGIONS.some((r) => addr.startsWith(r));

const url = (page) => `https://apis.data.go.kr/1741000/${EP}/info?serviceKey=${KEY}&pageNo=${page}&numOfRows=100&resultType=json`;

async function fetchPage(page, tries = 4) {
  for (let t = 1; t <= tries; t++) {
    try {
      const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 120000);
      const r = await fetch(url(page), { signal: ctl.signal }); clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const d = await r.json();
      const items = d?.response?.body?.items?.item;
      if (!Array.isArray(items)) throw new Error("shape");
      return { page, items, total: Number(d.response.body.totalCount) || 0 };
    } catch (e) {
      if (t === tries) return { page, items: null, err: String(e).slice(0, 80) };
      await new Promise((s) => setTimeout(s, 1500 * t)); // 백오프(쿼터·순간 오류 대응)
    }
  }
}

// 필요한 필드만 남긴다 — 원문은 40필드/1.2KB지만 매칭엔 8개면 충분(디스크·읽기 비용 절감)
const slim = (o) => ({
  no: o.MNG_NO, nm: o.BPLC_NM, ln: o.LOTNO_ADDR, rn: o.ROAD_NM_ADDR,
  st: o.DTL_SALS_STTS_NM, cd: o.DTL_SALS_STTS_CD, cl: o.CLSBIZ_YMD || "",
  biz: o.BZSTAT_SE_NM, tel: o.TELNO, opn: o.LCPMT_YMD, upd: o.DAT_UPDT_PNT,
});

(async () => {
  let state = { next: 1, kept: 0, seen: 0, total: 0, started: new Date().toISOString() };
  if (!RESET && existsSync(STATE)) state = JSON.parse(readFileSync(STATE, "utf8"));
  else writeFileSync(OUT, "");
  const first = await fetchPage(1);
  const total = first.total || 0;
  const lastPage = Math.ceil(total / 100);
  state.total = total;
  console.log(`[${EP}/${ENDPOINTS[EP]}] 전체 ${total.toLocaleString()}건 · ${lastPage.toLocaleString()}페이지 · ${state.next}페이지부터 · 동시 ${CONC}`);
  const t0 = Date.now();
  while (state.next <= lastPage) {
    const pages = [];
    for (let i = 0; i < CONC && state.next + i <= lastPage; i++) pages.push(state.next + i);
    const res = await Promise.all(pages.map((p) => fetchPage(p)));
    const failed = res.filter((r) => !r.items);
    if (failed.length) { // 한 배치가 통째로 실패 = 쿼터 소진 가능성 → 멈추고 상태 보존(다음 실행이 이어받음)
      console.error(`⛔ ${failed.length}/${pages.length} 페이지 실패(${failed[0].err}) — ${state.next}페이지에서 중단. 다시 실행하면 이어서.`);
      break;
    }
    let buf = "";
    for (const r of res) for (const it of r.items) { state.seen++; if (inScope(it.LOTNO_ADDR)) { buf += JSON.stringify(slim(it)) + "\n"; state.kept++; } }
    if (buf) appendFileSync(OUT, buf);
    state.next += pages.length;
    writeFileSync(STATE, JSON.stringify(state));
    const done = state.next - 1, pct = ((done / lastPage) * 100).toFixed(1);
    const eta = ((Date.now() - t0) / 1000) * ((lastPage - done) / Math.max(1, done - (JSON.parse(readFileSync(STATE, "utf8")).startPage || 0)));
    if (done % (CONC * 10) < CONC) console.log(`  ${pct}% (${done.toLocaleString()}/${lastPage.toLocaleString()}p) · 지역내 ${state.kept.toLocaleString()}건 · 남은시간 ~${(eta / 3600).toFixed(1)}h`);
  }
  console.log(`✅ [${EP}] ${state.next > lastPage ? "완료" : "중단"} · 훑음 ${state.seen.toLocaleString()} · 지역내 ${state.kept.toLocaleString()}건 → ${OUT}`);
})();
