import { sql, ensureOnce } from "./db";

// ☕📈 「동네 카페 창업 리포트」(2026-09-13, CEO 착수 지시 "성수동부터 3개")
//   우리 서비스의 핵심 재료 = 검증 후기로 만든 동네 카페 시장 정보. 이걸 가장 큰돈이 걸린 사람(예비 창업자)에게 판다.
//   원칙: ①네이버 후기 원문은 넣지 않는다(집계·우리 분석·인허가 공공데이터만 — 약관 7.3.③ 회피) ②큰 컬럼 미접촉(작은 컬럼·jsonb 날짜 배열만)
//         ③동네 하나에 쿼리 6개, ISR 24시간 — 봇이 훑어도 하루 1회. ④수집 시차가 있는 최근 2개월 후기 추이는 '집계 중'으로 정직 표기.
export type StartupReportDef = { slug: string; title: string; area: string; dongs: string[]; blurb: string };
export const STARTUP_REPORTS: StartupReportDef[] = [
  { slug: "seongsu", title: "성수동", area: "성동구", dongs: ["성수동1가", "성수동2가"], blurb: "공장 골목에서 서울 카페 1번지가 된 동네. 포화와 기회가 같이 있는 곳." },
  { slug: "yeonnam", title: "연남동", area: "마포구", dongs: ["연남동"], blurb: "경의선 숲길을 따라 골목마다 카페. 개성으로 승부하는 상권." },
  { slug: "mangwon", title: "망원동", area: "마포구", dongs: ["망원동"], blurb: "망리단길. 동네 손님과 나들이 손님이 섞이는 상권." },
];
export const REPORT_PRICE = 29000;
export const AXES: { key: string; label: string; emoji: string }[] = [
  { key: "roast", label: "직접 로스팅", emoji: "🔥" }, { key: "work", label: "작업·공부", emoji: "💻" }, { key: "quiet", label: "조용·혼자", emoji: "🤍" },
  { key: "dessert", label: "디저트", emoji: "🍰" }, { key: "mood", label: "분위기·사진", emoji: "📸" }, { key: "space", label: "넓은 공간", emoji: "🪑" },
  { key: "bakery", label: "베이커리", emoji: "🥐" }, { key: "brunch", label: "브런치", emoji: "🍳" }, { key: "view", label: "뷰", emoji: "🌄" },
  { key: "terrace", label: "테라스", emoji: "🌿" }, { key: "pet", label: "애견 동반", emoji: "🐶" }, { key: "nokids", label: "노키즈", emoji: "🚸" },
];
export type StartupReport = {
  def: StartupReportDef; generatedAt: string;
  cafes: number; verified: number; avgReviews: number; totalReviews: number; tripPct: number | null;
  axes: { key: string; label: string; emoji: string; n: number; pct: number }[]; openAxes: { label: string; emoji: string; pct: number }[];
  top: { id: number; name: string; count: number; grade: string | null; identity: string | null; topAxis: string | null }[];
  permits: { matched: number; opened12: number; closed12: number; tel: number; closeRate12: number | null; openedRecent: { name: string; opened: string }[] };
  trend: { ym: string; n: number; partial: boolean }[];
  queries: { q: string; n: number }[];
};
export function reportBySlug(slug: string): StartupReportDef | null { return STARTUP_REPORTS.find((r) => r.slug === slug) ?? null; }

