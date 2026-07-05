import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore } from "@/lib/synthStore";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";
export const maxDuration = 300;

// 주간 재수집은 최신성 위해 새로 수집(raw 갱신)
const synthOne = (c: { id: number; name: string; area: string }) => synthAndStore(c, { refresh: true });

// 자동 실행 진입점: 가장 오래 갱신 안 된 카페 몇 곳을 재수집
export async function GET(req: NextRequest) {
  try {
    // 보안: 아무나 이 주소를 호출해 비용을 쓰지 못하게 비밀키 확인
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    await ensureSchema();
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_reviews JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS char_scores JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_quality JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS review_dates JSONB`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_checked_at TIMESTAMPTZ`.catch(() => {}); // 마지막 재점검 시각(커버리지 측정용)

    // 🔒 약관 준수: 수집한 외부 글(raw 스니펫)은 영구 보관하지 않고 '한시적 캐시'로만 둔다.
    // 90일 지난 raw는 파기 → warmup(00:10)이 필요 시 새로 수집. (표시용 1줄 인용·링크·파생분석은 유지)
    const RAW_TTL_DAYS = Number(process.env.RAW_TTL_DAYS || 90);
    const purged = await sql`UPDATE cafes SET raw_reviews = NULL
      WHERE raw_reviews IS NOT NULL AND raw_collected_at < now() - make_interval(days => ${RAW_TTL_DAYS})
      RETURNING id` as unknown as { id: number }[];

    // 📺 YouTube 개발자 정책 준수: 저장한 유튜브 API 데이터는 30일마다 갱신/삭제.
    // 30일 지난 카페의 유튜브 항목을 raw에서 제거 + yt_checked_at 초기화 → 백필이 최신으로 재수집.
    const YT_TTL_DAYS = Number(process.env.YT_TTL_DAYS || 30);
    const ytRefreshed = await sql`UPDATE cafes
      SET raw_reviews = COALESCE((SELECT jsonb_agg(e) FROM jsonb_array_elements(raw_reviews) e WHERE e->>'source' <> 'youtube'), '[]'::jsonb),
          yt_checked_at = NULL
      WHERE yt_checked_at IS NOT NULL AND yt_checked_at < now() - make_interval(days => ${YT_TTL_DAYS})
        AND raw_reviews @> '[{"source":"youtube"}]'
      RETURNING id` as unknown as { id: number }[];
    // 🎯 유료(active 구독) 사장님 카페 우선 — 사장님이 보는 분석이 항상 최신이도록. 2일 이상 지난 구독 카페 먼저.
    const subTargets = await sql`
      SELECT c.id, c.name, c.area FROM cafes c
      JOIN subscriptions s ON s.cafe_id = c.id AND s.status = 'active'
      WHERE c.published = true AND (c.synth_updated IS NULL OR c.synth_updated < now() - interval '2 days')
      ORDER BY c.synth_updated ASC NULLS FIRST
      LIMIT 3
    ` as unknown as { id: number; name: string; area: string }[];
    // 🧹 오염그물 재적용 — '진짜 필요한 카페만'(낭비 0). refresh:false=재수집X·규칙만 재적용, API·토큰·쿼터 0(순수 결정론).
    //   대상: ①새 리뷰 수집됨(raw_collected_at > synth_updated → 규칙 재적용 필요) ②4일+ 미갱신(규칙변경 자동커버, 전수 ~4일 순환).
    //   ⚠️ 신선한(4일 내·새 raw 없는) 카페는 재처리 안 함 → 안 변한 것 반복 재계산 낭비 제거. 필요한 것 우선(새 raw) 먼저.
    //   ⚠️ no-mass-unpublish 차단기: 100곳 이상 처리 후 비공개율 20% 초과 시 즉시 중단(버그성 대량비공개 방지, 인천사고 교훈).
    // synth_checked_at = '마지막 재점검 시각'(변경 여부 무관 매 재합성마다 갱신) → 이걸로 순환해야 실제 커버리지가 전진.
    //   (synth_updated는 '결과가 바뀐 시각'이라 안 변한 카페는 안 움직여 순환 기준으로 못 씀 — 2026-07-05 정정.)
    const GEN_CONC = 10, GEN_MAX = 150, GEN_RATE_LIMIT = 0.20; // 150/시×24=3,600/일 → 전수 ~4일(12,864/3,600)
    const genRows = (await sql`
      SELECT id, name, area, synth_count FROM cafes
      WHERE published = true AND raw_reviews IS NOT NULL
        AND (raw_collected_at > synth_checked_at OR synth_checked_at IS NULL OR synth_checked_at < now() - interval '4 days')
      ORDER BY (raw_collected_at > synth_checked_at) DESC, synth_checked_at ASC NULLS FIRST
      LIMIT ${GEN_MAX}
    `) as unknown as { id: number; name: string; area: string; synth_count: number }[];
    let gi = 0, gDone = 0, gChanged = 0, gErr = 0; const gUnpub: number[] = []; let gStop = false;
    const genWorker = async () => {
      while (!gStop) {
        const c = genRows[gi++]; if (!c) break;
        try {
          await synthAndStore({ id: c.id, name: c.name, area: c.area }, { refresh: false });
          const [a] = (await sql`SELECT synth_count, published FROM cafes WHERE id=${c.id}`) as unknown as { synth_count: number; published: boolean }[];
          gDone++;
          if (a.synth_count !== c.synth_count) gChanged++;
          if (!a.published) gUnpub.push(c.id);
          if (gDone >= 100 && gUnpub.length / gDone > GEN_RATE_LIMIT) gStop = true; // 차단기 발동
        } catch { gErr++; }
      }
    };

    // 🎯 구독(유료) 카페는 신선 재수집(refresh:true, 소량·쿼터보호) — 사장님 분석 항상 최신
    const subResults = [];
    for (const cafe of subTargets) {
      try { subResults.push(await synthOne(cafe)); }
      catch (e) { subResults.push({ name: cafe.name, ok: false, error: String(e) }); }
      await new Promise((r) => setTimeout(r, 200));
    }
    // 일반 순환(무료 대량) 동시 실행
    await Promise.all(Array.from({ length: GEN_CONC }, () => genWorker()));
    // 공개상태 바뀐 카페만 전 캐시 레이어 무효화(요청 컨텍스트라 ISR 무효화 정상). 없으면 내용변동분만 검색캐시 갱신.
    if (gUnpub.length) { const { invalidateCafeCaches } = await import("@/lib/cafeCacheInvalidate"); await invalidateCafeCaches(gUnpub).catch(() => {}); }
    else if (gChanged) await sql`DELETE FROM search_cache`.catch(() => {});

    await recordRun("cron-resynth", true, `raw정리 ${purged.length} 유튜브 ${ytRefreshed.length} · 구독재수집 ${subResults.length} · 전수적용 ${gDone}(변동 ${gChanged}·비공개 ${gUnpub.length}·오류 ${gErr})${gStop ? " ⚠️차단기발동" : ""}`, gDone);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), rawPurged: purged.length, ytRefreshed: ytRefreshed.length, subResynth: subResults.length, netApplied: gDone, changed: gChanged, unpublished: gUnpub.length, breaker: gStop });
  } catch (e) {
    await recordRun("cron-resynth", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
