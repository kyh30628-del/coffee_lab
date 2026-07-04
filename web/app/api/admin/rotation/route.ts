import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { subscriptionLive } from "@/lib/flags";
import { rotateFeatured, peakInfo } from "@/lib/exposureRotation";
export const runtime = "nodejs";

// 🔁 노출 로테이션 현황(관리자) — 지금 이 순간 누가 어떤 순서로 노출되는지, 피크 여부·다음 회전까지, 전체+구/군별.
//   실제 discover와 동일한 rotateFeatured로 계산(SUBSCRIPTION_LIVE off여도 미리 확인 가능).
const authed = (req: NextRequest) =>
  !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

const FEAT_CAP = 6;
// 지번/area에서 구·시·군 추출(광역시 infix 주의 — 마지막 구/시/군 토큰). discover guOf와 동일 취지.
function guOf(area: string): string {
  const a = (area ?? "").trim();
  const incheon = a.includes("인천");
  const toks = a.match(/[가-힣]+[구시군]/g) || [];
  const gu = toks.length ? toks[toks.length - 1] : (a.split(/\s+/)[0] || "기타");
  return incheon ? "인천 " + gu : gu;
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await ensureSchema();
    const now = Date.now();
    const rows = await sql`
      SELECT c.id, c.name, c.area, c.published
      FROM cafe_promos p JOIN cafes c ON c.id = p.cafe_id
      WHERE p.featured = true AND p.approved = true AND (p.featured_until IS NULL OR p.featured_until > now())
    ` as unknown as { id: number; name: string; area: string; published: boolean }[];

    const pi = peakInfo(now);
    const minInSlice = pi.minuteOfDay % 20;
    const nextRotateInMin = 20 - minInSlice;

    // 순서에 노출여부·순위 부여
    const order = (pool: typeof rows) => {
      const rotated = rotateFeatured(pool, pool.length, now); // 전체 순서(자름 없이)
      return rotated.map((c, i) => ({ id: c.id, name: c.name, area: c.area, published: c.published, rank: i + 1, onair: i < FEAT_CAP }));
    };

    const global = order(rows);
    // 구/군별
    const byGuMap = new Map<string, typeof rows>();
    for (const c of rows) { const g = guOf(c.area); if (!byGuMap.has(g)) byGuMap.set(g, []); byGuMap.get(g)!.push(c); }
    const byGu = [...byGuMap.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([gu, pool]) => ({ gu, count: pool.length, order: order(pool) }));

    return NextResponse.json({
      ok: true,
      now,
      liveExposure: subscriptionLive(), // false면 아래 순서는 '예정'(소비자엔 아직 안 보임)
      cap: FEAT_CAP,
      total: rows.length,
      isPeak: pi.isPeak,
      peakWindow: "09:00–17:00 KST",
      sliceMin: 20,
      nextRotateInMin,
      global,
      byGu,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
