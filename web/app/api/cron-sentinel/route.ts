import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { healAreaLabel, healOutOfBox } from "@/lib/synthStore";
import { recordRun } from "@/lib/agentLog";
import { fingerprintOf } from "@/lib/runLedger";
import { frozenTargets, noteAttempt, shownHash, frozenSummary } from "@/lib/healHarness";
import { startJobRun, tickBlob, runUsage, clearOverBudget } from "@/lib/blobBudget";
import { acquireLease, releaseLease, pruneLeases, activeLeases } from "@/lib/healLease";
import { openScope, noteWrite, scopeResult } from "@/lib/writeScope";
import { isCostHalted } from "@/lib/costGuard";
import { probeConsoleKey } from "@/lib/consoleKeyProbe";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";
import { quoteMatchConfidence, coreTokens } from "@/lib/reviewQuality";
import { loadCriteriaLists, getListSetSync } from "@/lib/criteriaLists";

export const runtime = "nodejs";
export const maxDuration = 300;

// 🆕 이름-불일치 스캔(coherence 부풀림 사각 전담): 노출후기 다수가 '실제 그 카페명'을 안 담거나(quoteMatchConfidence=0)
//   제목이 먼 광역시(부산·대구…)를 주제로 삼으면 동명 타지역/옆가게 오염 의심. name_pollution(coherence<0.3)이
//   '까페'·'대구 중구' 같은 일반어/구名 충돌로 1.0 부풀 때 못 잡던 케이스(비비·MY FAVORITE·외할머니)를 잡는다.
//   ⚠️ 탐지·경보 전용(자동 비공개 안 함) — 붙임/띄어쓰기 변형 오탐이 있으므로 CEO/기조실장 검토 큐로만.
const FAR_METRO = ["부산", "대구", "대전", "울산", "전주", "창원", "김해", "포항", "목포", "여수", "순천"];
// 한 리뷰가 '먼 광역시 주제글'인가(동명 타지역): 그 지역이 제목 주제(앞8자·2회+)+우리지역/이름/시도 아님.
function farHit(q: string, name: string, areaTerms: string[]): boolean {
  const fm = FAR_METRO.find((m) => q.includes(m)); if (!fm) return false;
  if (areaTerms.some((a) => a.includes(fm)) || name.replace(/\s/g, "").includes(fm) || /(서울|경기|인천)/.test(q)) return false;
  return q.indexOf(fm) <= 7 || q.split(fm).length - 1 >= 2;
}
// 🔎 전수 이름-불일치 스캔(모든 오염 클래스): ① 먼광역시 동명 ② 이름 흡수(노출후기 다수가 카페명 실언급 안 함
//   =quoteMatchConfidence 0, 외할머니·비비·구구커피류). coherence<0.3이 일반어·구名충돌로 못 잡던 전 사각.
//   결정론·무료(AI 0). 250s 시간컷으로 300s 크론 안전. 탐지·경보만(자동조치 안 함, 붙임/띄어쓰기 오탐은 검토큐).
async function scanNameMismatch(): Promise<{ count: number; far: number; nameMiss: number; samples: string[] }> {
  const t0 = Date.now(); let lo = 0; let truncated = false;
  const flagged: { id: number; name: string; area: string; miss: number; shown: number; far: boolean; rate: number }[] = [];
  for (let guard = 0; guard < 80; guard++) {
    if (Date.now() - t0 > 240000) { truncated = true; break; } // 시간 안전장치(다음 실행이 이어감)
    const rows = (await sql`SELECT id, name, area, dong, synth_reviews FROM cafes
      WHERE published AND synth_reviews IS NOT NULL AND jsonb_array_length(synth_reviews) >= 3 AND id > ${lo}
      ORDER BY id LIMIT 500`) as any[];
    if (!rows.length) break; lo = rows[rows.length - 1].id;
    for (const c of rows) {
      const areaTerms = [c.area, c.dong].filter(Boolean) as string[];
      const revs = c.synth_reviews || [];
      const toks = coreTokens(c.name, areaTerms);
      const hasStrong = toks.some((t: string) => { const n = t.replace(/[^가-힣A-Za-z0-9]/g, ""); return n.length >= 3 && !/^\d+$/.test(n); }); // 고유이름 있어야(1~2자·순수숫자=약한이름 FP 배제)
      let miss = 0, far = false;
      for (const r of revs) {
        const q = (r.quote || "") as string;
        if (quoteMatchConfidence(c.name, q, areaTerms) === 0) miss++;
        if (farHit(q, c.name, areaTerms)) far = true;
      }
      const rate = miss / revs.length;
      if (far || (hasStrong && rate >= 0.5)) flagged.push({ id: c.id, name: c.name, area: c.area, miss, shown: revs.length, far, rate });
    }
  }
  flagged.sort((a, b) => Number(b.far) - Number(a.far) || b.rate - a.rate);
  const samples = flagged.slice(0, 60).map((f) => `#${f.id} ${f.name}[${f.area}] ${f.miss}/${f.shown}${f.far ? " 먼광역시" : " 이름불일치"}`);
  if (truncated) samples.push("⚠️(시간컷—다음 실행이 이어서 스캔)");
  return { count: flagged.length, far: flagged.filter((f) => f.far).length, nameMiss: flagged.filter((f) => !f.far && f.rate >= 0.5).length, samples };
}

// 🎡 명소·행사 오염 스캔(약한토큰 사각 전담): 카페명이 유명 명소·축제·공연장 이름과 겹칠 때(남사당카페=남사당놀이·
//   바우덕이축제·안성맞춤랜드), 명소·행사 글이 그 토큰으로 '이름일치'처럼 들어와 verified로 노출된다. 이 부류는
//   coherence가 오히려 높고(토큰이 전 리뷰에 있음) offctx도 낮아(명소글도 '카페·먹거리' 맥락어 보유) name_pollution·
//   name_mismatch·offctx 세 탐지기를 전부 통과했다(2026-07-14 남사당카페 사례, CEO 지적). → 전용 탐지기.
//   판정: 노출후기가 ①강한 명소·행사 문맥어를 담고 ②카페명 마커(글자붙인 전체명 or 코어토큰+카페/커피)가 없으면 오염.
//   ⚠️ 탐지·경보 전용(자동 비공개 안 함) — 명소 근처 정상 카페 오탐 가능, CEO/기조실장 검토 큐로만.
const ATTR_STRONG = /(축제|공연장|풍물|사물놀이|남사당놀이|무형문화재|셔틀\s*버스|입장료|매표소|관람권|전시회|전시관|박물관|미술관|테마파크|놀이공원|팜랜드|퍼레이드|불꽃놀이|행사장|축제장|민속촌|한옥마을|동물원|식물원|수목원|워터파크|케이블카|유원지|경기장|야구장|경마장|바우덕이|풍물단)/;
function attrMarkers(name: string, at: string[]): string[] {
  const s = new Set<string>();
  const raw = (name || "").replace(/\s/g, "").toLowerCase(); if (raw.length >= 3) s.add(raw);
  for (const t of coreTokens(name, at)) { const n = t.replace(/\s/g, "").toLowerCase(); if (n.length >= 2) { s.add(n + "카페"); s.add(n + "커피"); s.add("카페" + n); s.add("커피" + n); } }
  return [...s];
}
type AttrFlag = { id: number; name: string; area: string; bad: number; shown: number };
async function scanAttractionPollution(): Promise<{ count: number; samples: string[]; flagged: AttrFlag[] }> {
  const t0 = Date.now(); let lo = 0; let truncated = false;
  const flagged: AttrFlag[] = [];
  for (let guard = 0; guard < 80; guard++) {
    if (Date.now() - t0 > 90000) { truncated = true; break; } // 시간 안전장치(스캔60~90s → 자동조치 예산 확보)
    const rows = (await sql`SELECT id, name, area, dong, synth_reviews FROM cafes
      WHERE published AND synth_reviews IS NOT NULL AND jsonb_array_length(synth_reviews) >= 2 AND id > ${lo}
      ORDER BY id LIMIT 500`) as any[];
    if (!rows.length) break; lo = rows[rows.length - 1].id;
    for (const c of rows) {
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const mk = attrMarkers(c.name, at);
      let bad = 0;
      for (const r of (c.synth_reviews || [])) {
        const q = (r.quote || "") as string; const qn = q.replace(/\s/g, "").toLowerCase();
        if (ATTR_STRONG.test(q) && !mk.some((m) => qn.includes(m))) bad++;
      }
      if (bad >= 2) flagged.push({ id: c.id, name: c.name, area: c.area, bad, shown: (c.synth_reviews || []).length });
    }
  }
  flagged.sort((a, b) => b.bad - a.bad);
  const samples = flagged.slice(0, 60).map((f) => `#${f.id} ${f.name}[${f.area}] 명소글 ${f.bad}/${f.shown}`);
  if (truncated) samples.push("⚠️(시간컷—다음 실행이 이어서 스캔)");
  return { count: flagged.length, samples, flagged };
}

