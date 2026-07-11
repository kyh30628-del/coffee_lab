import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { extractHighlights } from "@/lib/cafeProfile";
export const runtime = "nodejs";

// 카페소개 포스터(app/poster/cafe)용 — 검증등급(synth_grade='검증') 공개 카페만 대상.
// ①검색 선택 ②'오늘의 추천' 순환(2일 주기) ③상세(태그라인·하이라이트·검증 후기 발췌)를 한 라우트에서 처리.
// 모든 텍스트는 DB 실측(synth_identity·synth_reviews·char_scores) 파생 — 지어내지 않음.

type ReviewEntry = { quote?: string; trust?: string; score?: number; date?: string };

function pickQuote(reviews: ReviewEntry[]): string | null {
  const verified = (reviews || []).filter((r) => r?.trust === "verified" && r?.quote);
  if (!verified.length) return null;
  const best = [...verified].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  let q = (best.quote || "").trim();
  if (q.length > 90) q = q.slice(0, 88).trim() + "…";
  return q || null;
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const q = req.nextUrl.searchParams.get("q");
    const id = req.nextUrl.searchParams.get("id");
    const mode = req.nextUrl.searchParams.get("mode");

    if (id) {
      const idNum = Number(id);
      if (!Number.isInteger(idNum)) return NextResponse.json({ ok: false, error: "잘못된 id" }, { status: 400 });
      const rows = await sql`
        SELECT id, name, area, synth_grade, synth_identity, synth_count, synth_reviews
        FROM cafes WHERE id=${idNum} AND published=true LIMIT 1`;
      const c = rows[0] as any;
      if (!c) return NextResponse.json({ ok: false, error: "카페를 찾을 수 없어요" }, { status: 404 });
      const reviews = (c.synth_reviews ?? []) as ReviewEntry[];
      const highlights = extractHighlights((Array.isArray(reviews) ? reviews : []).map((r) => r?.quote || ""));
      const quote = pickQuote(reviews);
      return NextResponse.json(
        {
          ok: true,
          cafe: {
            id: c.id,
            name: c.name,
            area: c.area,
            synthGrade: c.synth_grade,
            identity: c.synth_identity,
            reviewCount: c.synth_count ?? 0,
            highlights: highlights.slice(0, 3).map((h) => ({ label: h.label, emoji: h.emoji })),
            quote,
          },
        },
        { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } },
      );
    }

    if (mode === "rotate") {
      const cnt = await sql`SELECT count(*)::int AS n FROM cafes WHERE published=true AND synth_grade='검증'`;
      const n = (cnt[0] as any)?.n ?? 0;
      if (!n) return NextResponse.json({ ok: true, cafe: null });
      // 이틀에 1회 주기 순환 — 날짜 기반 결정론 인덱스(대표님이 언제 열어도 같은 2일 안엔 같은 추천).
      const dayIdx = Math.floor(Date.now() / 86_400_000);
      const offset = Math.floor(dayIdx / 2) % n;
      const rows = await sql`
        SELECT id, name, area FROM cafes WHERE published=true AND synth_grade='검증'
        ORDER BY id OFFSET ${offset} LIMIT 1`;
      return NextResponse.json({ ok: true, cafe: rows[0] ?? null }, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
    }

    // 검색(기본): 이름 부분일치, 검증등급만.
    const query = (q ?? "").trim();
    if (query.length < 1) return NextResponse.json({ ok: true, cafes: [] });
    const rows = await sql`
      SELECT id, name, area FROM cafes
      WHERE published=true AND synth_grade='검증' AND name ILIKE ${"%" + query + "%"}
      ORDER BY synth_count DESC NULLS LAST LIMIT 8`;
    return NextResponse.json({ ok: true, cafes: rows }, { headers: { "Cache-Control": "public, max-age=0, must-revalidate" } });
  } catch {
    return NextResponse.json({ ok: false, error: "일시적 오류 — 잠시 후 다시 시도해 주세요" }, { status: 500 });
  }
}
