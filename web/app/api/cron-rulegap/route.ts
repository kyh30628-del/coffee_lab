import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureLearnedTable, loadLearnedTerms, getLearned, applyLearned, rollbackLearned } from "@/lib/learnedTerms";

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
const DISTRICT_THRESHOLD = 5; // 생활권 자동학습: 이만큼의 서로 다른 카페에서 오염으로 등장해야

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
    const OFF_CAT = /(애견|애완|반려동물|펫카페|고양이카페|동물카페|키즈|실내놀이터|놀이방|스터디카페|독서실|만화방|만화카페|룸카페|멀티방|파티룸|방탈출|보드게임|보드카페|볼링|당구|스크린골프|골프연습|코인노래|노래방|찜질방|사우나|클라이밍|트램폴린|트램펄린|서점)/;
    const GOOD_NAME = /(카페|까페|커피|로스터|로스팅|브런치|디저트|베이커리|베이글|제과|찻집|티하우스|coffee|cafe)/i;
    const okIds = new Set(((await sql`SELECT term FROM learned_terms WHERE kind='cafe_ok' AND status='active'`) as { term: string }[]).map((r) => String(r.term)));
    const catCafes = (await sql`SELECT id, name, COALESCE(naver_category,'') cat FROM cafes WHERE published=true AND naver_category IS NOT NULL AND naver_category <> ''`) as { id: number; name: string; cat: string }[];
    const unknownByCat: Record<string, { n: number; samples: number[] }> = {};
    let offConcept = 0;
    for (const c of catCafes) {
      if (GOOD_CAT.test(c.cat)) continue;                 // 카페 업종 — 통과
      if (OFF_CAT.test(c.cat)) { offConcept++; continue; } // 오프콘셉(heal 처리)
      if (GOOD_NAME.test(c.name)) continue;               // 업종은 애매해도 '이름이 카페형'(로스터리 등 오분류) — 통과
      if (okIds.has(String(c.id))) continue;               // 사람이 검토·승인(유지)한 카페 — 재플래그 안 함
      const e = unknownByCat[c.cat] || (unknownByCat[c.cat] = { n: 0, samples: [] });
      e.n++; if (e.samples.length < 6) e.samples.push(c.id);
    }
    for (const [cat, e] of Object.entries(unknownByCat).sort((a, b) => b[1].n - a[1].n)) {
      pending.push({ kind: "category_unknown", term: cat, cafes: e.n, samples: e.samples, reason: "업종·이름 모두 카페 신호 없음 — 콘셉트 적합성 검토(승인)" });
    }
    if (offConcept > 0) pending.push({ kind: "category_offconcept", term: "(오프콘셉 잔여)", cafes: offConcept, reason: "오프콘셉 업종 공개 중 — heal이 자동 비공개 예정" });

    // 기록(검증·롤백 기준 + 관제탑 노출용)
    if (!dry) await sql`INSERT INTO rulegap_runs (published_before, learned, pending) VALUES (${pubNow}, ${JSON.stringify(learned)}::jsonb, ${JSON.stringify(pending)}::jsonb)`;

    return NextResponse.json({
      ok: true, dry, ranAt: new Date().toISOString(), scanned,
      rolledBack,
      learnedCount: learned.length, learned,
      pendingCount: pending.length, pending: pending.slice(0, 30),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 300) }, { status: 500 });
  }
}
