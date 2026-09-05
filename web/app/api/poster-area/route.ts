import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { extractHighlights } from "@/lib/cafeProfile";
export const runtime = "nodejs";

// 지역소개 포스터(app/poster/area)용 — 구/시 단위(area 컬럼, lib/region.ts 단일출처와 동일 키) 기준.
// ①지역 목록(드롭다운) ②선택 지역의 검증등급 상위 카페 3~5곳(이름+한줄 하이라이트)+보조 통계를 한 라우트에서 처리.
// 하이라이트는 전부 DB 실측(synth_reviews 긍정 언급 집계 · synth_identity) 파생 — 지어내지 않음.
// 목록은 /area/[gu] 페이지와 동일 기준(공개 카페 5곳 이상)만 노출해 포스터로 소개할 만한 규모만 다룬다.

type ReviewEntry = { quote?: string };

function taglineFirst(identity: string | null): string | null {
  if (!identity) return null;
  const seg = identity.split("·")[0]?.trim();
  return seg || null;
}

// 카페 1곳의 한줄 하이라이트 — ①검증 후기에서 긍정 언급 최다 특징 ②없으면 태그라인(synth_identity) 첫 segment.
function cafeHighlight(identity: string | null, reviews: ReviewEntry[]): string | null {
  const quotes = (reviews || []).map((r) => r?.quote || "").filter(Boolean);
  const top = extractHighlights(quotes, 1)[0];
  if (top) return `${top.emoji} ${top.label}`;
  return taglineFirst(identity);
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const area = req.nextUrl.searchParams.get("area");

    if (area) {
      const rows = await sql`
        SELECT
          count(*)::int AS cafe_count,
          count(*) FILTER (WHERE synth_grade='검증')::int AS verified_count,
          COALESCE(SUM(synth_count) FILTER (WHERE synth_grade='검증'), 0)::int AS verified_reviews
        FROM cafes WHERE published=true AND area=${area}`;
      const r = rows[0] as any;
      if (!r || !r.cafe_count) return NextResponse.json({ ok: false, error: "해당 지역 데이터가 없어요" }, { status: 404 });
      const topRows = await sql`
        SELECT name, synth_identity, synth_reviews FROM cafes WHERE published=true AND area=${area}
        ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT 5`;
      const topCafes = (topRows as any[]).map((x) => ({
        name: x.name as string,
        highlight: cafeHighlight(x.synth_identity, Array.isArray(x.synth_reviews) ? x.synth_reviews : []),
      }));
      return NextResponse.json(
        {
          ok: true,
          stats: {
            area,
            cafeCount: r.cafe_count,
            verifiedCount: r.verified_count,
            verifiedReviews: r.verified_reviews,
            topCafes,
          },
        },
        { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } },
      );
    }

    // 목록: 포스터로 소개할 만한 규모(공개 카페 5곳 이상)의 지역만.
    const rows = await sql`
      SELECT area, count(*)::int AS n FROM cafes
      WHERE published=true AND area IS NOT NULL AND area <> ''
      GROUP BY area HAVING count(*) >= 5 ORDER BY n DESC LIMIT 100`;
    return NextResponse.json({ ok: true, areas: rows }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ ok: false, error: "일시적 오류 — 잠시 후 다시 시도해 주세요" }, { status: 500 });
  }
}
