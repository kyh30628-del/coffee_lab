import { NextRequest, NextResponse } from "next/server";
import { sql, ensureOnce } from "@/lib/db";
export const runtime = "nodejs";

// 🚪 외부 이탈 클릭 기록 — "이 카페로 가기로 했다"에 가장 가까운 신호(2026-08-17, CEO 지시).
//
// 왜 필요한가: 지금 우리가 재는 건 전부 **의도**(조회·체류)지 **결과**가 아니다.
//   "실제로 갔다"를 증명하는 데이터는 user_visits.verified 5건뿐이고, 그건 30m 위치인증을
//   요구해 사실상 아무도 완료하지 않는다. 반면 네이버 플레이스·카카오 길찾기 클릭은
//   "이 카페를 선택했다"는 행동이라, 조회수보다 훨씬 진짜 성과에 가깝다.
//
// ⚠️ traffic_events에 넣지 않은 이유: 그러면 PV·이탈률·착지 분석이 오염된다.
//   기존 지표를 훼손하지 않도록 별도 테이블에 담는다(행이 작고 클릭 때만 생겨 비용 무시 가능).
//   anon_id를 함께 받는 이유는 봇 제외 단일출처(BOT_ANON_IDS_SQL)와 조인해 같은 기준으로 거르기 위함이다.
let ensured = false;
async function ensure() {
  if (ensured) return;
  // 💰 사용자 클릭 경로에 DDL을 두지 않는다 — 배포 단위 1회로(2026-08-18).
  await ensureOnce("api.trackOutbound.schema", async () => {
  await sql`CREATE TABLE IF NOT EXISTS outbound_clicks (
    id BIGSERIAL PRIMARY KEY,
    anon_id TEXT,
    cafe_id INT,
    target TEXT,            -- naver_place | kakao_map
    source TEXT,            -- 어느 화면에서 눌렀나(카페상세/지도앱/동네목록)
    path TEXT,
    ts TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_outbound_clicks_ts ON outbound_clicks (ts)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_outbound_clicks_cafe ON outbound_clicks (cafe_id)`;
  });
  ensured = true;
}

export async function POST(req: NextRequest) {
  try {
    await ensure();
    const b = await req.json().catch(() => ({}));
    const anonId = String(b.anonId ?? "").slice(0, 64);
    const path = String(b.path ?? "").slice(0, 200);
    const target = String(b.target ?? "").slice(0, 20);
    const source = String(b.source ?? "").slice(0, 30) || null;
    // cafeId 명시값 우선 — 지도앱은 pathname이 "/"라 path 파싱이 안 된다(공유 계측에서 겪은 것과 같은 함정).
    const explicit = Number(b.cafeId);
    const m = path.match(/\/c\/(\d+)/);
    const cafeId = Number.isFinite(explicit) && explicit > 0 ? explicit : (m ? Number(m[1]) : null);
    if (!target || (!anonId && !cafeId)) return NextResponse.json({ ok: false }, { status: 400 });
    await sql`INSERT INTO outbound_clicks (anon_id, cafe_id, target, source, path)
      VALUES (${anonId}, ${cafeId}, ${target}, ${source}, ${path})`;
    return NextResponse.json({ ok: true });
  } catch {
    // 계측 실패가 이동을 막으면 안 된다 — 조용히 삼킨다.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
