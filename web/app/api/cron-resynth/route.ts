import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { synthAndStore } from "@/lib/synthStore";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    // 일반 순환 — 한 번에 3곳씩(비용·시간 보호), 가장 오래 갱신 안 된 순.
    const genTargets = await sql`
      SELECT id, name, area FROM cafes
      WHERE published = true
      ORDER BY synth_updated ASC NULLS FIRST
      LIMIT 3
    ` as unknown as { id: number; name: string; area: string }[];
    // 구독 카페 우선 + 일반 순환, 중복 제거, 최대 4곳(구독자 있을 때만 1곳 추가 비용).
    const seen = new Set<number>();
    const targets = [...subTargets, ...genTargets].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))).slice(0, 4);

    const results = [];
    for (const cafe of targets) {
      try { results.push(await synthOne(cafe)); }
      catch (e) { results.push({ name: cafe.name, ok: false, error: String(e) }); }
      await new Promise((r) => setTimeout(r, 400));
    }
    await recordRun("cron-resynth", true, `raw정리 ${purged.length} 유튜브 ${ytRefreshed.length} 재합성 ${results.length}(구독우선 ${subTargets.length})`, results.length);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), rawPurged: purged.length, ytRefreshed: ytRefreshed.length, results });
  } catch (e) {
    await recordRun("cron-resynth", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