// 🎡 자율 조치(CEO 지시 2026-07-14): flag된 카페의 명소·행사 오염 후기를 결정론 규칙으로 자동 제거·재합성(durable).
//   보수: ①런당 최대 12곳 ②시간예산(전체 스캔 후 남은 시간, deadline까지) ③카페명 마커 든 후기는 보존(명소 언급해도).
//   멱등: 제거는 judge_decisions에 저장돼 재-flag 안 됨 → 다음 런은 '새로 생긴' 오염만 처리. 실패는 로그만(진행 계속).
async function healAttractionPollution(flagged: AttrFlag[], deadline: number): Promise<{ fixed: number; dropped: number; unpub: number; names: string[]; skipped?: number; noEffect?: number; frozen?: number }> {
  const { collectAndSynthesize } = await import("@/lib/collectOrchestrator");
  const { applyDecisions } = await import("@/lib/synthStore");
  const { cleanCafeName } = await import("@/lib/reviewQuality");
  const { invalidateCafeCaches } = await import("@/lib/cafeCacheInvalidate");
  const norm = (s: string) => (s || "").replace(/\s/g, "").toLowerCase();
  let fixed = 0, dropped = 0, unpub = 0; const names: string[] = [];
  // 🩺 하네스 L4 — 반복 무효로 **동결된 대상은 시도조차 하지 않는다**(헛돎 원천 차단).
  let skipped = 0, noEffect = 0, frozenNew = 0;
  const HJOB = "sentinel.attraction";
  const frozenSet = await frozenTargets(HJOB);
  // 🩺 2026-08-15 수렴 버그 수리: 예전엔 `flagged.slice(0,12)`로 **먼저 자르고** 그 안에서 동결분을 걸렀다.
  //   동결 대상이 목록 앞쪽에 몰리면 12개 슬롯을 전부 스킵으로 소진해, 처리 가능한 항목이 **영원히 차례가 안 왔다**
  //   (실측: 지점오염 '잔여 5(다음런)'이 여러 런 동안 그대로 · 자동정리 0 · 하네스가 정체 3회로 검출).
  //   → 동결분을 **자르기 전에** 제외해 배치 12칸이 전부 실제 처리 대상으로 채워지게 한다.
  const actionable = flagged.filter((x: any) => !frozenSet.has(Number(x.id)));
  skipped += flagged.length - actionable.length;
  for (const f of actionable.slice(0, 12)) {
    if (Date.now() > deadline) break;
    // 🎫 하네스 L2 — 다른 잡(autoCorrect·resynth·다른 힐러)이 같은 카페를 만지는 중이면 양보한다.
    if (!(await acquireLease(HJOB, Number(f.id), 180))) { skipped++; continue; }
    try {
      tickBlob(); const c = (await sql`SELECT name, area, dong, address, published, raw_reviews, judge_decisions FROM cafes WHERE id=${f.id}`)[0] as any;
      if (!c) continue;
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const mk = attrMarkers(c.name, at);
      const raw = Array.isArray(c.raw_reviews) ? c.raw_reviews : [];
      const g = raw.filter((r: any) => r.source === "google").map((r: any) => ({ text: r.text, time: r.time }));
      const mkS = (s: string) => raw.filter((r: any) => r.source === s).map((r: any) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
      const sources: any[] = []; if (g.length) sources.push({ source: "google", texts: g });
      const b = mkS("blog"); if (b.length) sources.push({ source: "blog", texts: b });
      const y = mkS("youtube"); if (y.length) sources.push({ source: "youtube", texts: y });
      const decs = c.judge_decisions && typeof c.judge_decisions === "object" ? c.judge_decisions : {};
      const r = collectAndSynthesize(cleanCafeName(c.name), at, sources, { decisions: decs, address: c.address || "" });
      const dec: Record<string, boolean> = {}; let drop = 0;
      for (const it of (r.auditItems || [])) {
        // ♻️ 무한 반복 차단(2026-08-08, CEO "왜 자꾸 헛도는 루프를 도냐"): auditItems는 **규칙 기준**으로
        //   채워져서 이미 decisions=false로 제거 결정된 항목도 계속 들어온다. 가드가 없으면 힐러가 매 런마다
        //   같은 항목을 또 dec에 담아 applyDecisions를 호출 → raw_reviews(큰 blob) 재로드 + 재합성 +
        //   `DELETE FROM search_cache`까지 하루 4회씩 헛돌았다(실측: 6회 연속 "치유 10/감지 22" 동일).
        if (decs[it.key] === false) continue; const body = norm((it.title || "") + " " + (it.body || "")); if (ATTR_STRONG.test(body) && !mk.some((m) => body.includes(m))) { dec[it.key] = false; drop++; } }
      // 🩺 하네스 L4 완성(2026-08-08 실전검증서 발견): 가드가 앞단에서 다 걸러 `drop=0`이 되면
      //   applyDecisions도 noteAttempt도 호출되지 않아 **수렴 계약이 발동하지 못한다** → 감지 22건이
      //   영원히 남고 아무도 사람에게 안 넘긴다. "제거할 게 없다"도 **무효(효과 없음)** 로 기록해야
      //   2회 후 동결되고 워치리스트로 승격된다.
      if (drop === 0) { noEffect++; if ((await noteAttempt(HJOB, Number(f.id), false, { note: "제거 대상 없음(이미 결정 완료 — 자동으로는 더 못 고침)" })).frozen) frozenNew++; continue; }
      // 🩺 하네스 L4 — 집행 전후 '탐지기가 보는 소스'(synth_reviews)의 해시를 비교해 **효과를 실측**한다.
      //   md5는 SQL 안에서 계산돼 32자만 오간다(큰 컬럼 전송 없음). 효과 없으면 fixed로 세지 않는다.
      const _h0 = await shownHash(Number(f.id));
      noteWrite("cafes.judge_decisions"); noteWrite("cafes.synth_reviews"); noteWrite("cafes.synth_reviews_all");
      const res = await applyDecisions({ id: f.id, name: c.name, area: c.area }, dec);
      const _eff = (await shownHash(Number(f.id))) !== _h0;
      if ((await noteAttempt(HJOB, Number(f.id), _eff, { note: `drop=${drop}` })).frozen) frozenNew++;
      if (!_eff) { noEffect++; continue; }   // 허위 '고쳤다' 차단 — 다음 런은 위 frozenSet이 막는다
      fixed++; dropped += drop; if (res?.published === false && c.published) unpub++;
      if (names.length < 8) names.push(`${c.name}(-${drop})`);
      await invalidateCafeCaches([f.id]).catch(() => {});
    } catch { /* 개별 실패는 건너뜀(다음 런이 이어서 처리) */ }
    finally { await releaseLease(HJOB, Number(f.id)).catch(() => {}); }
  }
  if (fixed > 0) // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 한 곳 비공개는 동네→구 지도와 무관한데,
  //   같이 지우면 다음 검색이 전수 스캔(6,565페이지)으로 지도를 다시 만든다(불필요한 비용).
  await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
  return { fixed, dropped, unpub, names, skipped, noEffect, frozen: frozenNew };
}

// 🔤 약한이름(1글자) 흡수 오염 스캔·자율조치(CEO 지시 2026-07-14): 이름이 1글자 순한글(쉼·결·휴·봄…)이면
//   토큰이 너무 흔해 "쉼터"·"커피 마시고 쉼"(동사)·지역매칭만으로 남의 카페 후기를 흡수한다. name_mismatch는
//   hasStrong(3자+ 고유토큰)을 요구해 이 부류를 '의도적으로' 제외한다(약한토큰=아무데나 매칭→FP폭주). → 전용 탐지기.
//   ⚠️ 규칙만으론 '용산 카페'·'느좋 카페'(지역·형용사+카페) 서술어를 다른카페 고유명과 못 가른다(2026-07-14 실측:
//   1글자 20곳 중 18곳이 서술어로 오탐). → 자동삭제는 '지목된 카페명이 우리 DB에 실존하는 다른 공개카페일 때'만(고정밀 대조
//   게이트: 실측서 서술어 16개 중 15개 배제·진짜오염 4종 전부 포착). 서브토큰(쉼터/동사)·미등록 타카페는 손대지 않음(정상
//   후기 파괴 위험 → AI 판정 큐로). 오늘 #2557 쉼·#14119 결 수동정리에서 검증된 규칙 그대로. 정밀도>재현율(자동삭제라).
const WEAK_GEN = /^(근처|이곳|동네|신상|대형|작은|조용한|예쁜|감성|분위기|디저트|브런치|북|애견|강아지|키즈|루프탑|이색|힐링|스터디|무인|프랜차이즈|체인|전문|우리|맛있는|유명|인기|여기|거기|해당|같은|또다른|다른|몇몇|여러|모든|다양한|주변|주위|인근|곳|첫|막|한|두|세|공원|정원|공간|골목|한옥|포토|책|꽃|숲|뜰|마당|오늘|휴식|바다|하늘|강변|호수|숯|국내|서울|경기|인천)$/;
const WEAK_CAFEWORD = /([가-힣A-Za-z0-9]{2,10})\s*(카페|커피숍|로스터리|베이커리|제과점)/g;
const PARTICLE_END = /[의이가은는을를에도만과와로]$/; // 조사로 끝나면 카페명 아님("곳의 카페"=여러 카페)
// 노출후기가 '자기와 다른 특정 카페명'을 지목하는가 → 후보명(pre+접미) 반환(없으면 null). 일반어·조사끝·자기이름 배제.
function weakOtherCafe(text: string, selfN: string): string | null {
  WEAK_CAFEWORD.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = WEAK_CAFEWORD.exec(text))) {
    const pre = m[1]; const preN = pre.replace(/\s/g, "").toLowerCase();
    if (preN === selfN || preN.length < 2 || WEAK_GEN.test(pre) || PARTICLE_END.test(pre)) continue;
    return pre + m[2];
  }
  return null;
}
// 정규화·접미(카페/커피…) 제거 = 카페명 대조 표준형. "블룸카페"·"블룸" 모두 "블룸"으로 수렴.
const canonName = (s: string) => (s || "").replace(/[\s·・.]/g, "").toLowerCase().replace(/(카페|커피숍|커피|로스터리|베이커리|제과점)$/, "");
// 지목된 후보가 우리 DB에 실존하는 '다른' 카페명인가(고유명 검증). 서술어(용산카페·맛집카페)는 실존 안 해서 걸러짐.
function xrefKnown(candidate: string, known: Set<string>, selfN: string): boolean {
  const c = canonName(candidate);
  return c.length >= 2 && c !== selfN && known.has(c);
}
// 강한 자기마커(카페휴·휴카페·커피휴…) — 있으면 진짜 그 카페 후기로 보존. ⚠️ coreTokens는 1글자 토큰을 버리므로
//   1글자 이름에선 마커가 비어 보호 실패(2026-07-14 #15718 휴='로스팅 카페 휴' 오탐) → 정리한 이름에서 직접 생성.
function weakSelfMarkers(cleanName: string): string[] {
  const n = (cleanName || "").replace(/[\s·・.]/g, "").toLowerCase();
  if (!n) return [];
  return [n + "카페", "카페" + n, n + "커피", "커피" + n];
}
type WeakFlag = { id: number; name: string; area: string; bad: number; shown: number; other: string };
async function scanWeakNamePollution(): Promise<{ count: number; samples: string[]; flagged: WeakFlag[] }> {
  const { cleanCafeName } = await import("@/lib/reviewQuality");
  // DB 실존 카페명 표준형 집합(고유명 대조 게이트). 서술어는 여기 없어서 걸러진다.
  const known = new Set<string>();
  for (const r of (await sql`SELECT name FROM cafes WHERE published`) as any[]) { const n = canonName(cleanCafeName(r.name)); if (n.length >= 2) known.add(n); }
  const t0 = Date.now(); let lo = 0; let truncated = false; const flagged: WeakFlag[] = [];
  for (let guard = 0; guard < 80; guard++) {
    if (Date.now() - t0 > 45000) { truncated = true; break; } // 값싼 스캔(대부분 이름체크서 즉시 skip) — 45s컷
    const rows = (await sql`SELECT id, name, area, dong, synth_reviews FROM cafes
      WHERE published AND synth_reviews IS NOT NULL AND jsonb_array_length(synth_reviews) >= 3 AND id > ${lo}
      ORDER BY id LIMIT 500`) as any[];
    if (!rows.length) break; lo = rows[rows.length - 1].id;
    for (const c of rows) {
      const cn = cleanCafeName(c.name); const nn = cn.replace(/[\s·・.]/g, "");
      if (!/^[가-힣]$/.test(nn)) continue; // 정확히 1글자 순한글 이름만(최고위험·최고정밀)
      const markers = weakSelfMarkers(cn); const selfN = nn.toLowerCase();
      let bad = 0; let other = "";
      for (const r of (c.synth_reviews || [])) {
        const q = (r.quote || "") as string; const qn = q.replace(/\s/g, "").toLowerCase();
        const o = weakOtherCafe(q, selfN);
        if (o && xrefKnown(o, known, selfN) && !markers.some((mk) => qn.includes(mk))) { bad++; if (!other) other = o; }
      }
      if (bad >= 1) flagged.push({ id: c.id, name: cn, area: c.area, bad, shown: (c.synth_reviews || []).length, other });
    }
  }
  flagged.sort((a, b) => b.bad - a.bad);
  const samples = flagged.slice(0, 40).map((f) => `#${f.id} ${f.name}[${f.area}] 타카페 ${f.bad}/${f.shown}(«${f.other}»)`);
  if (truncated) samples.push("⚠️(시간컷—다음 실행이 이어서 스캔)");
  return { count: flagged.length, samples, flagged };
}
// 🔤 자율 조치: flag된 1글자이름 카페의 '명시적 다른 카페명' 후기를 결정론으로 자동 제거·재합성(durable).
//   보수: 강한 자기마커 든 후기는 보존(명시적 타카페명 없거나 자기이름 있으면 미제거). 런당 12곳·deadline 시간예산.
async function healWeakNamePollution(flagged: WeakFlag[], deadline: number): Promise<{ fixed: number; dropped: number; unpub: number; names: string[]; skipped?: number; noEffect?: number; frozen?: number }> {
  const { collectAndSynthesize } = await import("@/lib/collectOrchestrator");
  const { applyDecisions } = await import("@/lib/synthStore");
  const { cleanCafeName } = await import("@/lib/reviewQuality");
  const { invalidateCafeCaches } = await import("@/lib/cafeCacheInvalidate");
  const known = new Set<string>();
  for (const r of (await sql`SELECT name FROM cafes WHERE published`) as any[]) { const n = canonName(cleanCafeName(r.name)); if (n.length >= 2) known.add(n); }
  let fixed = 0, dropped = 0, unpub = 0; const names: string[] = [];
  // 🩺 하네스 L4 — 반복 무효로 **동결된 대상은 시도조차 하지 않는다**(헛돎 원천 차단).
  let skipped = 0, noEffect = 0, frozenNew = 0;
  const HJOB = "sentinel.weak-name";
  const frozenSet = await frozenTargets(HJOB);
  // 🩺 2026-08-15 수렴 버그 수리: 예전엔 `flagged.slice(0,12)`로 **먼저 자르고** 그 안에서 동결분을 걸렀다.
  //   동결 대상이 목록 앞쪽에 몰리면 12개 슬롯을 전부 스킵으로 소진해, 처리 가능한 항목이 **영원히 차례가 안 왔다**
  //   (실측: 지점오염 '잔여 5(다음런)'이 여러 런 동안 그대로 · 자동정리 0 · 하네스가 정체 3회로 검출).
  //   → 동결분을 **자르기 전에** 제외해 배치 12칸이 전부 실제 처리 대상으로 채워지게 한다.
  const actionable = flagged.filter((x: any) => !frozenSet.has(Number(x.id)));
  skipped += flagged.length - actionable.length;
  for (const f of actionable.slice(0, 12)) {
    if (Date.now() > deadline) break;
    // 🎫 하네스 L2 — 다른 잡(autoCorrect·resynth·다른 힐러)이 같은 카페를 만지는 중이면 양보한다.
    if (!(await acquireLease(HJOB, Number(f.id), 180))) { skipped++; continue; }
    try {
      tickBlob(); const c = (await sql`SELECT name, area, dong, address, published, raw_reviews, judge_decisions FROM cafes WHERE id=${f.id}`)[0] as any;
      if (!c) continue;
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const cn = cleanCafeName(c.name); const selfN = cn.replace(/[\s·・.]/g, "").toLowerCase();
      const markers = weakSelfMarkers(cn);
      const raw = Array.isArray(c.raw_reviews) ? c.raw_reviews : [];
      const g = raw.filter((r: any) => r.source === "google").map((r: any) => ({ text: r.text, time: r.time }));
      const mkS = (s: string) => raw.filter((r: any) => r.source === s).map((r: any) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
      const sources: any[] = []; if (g.length) sources.push({ source: "google", texts: g });
      const b = mkS("blog"); if (b.length) sources.push({ source: "blog", texts: b });
      const y = mkS("youtube"); if (y.length) sources.push({ source: "youtube", texts: y });
      const decs = c.judge_decisions && typeof c.judge_decisions === "object" ? c.judge_decisions : {};
      const r = collectAndSynthesize(cn, at, sources, { decisions: decs, address: c.address || "" });
      const dec: Record<string, boolean> = {}; let drop = 0;
      for (const it of (r.auditItems || [])) {
        // ♻️ 무한 반복 차단(2026-08-08, CEO "왜 자꾸 헛도는 루프를 도냐"): auditItems는 **규칙 기준**으로
        //   채워져서 이미 decisions=false로 제거 결정된 항목도 계속 들어온다. 가드가 없으면 힐러가 매 런마다
        //   같은 항목을 또 dec에 담아 applyDecisions를 호출 → raw_reviews(큰 blob) 재로드 + 재합성 +
        //   `DELETE FROM search_cache`까지 하루 4회씩 헛돌았다(실측: 6회 연속 "치유 10/감지 22" 동일).
        if (decs[it.key] === false) continue;
        const body = (it.title || "") + " " + (it.body || ""); const bn = body.replace(/\s/g, "").toLowerCase();
        const o = weakOtherCafe(body, selfN);
        if (o && xrefKnown(o, known, selfN) && !markers.some((mk) => bn.includes(mk))) { dec[it.key] = false; drop++; }
      }
      // 🩺 하네스 L4 완성(2026-08-08 실전검증서 발견): 가드가 앞단에서 다 걸러 `drop=0`이 되면
      //   applyDecisions도 noteAttempt도 호출되지 않아 **수렴 계약이 발동하지 못한다** → 감지 22건이
      //   영원히 남고 아무도 사람에게 안 넘긴다. "제거할 게 없다"도 **무효(효과 없음)** 로 기록해야
      //   2회 후 동결되고 워치리스트로 승격된다.
      if (drop === 0) { noEffect++; if ((await noteAttempt(HJOB, Number(f.id), false, { note: "제거 대상 없음(이미 결정 완료 — 자동으로는 더 못 고침)" })).frozen) frozenNew++; continue; }
      // 🩺 하네스 L4 — 집행 전후 '탐지기가 보는 소스'(synth_reviews)의 해시를 비교해 **효과를 실측**한다.
      //   md5는 SQL 안에서 계산돼 32자만 오간다(큰 컬럼 전송 없음). 효과 없으면 fixed로 세지 않는다.
      const _h0 = await shownHash(Number(f.id));
      noteWrite("cafes.judge_decisions"); noteWrite("cafes.synth_reviews"); noteWrite("cafes.synth_reviews_all");
      const res = await applyDecisions({ id: f.id, name: c.name, area: c.area }, dec);
      const _eff = (await shownHash(Number(f.id))) !== _h0;
      if ((await noteAttempt(HJOB, Number(f.id), _eff, { note: `drop=${drop}` })).frozen) frozenNew++;
      if (!_eff) { noEffect++; continue; }   // 허위 '고쳤다' 차단 — 다음 런은 위 frozenSet이 막는다
      fixed++; dropped += drop; if (res?.published === false && c.published) unpub++;
      if (names.length < 8) names.push(`${cn}(-${drop})`);
      await invalidateCafeCaches([f.id]).catch(() => {});
    } catch { /* 개별 실패는 건너뜀(다음 런이 이어서 처리) */ }
    finally { await releaseLease(HJOB, Number(f.id)).catch(() => {}); }
  }
  if (fixed > 0) // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 한 곳 비공개는 동네→구 지도와 무관한데,
  //   같이 지우면 다음 검색이 전수 스캔(6,565페이지)으로 지도를 다시 만든다(불필요한 비용).
  await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
  return { fixed, dropped, unpub, names, skipped, noEffect, frozen: frozenNew };
}

// 🏢 비카페 업종 오염 스캔·자율조치(CEO 지시 2026-07-14, name_mismatch 60곳 전수검토 후속): 이름 토큰이 겹치는 다른
//   '업종'(부동산 매매·마사지/피부관리샵·예물시계·연탄구이 식당·구인공고)이 흡수돼 verified 노출된다(비비·테라피·카페인24
//   ·남동스카이라운지 등). xref(다른 '카페' 대조)로는 못 잡는다 — 오염원이 카페가 아니라 DB에 없기 때문. → 전용 탐지기.
//   판정: 노출후기가 ①강한 비카페 업종어 담고 ②카페명 마커(attrMarkers) 없으면 오염. ⚠️보수적 마커만(자동차검사·브런치
//   정식 등 정상 카페가 근처 업종어 쓰는 케이스 배제 — YELLOW75=자동차검사소 안 카페라 '자동차검사'는 넣지 않음).
const NONCAFE_STRONG = /(상가\s*매매|매매\s*합니다|매매합니다|탑층\s*상가|상업지역\s*탑층|추천\s*매물|오피스텔\s*분양|아파트\s*분양|분양\s*문의|전신\s*관리|전신관리|피부\s*관리|피부관리|마사지\s*(?:샵|숍|관리|예약|전문|테라피)|태국\s*마사지|스웨디시|플라즈마토닝|왁싱\s*(?:샵|숍|전문|예약)?|반영구\s*(?:화장|메이크업|눈썹|아이라인|시술|샵)|눈썹\s*문신|예물\s*시계|무브먼트\s*시착|시착\s*후기|담당\s*업무|지원\s*자격|아르바이트\s*모집|직원\s*모집|채용\s*공고|시급\s*[0-9])/;
// 🍽️ 식당/음식점 딸림(2026-08-02, 강화 감사): 카페 리뷰에 다른 '식사 전문점'(짬뽕·비빔밥·횟집·국밥·보쌈…) 후기가 섞인 경우.
//   메뉴어는 카페 리뷰에도 부수 등장하므로 '카페 신호(커피·디저트·베이커리…)가 전혀 없는' 문장만 오염으로 판정(정상 카페후기 오제거 방지).
const RESTAURANT_MEAL = /짬뽕|순두부|젓국|밴댕이|칼국수|백반|한정식|산채비빔밥|비빔밥|국밥|짜장면|탕수육|분식|소세지|소시지|떡볶이|순대국|족발|보쌈|곱창|막창|삼겹살|장어구이|횟집|회덮밥|물회|매운탕|감자탕|아구찜|해물탕|닭갈비|추어탕|설렁탕/;
const CAFE_SIGNAL_Q = /커피|카페|디저트|라떼|라테|아메리카노|에스프레소|음료|케이크|스콘|브런치|베이글|빙수|마카롱|와플|찻집|티룸|말차|녹차|에이드|스무디|아인슈페너|드립|원두|베이커리|빵/;
function bizPollutionHit(text: string): string | null {
  const m = NONCAFE_STRONG.exec(text); if (m) return m[0];
  if (RESTAURANT_MEAL.test(text) && !CAFE_SIGNAL_Q.test(text)) { const mm = text.match(RESTAURANT_MEAL); return mm ? mm[0] : "식당"; }
  return null;
}
type NcbFlag = { id: number; name: string; area: string; bad: number; shown: number; hit: string };
async function scanNonCafeBizPollution(): Promise<{ count: number; samples: string[]; flagged: NcbFlag[] }> {
  const t0 = Date.now(); let lo = 0; let truncated = false; const flagged: NcbFlag[] = [];
  for (let guard = 0; guard < 80; guard++) {
    if (Date.now() - t0 > 60000) { truncated = true; break; } // 60s컷(자동조치 예산 확보)
    const rows = (await sql`SELECT id, name, area, dong, synth_reviews FROM cafes
      WHERE published AND synth_reviews IS NOT NULL AND jsonb_array_length(synth_reviews) >= 2 AND id > ${lo}
      ORDER BY id LIMIT 500`) as any[];
    if (!rows.length) break; lo = rows[rows.length - 1].id;
    for (const c of rows) {
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const mk = attrMarkers(c.name, at);
      let bad = 0; let hit = "";
      for (const r of (c.synth_reviews || [])) {
        const q = (r.quote || "") as string; const qn = q.replace(/\s/g, "").toLowerCase();
        const h = bizPollutionHit(q);
        if (h && !mk.some((x) => qn.includes(x))) { bad++; if (!hit) hit = h; }
      }
      if (bad >= 2) flagged.push({ id: c.id, name: c.name, area: c.area, bad, shown: (c.synth_reviews || []).length, hit });
    }
  }
  flagged.sort((a, b) => b.bad - a.bad);
  const samples = flagged.slice(0, 40).map((f) => `#${f.id} ${f.name}[${f.area}] 비카페업종 ${f.bad}/${f.shown}(«${f.hit}»)`);
  if (truncated) samples.push("⚠️(시간컷—다음 실행이 이어서 스캔)");
  return { count: flagged.length, samples, flagged };
}
// 🏢 자율 조치: flag된 카페의 비카페 업종 오염후기(NONCAFE_STRONG && 카페명마커 없음)를 결정론 자동 제거·재합성.
//   보수: 카페명 마커 든 후기는 보존(업종어 있어도). 런당 12곳·deadline 시간예산·멱등.
async function healNonCafeBizPollution(flagged: NcbFlag[], deadline: number): Promise<{ fixed: number; dropped: number; unpub: number; names: string[]; skipped?: number; noEffect?: number; frozen?: number }> {
  const { collectAndSynthesize } = await import("@/lib/collectOrchestrator");
  const { applyDecisions } = await import("@/lib/synthStore");
  const { cleanCafeName } = await import("@/lib/reviewQuality");
  const { invalidateCafeCaches } = await import("@/lib/cafeCacheInvalidate");
  let fixed = 0, dropped = 0, unpub = 0; const names: string[] = [];
  // 🩺 하네스 L4 — 반복 무효로 **동결된 대상은 시도조차 하지 않는다**(헛돎 원천 차단).
  let skipped = 0, noEffect = 0, frozenNew = 0;
  const HJOB = "sentinel.noncafe-biz";
  const frozenSet = await frozenTargets(HJOB);
  // 🩺 2026-08-15 수렴 버그 수리: 예전엔 `flagged.slice(0,12)`로 **먼저 자르고** 그 안에서 동결분을 걸렀다.
  //   동결 대상이 목록 앞쪽에 몰리면 12개 슬롯을 전부 스킵으로 소진해, 처리 가능한 항목이 **영원히 차례가 안 왔다**
  //   (실측: 지점오염 '잔여 5(다음런)'이 여러 런 동안 그대로 · 자동정리 0 · 하네스가 정체 3회로 검출).
  //   → 동결분을 **자르기 전에** 제외해 배치 12칸이 전부 실제 처리 대상으로 채워지게 한다.
  const actionable = flagged.filter((x: any) => !frozenSet.has(Number(x.id)));
  skipped += flagged.length - actionable.length;
  for (const f of actionable.slice(0, 12)) {
    if (Date.now() > deadline) break;
    // 🎫 하네스 L2 — 다른 잡(autoCorrect·resynth·다른 힐러)이 같은 카페를 만지는 중이면 양보한다.
    if (!(await acquireLease(HJOB, Number(f.id), 180))) { skipped++; continue; }
    try {
      tickBlob(); const c = (await sql`SELECT name, area, dong, address, published, raw_reviews, judge_decisions FROM cafes WHERE id=${f.id}`)[0] as any;
      if (!c) continue;
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const mk = attrMarkers(c.name, at);
      const raw = Array.isArray(c.raw_reviews) ? c.raw_reviews : [];
      const g = raw.filter((r: any) => r.source === "google").map((r: any) => ({ text: r.text, time: r.time }));
      const mkS = (s: string) => raw.filter((r: any) => r.source === s).map((r: any) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
      const sources: any[] = []; if (g.length) sources.push({ source: "google", texts: g });
      const b = mkS("blog"); if (b.length) sources.push({ source: "blog", texts: b });
      const y = mkS("youtube"); if (y.length) sources.push({ source: "youtube", texts: y });
      const decs = c.judge_decisions && typeof c.judge_decisions === "object" ? c.judge_decisions : {};
      const r = collectAndSynthesize(cleanCafeName(c.name), at, sources, { decisions: decs, address: c.address || "" });
      const dec: Record<string, boolean> = {}; let drop = 0;
      for (const it of (r.auditItems || [])) {
        // ♻️ 무한 반복 차단(2026-08-08, CEO "왜 자꾸 헛도는 루프를 도냐"): auditItems는 **규칙 기준**으로
        //   채워져서 이미 decisions=false로 제거 결정된 항목도 계속 들어온다. 가드가 없으면 힐러가 매 런마다
        //   같은 항목을 또 dec에 담아 applyDecisions를 호출 → raw_reviews(큰 blob) 재로드 + 재합성 +
        //   `DELETE FROM search_cache`까지 하루 4회씩 헛돌았다(실측: 6회 연속 "치유 10/감지 22" 동일).
        if (decs[it.key] === false) continue;
        const body = (it.title || "") + " " + (it.body || ""); const bn = body.replace(/\s/g, "").toLowerCase();
        if (bizPollutionHit(body) && !mk.some((x) => bn.includes(x))) { dec[it.key] = false; drop++; }
      }
      // 🩺 하네스 L4 완성(2026-08-08 실전검증서 발견): 가드가 앞단에서 다 걸러 `drop=0`이 되면
      //   applyDecisions도 noteAttempt도 호출되지 않아 **수렴 계약이 발동하지 못한다** → 감지 22건이
      //   영원히 남고 아무도 사람에게 안 넘긴다. "제거할 게 없다"도 **무효(효과 없음)** 로 기록해야
      //   2회 후 동결되고 워치리스트로 승격된다.
      if (drop === 0) { noEffect++; if ((await noteAttempt(HJOB, Number(f.id), false, { note: "제거 대상 없음(이미 결정 완료 — 자동으로는 더 못 고침)" })).frozen) frozenNew++; continue; }
      // 🩺 하네스 L4 — 집행 전후 '탐지기가 보는 소스'(synth_reviews)의 해시를 비교해 **효과를 실측**한다.
      //   md5는 SQL 안에서 계산돼 32자만 오간다(큰 컬럼 전송 없음). 효과 없으면 fixed로 세지 않는다.
      const _h0 = await shownHash(Number(f.id));
      noteWrite("cafes.judge_decisions"); noteWrite("cafes.synth_reviews"); noteWrite("cafes.synth_reviews_all");
      const res = await applyDecisions({ id: f.id, name: c.name, area: c.area }, dec);
      const _eff = (await shownHash(Number(f.id))) !== _h0;
      if ((await noteAttempt(HJOB, Number(f.id), _eff, { note: `drop=${drop}` })).frozen) frozenNew++;
      if (!_eff) { noEffect++; continue; }   // 허위 '고쳤다' 차단 — 다음 런은 위 frozenSet이 막는다
      fixed++; dropped += drop; if (res?.published === false && c.published) unpub++;
      if (names.length < 8) names.push(`${cleanCafeName(c.name)}(-${drop})`);
      await invalidateCafeCaches([f.id]).catch(() => {});
    } catch { /* 개별 실패는 건너뜀(다음 런이 이어서 처리) */ }
    finally { await releaseLease(HJOB, Number(f.id)).catch(() => {}); }
  }
  if (fixed > 0) // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 한 곳 비공개는 동네→구 지도와 무관한데,
  //   같이 지우면 다음 검색이 전수 스캔(6,565페이지)으로 지도를 다시 만든다(불필요한 비용).
  await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
  return { fixed, dropped, unpub, names, skipped, noEffect, frozen: frozenNew };
}

// 🏪 프랜차이즈 지점 간 오염 스캔·자율조치(2026-07-17, "프랜차이즈 지점명 전수" 실측 후 상시탐지기화): 같은 브랜드가
//   우리 DB에 여러 지점으로 등록돼 있을 때(테라커피 구월팬더점·시흥목감점 등), 블로그가 자매 지점 얘기를 섞어써서
//   노출 후기가 '다른 지점' 얘기로 오염된다(오늘 실측 17곳 확정). xref보다 더 안전 — 대조 대상이 우리 DB에 실존하는
//   '진짜 다른 지점'이라 오탐 여지가 name_mismatch류보다 훨씬 적다(브랜드명+타지점 접미사 동시등장+자기접미사 부재).
//   브랜드 추출: "OO ..접미사점" 패턴에서 마지막 어절(본점/지점/N호점/1st 등)을 떼어낸 앞부분 = 브랜드키.
const GENERIC_BRAND = new Set(["카페", "커피", "디저트", "베이커리", "카페,디저트", "coffee", "cafe"]);
const BRANCH_SUFFIX_RE = /^(.+?)\s+([가-힣A-Za-z0-9.]{1,14}(?:본점|지점|직영점|가맹점|점|1st|2nd|3rd|호점))$/;
// 접미사(예:"서창점")에서 마커를 떼면 지점 토큰(예:"서창") — 후기 원문은 "서창점"보다 "서창동/서창" 식으로 더 흔히 등장해
// 접미사 완전일치만으로는 놓친다(#499 실증: id16680 용현점에 id15520 서창점 인용문 복제, "서창점" 문자열은 없었음).
const BRANCH_MARKER_RE = /(본점|지점|직영점|가맹점|점|1st|2nd|3rd|호점)$/;
function branchToken(suffix: string): string {
  return suffix.replace(BRANCH_MARKER_RE, "").trim();
}
type FranchiseFlag = { id: number; name: string; area: string; brand: string; ownSuffix: string; ownToken: string; otherSuffixes: string[]; otherTokens: string[]; bad: number; shown: number; hitSuffix: string };
async function scanFranchiseBranchPollution(): Promise<{ count: number; samples: string[]; flagged: FranchiseFlag[] }> {
  // 1단계: 이름만으로 가볍게 브랜드 그룹 구성(전체 카페, id+name만이라 경량)
  const nameRows = (await sql`SELECT id, name FROM cafes WHERE published`) as { id: number; name: string }[];
  const groups = new Map<string, { id: number; name: string; suffix: string; token: string }[]>();
  for (const c of nameRows) {
    const m = c.name.trim().match(BRANCH_SUFFIX_RE);
    if (!m) continue;
    const brand = m[1].trim();
    if (GENERIC_BRAND.has(brand) || brand.length < 2) continue;
    const suffix = m[2].trim();
    if (!groups.has(brand)) groups.set(brand, []);
    groups.get(brand)!.push({ id: c.id, name: c.name, suffix, token: branchToken(suffix) });
  }
  // 2단계: 2개 이상 지점 보유 브랜드에 속한 카페만 synth_reviews로 대조(대상만 선별해 경량 유지)
  const targetIds: number[] = [];
  const meta = new Map<number, { brand: string; suffix: string; token: string; others: string[]; otherTokens: string[] }>();
  for (const [brand, arr] of groups) {
    if (arr.length < 2) continue;
    for (const c of arr) {
      targetIds.push(c.id);
      meta.set(c.id, {
        brand, suffix: c.suffix, token: c.token,
        others: arr.filter((x) => x.id !== c.id).map((x) => x.suffix),
        // 지점 토큰은 2자 미만(본점 등 마커만 떼면 빈 문자열)이면 변별력 없어 제외.
        otherTokens: arr.filter((x) => x.id !== c.id && x.token.length >= 2).map((x) => x.token),
      });
    }
  }
  const flagged: FranchiseFlag[] = [];
  for (let i = 0; i < targetIds.length; i += 200) {
    const chunk = targetIds.slice(i, i + 200);
    const rows = (await sql`SELECT id, name, area, synth_reviews FROM cafes WHERE id = ANY(${chunk}::int[]) AND synth_reviews IS NOT NULL`) as any[];
    for (const c of rows) {
      const info = meta.get(c.id); if (!info) continue;
      let bad = 0; let hitSuffix = "";
      const ownHit = (q: string) => q.includes(info.suffix) || (info.token.length >= 2 && q.includes(info.token));
      for (const r of (c.synth_reviews || [])) {
        const q = (r.quote || "") as string;
        const hit = info.others.find((s) => q.includes(s)) || info.otherTokens.find((t) => q.includes(t));
        if (hit && !ownHit(q)) { bad++; if (!hitSuffix) hitSuffix = hit; }
      }
      if (bad >= 1) flagged.push({ id: c.id, name: c.name, area: c.area, brand: info.brand, ownSuffix: info.suffix, ownToken: info.token, otherSuffixes: info.others, otherTokens: info.otherTokens, bad, shown: (c.synth_reviews || []).length, hitSuffix });
    }
  }
  flagged.sort((a, b) => b.bad - a.bad);
  const samples = flagged.slice(0, 40).map((f) => `#${f.id} ${f.name}[${f.area}] 타지점"${f.hitSuffix}" ${f.bad}/${f.shown}`);
  return { count: flagged.length, samples, flagged };
}
// 🏪 자율 조치: flag된 카페의 raw에서 '브랜드+다른지점접미사' 언급하되 '자기지점접미사' 없는 항목을 결정론 자동 제거·재합성.
//   보수: 자기 지점명 함께 언급되면 보존(다른 지점 안내 정보일 뿐). 런당 최대 12곳·deadline 시간예산·멱등.
async function healFranchiseBranchPollution(flagged: FranchiseFlag[], deadline: number): Promise<{ fixed: number; dropped: number; unpub: number; names: string[]; skipped?: number; noEffect?: number; frozen?: number }> {
  const { collectAndSynthesize, toQuote } = await import("@/lib/collectOrchestrator");
  const { applyDecisions } = await import("@/lib/synthStore");
  const { cleanCafeName } = await import("@/lib/reviewQuality");
  const { invalidateCafeCaches } = await import("@/lib/cafeCacheInvalidate");
  let fixed = 0, dropped = 0, unpub = 0; const names: string[] = [];
  // 🩺 하네스 L4 — 반복 무효로 **동결된 대상은 시도조차 하지 않는다**(헛돎 원천 차단).
  let skipped = 0, noEffect = 0, frozenNew = 0;
  const HJOB = "sentinel.franchise-branch";
  const frozenSet = await frozenTargets(HJOB);
  // 🩺 2026-08-15 수렴 버그 수리: 예전엔 `flagged.slice(0,12)`로 **먼저 자르고** 그 안에서 동결분을 걸렀다.
  //   동결 대상이 목록 앞쪽에 몰리면 12개 슬롯을 전부 스킵으로 소진해, 처리 가능한 항목이 **영원히 차례가 안 왔다**
  //   (실측: 지점오염 '잔여 5(다음런)'이 여러 런 동안 그대로 · 자동정리 0 · 하네스가 정체 3회로 검출).
  //   → 동결분을 **자르기 전에** 제외해 배치 12칸이 전부 실제 처리 대상으로 채워지게 한다.
  const actionable = flagged.filter((x: any) => !frozenSet.has(Number(x.id)));
  skipped += flagged.length - actionable.length;
  for (const f of actionable.slice(0, 12)) {
    if (Date.now() > deadline) break;
    // 🎫 하네스 L2 — 다른 잡(autoCorrect·resynth·다른 힐러)이 같은 카페를 만지는 중이면 양보한다.
    if (!(await acquireLease(HJOB, Number(f.id), 180))) { skipped++; continue; }
    try {
      tickBlob(); const c = (await sql`SELECT name, area, dong, address, published, raw_reviews, judge_decisions FROM cafes WHERE id=${f.id}`)[0] as any;
      if (!c) continue;
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const raw = Array.isArray(c.raw_reviews) ? c.raw_reviews : [];
      const g = raw.filter((r: any) => r.source === "google").map((r: any) => ({ text: r.text, time: r.time }));
      const mkS = (s: string) => raw.filter((r: any) => r.source === s).map((r: any) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
      const sources: any[] = []; if (g.length) sources.push({ source: "google", texts: g });
      const b = mkS("blog"); if (b.length) sources.push({ source: "blog", texts: b });
      const y = mkS("youtube"); if (y.length) sources.push({ source: "youtube", texts: y });
      const decs = c.judge_decisions && typeof c.judge_decisions === "object" ? c.judge_decisions : {};
      const cleanName = cleanCafeName(c.name);
      const r = collectAndSynthesize(cleanName, at, sources, { decisions: decs, address: c.address || "" });
      const dec: Record<string, boolean> = {}; let drop = 0;
      for (const it of (r.auditItems || [])) {
        // ♻️ 무한 반복 차단(2026-08-08, CEO "왜 자꾸 헛도는 루프를 도냐"): auditItems는 **규칙 기준**으로
        //   채워져서 이미 decisions=false로 제거 결정된 항목도 계속 들어온다. 가드가 없으면 힐러가 매 런마다
        //   같은 항목을 또 dec에 담아 applyDecisions를 호출 → raw_reviews(큰 blob) 재로드 + 재합성 +
        //   `DELETE FROM search_cache`까지 하루 4회씩 헛돌았다(실측: 6회 연속 "치유 10/감지 22" 동일).
        if (decs[it.key] === false) continue;
        const body = (it.title || "") + " " + (it.body || "");
        // 🩺 granularity 갭 수정(decisions#659, 08-11): 보존 여부는 **raw 항목 전체**가 아니라 실제로
        //   화면에 노출될 합성 quote(toQuote — 표시 로직과 완전히 동일 함수)를 기준으로 판정한다. 여러
        //   지점을 나열하는 라운드업 포스트는 본문 어딘가에 자기 지점 접미사가 있어도, 실제 대표 인용문은
        //   다른 지점 얘기만 뽑힐 수 있다(id3782·11906 실측) — scanFranchiseBranchPollution의 탐지 granularity
        //   (synth_reviews.quote 대조)와 맞춘다.
        // 🩺 2차 granularity 갭 수정(#683, 08-14): 표시 quote는 storeResult의 evidence.push가
        //   toQuote(t.**text**, name)으로 뽑는데(collectOrchestrator.ts), 위 줄은 desc 기반인 it.body를
        //   써서 다른 문장을 골랐다 — text에 제목이 붙어있으면 문장 분리·점수가 달라져(동점 tie-break로
        //   먼저 오는 문장이 이김) desc판 quote엔 자기지점이 있어도 text판(=실제 화면) quote엔 없는 경우가
        //   생긴다(id7840 실증: desc quote="…오산시청점에 본점이…"(보존) vs 실제 표시 quote="…한국병원점…"(오염
        //   그대로)). it.text(원문)를 최우선으로 써서 재감사 quote를 표시 quote와 완전히 일치시킨다.
        const quote = toQuote(it.text || it.body || it.title || "", cleanName);
        const ownInQuote = quote.includes(f.ownSuffix) || (f.ownToken.length >= 2 && quote.includes(f.ownToken));
        if (ownInQuote) continue; // 표시될 인용문 자체가 자기 지점 얘기 → 보존
        if (f.otherSuffixes.some((s) => body.includes(s)) || f.otherTokens.some((t) => body.includes(t))) { dec[it.key] = false; drop++; }
      }
      // 🩺 하네스 L4 완성(2026-08-08 실전검증서 발견): 가드가 앞단에서 다 걸러 `drop=0`이 되면
      //   applyDecisions도 noteAttempt도 호출되지 않아 **수렴 계약이 발동하지 못한다** → 감지 22건이
      //   영원히 남고 아무도 사람에게 안 넘긴다. "제거할 게 없다"도 **무효(효과 없음)** 로 기록해야
      //   2회 후 동결되고 워치리스트로 승격된다.
      if (drop === 0) { noEffect++; if ((await noteAttempt(HJOB, Number(f.id), false, { note: "제거 대상 없음(이미 결정 완료 — 자동으로는 더 못 고침)" })).frozen) frozenNew++; continue; }
      // 🩺 하네스 L4 — 집행 전후 '탐지기가 보는 소스'(synth_reviews)의 해시를 비교해 **효과를 실측**한다.
      //   md5는 SQL 안에서 계산돼 32자만 오간다(큰 컬럼 전송 없음). 효과 없으면 fixed로 세지 않는다.
      const _h0 = await shownHash(Number(f.id));
      noteWrite("cafes.judge_decisions"); noteWrite("cafes.synth_reviews"); noteWrite("cafes.synth_reviews_all");
      const res = await applyDecisions({ id: f.id, name: c.name, area: c.area }, dec);
      const _eff = (await shownHash(Number(f.id))) !== _h0;
      if ((await noteAttempt(HJOB, Number(f.id), _eff, { note: `drop=${drop}` })).frozen) frozenNew++;
      if (!_eff) { noEffect++; continue; }   // 허위 '고쳤다' 차단 — 다음 런은 위 frozenSet이 막는다
      fixed++; dropped += drop; if (res?.published === false && c.published) unpub++;
      if (names.length < 8) names.push(`${cleanCafeName(c.name)}(-${drop})`);
      await invalidateCafeCaches([f.id]).catch(() => {});
    } catch { /* 개별 실패는 건너뜀(다음 런이 이어서 처리) */ }
    finally { await releaseLease(HJOB, Number(f.id)).catch(() => {}); }
  }
  if (fixed > 0) // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 한 곳 비공개는 동네→구 지도와 무관한데,
  //   같이 지우면 다음 검색이 전수 스캔(6,565페이지)으로 지도를 다시 만든다(불필요한 비용).
  await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
  return { fixed, dropped, unpub, names, skipped, noEffect, frozen: frozenNew };
}

// 🔠 흔한단어/동음이의어 이름 오염 스캔·자율조치(2026-07-17, "다른 오염도 상시감시" 후속): 카페명이 시계용어(문페이즈)·
//   골프용품(로시)·음악장르(사이키델릭)·허브/꽃이름(로즈마리·스위트피)·흔한메뉴명(딜라이트)·묘사구문(나무그늘·빨간벽돌)·
//   극단흔한단어(빛·밤)·커피품종명(코나)·연재물용어(연재) 등과 겹치면, 전혀 무관한 업종·주제 콘텐츠가 대량 흡수된다.
//   name_mismatch(hasStrong 3자+만 대상)·weak_name(정확히 1글자만)이 의도적으로 비켜가는 사각지대 — 사전은
//   identity.weak_token(criteria_lists, 무배포 편집 단일출처)을 그대로 재사용해 "이 단어가 위험군"인지 판단한다.
//   판정: 노출후기가 위험토큰을 담았는데 ①카페 전체이름 원문 또는 ②등록주소 도로명+번지(주소앵커) 둘 다 없으면 오염.
//   ⚠️ 문맥어(카페/커피) 요구는 오늘 실측상 너무 느슨해 안 씀(무관 콘텐츠도 카페 근처라 카페어를 흔히 동반) — 주소앵커만 신뢰.
function addressAnchor(addr: string): string {
  const m = (addr || "").match(/[가-힣0-9]+(?:로|길)\s*\d+(?:-\d+)?/);
  return m ? m[0].replace(/\s+/g, "") : "";
}
function hasStrongAnchor(text: string, nameNoSpace: string, anchor: string): boolean {
  const t = (text || "").replace(/\s+/g, "");
  return (nameNoSpace.length >= 2 && t.includes(nameNoSpace)) || (!!anchor && t.includes(anchor));
}
type GenericFlag = { id: number; name: string; area: string; token: string; bad: number; shown: number };
async function scanGenericTermPollution(): Promise<{ count: number; samples: string[]; flagged: GenericFlag[] }> {
  await loadCriteriaLists();
  const weakSet = getListSetSync("identity.weak_token");
  const t0 = Date.now(); let lo = 0; let truncated = false; const flagged: GenericFlag[] = [];
  for (let guard = 0; guard < 80; guard++) {
    if (Date.now() - t0 > 30000) { truncated = true; break; } // 값싼 스캔(대부분 토큰체크서 즉시 skip) — 30s컷
    const rows = (await sql`SELECT id, name, area, dong, address, synth_reviews FROM cafes
      WHERE published AND synth_reviews IS NOT NULL AND jsonb_array_length(synth_reviews) >= 2 AND id > ${lo}
      ORDER BY id LIMIT 500`) as any[];
    if (!rows.length) break; lo = rows[rows.length - 1].id;
    for (const c of rows) {
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const toks = coreTokens(c.name, at);
      const hitTok = toks.find((tk) => weakSet.has(tk));
      if (!hitTok) continue;
      const nameNoSpace = (c.name || "").replace(/\s+/g, "");
      const anchor = addressAnchor(c.address || "");
      let bad = 0;
      for (const r of (c.synth_reviews || [])) {
        const q = (r.quote || "") as string;
        if (!q.includes(hitTok)) continue;
        if (!hasStrongAnchor(q, nameNoSpace, anchor)) bad++;
      }
      if (bad >= 1) flagged.push({ id: c.id, name: c.name, area: c.area, token: hitTok, bad, shown: (c.synth_reviews || []).length });
    }
  }
  flagged.sort((a, b) => b.bad - a.bad);
  const samples = flagged.slice(0, 40).map((f) => `#${f.id} ${f.name}[${f.area}] 흔한단어"${f.token}" ${f.bad}/${f.shown}`);
  if (truncated) samples.push("⚠️(시간컷—다음 실행이 이어서 스캔)");
  return { count: flagged.length, samples, flagged };
}

// 🗣️ 문구형 이름 오염 탐지(2026-07-19, CEO "바닷가에서카페 리뷰 엉망") — 신규 재발 조기경보.
//   근본유형: 카페명 식별토큰이 3자+라 강한토큰으로 오인되지만 실은 '흔한 문구'(조사·어미 종결 = 부사구/서술구).
//   그 문구가 지역·업종 흔한말이면(바닷가에서·수가에서·좋아서하는…) 남의 글이 nameInBody로 흡수된다.
//   name_mismatch(hasStrong 3자+ 요구)·weak_name(1글자만)·generic_term(이미 weak_token 등재분만)이 전부
//   비켜가는 사각 — 아직 사전에 없는 신규 문구이름을 조사종결 형태로 잡아 워치리스트 경보한다.
//   ⚠️ 탐지·경보 전용(자동삭제 없음): 문구판별은 휴리스틱이라 FP위험 → 사람이 확인 후 identity.weak_token에
//      추가하면 그때부터 scanGenericTermPollution/healGenericTermPollution이 자동 치유(이중 안전).
const PHRASE_TAIL = /(에서|으로|에게|한테|까지|부터|보다|처럼|에는|이라|라는|하는|다가|고서|면서|든지|거나|에서는|집에서)$/;
type PhraseFlag = { id: number; name: string; area: string; token: string; bad: number; shown: number };
async function scanPhraseNamePollution(): Promise<{ count: number; samples: string[]; flagged: PhraseFlag[] }> {
  await loadCriteriaLists();
  const weakSet = getListSetSync("identity.weak_token");
  const t0 = Date.now(); let lo = 0; let truncated = false; const flagged: PhraseFlag[] = [];
  for (let guard = 0; guard < 80; guard++) {
    if (Date.now() - t0 > 30000) { truncated = true; break; } // 값싼 스캔 — 30s컷
    const rows = (await sql`SELECT id, name, area, dong, address, synth_reviews FROM cafes
      WHERE published AND synth_reviews IS NOT NULL AND jsonb_array_length(synth_reviews) >= 4 AND id > ${lo}
      ORDER BY id LIMIT 500`) as any[];
    if (!rows.length) break; lo = rows[rows.length - 1].id;
    for (const c of rows) {
      // 지점표식(○○점) 이름은 브랜드가 확립된 프랜차이즈 지점 → 문구오염 대상 아님(지점오염은 franchise_branch 담당).
      //   실측 FP: '누군가에게 거북섬점'(id4399)은 브랜드 '누군가에게'가 -에게 종결이라 문구로 오인되나 77/77 진짜후기.
      //   진짜 문구오염(바닷가에서카페·동네까페 수가에서)은 지점표식이 없어 그대로 잡힌다.
      if (/[가-힣0-9]{2,}점$/.test((c.name || "").trim())) continue;
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const toks = coreTokens(c.name, at);
      // 조사·어미로 끝나는 3자+ 토큰 = 문구형(고유명사 아님). 이미 weak_token 등재분은 generic_term이 담당 → 제외.
      const phraseTok = toks.find((tk) => tk.length >= 3 && PHRASE_TAIL.test(tk) && !weakSet.has(tk));
      if (!phraseTok) continue;
      const nameNoSpace = (c.name || "").replace(/\s+/g, "");
      const anchor = addressAnchor(c.address || "");
      let bad = 0;
      for (const r of (c.synth_reviews || [])) {
        const q = (r.quote || "") as string;
        if (!q.includes(phraseTok)) continue;
        if (!hasStrongAnchor(q, nameNoSpace, anchor)) bad++;
      }
      if (bad >= 2) flagged.push({ id: c.id, name: c.name, area: c.area, token: phraseTok, bad, shown: (c.synth_reviews || []).length });
    }
  }
  flagged.sort((a, b) => b.bad - a.bad);
  const samples = flagged.slice(0, 40).map((f) => `#${f.id} ${f.name}[${f.area}] 문구토큰"${f.token}" ${f.bad}/${f.shown}`);
  if (truncated) samples.push("⚠️(시간컷—다음 실행이 이어서 스캔)");
  return { count: flagged.length, samples, flagged };
}
// 🔠 자율 조치: flag된 카페의 raw에서 위험토큰을 담되 전체이름/주소앵커 둘 다 없는 항목을 결정론 자동 제거·재합성.
//   보수: 둘 중 하나라도 있으면 보존. 런당 최대 12곳·deadline 시간예산·멱등.
async function healGenericTermPollution(flagged: GenericFlag[], deadline: number): Promise<{ fixed: number; dropped: number; unpub: number; names: string[]; skipped?: number; noEffect?: number; frozen?: number }> {
  const { collectAndSynthesize } = await import("@/lib/collectOrchestrator");
  const { applyDecisions } = await import("@/lib/synthStore");
  const { cleanCafeName } = await import("@/lib/reviewQuality");
  const { invalidateCafeCaches } = await import("@/lib/cafeCacheInvalidate");
  let fixed = 0, dropped = 0, unpub = 0; const names: string[] = [];
  // 🩺 하네스 L4 — 반복 무효로 **동결된 대상은 시도조차 하지 않는다**(헛돎 원천 차단).
  let skipped = 0, noEffect = 0, frozenNew = 0;
  const HJOB = "sentinel.generic-term";
  const frozenSet = await frozenTargets(HJOB);
  // 🩺 2026-08-15 수렴 버그 수리: 예전엔 `flagged.slice(0,12)`로 **먼저 자르고** 그 안에서 동결분을 걸렀다.
  //   동결 대상이 목록 앞쪽에 몰리면 12개 슬롯을 전부 스킵으로 소진해, 처리 가능한 항목이 **영원히 차례가 안 왔다**
  //   (실측: 지점오염 '잔여 5(다음런)'이 여러 런 동안 그대로 · 자동정리 0 · 하네스가 정체 3회로 검출).
  //   → 동결분을 **자르기 전에** 제외해 배치 12칸이 전부 실제 처리 대상으로 채워지게 한다.
  const actionable = flagged.filter((x: any) => !frozenSet.has(Number(x.id)));
  skipped += flagged.length - actionable.length;
  for (const f of actionable.slice(0, 12)) {
    if (Date.now() > deadline) break;
    // 🎫 하네스 L2 — 다른 잡(autoCorrect·resynth·다른 힐러)이 같은 카페를 만지는 중이면 양보한다.
    if (!(await acquireLease(HJOB, Number(f.id), 180))) { skipped++; continue; }
    try {
      tickBlob(); const c = (await sql`SELECT name, area, dong, address, published, raw_reviews, judge_decisions FROM cafes WHERE id=${f.id}`)[0] as any;
      if (!c) continue;
      const at = [c.area, c.dong].filter(Boolean) as string[];
      const nameNoSpace = (c.name || "").replace(/\s+/g, "");
      const anchor = addressAnchor(c.address || "");
      const raw = Array.isArray(c.raw_reviews) ? c.raw_reviews : [];
      const g = raw.filter((r: any) => r.source === "google").map((r: any) => ({ text: r.text, time: r.time }));
      const mkS = (s: string) => raw.filter((r: any) => r.source === s).map((r: any) => ({ text: r.text, title: r.title, desc: r.desc, time: r.time, link: r.link, date: r.date, source: r.srcName }));
      const sources: any[] = []; if (g.length) sources.push({ source: "google", texts: g });
      const b = mkS("blog"); if (b.length) sources.push({ source: "blog", texts: b });
      const y = mkS("youtube"); if (y.length) sources.push({ source: "youtube", texts: y });
      const decs = c.judge_decisions && typeof c.judge_decisions === "object" ? c.judge_decisions : {};
      const r = collectAndSynthesize(cleanCafeName(c.name), at, sources, { decisions: decs, address: c.address || "" });
      const dec: Record<string, boolean> = {}; let drop = 0;
      for (const it of (r.auditItems || [])) {
        // ♻️ 무한 반복 차단(2026-08-08, CEO "왜 자꾸 헛도는 루프를 도냐"): auditItems는 **규칙 기준**으로
        //   채워져서 이미 decisions=false로 제거 결정된 항목도 계속 들어온다. 가드가 없으면 힐러가 매 런마다
        //   같은 항목을 또 dec에 담아 applyDecisions를 호출 → raw_reviews(큰 blob) 재로드 + 재합성 +
        //   `DELETE FROM search_cache`까지 하루 4회씩 헛돌았다(실측: 6회 연속 "치유 10/감지 22" 동일).
        if (decs[it.key] === false) continue;
        const body = (it.title || "") + " " + (it.body || "");
        if (!body.includes(f.token)) continue;
        if (!hasStrongAnchor(body, nameNoSpace, anchor)) { dec[it.key] = false; drop++; }
      }
      // 🩺 하네스 L4 완성(2026-08-08 실전검증서 발견): 가드가 앞단에서 다 걸러 `drop=0`이 되면
      //   applyDecisions도 noteAttempt도 호출되지 않아 **수렴 계약이 발동하지 못한다** → 감지 22건이
      //   영원히 남고 아무도 사람에게 안 넘긴다. "제거할 게 없다"도 **무효(효과 없음)** 로 기록해야
      //   2회 후 동결되고 워치리스트로 승격된다.
      if (drop === 0) { noEffect++; if ((await noteAttempt(HJOB, Number(f.id), false, { note: "제거 대상 없음(이미 결정 완료 — 자동으로는 더 못 고침)" })).frozen) frozenNew++; continue; }
      // 🩺 하네스 L4 — 집행 전후 '탐지기가 보는 소스'(synth_reviews)의 해시를 비교해 **효과를 실측**한다.
      //   md5는 SQL 안에서 계산돼 32자만 오간다(큰 컬럼 전송 없음). 효과 없으면 fixed로 세지 않는다.
      const _h0 = await shownHash(Number(f.id));
      noteWrite("cafes.judge_decisions"); noteWrite("cafes.synth_reviews"); noteWrite("cafes.synth_reviews_all");
      const res = await applyDecisions({ id: f.id, name: c.name, area: c.area }, dec);
      const _eff = (await shownHash(Number(f.id))) !== _h0;
      if ((await noteAttempt(HJOB, Number(f.id), _eff, { note: `drop=${drop}` })).frozen) frozenNew++;
      if (!_eff) { noEffect++; continue; }   // 허위 '고쳤다' 차단 — 다음 런은 위 frozenSet이 막는다
      fixed++; dropped += drop; if (res?.published === false && c.published) unpub++;
      if (names.length < 8) names.push(`${cleanCafeName(c.name)}(-${drop})`);
      await invalidateCafeCaches([f.id]).catch(() => {});
    } catch { /* 개별 실패는 건너뜀(다음 런이 이어서 처리) */ }
    finally { await releaseLease(HJOB, Number(f.id)).catch(() => {}); }
  }
  if (fixed > 0) // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 한 곳 비공개는 동네→구 지도와 무관한데,
  //   같이 지우면 다음 검색이 전수 스캔(6,565페이지)으로 지도를 다시 만든다(불필요한 비용).
  await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
  return { fixed, dropped, unpub, names, skipped, noEffect, frozen: frozenNew };
}

// 🛡️ 데이터 정합성 센티넬 — 신뢰/해자 파수꾼. "사장님이 버그를 발견하기 전에 내가 먼저"(선제 탐지).
//   백로그를 치우는 게 아니라, 깨끗한 상태를 '유지'하고 새 오염이 들어오면 즉시 경보한다.
//   ① 모든 정합성 축을 매일 스캔 ② 안전한 것만 자동 치유(area·박스밖·명백 중복) ③ 나머진 리포트(관제탑).
//   파괴적 자동조치는 '명백한 것'만(보수). 애매하면 보고만.

const authed = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return (!!s && req.headers.get("authorization") === `Bearer ${s}`) || !s;
};

// 명백 중복 = 정규화 이름 동일 + 좌표 ~55m 이내(같은 자리 같은 이름 = 같은 카페). 더 풍부한(후기 많은) 쪽만 남김.
const normName = (s: string) => (s || "").replace(/\s/g, "").replace(/(\d+호?점|본점|지점)$/, "").toLowerCase();
async function healExactDuplicates(): Promise<{ resolved: number; pairs: string[] }> {
  const rows = (await sql`SELECT id, name, lat, lng, COALESCE(synth_count,0) sc FROM cafes WHERE published AND lat IS NOT NULL`) as any[];
  const grp: Record<string, any[]> = {};
  for (const r of rows) {
    const k = normName(r.name) + "@" + Math.round(r.lat * 2000) + "_" + Math.round(r.lng * 2000);
    (grp[k] = grp[k] || []).push(r);
  }
  const pairs: string[] = [];
  let resolved = 0;
  for (const g of Object.values(grp)) {
    if (g.length < 2) continue;
    g.sort((a, b) => b.sc - a.sc || a.id - b.id); // 후기 많은 → 남김
    const keep = g[0];
    for (const loser of g.slice(1)) {
      await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded', updated_at = now() WHERE id = ${loser.id}`.catch(() => {});
      resolved++;
      if (pairs.length < 6) pairs.push(`${loser.name} → ${keep.name}(유지)`);
    }
  }
  return { resolved, pairs };
}

// 🕵️ 인용문 교차오염: 노출 인용문에 '자기와 무관한 다른 카페 고유상호'가 섞인 카페(삼남매 빵집↔경쟁 자연도소금빵 유형).
//   lib/competitorQuote가 흔한업종어·동사·자기명·같은브랜드·공유명을 배제(고정밀). bad>=2 && >=1/3이면 flag.
type CompFlag = { id: number; name: string; area: string; badCount: number; shown: number; other: string };
async function scanCompetitorQuotePollution(): Promise<{ count: number; samples: string[]; flagged: CompFlag[] }> {
  const { cleanCafeName } = await import("@/lib/reviewQuality");
  const { cafeCore, selfMarkers, buildCompetitorIndex, competitorInText } = await import("@/lib/competitorQuote");
  const idx = buildCompetitorIndex((await sql`SELECT id, name FROM cafes WHERE published`) as any[]);
  const t0 = Date.now(); let lo = 0; let truncated = false; const flagged: CompFlag[] = [];
  for (let guard = 0; guard < 80; guard++) {
    if (Date.now() - t0 > 60000) { truncated = true; break; }
    const rows = (await sql`SELECT id, name, area, COALESCE(synth_reviews_all, synth_reviews) AS synth_reviews FROM cafes
      WHERE published AND synth_reviews_all IS NOT NULL AND jsonb_array_length(synth_reviews_all) >= 3 AND id > ${lo}
      ORDER BY id LIMIT 600`) as any[];
    if (!rows.length) break; lo = rows[rows.length - 1].id;
    for (const c of rows) {
      const cn = cleanCafeName(c.name); const sc = cafeCore(cn); if (sc.length < 2) continue;
      const mk = selfMarkers(cn); const qs = (c.synth_reviews || []) as any[];
      let bad = 0; let other = "";
      for (const r of qs) {
        const q = (r.quote || "") as string; const qn = q.replace(/\s/g, "").toLowerCase();
        if (mk.some((x: string) => qn.includes(x))) continue;
        const o = competitorInText(q, sc, c.id, idx);
        if (o) { bad++; if (!other) other = o; }
      }
      if (bad >= 2 && bad * 3 >= qs.length) flagged.push({ id: c.id, name: cn, area: c.area, badCount: bad, shown: qs.length, other });
    }
  }
  flagged.sort((a, b) => b.badCount - a.badCount);
  const samples = flagged.slice(0, 40).map((f) => `#${f.id} ${f.name}[${f.area}] 타상호 ${f.badCount}/${f.shown}(«${f.other}»)`);
  if (truncated) samples.push("⚠️(시간컷—다음 실행이 이어서 스캔)");
  return { count: flagged.length, samples, flagged };
}
// 자율 조치: flag된 카페의 '경쟁 상호 섞인 노출 인용문'만 제거(재대조·durable). 카페 자체는 비공개 안 함(보수적—표시 큐레이션).
async function healCompetitorQuotePollution(flagged: CompFlag[], deadline: number): Promise<{ fixed: number; dropped: number; unpub: number; names: string[]; skipped?: number; noEffect?: number; frozen?: number }> {
  const { cleanCafeName } = await import("@/lib/reviewQuality");
  const { cafeCore, selfMarkers, buildCompetitorIndex, competitorInText } = await import("@/lib/competitorQuote");
  const { invalidateCafeCaches } = await import("@/lib/cafeCacheInvalidate");
  const idx = buildCompetitorIndex((await sql`SELECT id, name FROM cafes WHERE published`) as any[]);
  let fixed = 0, dropped = 0; const names: string[] = [];
  // 🩺 하네스 L4 — 이 힐러는 원래 '바뀐 게 없으면 건너뛰는' 가드가 있어 허위보고는 없었다. 다만 **못 고치는 1건을
  //   8회 연속 계속 감지**하고 있었으므로(2026-08-08 원장 실측), 반복 무효를 기록해 동결·사람확인으로 넘긴다.
  let skipped = 0, noEffect = 0, frozenNew = 0;
  const HJOB = "sentinel.competitor-quote";
  const frozenSet = await frozenTargets(HJOB);
  for (const f of flagged) {
    if (Date.now() > deadline) break;
    if (frozenSet.has(Number(f.id))) { skipped++; continue; }
    // 🎫 하네스 L2 — 다른 잡(autoCorrect·resynth·다른 힐러)이 같은 카페를 만지는 중이면 양보한다.
    if (!(await acquireLease(HJOB, Number(f.id), 180))) { skipped++; continue; }
    try {
      // 🩹 표시되는 배열(synth_reviews_all)까지 정리 — 과거엔 synth_reviews만 고쳐 정작 상세페이지가 쓰는
      //   synth_reviews_all은 오염이 남던 버그(2026-08-01 발견). 둘 다 같은 기준으로 정리.
      const c = (await sql`SELECT name, synth_reviews, synth_reviews_all FROM cafes WHERE id=${f.id}`)[0] as any;
      if (!c) continue;
      const cn = cleanCafeName(c.name); const sc = cafeCore(cn); const mk = selfMarkers(cn);
      const foreign = (r: any) => { const q = (r.quote || "") as string; const qn = q.replace(/\s/g, "").toLowerCase(); if (mk.some((x: string) => qn.includes(x))) return false; return !!competitorInText(q, sc, f.id, idx); };
      const qs = (c.synth_reviews || []) as any[];
      const qa = (c.synth_reviews_all || []) as any[];
      const keep = qs.filter((r: any) => !foreign(r));
      const keepAll = qa.filter((r: any) => !foreign(r));
      if (keep.length === qs.length && keepAll.length === qa.length) { noEffect++; if ((await noteAttempt(HJOB, Number(f.id), false, { note: "제거 대상 없음(보수 판정)" })).frozen) frozenNew++; continue; }
      noteWrite("cafes.synth_reviews"); noteWrite("cafes.synth_reviews_all");
      await sql`UPDATE cafes SET synth_reviews=${JSON.stringify(keep)}::jsonb, synth_reviews_all=${JSON.stringify(keepAll)}::jsonb, updated_at=now() WHERE id=${f.id}`;
      await invalidateCafeCaches([f.id]).catch(() => {});
      const rm = (qs.length - keep.length) + (qa.length - keepAll.length);
      fixed++; dropped += rm; if (names.length < 8) names.push(`${cn}(-${qa.length - keepAll.length})`);
      await noteAttempt(HJOB, Number(f.id), true).catch(() => ({ frozen: false }));
    } catch { /* 개별 실패는 다음 런이 이어서 */ }
    finally { await releaseLease(HJOB, Number(f.id)).catch(() => {}); }
  }
  if (fixed > 0) // ⚠️ 지역 인덱스 행(__geo_index_v1__)은 남긴다 — 카페 한 곳 비공개는 동네→구 지도와 무관한데,
  //   같이 지우면 다음 검색이 전수 스캔(6,565페이지)으로 지도를 다시 만든다(불필요한 비용).
  await sql`DELETE FROM search_cache WHERE qkey <> '__geo_index_v1__'`.catch(() => {});
  return { fixed, dropped, unpub: 0, names, skipped, noEffect, frozen: frozenNew };
}

export async function GET(req: NextRequest) {
  const started = Date.now();
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    startJobRun("cron-sentinel"); // 💰 하네스 L1 — 큰 컬럼 소비 계량 시작(웜 인스턴스 누적 방지)
    openScope("cron-sentinel");   // 🔐 하네스 L3 — 계약에 선언한 쓰기 대상 밖을 건드리면 드리프트로 잡는다
    // 🧪 하네스 L3 — 드라이런 표준화(`?dry=1`). 탐지는 그대로 돌리되 **치유기를 전혀 호출하지 않는다.**
    //   지금까지 "무엇이 바뀔 것인가"를 보려면 매번 손으로 임시 스크립트를 짜야 했다(2026-08-08에도 그랬다).
    //   드라이런을 계약의 일부로 두면 조치 전 확인이 표준 절차가 된다. DB 변경 0 · 큰 컬럼 로드 0.
    const DRY = req.nextUrl.searchParams.get("dry") === "1";
    if (await isCostHalted()) { await recordRun("cron-sentinel", true, "🛑 비용 자동정지 중 — 스킵", 0).catch(() => {}); return NextResponse.json({ ok: true, skipped: "cost-halt" }); }
    await sql`CREATE TABLE IF NOT EXISTS sentinel_reports (id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), clean BOOLEAN, report JSONB)`.catch(() => {});

    // ── ① 자동 치유(안전·결정론·멱등) ──
    const area = await healAreaLabel().catch(() => ({ fixed: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 }));
    const box = await healOutOfBox().catch(() => ({ excluded: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 }));
    const dup = await healExactDuplicates().catch(() => ({ resolved: 0, pairs: [] as string[] }));

    // ── ② 치유 후 잔여 정합성 스캔(전 축) ──
    await loadCriteria(); // 수도권 좌표박스 기준 캐시 프라임(폴백=36.8~38.3/124.5~127.9)
    const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
    const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");
    const one = async (p: Promise<any[]>) => Number((await p)[0]?.c ?? 0);
    const checks = {
      area_mismatch_seoul: await one(sql`SELECT count(*) c FROM cafes WHERE published AND area LIKE '%구' AND area NOT LIKE '인천%' AND address LIKE '서울%' AND position(area in address)=0`),
      area_mismatch_gg: await one(sql`SELECT count(*) c FROM cafes WHERE published AND area LIKE '%시' AND address LIKE '경기%' AND position(replace(area,'시','') in address)=0`),
      out_of_box: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat<${latMin} OR lat>${latMax} OR lng<${lngMin} OR lng>${lngMax})`),
      non_capital_addr: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (address LIKE '충청%' OR address LIKE '강원%' OR address LIKE '전라%' OR address LIKE '경상%' OR address LIKE '대전%' OR address LIKE '부산%' OR address LIKE '대구%' OR address LIKE '울산%' OR address LIKE '광주광역시%' OR address LIKE '세종%' OR address LIKE '제주%')`),
      missing_synth: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (synth_count IS NULL OR synth_count=0)`),
      missing_char: await one(sql`SELECT count(*) c FROM cafes WHERE published AND char_scores IS NULL`),
      missing_coord: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR lat=0 OR lng=0)`),
      missing_address: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (address IS NULL OR address='')`),
      bad_grade: await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade IS NOT NULL AND synth_grade NOT IN ('검증','참고','후보')`),
      // 🆕 이름일치율 사각(구구커피류): 노출 후기가 '실제 그 카페'를 거의 안 말함(<0.3). offctx로는 안 보이는 오염
      //   (남의 카페 후기도 '카페 맥락어'는 있으니까). cleanCafeName 게이트 배포 후 재합성분은 정확. 경보만(재등급은 결재).
      name_pollution: await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_coherence IS NOT NULL AND synth_coherence < 0.3 AND COALESCE(offctx_ok,false)=false`),
    };
    // 🆕 이름-불일치/먼광역시 오염 스캔(coherence 사각 전담) — 탐지·경보만(자동 비공개 안 함).
    const mismatch = await scanNameMismatch().catch(() => ({ count: 0, far: 0, nameMiss: 0, samples: [] as string[] }));
    (checks as any).name_mismatch = mismatch.count;
    // 🎡 명소·행사 오염(약한토큰 사각) — 탐지·경보만.
    const attr = await scanAttractionPollution().catch(() => ({ count: 0, samples: [] as string[], flagged: [] as AttrFlag[] }));
    // 🎡 자율 조치: flag된 명소·행사 오염을 남은 시간예산 안에서 자동 제거(런당 최대 12곳, deadline 270s). 나머지는 다음 런.
    const attrHeal = DRY ? { fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 } : await healAttractionPollution(attr.flagged || [], started + 240000).catch(() => ({ fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 }));
    // 🧾 사람이 판독을 끝낸 건(=동결)은 **탐지 카운트에서 뺀다** — 2026-08-08 15건 판독 결과
    //   오탐 5·보존판정 9·확인필요 1로 **데이터 삭제가 필요한 건 0건**이었다. 그런데도 매 런 22건이
    //   그대로 잡히면 워치리스트가 영원히 빨간 상태로 남아 진짜 신규 오염이 묻힌다.
    //   역할 분리: 데이터 탐지(여기)=새 오염만 / 화면 문제=cron-exposure(quote 기준)가 담당.
    (checks as any).attraction_pollution = Math.max(0, attr.count - attrHeal.fixed - (await frozenTargets("sentinel.attraction")).size); // 자동조치 후 잔여
    // 🔤 약한이름(1글자) 흡수 오염(name_mismatch가 의도적 제외하는 사각) — 명시적 타카페명만 자동 제거.
    const weak = await scanWeakNamePollution().catch(() => ({ count: 0, samples: [] as string[], flagged: [] as WeakFlag[] }));
    const weakHeal = DRY ? { fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 } : await healWeakNamePollution(weak.flagged || [], started + 250000).catch(() => ({ fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 }));
    (checks as any).weak_name_pollution = Math.max(0, weak.count - weakHeal.fixed - (await frozenTargets("sentinel.weak-name")).size); // 자동조치 후 잔여
    // 🏢 비카페 업종 오염(부동산·마사지·시계·구인 등, xref 사각) — 강한 업종어 + 카페명마커 부재만 자동 제거.
    const ncb = await scanNonCafeBizPollution().catch(() => ({ count: 0, samples: [] as string[], flagged: [] as NcbFlag[] }));
    const ncbHeal = DRY ? { fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 } : await healNonCafeBizPollution(ncb.flagged || [], started + 280000).catch(() => ({ fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 }));
    (checks as any).noncafe_biz_pollution = Math.max(0, ncb.count - ncbHeal.fixed - (await frozenTargets("sentinel.noncafe-biz")).size); // 자동조치 후 잔여
    // 🏪 프랜차이즈 지점 간 오염(브랜드+타지점 접미사 동시등장, xref보다 안전 — 대조대상이 우리 DB 실존 지점) — 자동 제거.
    const fr = await scanFranchiseBranchPollution().catch(() => ({ count: 0, samples: [] as string[], flagged: [] as FranchiseFlag[] }));
    const frHeal = DRY ? { fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 } : await healFranchiseBranchPollution(fr.flagged || [], started + 288000).catch(() => ({ fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 }));
    (checks as any).franchise_branch_pollution = Math.max(0, fr.count - frHeal.fixed - (await frozenTargets("sentinel.franchise-branch")).size); // 자동조치 후 잔여
    // 🔠 흔한단어/동음이의어 이름 오염(identity.weak_token 사전 재사용, name_mismatch·weak_name 사각 전담) — 자동 제거.
    const gen = await scanGenericTermPollution().catch(() => ({ count: 0, samples: [] as string[], flagged: [] as GenericFlag[] }));
    const genHeal = DRY ? { fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 } : await healGenericTermPollution(gen.flagged || [], started + 296000).catch(() => ({ fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 }));
    (checks as any).generic_term_pollution = Math.max(0, gen.count - genHeal.fixed - (await frozenTargets("sentinel.generic-term")).size); // 자동조치 후 잔여
    // 🗣️ 문구형 이름 오염(신규 재발 조기경보 — 조사·어미 종결 토큰, 아직 사전 미등재분) — 탐지·워치리스트 전용(자동조치 없음).
    const phrase = await scanPhraseNamePollution().catch(() => ({ count: 0, samples: [] as string[], flagged: [] as PhraseFlag[] }));
    (checks as any).phrase_name_pollution = phrase.count;

    // 🕵️ 인용문 교차오염(다른 카페 상호 섞임) — 탐지+자율조치(경쟁 상호 인용문만 제거, 비공개 안 함)
    const comp = await scanCompetitorQuotePollution().catch(() => ({ count: 0, samples: [] as string[], flagged: [] as CompFlag[] }));
    const compHeal = DRY ? { fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 } : await healCompetitorQuotePollution(comp.flagged || [], started + 288000).catch(() => ({ fixed: 0, dropped: 0, unpub: 0, names: [] as string[], skipped: 0, noEffect: 0, frozen: 0 }));
    (checks as any).competitor_quote_pollution = Math.max(0, comp.count - compHeal.fixed - (await frozenTargets("sentinel.competitor-quote")).size);

    // name_mismatch·attraction·weak_name·noncafe_biz·franchise_branch·generic_term·phrase_name은 '정합성 실패'가 아니라 검토 워치리스트 → clean 판정서 제외.
    const WATCH = new Set(["name_mismatch", "attraction_pollution", "weak_name_pollution", "noncafe_biz_pollution", "franchise_branch_pollution", "generic_term_pollution", "phrase_name_pollution", "competitor_quote_pollution"]);
    const residual = Object.entries(checks).reduce((s, [k, n]) => s + (WATCH.has(k) ? 0 : (n as number)), 0);
    const healedTotal = area.fixed + box.excluded + dup.resolved + attrHeal.fixed + weakHeal.fixed + ncbHeal.fixed + frHeal.fixed + genHeal.fixed + compHeal.fixed;
    const clean = residual === 0;

    // ── ②-b 콘솔키 크레딧 실측 프로브(트래픽 무관) ──
    //   search_log.ai_err는 실사용자 검색이 있어야만 소진을 잡는다 → 검색 뜸하면 소진돼도 신호 소멸(조용한 저하).
    //   여기서 소액 호출(max_tokens:1)로 크레딧 상태를 직접 확인해 console_key_state에 적재. 관제탑·재무팀이 이 값을
    //   읽어 '정상' 단정 대신 실측으로 판단한다. 소진 시 호출=400=과금0. ※ 소진은 저영향(검색 결정론 폴백·moat 구독 유지)
    //   이라 여기선 정보성 로그로만 남긴다 — 위험 판정은 관제탑이 폴백 유무를 반영해 LOW로 표면화(CEO 2026-07-08).
    const probe = await probeConsoleKey().catch((e) => ({ signal: "exception" as const, ok: true, detail: String(e).slice(0, 100) }));

    // ── ③ 리포트 ──
    const flags = Object.entries(checks).filter(([k, n]) => n > 0 && !WATCH.has(k)).map(([k, n]) => `${k}:${n}`);
    const _scope = scopeResult(); // 🔐 하네스 L3 — 이번 런이 실제로 건드린 대상 vs 계약 선언
    // 🎫 하네스 L2 — 만료 리스 청소 + 현재 점유 현황(겹침이 실제로 있었는지 보이게)
    const leasePruned = await pruneLeases().catch(() => 0);
    const leaseNow = await activeLeases().catch(() => 0);
    // 🩺 하네스 L4 — 자동으로 못 고쳐 '동결'된 대상은 사람이 볼 수 있어야 한다(조용히 사라지면 안 됨).
    const frozenNow = await frozenSummary().catch(() => [] as { job: string; n: number }[]);
    const healSkipped = (attrHeal.skipped ?? 0) + (weakHeal.skipped ?? 0) + (ncbHeal.skipped ?? 0) + (frHeal.skipped ?? 0) + (genHeal.skipped ?? 0) + (compHeal.skipped ?? 0);
    const healNoEffect = (attrHeal.noEffect ?? 0) + (weakHeal.noEffect ?? 0) + (ncbHeal.noEffect ?? 0) + (frHeal.noEffect ?? 0) + (genHeal.noEffect ?? 0) + (compHeal.noEffect ?? 0);
    const harnessNote = (healSkipped || healNoEffect || frozenNow.length)
      ? ` · 🩺하네스: 무효 ${healNoEffect}·동결스킵 ${healSkipped}${frozenNow.length ? `·동결누적 ${frozenNow.reduce((a, b) => a + b.n, 0)}(사람확인 대기)` : ""}${leaseNow ? `·리스점유 ${leaseNow}` : ""}${leasePruned ? `·만료리스정리 ${leasePruned}` : ""}${_scope?.violations.length ? `·🔐스코프위반 ${_scope.violations.join(",")}` : ""}`
      : "";
    await sql`INSERT INTO sentinel_reports (clean, report) VALUES (${clean}, ${JSON.stringify({ checks, nameMismatch: mismatch.samples, attractionPollution: attr.samples, attractionHealed: attrHeal, weakNamePollution: weak.samples, weakNameHealed: weakHeal, nonCafeBizPollution: ncb.samples, nonCafeBizHealed: ncbHeal, franchiseBranchPollution: fr.samples, franchiseBranchHealed: frHeal, genericTermPollution: gen.samples, genericTermHealed: genHeal, phraseNamePollution: phrase.samples, competitorQuotePollution: comp.samples, competitorQuoteHealed: compHeal, healed: { area: area.fixed, box: box.excluded, dup: dup.resolved, attr: attrHeal.fixed, weak: weakHeal.fixed, ncb: ncbHeal.fixed, fr: frHeal.fixed, gen: genHeal.fixed, comp: compHeal.fixed }, consoleKey: probe, harness: { noEffect: healNoEffect, skipped: healSkipped, frozen: frozenNow } })}::jsonb)`.catch(() => {});

    const probeNote = probe.signal === "ok" ? "콘솔키 크레딧 정상" : probe.signal === "credit" ? "콘솔키 크레딧 소진(콘솔경로 중단·검색 결정론폴백 정상=저영향)" : `콘솔키 프로브 ${probe.signal}`;
    const mmNote = mismatch.count > 0 ? ` · 🔎오염의심 ${mismatch.count}(먼광역시 ${mismatch.far}·이름불일치 ${mismatch.nameMiss})` : "";
    const attrNote = (attr.count > 0 || attrHeal.fixed > 0) ? ` · 🎡명소오염 자동정리 ${attrHeal.fixed}곳(-${attrHeal.dropped}건${attrHeal.unpub ? `·비공개 ${attrHeal.unpub}` : ""})${(checks as any).attraction_pollution > 0 ? `·잔여 ${(checks as any).attraction_pollution}(다음런)` : ""}` : "";
    const weakNote = (weak.count > 0 || weakHeal.fixed > 0) ? ` · 🔤약한이름오염 자동정리 ${weakHeal.fixed}곳(-${weakHeal.dropped}건${weakHeal.unpub ? `·비공개 ${weakHeal.unpub}` : ""})${(checks as any).weak_name_pollution > 0 ? `·잔여 ${(checks as any).weak_name_pollution}(다음런)` : ""}` : "";
    const ncbNote = (ncb.count > 0 || ncbHeal.fixed > 0) ? ` · 🏢비카페업종오염 자동정리 ${ncbHeal.fixed}곳(-${ncbHeal.dropped}건${ncbHeal.unpub ? `·비공개 ${ncbHeal.unpub}` : ""})${(checks as any).noncafe_biz_pollution > 0 ? `·잔여 ${(checks as any).noncafe_biz_pollution}(다음런)` : ""}` : "";
    const frNote = (fr.count > 0 || frHeal.fixed > 0) ? ` · 🏪지점오염 자동정리 ${frHeal.fixed}곳(-${frHeal.dropped}건${frHeal.unpub ? `·비공개 ${frHeal.unpub}` : ""})${(checks as any).franchise_branch_pollution > 0 ? `·잔여 ${(checks as any).franchise_branch_pollution}(다음런)` : ""}` : "";
    const genNote = (gen.count > 0 || genHeal.fixed > 0) ? ` · 🔠흔한단어오염 자동정리 ${genHeal.fixed}곳(-${genHeal.dropped}건${genHeal.unpub ? `·비공개 ${genHeal.unpub}` : ""})${(checks as any).generic_term_pollution > 0 ? `·잔여 ${(checks as any).generic_term_pollution}(다음런)` : ""}` : "";
    const phraseNote = phrase.count > 0 ? ` · 🗣️문구형이름오염 의심 ${phrase.count}곳(워치리스트—확인 후 사전등재)` : "";
    const compNote = (comp.count > 0 || compHeal.fixed > 0) ? ` · 🕵️인용문교차오염 자동정리 ${compHeal.fixed}곳(-${compHeal.dropped}건)${(checks as any).competitor_quote_pollution > 0 ? `·잔여 ${(checks as any).competitor_quote_pollution}(다음런)` : ""}` : "";
    const detail = `치유 ${healedTotal}(area${area.fixed}·박스${box.excluded}·중복${dup.resolved}) · ${clean ? "정합성 OK ✅" : "⚠️ 잔여 " + flags.join(" ")}${mmNote}${attrNote}${weakNote}${ncbNote}${frNote}${genNote}${phraseNote}${compNote}${harnessNote} · ${probeNote}`;
    // 📒 하네스 L5 — 실행 원장에 '문제 집합의 지문'을 남긴다. 지문이 N회 연속 같으면 = 아무것도 못 바꾸고
    //   반복 중(2026-08-08 지점오염 힐러가 정확히 그 모습이었다). ⚠️ 지문엔 시각·난수·시도내역을 넣지 말 것 —
    //   '치유 이름/제거건수'를 넣었더니 런마다 미세하게 달라져 정체를 못 잡았다(설계 교정 실측).
    const _fpIds = (arr: unknown): string[] => (Array.isArray(arr) ? arr : []).map((x) => String(x).match(/#(\d+)/)?.[1] ?? String(x).slice(0, 12));
    // ⚠️ 지문은 **사람이 판독을 끝낸 건(동결)을 뺀** 문제 집합이어야 한다. 안 그러면 사람이 다 처리한 뒤에도
    //   "같은 결과 N회 연속"으로 영원히 정체 경보가 뜬다(2026-08-08 실측으로 발견).
    const _frozenAll = new Set<number>();
    for (const j of ["sentinel.attraction", "sentinel.weak-name", "sentinel.noncafe-biz",
                     "sentinel.franchise-branch", "sentinel.generic-term", "sentinel.competitor-quote"]) {
      for (const id of await frozenTargets(j)) _frozenAll.add(id);
    }
    const _live = (arr: string[]) => arr.filter((x) => !_frozenAll.has(Number(x)));
    // 🩺 지문 = **이 잡이 고쳐야 할 문제집합**의 식별자. 두 가지를 지킨다(2026-08-16 수리).
    //   ① `mm`(이름불일치)는 **이 잡이 치유하지 않는** 관찰 전용 신호다(표시 품질은 cron-exposure 담당,
    //      과거 전수감사서 RED의 ~90%가 오탐으로 판명). 지문에 넣으면 영원히 안 변하는 상수가 섞여
    //      **어떤 런이든 같은 지문 → 영구 '정체'** 오탐이 난다. 실측: 08-15 수렴 완료 후에도 4회 연속 정체 검출.
    //   ② 고칠 게 하나도 없으면(전 축 0 + 대상 0) **지문을 남기지 않는다**(null). 빈 문제집합의 반복은
    //      '헛돎'이 아니라 '깨끗함'이다. detectStuck은 fingerprint IS NOT NULL만 보므로 이걸로 오탐이 끝난다.
    const _fpTargets = _live([
      ..._fpIds(attr.samples), ..._fpIds(weak.samples), ..._fpIds(ncb.samples),
      ..._fpIds(fr.samples), ..._fpIds(gen.samples), ..._fpIds(comp.samples),
    ]);
    const _healable = [
      (checks as any).attraction_pollution, (checks as any).weak_name_pollution,
      (checks as any).noncafe_biz_pollution, (checks as any).franchise_branch_pollution,
      (checks as any).generic_term_pollution, (checks as any).competitor_quote_pollution,
    ].reduce((a: number, b: any) => a + (Number(b) || 0), 0);
    const fingerprint = (_healable === 0 && _fpTargets.length === 0) ? undefined : fingerprintOf({
      attr: (checks as any).attraction_pollution, weak: (checks as any).weak_name_pollution,
      ncb: (checks as any).noncafe_biz_pollution, fr: (checks as any).franchise_branch_pollution,
      gen: (checks as any).generic_term_pollution, comp: (checks as any).competitor_quote_pollution,
      targets: _fpTargets,
    });
    if (DRY) {
      // 🧪 드라이런 — DB에 아무것도 남기지 않는다(원장·리포트 오염 방지). "무엇이 바뀔 것인가"만 돌려준다.
      return NextResponse.json({ ok: true, dryRun: true, wouldDetect: checks, samples: {
        attraction: attr.samples, weakName: weak.samples, nonCafeBiz: ncb.samples,
        franchise: fr.samples, generic: gen.samples, competitor: comp.samples,
      } });
    }
    const _usage = runUsage(); if (!_usage?.overBudget) void clearOverBudget("cron-sentinel");
    await recordRun("cron-sentinel", true, detail, healedTotal, {
      fingerprint,
      metrics: {
        detected: attr.count + weak.count + ncb.count + fr.count + gen.count + comp.count, healed: healedTotal,
        noEffect: healNoEffect, skipped: healSkipped,
        blobReads: _usage?.blobReads ?? 0, wallMs: _usage?.wallMs ?? 0,
        scopeViolations: _scope?.violations.length ?? 0,
      },
    });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), clean, healed: { area: area.fixed, areaNames: area.names, box: box.excluded, dup: dup.resolved, dupPairs: dup.pairs }, checks, flags, nameMismatch: mismatch, consoleKey: probe });
  } catch (e) {
    await recordRun("cron-sentinel", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
