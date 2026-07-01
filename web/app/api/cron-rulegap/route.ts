import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureLearnedTable, loadLearnedTerms, getLearned, applyLearned, rollbackLearned } from "@/lib/learnedTerms";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";
export const maxDuration = 300;

// 🤖 규칙갭 자가학습 에이전트 (토큰 0, 결정론).
//   ① 검증·롤백: 직전 자동학습이 정상 카페를 과도하게 비공개시켰으면 되돌림.
//   ② 탐지: 공개 카페 노출 리뷰를 스캔해 현 규칙을 빠져나간 토큰을 횡단 집계.
//   ③ 적용: '사전(생활권)' 후보는 안전가드 통과 시 자동 적용. '로직·고위험'(프랜차이즈·일반명)은 승인대기로 surface.
//   결정 틀: 결정론 먼저 → 입증(영향 측정) → 자동은 사전만·로직은 승인. 모든 적용 DB 로그·즉시 롤백.

const guShort = (a: string) => String(a).replace(/(특별자치시|특별자치도|광역시|특별시|자치시|자치구|시|군|구|도)$/, "");
const NON_BRANCH = /(백화점|면세점|서점|문고점|전문점|체인점|할인점|편의점|음식점|분식점|노점|상점|약국점|마트점|장점|단점|시점|관점|초점|약점|강점|정점|요점|중점|종점|만점|채점|별점|평점|빵점|매점|거점|기점|이점|반점|문제점|차이점|공통점|장단점|정기점|가맹점|직영점|무인점|판매점|득점|실점|승점|벌점|가점|감점|배점)$/;
const STOP = new Set(["오늘","어제","내일","요즘","이번","다음","지난","우리","여기","거기","저기","그곳","이곳","정말","진짜","그냥","조금","너무","완전","약간","아주","매우","커피","카페","메뉴","사장","직원","가격","분위기","자리","주차","방문","후기","추천","시간","요일","평일","주말","오전","오후","매일","자주","근처","우리집","본점","지점"]);
// 비카페 '업체 정체성' 어(이름충돌로 다른 업종 후기를 끌어온 신호) vs 카페어.
//   ⚠️ 위치형 단어(병원·호텔·식물원·학원)는 제외 — 'OO병원점' 같은 정상 카페·베이커리가 거기 위치한 경우라 오탐.
//   여기엔 '그 가게가 곧 그 업종'인 정체성 단어만(캠핑장·펜션·헬스장·공방·한정식 등).
const NONCAFE_ENTITY = /(헬스장|휘트니스|피트니스|캠핑장|글램핑|글램핑장|펜션|모텔|민박|필라테스|요가원|향수공방|도자기공방|공방|낚시터|볼링장|당구장|찜질방|사우나|한정식|밴댕이무침|회무침|솥밥|매운탕|숙소|객실|입실|퇴실|차박|오토캠핑)/g;
const CAFE_TERM = /(커피|아메리카노|라떼|에스프레소|디저트|케이크|스콘|베이글|브런치|원두|카페|음료|마카롱|와플|빙수|로스팅|드립)/g;
// 이름이 카페/베이커리형이면 오염 의심에서 제외(곤트란쉐리에·타르데마 베이커리 등 정상 브랜드의 병원점·식물원점 오탐 방지)
const GOOD_NAME = /(카페|까페|커피|로스터|로스팅|브런치|디저트|베이커리|베이글|제과|찻집|티하우스|coffee|cafe)/i;
const DISTRICT_THRESHOLD = 5; // 생활권 자동학습: 이만큼의 서로 다른 카페에서 오염으로 등장해야

// 🏷️ 룰갭 제안16: 도로명 주소형 카페명 — 카페명이 '자기 등록주소의 도로명(번지 앞 토큰)'과 그대로 같으면
//   상호가 아니라 주소 파편이 name에 잘못 들어간 것(SEO 도로명 키워드 오염). 자기 주소 대조라 오탐 없음
//   (예: '카페알로'·'아지트로'처럼 우연히 로/길로 끝나는 진짜 상호는 자기 주소 도로명과 다르므로 제외됨).
const ADDR_ROAD_TOKEN_RE = /([가-힣0-9]{2,}(?:로|길))\s+[0-9]/;
function isRoadNameCafeName(name: string, addr: string | null | undefined): boolean {
  const n = (name || "").trim();
  if (n.length < 2 || !/(로|길)$/.test(n)) return false;
  const m = (addr || "").match(ADDR_ROAD_TOKEN_RE);
  const token = m ? m[1] : "";
  return !!token && (token === n || token.endsWith(n));
}
// 🏷️ 룰갭 제안17: 아파트단지명 포함 카페명 — 'N차아파트'류 단지 표기가 상호에 그대로 박히면
//   실제 카페가 아니라 그 아파트 단지 입주민 공동시설(북카페·커뮤니티실 등)일 확률이 매우 높음.
//   ⚠️ '아파트먼트'(도화아파트먼트 등 실존 카페 브랜드)는 차수 표기가 없어 이 패턴에 안 걸림.
const APT_UNIT_RE = /[0-9]+\s*차\s*아파트|아파트\s*[0-9]+\s*단지|[0-9]+\s*단지\s*아파트/;
const isApartmentComplexName = (name: string): boolean => APT_UNIT_RE.test(name || "");

