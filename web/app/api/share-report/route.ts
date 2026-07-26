import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { CHAR_AXES } from "@/lib/charScore";
import { guOf } from "@/lib/region";

export const runtime = "nodejs";

// 📣 공개 '사장님 리포트' — 카페별 순위·정체성·대표 강점(전부 이미 공개된 큐레이션 데이터).
//   사장님 아웃리치: 이 리포트 링크/QR을 사장님이 보고 공유 → 유입(B2B 바이럴). 인증 없음(공개 카페만).
//   동네 분류(guOf)는 lib/region 단일출처 — 예전 로컬 `split[1]`은 '서울 중구'와 '인천 중구'를 한 풀로 병합했다.

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id)) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
    const me = (await sql`SELECT id, name, area, synth_grade, synth_count, synth_identity, char_scores, published FROM cafes WHERE id = ${id} LIMIT 1`)[0] as any;
    if (!me || !me.published) return NextResponse.json({ ok: false, error: "공개된 카페가 아닙니다" }, { status: 404 });

    const myGu = guOf(me.area);
    const hood = (await sql`SELECT id, name, area, synth_count, char_scores FROM cafes WHERE published = true`) as any[];
    const inHood = hood.filter((c) => guOf(c.area) === myGu);
    // 순위 동점 시 id로 타이브레이크(2026-07-26) — ORDER BY 없는 SELECT라 정렬 전 배열 순서가 보장 안 돼,
    // 리뷰수 같은 카페끼리는 순위가 재조회 때마다 흔들릴 수 있었다(badge/[cafeId] 라우트와 동일 원칙 통일).
    const sorted = [...inHood].sort((a, b) => (b.synth_count ?? 0) - (a.synth_count ?? 0) || Number(a.id) - Number(b.id));
    const rank = sorted.findIndex((c) => Number(c.id) === Number(me.id)) + 1; // 동명 카페 순위 오식별 방지(2026-07-02)

    // 대표 강점: 내 점수 높고 동네에서 흔치 않은 축(차별점)
    const cs = me.char_scores || {};
    const ranked = CHAR_AXES.map((ax) => {
      const myV = Number(cs[ax.key] ?? 0);
      const pen = inHood.length ? Math.round(100 * inHood.filter((c) => Number((c.char_scores || {})[ax.key] ?? 0) >= 2).length / inHood.length) : 0;
      return { key: ax.key, label: ax.label, emoji: ax.emoji, myV, pen };
    }).filter((x) => x.myV >= 2).sort((a, b) => (b.myV - a.myV) || (a.pen - b.pen));
    const top = ranked[0] || null;

    return NextResponse.json({
      ok: true,
      id: me.id, name: me.name, area: me.area, gu: myGu,
      grade: me.synth_grade, count: me.synth_count ?? 0,
      identity: me.synth_identity || "",
      rank, hoodCount: inHood.length,
      topStrength: top ? { label: top.label, emoji: top.emoji, rare: top.pen <= 30 } : null,
      strengths: ranked.slice(0, 3).map((r) => ({ label: r.label, emoji: r.emoji })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
