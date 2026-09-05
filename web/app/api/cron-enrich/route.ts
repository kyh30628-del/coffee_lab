import { NextRequest, NextResponse } from "next/server";
import { noteSilentFail } from "@/lib/silentFail";
import { bulkUpdateDerived } from "@/lib/neonWriter";
import { sql, ensureSchema } from "@/lib/db";
import { reputationSignals } from "@/lib/enrich";
import { recordRun } from "@/lib/agentLog";
import { startJobRun } from "@/lib/blobBudget";
import { openScope } from "@/lib/writeScope";
import { fingerprintOf } from "@/lib/runLedger";

export const runtime = "nodejs";
export const maxDuration = 300;

// ✨ 상세 강화 에이전트 — 검증 리뷰에서 평판 신선도·하락 감지(최근 평 갈림/노후).
//   메뉴·가격은 리뷰가 부정확한 소스라 추출 안 함 → 권위 원천(네이버 플레이스)으로 연결.
//   공개 게이트는 안 건드림. 토큰 0(규칙). enriched_at 커서로 전 공개카페 순환.

const authed = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return (!!s && req.headers.get("authorization") === `Bearer ${s}`) || !s;
};

export async function GET(req: NextRequest) {
  startJobRun("cron-enrich"); openScope("cron-enrich"); // 💰🔐 하네스 L1·L3 — 큰 컬럼 계량 + 쓰기 스코프
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS recent_ratio REAL`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS reputation_note TEXT`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ`.catch(() => {});

    // 📈 2026-08-29: 기본 400 → 800. 실측 — 하루 새 일감 1,365곳인데 처리는 800곳(400×2회)뿐이라
    //   적체가 **매일 565곳씩 늘고** 있었다(현재 4,034곳). 800×2=1,600 > 1,365 → 적체가 줄어든다.
    //   💰 비용: 카페당 읽는 양 1.5KB → 정상화 후 월 +0.02GB(전송량 340GB의 0.007%). 무시 가능.
    //   왕복은 오히려 준다(아래 묶음 UPDATE로 800회 → 2회).
    // 🏅 동네 순위 갱신(2026-08-30) — 소비자 화면에 "○○시 N곳 중 M위"를 띄우기 위한 값.
    //
    //   왜 필요한가(CEO: "자발적으로 들어오고 우리 서비스를 알 수 있게 하는 방식이 가장 좋지 않을까"):
    //   지금 순위는 **사장님 리포트에만** 있다. 그래서 사장님이 자기 가게를 검색해 우리 페이지를 찾아와도
    //   자랑할 만한 사실이 안 보여 그냥 지나간다. 순위를 공개 화면에 세우면
    //   ①사장님이 발견해 스스로 찾아오고 ②자랑거리라 공유하며 ③손님에게도 신뢰 신호가 된다.
    //   보내는 것(DM·법적 위험)이 아니라 **찾아오게 하는** 방식이다.
    //
    //   💰 비용: **윈도우 쿼리 1회**(실측 1.2초)로 전 카페 순위를 한 번에 계산해 컬럼에 저장한다.
    //     페이지에서 동네 전체를 조회하면 18,929페이지 × ISR마다 스캔이라 감당이 안 된다
    //     (이 저장소가 이미 데인 패턴 — 08-17 사고 주석 참조). 계산은 여기서 1회, 읽기는 공짜.
    //   ⚠️ 새 크론을 만들지 않고 이미 도는 이 잡에 얹는다(함수 실행 추가 0).
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS area_rank INT`.catch(() => {});
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS area_total INT`.catch(() => {});
    let ranked = 0;
    // 💰 2026-09-05(CEO 승인 비용 다이어트): 순위는 RANK 연쇄 특성상 매회 ~7,411행이 실변경돼
    //   하루 4회 = 3만 행 쓰기였다. 소비자 화면의 순위는 하루 1회면 충분 → 08시 KST(23 UTC) 회차만 계산.
    //   (IS DISTINCT FROM 가드는 유지 — 안 바뀐 행은 그때도 안 쓴다.)
    const isRankHour = new Date().getUTCHours() === 23;
    if (isRankHour) try {
      const rk = (await sql`WITH r AS (
        SELECT id,
               RANK() OVER (PARTITION BY area ORDER BY COALESCE(synth_count,0) DESC, id ASC) rk,
               COUNT(*) OVER (PARTITION BY area) tot
        FROM cafes WHERE published)
        UPDATE cafes c SET area_rank = r.rk, area_total = r.tot
        FROM r WHERE c.id = r.id AND (c.area_rank IS DISTINCT FROM r.rk OR c.area_total IS DISTINCT FROM r.tot)
        RETURNING c.id`) as any[];
      ranked = rk.length;
    } catch (e) { await noteSilentFail("cron-enrich.rank", e); }

    const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 800, 1), 2000);
    const rows = (await sql`SELECT id, name, synth_reviews, review_dates FROM cafes
      WHERE published AND synth_reviews IS NOT NULL
        AND (enriched_at IS NULL OR enriched_at < synth_updated)
      ORDER BY enriched_at ASC NULLS FIRST LIMIT ${limit}`) as any[];

    let processed = 0, declining = 0;
    // ⚡ 카페마다 UPDATE 1회(=왕복 1회)를 돌던 것을 **한 방**으로 묶는다. 800곳 = 800왕복 → 2왕복.
    const out: { id: number; recent_ratio: number | null; reputation_note: string | null }[] = [];
    const declineNames: string[] = [];
    const parse = (o: any): any[] => { let a = o; if (typeof a === "string") { try { a = JSON.parse(a); } catch { return []; } } return Array.isArray(a) ? a : (a && a.reviews) || []; };
    for (const c of rows) {
      // 평판·감성: 검증 노출본(옥석, 오염 적음)
      const verifiedQuotes = parse(c.synth_reviews).map((r: any) => (typeof r === "string" ? r : (r.quote || r.title || ""))).filter(Boolean);
      const rep = reputationSignals(verifiedQuotes, c.review_dates);

      if (rep.declineNote && rep.declineNote.startsWith("최근 평")) { declining++; if (declineNames.length < 8) declineNames.push(c.name); }

      out.push({ id: Number(c.id), recent_ratio: rep.recentRatio ?? null, reputation_note: rep.declineNote ?? null });
      processed++;
    }

    // 일괄 반영 — 화이트리스트(derivedColumns) 강제 + UPDATE...FROM(VALUES)라 INSERT 불가.
    let written = 0;
    if (out.length) {
      try {
        const res = await bulkUpdateDerived(out.map((o) => ({ ...o, enriched_at: new Date().toISOString() })));
        written = res.updated;
      } catch (e) { await noteSilentFail("cron-enrich.bulk", e); }
    }

    const detail = `평판점검 ${processed}(반영 ${written}) 평하락 ${declining} · 순위갱신 ${ranked}곳`;
    // 📒 하네스 L5 — 지문은 **남은 일(백로그)** 기준. 할 일이 없으면(0) 지문을 안 남긴다 —
    //   "일이 없어 조용한 것"과 "일이 있는데 못 끝내는 것"을 구분해야 정체 탐지가 소음이 안 된다.
    await recordRun("cron-enrich", true, detail, processed, { fingerprint: (processed) > 0 ? fingerprintOf({ processed }) : undefined, metrics: { processed } });
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), processed, declining, declineNames, remaining: rows.length === limit });
  } catch (e) {
    await recordRun("cron-enrich", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