const authed = (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD) return true;
  return (!!secret && req.headers.get("authorization") === `Bearer ${secret}`) || !secret;
};

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const dry = req.nextUrl.searchParams.get("dry") === "1";
    await ensureLearnedTable();
    await loadLearnedTerms(true);

    // ── ① 검증·자동롤백 ──────────────────────────────────────────────
    //   직전 자동적용(최근 2시간) 후 공개 카페가 크게 줄었으면 되돌린다(정상 카페 과다 비공개 방지).
    const rolledBack: string[] = [];
    await sql`CREATE TABLE IF NOT EXISTS rulegap_runs (id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), published_before INT, learned JSONB, pending JSONB)`;
    const pubNow = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE published=true`)[0].n as number;
    const lastRun = (await sql`SELECT id, published_before, learned FROM rulegap_runs ORDER BY id DESC LIMIT 1`)[0] as any;
    if (lastRun && lastRun.published_before && !dry) {
      const drop = lastRun.published_before - pubNow;
      const applied = (lastRun.learned || []).filter((l: any) => l.action === "applied");
      // 직전에 자동학습이 있었고, 공개가 0.5% 넘게(또는 50곳+) 줄었으면 직전 학습 롤백
      if (applied.length > 0 && drop > Math.max(50, Math.round(lastRun.published_before * 0.005))) {
        for (const l of applied) { try { await rollbackLearned(l.kind, l.term, `자동롤백: 공개 ${drop}곳 급감`); rolledBack.push(`${l.term}(${l.kind})`); } catch {} }
      }
    }

    // ── ② 탐지: 노출 리뷰 스캔 → 빠져나간 토큰 집계 ──────────────────
    const branchHits: Record<string, Set<number>> = {};   // ○○점(지점 의심) → 카페id
    const distHits: Record<string, Set<number>> = {};      // X동/X구(생활권 의심) → 카페id
    const areaCafes: Record<string, number> = {};          // 토큰이 '등록 지역'인 공개 카페 수(실제 지명 입증)
    const add = (m: Record<string, Set<number>>, t: string, id: number) => { (m[t] = m[t] || new Set()).add(id); };
    const learnedDist = getLearned("district");
    const pollutedCafes: { id: number; name: string; nc: number; cf: number }[] = []; // 노출리뷰가 비카페 업체어에 지배(이름충돌/오염)
    let scanned = 0;

    for (let lo = 0; lo <= 15000; lo += 1000) {
      const rows = (await sql`SELECT id,name,area,dong,synth_reviews FROM cafes WHERE published=true AND id>${lo} AND id<=${lo + 1000} AND synth_reviews IS NOT NULL`) as any[];
      for (const c of rows) {
        scanned++;
        const areaTerms = [c.area, c.dong].filter(Boolean) as string[];
        for (const a of areaTerms) { const s = guShort(a); if (s.length >= 2) areaCafes[s] = (areaCafes[s] || 0) + 1; }
        const dong = c.dong || ""; const dongCore = dong.replace(/(동|읍|면|가|리)$/, "");
        let revs: any = c.synth_reviews; if (typeof revs === "string") { try { revs = JSON.parse(revs); } catch { revs = []; } }
        if (!Array.isArray(revs)) revs = (revs && revs.reviews) || [];
        // 이름충돌·오염 감지: 노출리뷰가 비카페 업체어(헬스장·캠핑장·공방·펜션·한정식 등)에 지배되면 의심.
        const allTxt = revs.map((r: any) => (typeof r === "string" ? r : (r.quote || r.title || "")) || "").join(" ");
        const ncN = (allTxt.match(NONCAFE_ENTITY) || []).length, cfN = (allTxt.match(CAFE_TERM) || []).length;
        if (ncN >= 3 && ncN > cfN * 2 && !GOOD_NAME.test(c.name)) pollutedCafes.push({ id: c.id, name: c.name, nc: ncN, cf: cfN });
        for (const r of revs) {
          const txt: string = (typeof r === "string" ? r : (r.quote || r.title || "")) || "";
          const dongHere = !!dong && (txt.includes(dong) || (dongCore.length >= 2 && txt.includes(dongCore)));
          if (dongHere) continue;
          (txt.match(/([가-힣]{2,})점/g) || []).forEach((m) => {
            const t = m.replace(/점$/, "");
            if (t.length < 2 || t.length > 4) return;
            if (NON_BRANCH.test(m)) return;
            if (c.name.includes(t) || STOP.has(t)) return;
            if (areaTerms.some((a) => a.includes(t) || t.includes(guShort(a)))) return;
            add(branchHits, t, c.id);
          });
          (txt.match(/([가-힣]{2,4})(동|구)\b/g) || []).forEach((m) => {
            const base = m.replace(/(동|구)$/, "");
            if (base.length < 2 || STOP.has(base) || learnedDist.has(base)) return;
            if (c.name.includes(base) || areaTerms.some((a) => a.includes(base))) return;
            add(distHits, base, c.id);
          });
        }
      }
    }

    const rank = (m: Record<string, Set<number>>) => Object.entries(m).map(([t, s]) => ({ term: t, cafes: s.size, samples: [...s].slice(0, 8) })).sort((a, b) => b.cafes - a.cafes);

    // ── ③ 분류·적용 ────────────────────────────────────────────────
    const learned: any[] = [];   // 자동 적용(사전)
    const pending: any[] = [];   // 승인 대기(로직·고위험)

    // 생활권(district): '실제 지명'으로 입증(등록지역인 공개카페 ≥3)되고, 오염으로 ≥THRESHOLD 카페 등장 → 자동 적용.
    for (const cand of rank(distHits)) {
      if (cand.cafes < DISTRICT_THRESHOLD) continue;
      const isRealPlace = (areaCafes[cand.term] || 0) >= 3; // 누군가의 등록지역 = 실존 생활권
      if (isRealPlace && !getLearned("district").has(cand.term)) {
        if (!dry) await applyLearned("district", cand.term, { evidence: cand.cafes, samples: cand.samples, source: "auto", note: `노출리뷰 ${cand.cafes}곳 오염·실존지명` });
        learned.push({ kind: "district", term: cand.term, cafes: cand.cafes, action: dry ? "would-apply" : "applied" });
      } else {
        pending.push({ kind: "district", term: cand.term, cafes: cand.cafes, reason: isRealPlace ? "이미 학습됨" : "지명 미입증(등록지역 카페<3) — 승인 필요" });
      }
    }
    // 지점 의심 ○○점(장소형): 자동적용 안 함(로직 위험 — 오적용 시 정상 후기 배제). 관제탑 승인대기로 surface.
    for (const cand of rank(branchHits)) {
      if (cand.cafes < 3) continue;
      pending.push({ kind: "branch_review", term: `${cand.term}점`, cafes: cand.cafes, reason: "다른지점 의심 — 로직 검토 후 적용(승인)" });
    }

    // ── 업종-콘셉트 감지: 공개 카페 업종을 스캔 → 카페 화이트리스트도·오프콘셉도 아닌 '미확인 업종'을 승인대기로.
    //   (콘셉트 적합성=비공개 결정이라 자동 아님. 애견카페 같은 누락을 사장님 발견 전에 먼저 잡는다)
    const GOOD_CAT = /(카페|커피|로스터|디저트|베이커리|제과|브런치|찻집|티룸|티하우스|빵|케이크|케익|도넛|도너츠|베이글|아이스크림|빙수|마카롱|와플|스무디|주스|에이드|쿠키|타르트|푸딩|차,)/;
    const OFF_CAT = /(애견|애완|반려동물|펫카페|고양이카페|동물카페|키즈|실내놀이터|놀이방|스터디카페|독서실|만화방|만화카페|룸카페|멀티방|파티룸|방탈출|보드게임|보드카페|볼링|당구|스크린골프|골프연습|코인노래|노래방|찜질방|사우나|클라이밍|트램폴린|트램펄린|서점|북카페|도서관)/;
    const okIds = new Set(((await sql`SELECT term FROM learned_terms WHERE kind='cafe_ok' AND status='active'`) as { term: string }[]).map((r) => String(r.term)));
    const catCafes = (await sql`SELECT id, name, COALESCE(naver_category,'') cat FROM cafes WHERE published=true AND naver_category IS NOT NULL AND naver_category <> ''`) as { id: number; name: string; cat: string }[];
    const unknownCafes: { id: number; name: string; cat: string }[] = [];
    let offConcept = 0;
    for (const c of catCafes) {
      if (OFF_CAT.test(c.cat)) { offConcept++; continue; } // 오프콘셉(heal 처리) — '○○카페'도 잡게 GOOD보다 먼저
      if (GOOD_CAT.test(c.cat)) continue;                 // 카페 업종 — 통과
      if (GOOD_NAME.test(c.name)) continue;               // 업종은 애매해도 '이름이 카페형'(로스터리 등 오분류) — 통과
      if (okIds.has(String(c.id))) continue;               // 사람이 검토·승인(유지)한 카페 — 재플래그 안 함
      unknownCafes.push(c);
    }
    // 🔧 자동 종결 — '음식점>...' 식당 카테고리 + 노출리뷰에 커피 정체성(커피·라떼·원두·디저트·베이커리·브런치 등)이
    //    하나도 없으면 = 명백한 식당(빌라드코스테스=빠에야 레스토랑 류) → 결정론적 자동 비공개. '처리중' 위장으로 안 띄움.
    //    커피 정체성이 하나라도 있으면(양식 브런치카페 등 하이브리드 가능) → 기조실장 검토로 남김(승인대기).
    const COFFEE_ID = /커피|라떼|아메리카노|원두|에스프레소|핸드드립|콜드브루|드립|카페|까페|디저트|베이커리|빵|브런치|케이크|스콘|크로플|마카롱|음료|티룸|찻집|로스터/;
    let autoExcluded = 0;
    const stillUnknownByCat: Record<string, { n: number; samples: number[] }> = {};
    if (unknownCafes.length) {
      const ids = unknownCafes.map((c) => c.id);
      const rev = (await sql`SELECT id, COALESCE(synth_reviews::text, '') t FROM cafes WHERE id = ANY(${ids})`) as { id: number; t: string }[];
      const revMap = new Map(rev.map((r) => [Number(r.id), r.t]));
      for (const c of unknownCafes) {
        const isFood = /^음식점>/.test(c.cat);
        const txt = revMap.get(Number(c.id)) || "";
        if (isFood && txt && !COFFEE_ID.test(txt)) {
          await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded' WHERE id = ${c.id} AND published = true`;
          autoExcluded++;
          continue; // 결정론적 종결 — 승인대기로 안 올림
        }
        const e = stillUnknownByCat[c.cat] || (stillUnknownByCat[c.cat] = { n: 0, samples: [] });
        e.n++; if (e.samples.length < 6) e.samples.push(c.id);
      }
    }
    for (const [cat, e] of Object.entries(stillUnknownByCat).sort((a, b) => b[1].n - a[1].n)) {
      pending.push({ kind: "category_unknown", term: cat, cafes: e.n, samples: e.samples, reason: "비카페 업종이나 커피 정체성 일부 있음 — 기조실장 당일 검토(콘셉트 적합성)" });
    }
    if (offConcept > 0) pending.push({ kind: "category_offconcept", term: "(오프콘셉 잔여)", cafes: offConcept, reason: "오프콘셉 업종 공개 중 — heal이 자동 비공개 예정" });

    // 리뷰 오염(이름충돌): 노출리뷰가 비카페 업체어에 지배 → 승인대기(비공개는 영향 커서 사람 검토).
    const okIds2 = okIds; // 위에서 로드한 cafe_ok 재사용
    for (const p of pollutedCafes.filter((p) => !okIds2.has(String(p.id))).sort((a, b) => b.nc - a.nc).slice(0, 30)) {
      pending.push({ kind: "review_pollution", term: p.name, cafes: 1, samples: [p.id], reason: `노출리뷰가 비카페 업체어 ${p.nc}회(카페어 ${p.cf}) — 이름충돌/오염 의심, 검토 후 비공개(승인)` });
    }

    // ✅ 승인대기(review_pollution)는 '스냅샷'에만 두면 결재수단이 없어 RM보드에 '처리중' 좀비가 됨(CEO 지적 2026-07-01).
    //   → autoCorrect와 같은 unpublish 결재 레일로 상신(idempotent ikey=autopollute:id로 중복방지). CEO 승인 시 즉시 비공개 집행.
    if (!dry) {
      for (const p of pollutedCafes.filter((p) => !okIds2.has(String(p.id)))) {
        const ik = `autopollute:${p.id}`;
        const dup = (await sql`SELECT 1 FROM decisions WHERE action_params->>'ikey'=${ik} AND status IN('pending','approved','done','rejected','deferred') LIMIT 1`.catch(() => [])) as any[];
        if (!dup.length) {
          await sql`INSERT INTO decisions (title,detail,team,severity,tier,action_type,action_params,recommendation)
            VALUES (${`[룰갭] 오염 카페 비공개 — ${p.name}`.slice(0, 110)},
                    ${`규칙갭 자가진단: 노출리뷰가 비카페 업체어 ${p.nc}회·카페어 ${p.cf}회로 이름충돌/오염 의심(카페#${p.id}).`.slice(0, 200)},
                    '품질본부', 'HIGH', 'L2', 'unpublish', ${JSON.stringify({ ids: [p.id], ikey: ik })}::jsonb,
                    ${`명백 오염(카페어 ${p.cf}회) — 기조실장 전결로 다음 사이클 자동 비공개. 노출후기가 다른 업체를 가리켜 실손실 없음.`})`.catch(() => {});
        }
      }
    }

    // 룰갭 제안16+17: 도로명·아파트단지명 카페명(#58) — 공개여부 무관 스캔(잠재노출·synth 둘 다 대상).
    //   결정론(자기 주소 대조 / N차아파트 표기)이라 자동학습 대상 아님 — review_pollution과 같은 승인대기 레일로만 상신(자동 비공개 아님).
    const nameCandidates = (await sql`
      SELECT id, name, address, published FROM cafes
      WHERE COALESCE(pipeline_status,'') <> 'excluded' AND (name ~ '(로|길)$' OR name LIKE '%아파트%')
    `) as { id: number; name: string; address: string | null; published: boolean }[];
    const roadNameHits = nameCandidates.filter((c) => isRoadNameCafeName(c.name, c.address));
    const aptNameHits = nameCandidates.filter((c) => isApartmentComplexName(c.name));
    for (const c of roadNameHits) {
      pending.push({ kind: "road_name", term: c.name, cafes: 1, samples: [c.id], reason: `카페명이 등록주소 도로명과 일치(SEO 도로명 오염 의심${c.published ? "·공개중" : ""}) — 검토 후 비공개(승인)` });
    }
    for (const c of aptNameHits) {
      pending.push({ kind: "apt_complex_name", term: c.name, cafes: 1, samples: [c.id], reason: `카페명에 아파트단지 표기(N차아파트) — 입주민시설 의심${c.published ? "·공개중" : ""} — 검토 후 비공개(승인)` });
    }
    if (!dry) {
      const nameHits = [
        ...roadNameHits.map((c) => ({ c, ikind: "roadname", label: "도로명" })),
        ...aptNameHits.map((c) => ({ c, ikind: "aptname", label: "아파트단지명" })),
      ];
      for (const { c, ikind, label } of nameHits) {
        const ik = `${ikind}:${c.id}`;
        const dup = (await sql`SELECT 1 FROM decisions WHERE action_params->>'ikey'=${ik} AND status IN('pending','approved','done','rejected','deferred') LIMIT 1`.catch(() => [])) as any[];
        if (!dup.length) {
          await sql`INSERT INTO decisions (title,detail,team,severity,tier,action_type,action_params,recommendation)
            VALUES (${`[룰갭] ${label} 카페명 오염 — ${c.name}`.slice(0, 110)},
                    ${`규칙갭 제안16+17 자가진단: 카페명이 ${label === "도로명" ? "등록주소 도로명과 일치" : "아파트단지 표기(N차아파트) 포함"}(카페#${c.id}, 등록주소: ${c.address ?? "정보없음"}).`.slice(0, 200)},
                    '품질본부', 'HIGH', 'L2', 'unpublish', ${JSON.stringify({ ids: [c.id], ikey: ik })}::jsonb,
                    ${`상호가 아니라 주소/단지 표기 파편으로 추정(${label}) — 기조실장 전결로 다음 사이클 자동 비공개.`})`.catch(() => {});
        }
      }
    }

    // 기록(검증·롤백 기준 + 관제탑 노출용)
    if (!dry) await sql`INSERT INTO rulegap_runs (published_before, learned, pending) VALUES (${pubNow}, ${JSON.stringify(learned)}::jsonb, ${JSON.stringify(pending)}::jsonb)`;

    if (!dry) await recordRun("cron-rulegap", true, `학습 ${learned.length} 승인대기 ${pending.length} 식당자동제외 ${autoExcluded} 롤백 ${rolledBack.length}`, learned.length);
    return NextResponse.json({
      ok: true, dry, ranAt: new Date().toISOString(), scanned,
      rolledBack, autoExcluded,
      learnedCount: learned.length, learned,
      pendingCount: pending.length, pending: pending.slice(0, 30),
    });
  } catch (e: any) {
    await recordRun("cron-rulegap", false, String(e?.message ?? e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, { status: 500 });
  }
}
