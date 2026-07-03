import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
export const runtime = "nodejs";

// "📈 요즘 뜨는 카페" — 별점(미제공) 대신 우리 소유 데이터로 모멘텀 산출.
// 1차 신호(지금 작동): 최근 90/30일 검증 후기 게시 수 = 입소문 버즈(review_dates 기반).
// 2차 신호(스냅샷 누적 시): 주간 검증 리뷰 수 증가분(Δ) = 상승세. 둘 다 환각 없이 실데이터.
const recentN = (dates: unknown, days: number): number => {
  if (!Array.isArray(dates)) return 0;
  const cut = Date.now() - days * 86400000;
  let n = 0;
  for (const d of dates) { const t = Date.parse(String(d).replace(/\./g, "-")); if (!isNaN(t) && t >= cut) n++; }
  return n;
};
function inRegion(area: string, region: string): boolean {
  if (!region) return true;
  const a = area ?? "";
  // 인천 동명 구(중구·동구) 구분 — search/route.ts와 동일 기준
  if (region.startsWith("인천")) {
    const gu = region.replace(/^인천\s*/, "");
    return a.startsWith("인천") && (a.includes(gu) || a.includes(region));
  }
  if (a.startsWith("인천")) return false;
  if (a.includes(region)) return true;
  const s = region.replace(/(특별시|광역시|시|군|구)$/, "");
  return s.length >= 2 && a.includes(s);
}

export async function GET(req: NextRequest) {
  try {
    await ensureSchema();
    const region = (req.nextUrl.searchParams.get("region") ?? "").trim();

    // 스냅샷 증가분(Δ): 5일 이상 전 스냅샷이 있으면 상승세 계산
    const deltaMap = new Map<number, number>();
    let hasDelta = false;
    try {
      const snapDates = (await sql`SELECT DISTINCT snap_date FROM cafe_snapshots ORDER BY snap_date`) as unknown as { snap_date: string }[];
      if (snapDates.length >= 2) {
        const span = (Date.parse(String(snapDates[snapDates.length - 1].snap_date)) - Date.parse(String(snapDates[0].snap_date))) / 86400000;
        if (span >= 5) {
          hasDelta = true;
          const base = (await sql`SELECT DISTINCT ON (cafe_id) cafe_id, rating_count FROM cafe_snapshots WHERE snap_date <= CURRENT_DATE - 5 ORDER BY cafe_id, snap_date DESC`) as unknown as { cafe_id: number; rating_count: number | null }[];
          for (const b of base) if (b.rating_count != null) deltaMap.set(b.cafe_id, b.rating_count);
        }
      }
    } catch { /* 스냅샷 없음 → 버즈만 사용 */ }

    const rows = (await sql`SELECT id, name, area, synth_grade, synth_count, synth_identity, review_dates, char_scores
      FROM cafes WHERE published = true AND review_dates IS NOT NULL`) as unknown as
      { id: number; name: string; area: string; synth_grade: string | null; synth_count: number | null; synth_identity: string | null; review_dates: unknown; char_scores: Record<string, number> | null }[];

    const scored: any[] = [];
    for (const c of rows) {
      if (!inRegion(c.area ?? "", region)) continue;
      const total = c.synth_count ?? 0;
      const r90 = recentN(c.review_dates, 90);
      const r30 = recentN(c.review_dates, 30);
      if (r90 < 3) continue; // 최근 버즈가 의미 있는 곳만
      const share = total > 0 ? r90 / total : 0;
      const delta = hasDelta && deltaMap.has(c.id) ? total - (deltaMap.get(c.id) ?? total) : null;
      // '요즘 뜨는' = 가장 최근 한 달(30일)을 가장 무겁게(×2) + 3개월(90일) 버즈 + 최근 집중도 보정.
      let score = r30 * 2 + r90 * (0.6 + 0.8 * Math.min(share, 1));
      if (delta && delta > 0) score += delta * 3;
      // 커피 카테고리 정체성 보너스 — 디저트/베이커리 언급이 다른 특성보다 두드러지지 않는 곳만 부여.
      // 베이커리류가 리뷰 회전(버즈)만으로 '요즘 뜨는'을 과점하는 편향 완화(결함C).
      const cs = c.char_scores ?? {};
      const dessert = cs.dessert ?? 0;
      const coffeeAxes = (cs.roast ?? 0) + (cs.work ?? 0) + (cs.quiet ?? 0) + (cs.mood ?? 0) + (cs.space ?? 0);
      if (dessert <= coffeeAxes) score *= 1.25;
      const reason = (delta && delta > 0)
        ? `최근 검증후기 +${delta}건 늘며 상승세 · 3개월 ${r90}건`
        : (r30 >= 2 ? `최근 3개월 ${r90}건 (한 달새 ${r30}건) 입소문` : `최근 3개월 검증후기 ${r90}건 집중`);
      scored.push({ id: c.id, name: c.name, area: c.area, lat: 0, lng: 0, grade: c.synth_grade, count: total, identity: c.synth_identity, note: null, beanNote: [], reason, _s: score });
    }
    scored.sort((a, b) => b._s - a._s);
    const rising = scored.slice(0, 12).map(({ _s, ...x }) => x);
    return NextResponse.json({ ok: true, region: region || "수도권 전체", hasDelta, count: rising.length, rising }, {
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
