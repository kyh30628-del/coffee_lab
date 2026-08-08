import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";
import { fingerprintOf } from "@/lib/runLedger";
import { startJobRun, runUsage } from "@/lib/blobBudget";
import { sortReviews } from "@/lib/exposureOrder";
import { ownBranch, isOtherBranchQuote } from "@/lib/branchQuote";
import { quoteMatchConfidence } from "@/lib/reviewQuality";
import { isCostHalted } from "@/lib/costGuard";
export const runtime = "nodejs";
export const maxDuration = 120;

// 👁️ 노출 감시자 — 하네스 L5 / 경험본부·노출품질팀(신설).
//
// 왜 이 감시자가 필요한가(2026-08-08): 이틀 사이 CEO가 **직접** 두 건을 잡아냈다.
//   ① 피기스터하우스(구리) 대표 6건에 '돈제당'(식당) 후기 — 참고등급이 검증등급을 밀어냄
//   ② 쉐프부랑제 사우점 대표 6건에 '운양점' 후기 — 다른 지점 글
//   **둘 다 데이터는 깨끗했다.** 후기도 진짜, 등급도 정상, 오염 스캐너도 통과. 화면에 나가는 순서만 틀렸다.
//   품질본부는 데이터를 보고 경험본부는 검색을 보는데, "카페 상세에 실제로 무엇이 뜨는가"를 보는 주체가 없었다.
//
// 설계 원칙
//   · **소비자와 똑같은 것을 본다** — `lib/exposureOrder.sortReviews`를 소비자 API와 공유(갈라질 수 없게).
//   · **집행 권한 없음(L0)** — 감지·보고만. 정렬 규칙 변경은 코드라 L3(CEO 결재).
//   · **전수 스캔 금지** — 하루 300곳 층화 샘플. 45일이면 전량이 한 바퀴 돈다.
//   · **큰 컬럼 금지** — synth_reviews 상위 8건의 quote/trust/score만 SQL 안에서 잘라 가져온다.

const SAMPLE = 300;

