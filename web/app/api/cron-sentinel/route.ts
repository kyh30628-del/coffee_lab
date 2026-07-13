import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { healAreaLabel, healOutOfBox } from "@/lib/synthStore";
import { recordRun } from "@/lib/agentLog";
import { probeConsoleKey } from "@/lib/consoleKeyProbe";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";
import { quoteMatchConfidence, coreTokens } from "@/lib/reviewQuality";

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
async function scanAttractionPollution(): Promise<{ count: number; samples: string[] }> {
  const t0 = Date.now(); let lo = 0; let truncated = false;
  const flagged: { id: number; name: string; area: string; bad: number; shown: number }[] = [];
  for (let guard = 0; guard < 80; guard++) {
    if (Date.now() - t0 > 120000) { truncated = true; break; } // 시간 안전장치(name_mismatch와 예산 분담)
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
  return { count: flagged.length, samples };
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

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS sentinel_reports (id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), clean BOOLEAN, report JSONB)`.catch(() => {});

    // ── ① 자동 치유(안전·결정론·멱등) ──
    const area = await healAreaLabel().catch(() => ({ fixed: 0, names: [] as string[] }));
    const box = await healOutOfBox().catch(() => ({ excluded: 0, names: [] as string[] }));
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
    const attr = await scanAttractionPollution().catch(() => ({ count: 0, samples: [] as string[] }));
    (checks as any).attraction_pollution = attr.count;
    // name_mismatch·attraction_pollution은 '정합성 실패'가 아니라 검토 워치리스트 → clean 판정서 제외(경보 폭주 방지, 별도 표면화).
    const WATCH = new Set(["name_mismatch", "attraction_pollution"]);
    const residual = Object.entries(checks).reduce((s, [k, n]) => s + (WATCH.has(k) ? 0 : (n as number)), 0);
    const healedTotal = area.fixed + box.excluded + dup.resolved;
    const clean = residual === 0;

    // ── ②-b 콘솔키 크레딧 실측 프로브(트래픽 무관) ──
    //   search_log.ai_err는 실사용자 검색이 있어야만 소진을 잡는다 → 검색 뜸하면 소진돼도 신호 소멸(조용한 저하).
    //   여기서 소액 호출(max_tokens:1)로 크레딧 상태를 직접 확인해 console_key_state에 적재. 관제탑·재무팀이 이 값을
    //   읽어 '정상' 단정 대신 실측으로 판단한다. 소진 시 호출=400=과금0. ※ 소진은 저영향(검색 결정론 폴백·moat 구독 유지)
    //   이라 여기선 정보성 로그로만 남긴다 — 위험 판정은 관제탑이 폴백 유무를 반영해 LOW로 표면화(CEO 2026-07-08).
    const probe = await probeConsoleKey().catch((e) => ({ signal: "exception" as const, ok: true, detail: String(e).slice(0, 100) }));

    // ── ③ 리포트 ──
    const flags = Object.entries(checks).filter(([k, n]) => n > 0 && !WATCH.has(k)).map(([k, n]) => `${k}:${n}`);
    await sql`INSERT INTO sentinel_reports (clean, report) VALUES (${clean}, ${JSON.stringify({ checks, nameMismatch: mismatch.samples, attractionPollution: attr.samples, healed: { area: area.fixed, box: box.excluded, dup: dup.resolved }, consoleKey: probe })}::jsonb)`.catch(() => {});

    const probeNote = probe.signal === "ok" ? "콘솔키 크레딧 정상" : probe.signal === "credit" ? "콘솔키 크레딧 소진(콘솔경로 중단·검색 결정론폴백 정상=저영향)" : `콘솔키 프로브 ${probe.signal}`;
    const mmNote = mismatch.count > 0 ? ` · 🔎오염의심 ${mismatch.count}(먼광역시 ${mismatch.far}·이름불일치 ${mismatch.nameMiss})` : "";
    const attrNote = attr.count > 0 ? ` · 🎡명소오염 ${attr.count}` : "";
    const detail = `치유 ${healedTotal}(area${area.fixed}·박스${box.excluded}·중복${dup.resolved}) · ${clean ? "정합성 OK ✅" : "⚠️ 잔여 " + flags.join(" ")}${mmNote}${attrNote} · ${probeNote}`;
    await recordRun("cron-sentinel", true, detail, healedTotal);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), clean, healed: { area: area.fixed, areaNames: area.names, box: box.excluded, dup: dup.resolved, dupPairs: dup.pairs }, checks, flags, nameMismatch: mismatch, consoleKey: probe });
  } catch (e) {
    await recordRun("cron-sentinel", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
