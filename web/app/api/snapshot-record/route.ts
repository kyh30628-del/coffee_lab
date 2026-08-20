import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema , ensureOnce } from "@/lib/db";
export const runtime = "nodejs";
export const maxDuration = 60;

// 주간 모멘텀 스냅샷 — 외부 평점(Places) 대신 '우리가 검증·소유한 데이터'를 기록한다.
// 네이버·카카오·구글은 평점을 오픈 API로 제공하지 않음(합법 한계). 대신:
//  - verified_count: 검증+참고 옥석 리뷰 수(우리 신뢰 지표)
//  - recent_count  : 최근 90일 검증 리뷰 게시 수(버즈/모멘텀)
// 주차별 추이 = '뜨는 곳/지는 곳'. 과금·스크래핑 없음.
async function ensureSnapTable() {
  // 💰 2026-08-20 전수 적용: 이 함수 일부는 메모 플래그조차 없어 **매 요청** DDL이 돌았다 — 배포 단위 1회로.
  await ensureOnce("snapshot-record.ensureSnapTable", async () => {
  await sql`CREATE TABLE IF NOT EXISTS cafe_snapshots (
    id SERIAL PRIMARY KEY,
    cafe_id INT NOT NULL,
    snap_date DATE NOT NULL DEFAULT CURRENT_DATE,
    rating REAL,
    rating_count INT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`ALTER TABLE cafe_snapshots ADD COLUMN IF NOT EXISTS recent_count INT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snap_cafe ON cafe_snapshots(cafe_id, snap_date)`;
  });
}

const recentN = (dates: unknown, days = 90): number => {
  if (!Array.isArray(dates)) return 0;
  const cutoff = Date.now() - days * 86400000;
  let n = 0;
  for (const d of dates) {
    const t = Date.parse(String(d).replace(/\./g, "-"));
    if (!isNaN(t) && t >= cutoff) n++;
  }
  return n;
};

// POST { limit?: 200 } — 오늘 아직 스냅샷 안 찍은 공개 카페부터 limit개 (우리 데이터만, 빠름)
export async function POST(req: NextRequest) {
  try {
    // 🔒 내부 배치 라우트 — cron-snapshot만 호출. 무인증 반복호출로 DB write 증폭 방지(2026-07-29 보안감사).
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await ensureSnapTable();
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 200, 1), 500);

    const targets = await sql`
      SELECT c.id, c.synth_count, c.review_dates FROM cafes c
      WHERE c.published = true
        AND NOT EXISTS (SELECT 1 FROM cafe_snapshots s WHERE s.cafe_id = c.id AND s.snap_date = CURRENT_DATE)
      LIMIT ${limit}` as unknown as { id: number; synth_count: number | null; review_dates: unknown }[];

    let recorded = 0;
    for (const c of targets) {
      const vc = c.synth_count ?? 0;
      const recent = recentN(c.review_dates, 90);
      await sql`INSERT INTO cafe_snapshots (cafe_id, rating, rating_count, recent_count) VALUES (${c.id}, NULL, ${vc}, ${recent})`;
      recorded++;
    }
    const remain = (await sql`
      SELECT COUNT(*)::int AS n FROM cafes c
      WHERE c.published = true AND NOT EXISTS (SELECT 1 FROM cafe_snapshots s WHERE s.cafe_id = c.id AND s.snap_date = CURRENT_DATE)`)[0].n;
    return NextResponse.json({ ok: true, recorded, remaining: remain });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// GET — 스냅샷 현황(주차별 평균 옥석수·최근버즈)
export async function GET() {
  try {
    await ensureSchema(); await ensureSnapTable();
    const days = await sql`SELECT snap_date, COUNT(*)::int AS n,
      ROUND(AVG(rating_count)::numeric,1) AS avg_reviews,
      ROUND(AVG(recent_count)::numeric,1) AS avg_recent
      FROM cafe_snapshots GROUP BY snap_date ORDER BY snap_date DESC LIMIT 10`;
    const total = (await sql`SELECT COUNT(*)::int AS n FROM cafe_snapshots`)[0].n;
    return NextResponse.json({ ok: true, totalSnapshots: total, byDate: days });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
