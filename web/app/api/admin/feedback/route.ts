import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 💬 사용자 한 줄 피드백 — 관제탑 조회 (2026-10-19, CEO 지시)
//   실사용자가 상세 페이지 하단(또는 지도·플레이스 외부 클릭 직후)에서 남긴 👍/👎 + 선택 텍스트.
//   우리에게 **실사용자 직접 피드백 채널이 없었다** — 품질을 전부 내부 지표로 추정했다.
//
// 💰 비용: 작은 테이블만 읽는다(user_feedback). cafes는 이름을 붙일 때만 id로 조인 —
//   큰 컬럼(raw_reviews·synth_reviews_all)은 건드리지 않는다. LIMIT으로 상한을 둔다.
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    // 테이블이 아직 없을 수 있다(첫 피드백 전) — 그때는 조용히 0으로 답한다.
    const exists = (await sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'user_feedback'`) as unknown[];
    if (!exists.length) return NextResponse.json({ ok: true, sum: { d7: { like: 0, meh: 0, note: 0 }, d30: { like: 0, meh: 0, note: 0 }, all: 0 }, items: [] });

    const [s] = (await sql`SELECT
      COUNT(*) FILTER (WHERE kind = 'like' AND created_at > now() - interval '7 days')::int like7,
      COUNT(*) FILTER (WHERE kind = 'meh'  AND created_at > now() - interval '7 days')::int meh7,
      COUNT(*) FILTER (WHERE COALESCE(note,'') <> '' AND created_at > now() - interval '7 days')::int note7,
      COUNT(*) FILTER (WHERE kind = 'like' AND created_at > now() - interval '30 days')::int like30,
      COUNT(*) FILTER (WHERE kind = 'meh'  AND created_at > now() - interval '30 days')::int meh30,
      COUNT(*) FILTER (WHERE COALESCE(note,'') <> '' AND created_at > now() - interval '30 days')::int note30,
      COUNT(*)::int all_
      FROM user_feedback`) as any[];

    // 🔴 글이 달린 것부터 먼저 보여준다 — 숫자(👍/👎)는 집계로 보고, **읽을 게 있는 것**이 먼저다.
    const items = (await sql`SELECT f.id, f.kind, f.note, f.cafe_id, f.path, f.place, f.created_at,
        c.name AS cafe_name, c.area AS cafe_area
      FROM user_feedback f LEFT JOIN cafes c ON c.id = f.cafe_id
      ORDER BY (COALESCE(f.note,'') <> '') DESC, f.created_at DESC
      LIMIT 120`) as any[];

    return NextResponse.json({
      ok: true,
      sum: {
        d7: { like: s.like7, meh: s.meh7, note: s.note7 },
        d30: { like: s.like30, meh: s.meh30, note: s.note30 },
        all: s.all_,
      },
      items: items.map((r) => ({
        id: Number(r.id), kind: r.kind, note: r.note || "", cafeId: r.cafe_id ? Number(r.cafe_id) : null,
        cafeName: r.cafe_name || null, cafeArea: r.cafe_area || null,
        path: r.path || "", place: r.place || "",
        at: r.created_at ? new Date(r.created_at).toISOString() : null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 120) }, { status: 500 });
  }
}
