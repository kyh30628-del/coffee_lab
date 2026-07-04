import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🏛️ 전사 라운지 데이터 — 직원(잡)별 성과 + 공유회 피드(조간회의·업무지시·자율협업·결재) + CEO 코멘트.
//   조직 구조(본부→팀→직원)는 클라가 lib/org.ts에서 직접 읽고, 여기선 성과·피드·코멘트만 준다.
const auth = (req: NextRequest) => req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS lounge_comments (
    id SERIAL PRIMARY KEY, target TEXT NOT NULL, author TEXT DEFAULT 'CEO',
    body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
  )`.catch(() => {});
  await sql`CREATE TABLE IF NOT EXISTS peer_reviews (id SERIAL PRIMARY KEY, reviewer TEXT, target TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  await sql`CREATE TABLE IF NOT EXISTS org_reports (kind TEXT PRIMARY KEY, title TEXT, md TEXT, updated_at TIMESTAMPTZ DEFAULT now())`.catch(() => {});
  await sql`CREATE TABLE IF NOT EXISTS team_kpis (id SERIAL PRIMARY KEY, scope TEXT, week_start DATE, goal TEXT, updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(scope, week_start))`.catch(() => {});
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await ensure();
  // 직원(잡)별 성과 — 최근 실행 + 최근 7일 성공률
  const perfRows = (await sql`SELECT job, ok, processed, ran_at,
      left(coalesce(detail,''), 90) detail,
      (SELECT count(*) FILTER (WHERE ok) FROM agent_runs a2 WHERE a2.job=a1.job AND a2.ran_at>now()-interval '7 days')::int ok7,
      (SELECT count(*) FROM agent_runs a2 WHERE a2.job=a1.job AND a2.ran_at>now()-interval '7 days')::int tot7
    FROM (SELECT DISTINCT ON (job) * FROM agent_runs ORDER BY job, ran_at DESC) a1`.catch(() => [])) as any[];
  const perf: Record<string, any> = {};
  for (const r of perfRows) perf[r.job] = { ok: r.ok, processed: r.processed, ranAt: r.ran_at, detail: r.detail, ok7: r.ok7, tot7: r.tot7 };

  // 공유회 피드
  const brief = ((await sql`SELECT meeting, work_order, to_char(created_at AT TIME ZONE 'Asia/Seoul','MM-DD') d FROM org_briefings ORDER BY created_at DESC LIMIT 1`.catch(() => []))[0] as any) || null;
  const coord = (await sql`SELECT id, from_team, to_team, topic, status, resolution,
      to_char(created_at AT TIME ZONE 'Asia/Seoul','MM-DD HH24:MI') t FROM coordination ORDER BY created_at DESC LIMIT 20`.catch(() => [])) as any[];
  const decisions = (await sql`SELECT id, title, team, recommendation FROM decisions WHERE status='pending' AND COALESCE(tier,'L3')='L3' ORDER BY id`.catch(() => [])) as any[];

  // 성과 요약(전사) — 오늘 실행·성공률
  const today = ((await sql`SELECT count(*)::int runs, count(*) FILTER (WHERE ok)::int ok FROM agent_runs WHERE ran_at > (now() AT TIME ZONE 'Asia/Seoul')::date`.catch(() => [{ runs: 0, ok: 0 }]))[0]) as any;

  const comments = (await sql`SELECT id, target, author, body, to_char(created_at AT TIME ZONE 'Asia/Seoul','MM-DD HH24:MI') t FROM lounge_comments ORDER BY created_at DESC LIMIT 200`.catch(() => [])) as any[];

  // 🔄 다면평가 — 에이전트들이 서로 남긴 동료평가(reviewer=잡키, target=대상 팀/에이전트, note=한 줄)
  const peers = (await sql`SELECT id, reviewer, target, note, to_char(created_at AT TIME ZONE 'Asia/Seoul','MM-DD HH24:MI') t FROM peer_reviews ORDER BY created_at DESC LIMIT 60`.catch(() => [])) as any[];

  // 🏅 인사팀 조직평가·주간 리포트(로컬에서 push-report.mjs로 밀어넣은 것)
  const reports = (await sql`SELECT kind, title, md, to_char(updated_at AT TIME ZONE 'Asia/Seoul','MM-DD') d FROM org_reports ORDER BY kind`.catch(() => [])) as any[];

  // 🧭 유입 북극성 — 네이버·구글 검색 유입 방문자 + 재방문율(진짜 유입 핵심 증거). 봇·크롤러·내부 제외.
  const NOISE = `COALESCE(user_agent,'') !~* 'bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|preview' AND COALESCE(src,'') !~* 'findelio|blinkx|semrush|ahrefs|dataprovider|dotbot|petalbot|yandex|mj12|serpstat' AND NOT COALESCE(internal,false)`;
  // 재방문 = '다시 켠 것'(세션 2회+, 같은 날 포함). sessions=브라우저 세션 수(visit_count 페이지뷰와 다름).
  const acqRows = (await sql.query(
    `SELECT src, COUNT(*)::int visitors,
       COUNT(*) FILTER (WHERE COALESCE(sessions,1) >= 2)::int returned
     FROM user_consents WHERE src IN ('naver','google') AND last_seen > now()-interval '30 days' AND ${NOISE} GROUP BY src`
  ).catch(() => [])) as any[];
  const acq: Record<string, any> = { naver: { visitors: 0, returned: 0 }, google: { visitors: 0, returned: 0 } };
  for (const r of acqRows) acq[r.src] = { visitors: r.visitors, returned: r.returned };

  // 🎯 이번 주 팀·본부 목표·KPI (scope=팀명 또는 본부명)
  const kpiRows = (await sql`SELECT scope, goal, updated_by, to_char(week_start,'MM-DD') wk FROM team_kpis WHERE week_start = date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')::date`.catch(() => [])) as any[];
  const kpi: Record<string, any> = {};
  for (const k of kpiRows) kpi[k.scope] = { goal: k.goal, by: k.updated_by, wk: k.wk };

  return NextResponse.json({ ok: true, perf, brief, coord, decisions, today, comments, peers, reports, kpi, acq });
}

// CEO 코멘트 남기기 — { target: "div:..."|"team:..."|"member:...", body }
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await ensure();
  try {
    const b = await req.json();
    // 🎯 CEO·기조실장 목표설정/수정 — { kpiScope: "팀명|본부명", goal }
    if (b.kpiScope && typeof b.goal === "string") {
      await sql`INSERT INTO team_kpis (scope, week_start, goal, updated_by)
        VALUES (${String(b.kpiScope).slice(0, 80)}, date_trunc('week', now() AT TIME ZONE 'Asia/Seoul')::date, ${b.goal.slice(0, 320)}, 'CEO')
        ON CONFLICT (scope, week_start) DO UPDATE SET goal=EXCLUDED.goal, updated_by='CEO', updated_at=now()`.catch(() => {});
      return NextResponse.json({ ok: true });
    }
    const { target, body } = b;
    if (!target || !body || typeof body !== "string") return NextResponse.json({ ok: false, error: "target·body 필요" }, { status: 400 });
    const r = (await sql`INSERT INTO lounge_comments (target, body) VALUES (${String(target).slice(0, 80)}, ${body.slice(0, 1000)}) RETURNING id`) as any[];
    return NextResponse.json({ ok: true, id: r[0].id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "id 필요" }, { status: 400 });
  await sql`DELETE FROM lounge_comments WHERE id=${id}`.catch(() => {});
  return NextResponse.json({ ok: true });
}