export async function buildStartupReport(slug: string): Promise<StartupReport | null> {
  const def = reportBySlug(slug); if (!def) return null;
  const { area, dongs } = def;
  const base = (await sql`SELECT count(*)::int cafes, count(*) FILTER (WHERE synth_grade='검증')::int verified, COALESCE(round(avg(synth_count)),0)::int avg_rv,
      COALESCE(sum(synth_count),0)::int total_rv, round(avg(visitor_trip::float/NULLIF(visitor_n,0))*100)::int trip_pct
    FROM cafes WHERE published AND area=${area} AND dong = ANY(${dongs})`)[0] as any;
  const axRows = (await sql`SELECT k, count(*)::int n FROM cafes c, jsonb_each_text(c.char_scores) e(k,v)
    WHERE c.published AND c.area=${area} AND c.dong=ANY(${dongs}) AND v::numeric >= 2 GROUP BY 1`) as any[];
  const axMap = new Map(axRows.map((r) => [r.k, Number(r.n)]));
  const cafes = Number(base?.cafes ?? 0);
  const axes = AXES.map((a) => ({ ...a, n: axMap.get(a.key) ?? 0, pct: cafes ? Math.round(((axMap.get(a.key) ?? 0) / cafes) * 100) : 0 })).sort((a, b) => b.pct - a.pct);
  const openAxes = [...axes].filter((a) => a.pct <= 15).sort((a, b) => a.pct - b.pct).slice(0, 3).map((a) => ({ label: a.label, emoji: a.emoji, pct: a.pct }));
  const top = ((await sql`SELECT id, name, synth_count, synth_grade, synth_identity, char_scores FROM cafes
    WHERE published AND area=${area} AND dong=ANY(${dongs}) ORDER BY synth_count DESC NULLS LAST, id LIMIT 5`) as any[]).map((c) => {
    const cs = c.char_scores ?? {}; const best = [...AXES].sort((a, b) => Number(cs[b.key] ?? 0) - Number(cs[a.key] ?? 0))[0];
    return { id: Number(c.id), name: c.name, count: Number(c.synth_count ?? 0), grade: c.synth_grade ?? null, identity: c.synth_identity ?? null, topAxis: best && Number(cs[best.key] ?? 0) > 0 ? `${best.emoji} ${best.label}` : null };
  });
  const pr = (await sql`SELECT count(*)::int matched,
      count(*) FILTER (WHERE opened_ymd >= to_char(now()-interval '12 months','YYYY-MM-DD'))::int opened12,
      count(*) FILTER (WHERE status_cd='02' AND closed_ymd >= to_char(now()-interval '12 months','YYYY-MM-DD'))::int closed12,
      count(*) FILTER (WHERE tel<>'')::int tel
    FROM cafe_permits p JOIN cafes c ON c.id=p.cafe_id WHERE c.area=${area} AND c.dong=ANY(${dongs})`.catch(() => [{ matched: 0, opened12: 0, closed12: 0, tel: 0 }]))[0] as any;
  const openedRecent = ((await sql`SELECT c.name, p.opened_ymd FROM cafe_permits p JOIN cafes c ON c.id=p.cafe_id
    WHERE c.published AND c.area=${area} AND c.dong=ANY(${dongs}) AND p.opened_ymd >= to_char(now()-interval '12 months','YYYY-MM-DD') ORDER BY p.opened_ymd DESC LIMIT 8`.catch(() => [])) as any[])
    .map((r) => ({ name: r.name, opened: String(r.opened_ymd).slice(0, 7).replace("-", ".") }));
  const trendRows = (await sql`SELECT left(d,7) ym, count(*)::int n FROM cafes c, jsonb_array_elements_text(c.review_dates) d
    WHERE c.published AND c.area=${area} AND c.dong=ANY(${dongs}) AND d >= to_char(now()-interval '13 months','YYYY.MM') GROUP BY 1 ORDER BY 1`) as any[];
  const now = new Date(); const cut = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev2 = new Date(now.getFullYear(), now.getMonth() - 2, 1); const cut2 = `${prev2.getFullYear()}.${String(prev2.getMonth() + 1).padStart(2, "0")}`;
  const trend = trendRows.filter((r) => r.ym < cut).map((r) => ({ ym: r.ym, n: Number(r.n), partial: r.ym >= cut2 })); // 최근 2개월은 수집 시차 → partial
  const queries = ((await sql`SELECT q, count(*)::int n FROM search_log WHERE ts > now()-interval '180 days' AND (region=${area} OR q ILIKE ${"%" + def.title.replace(/동$/, "") + "%"}) GROUP BY 1 ORDER BY 2 DESC LIMIT 10`.catch(() => [])) as any[])
    .map((r) => ({ q: r.q, n: Number(r.n) }));
  const matched = Number(pr?.matched ?? 0);
  return {
    def, generatedAt: new Date().toISOString(),
    cafes, verified: Number(base?.verified ?? 0), avgReviews: Number(base?.avg_rv ?? 0), totalReviews: Number(base?.total_rv ?? 0), tripPct: base?.trip_pct == null ? null : Number(base.trip_pct),
    axes, openAxes, top,
    permits: { matched, opened12: Number(pr?.opened12 ?? 0), closed12: Number(pr?.closed12 ?? 0), tel: Number(pr?.tel ?? 0), closeRate12: matched ? Math.round((Number(pr?.closed12 ?? 0) / matched) * 1000) / 10 : null, openedRecent },
    trend, queries,
  };
}

// ── 주문·열람 코드(결제는 사업자등록 전이라 수동: 주문 접수 → CEO 입금 확인 → 코드 발송) ──
async function ensureOrders() {
  await ensureOnce("db.startupOrders.v1", async () => {
    await sql`CREATE TABLE IF NOT EXISTS startup_report_orders (id BIGSERIAL PRIMARY KEY, slug TEXT NOT NULL, email TEXT NOT NULL, name TEXT, code TEXT NOT NULL UNIQUE,
      paid_at TIMESTAMPTZ, opened_at TIMESTAMPTZ, opens INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS idx_startup_orders_slug ON startup_report_orders (slug, created_at DESC)`;
  });
}
export async function createOrder(slug: string, email: string, name: string): Promise<{ id: number; code: string }> {
  await ensureOrders();
  const code = Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  const r = (await sql`INSERT INTO startup_report_orders (slug, email, name, code) VALUES (${slug}, ${email}, ${name}, ${code}) RETURNING id`)[0] as any;
  return { id: Number(r.id), code };
}
/** 코드가 유효(결제 확인됨)하면 열람 기록을 남기고 true. */
export async function verifyAccess(slug: string, code: string): Promise<boolean> {
  if (!code || code.length < 6) return false;
  await ensureOrders();
  const r = (await sql`UPDATE startup_report_orders SET opens = opens + 1, opened_at = COALESCE(opened_at, now())
    WHERE slug=${slug} AND code=${code.toUpperCase()} AND paid_at IS NOT NULL RETURNING id`) as any[];
  return r.length > 0;
}