export async function GET(req: NextRequest) {
  startJobRun("cron-exposure");
  const started = Date.now();
  try {
    if (process.env.CRON_SECRET && req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
        && req.nextUrl.searchParams.get("key") !== process.env.CRON_SECRET) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    await ensureSchema();
    if (await isCostHalted()) { await recordRun("cron-exposure", true, "🛑 비용 자동정지 중 — 스킵", 0).catch(() => {}); return NextResponse.json({ ok: true, skipped: "cost-halt" }); }

    // 층화 샘플: 지점 카페(다른 지점 오염 위험군) + 최근 재합성분 + 무작위.
    //   ⚠️ 조회 1회. synth_reviews_all·raw_reviews는 건드리지 않는다.
    const rows = (await sql`
      WITH pool AS (
        SELECT id, name, area, dong, synth_grade,
               jsonb_path_query_array(COALESCE(synth_reviews,'[]'::jsonb), '$[0 to 7]') ev,
               (name ~ '(본점|지점|[가-힣A-Za-z0-9]{2,10}점)$') AS is_branch,
               synth_updated
        FROM cafes WHERE published AND synth_reviews IS NOT NULL
      )
      (SELECT * FROM pool WHERE is_branch ORDER BY md5(id::text) LIMIT ${Math.floor(SAMPLE / 3)})
      UNION ALL
      (SELECT * FROM pool WHERE NOT is_branch ORDER BY synth_updated DESC NULLS LAST LIMIT ${Math.floor(SAMPLE / 3)})
      UNION ALL
      (SELECT * FROM pool WHERE NOT is_branch ORDER BY md5(id::text || 'x') LIMIT ${Math.floor(SAMPLE / 3)})
    `) as any[];

    const nowT = Date.now();
    const bad = { refOverVerified: [] as number[], otherBranch: [] as number[], nameMismatch: [] as number[] };
    let checked = 0;

    for (const c of rows) {
      const ev = Array.isArray(c.ev) ? c.ev : [];
      if (ev.length === 0) continue;
      checked++;
      const areaTerms = [c.area, c.dong].filter(Boolean) as string[];
      // 소비자 API와 **같은 함수**로 정렬 → 사용자가 실제로 보는 상위 6건
      const shown = sortReviews(ev, c.name ?? "", areaTerms, nowT, c.dong).slice(0, 6);

      // ① 검증이 아래에 대기 중인데 상위에 참고가 있다 (2026-08-05 사고 유형)
      const shownRefs = shown.filter((r: any) => r?.trust !== "verified").length;
      const verifiedBelow = ev.filter((r: any) => r?.trust === "verified").length - shown.filter((r: any) => r?.trust === "verified").length;
      if (shownRefs > 0 && verifiedBelow > 0) bad.refOverVerified.push(c.id);

      // ② 지점 카페인데 다른 지점 글이 상위에 (2026-08-08 사고 유형)
      //   ⚠️ 임계 2건 — 정렬 규칙이 이미 1건은 뒤로 민다. 그래도 2건+ 남았다면 '밀어낼 자기 후기가 없다'는
      //   구조적 신호다(1건만 남는 건 정상 범위라 경보하면 워치리스트가 소음이 된다).
      const own = ownBranch(c.name ?? "", c.dong);
      if (own && shown.filter((r: any) => isOtherBranchQuote(String(r?.quote ?? ""), own)).length >= 2) bad.otherBranch.push(c.id);

      // ③ 상위 6건이 **전부** 카페명조차 안 맞음 (#307 계열)
      //   ⚠️ '1건이라도'로 잡으면 표본 300곳 중 24곳(8%)이 걸렸는데, 과거 전수감사에서 이 신호는
      //   **RED의 ~90%가 오탐**으로 확인됐다(생성어·단명 카페는 자기 후기도 conf=0으로 계산됨).
      //   그래서 '전부 불일치'(= 진짜로 남의 후기만 보고 있음)일 때만 경보한다 — 정밀도 > 재현율.
      const confs = shown.map((r: any) => quoteMatchConfidence(c.name ?? "", String(r?.quote ?? ""), areaTerms));
      if (confs.length >= 3 && confs.every((x: number) => x === 0)) bad.nameMismatch.push(c.id);
    }

    const total = bad.refOverVerified.length + bad.otherBranch.length + bad.nameMismatch.length;
    const clean = total === 0;
    const detail = `노출표본 ${checked}곳 · ${clean ? "정상 ✅" : `⚠️ 참고역전 ${bad.refOverVerified.length}·타지점 ${bad.otherBranch.length}·이름불일치 ${bad.nameMismatch.length}`}`;

    await sql`CREATE TABLE IF NOT EXISTS sentinel_reports (id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), clean BOOLEAN, report JSONB)`.catch(() => {});
    await sql`INSERT INTO sentinel_reports (clean, report) VALUES (${clean}, ${JSON.stringify({
      kind: "exposure", checked,
      refOverVerified: bad.refOverVerified.slice(0, 40),
      otherBranch: bad.otherBranch.slice(0, 40),
      nameMismatch: bad.nameMismatch.slice(0, 40),
    })}::jsonb)`.catch(() => {});

    const u = runUsage();
    await recordRun("cron-exposure", true, detail, checked, {
      fingerprint: fingerprintOf({ ref: bad.refOverVerified.length, br: bad.otherBranch.length, nm: bad.nameMismatch.length,
        targets: [...bad.refOverVerified, ...bad.otherBranch, ...bad.nameMismatch].map(String) }),
      metrics: { detected: total, blobReads: u?.blobReads ?? 0, wallMs: Date.now() - started },
    });
    return NextResponse.json({ ok: true, clean, checked, bad });
  } catch (e) {
    await recordRun("cron-exposure", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
