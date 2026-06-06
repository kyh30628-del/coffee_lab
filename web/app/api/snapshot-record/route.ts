import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { fetchPlacesReviews } from "@/lib/placesCollector";
export const runtime = "nodejs";
export const maxDuration = 60;

async function ensureSnapTable() {
  await sql`CREATE TABLE IF NOT EXISTS cafe_snapshots (
    id SERIAL PRIMARY KEY,
    cafe_id INT NOT NULL,
    snap_date DATE NOT NULL DEFAULT CURRENT_DATE,
    rating REAL,
    rating_count INT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_snap_cafe ON cafe_snapshots(cafe_id, snap_date)`;
}

// POST { limit?: 50 } — 오늘 아직 스냅샷 안 찍은 카페부터 limit개
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    await ensureSnapTable();
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);

    // 오늘 스냅샷 없는 공개 카페
    const targets = await sql`
      SELECT c.id, c.name, c.area FROM cafes c
      WHERE c.published = true
        AND NOT EXISTS (SELECT 1 FROM cafe_snapshots s WHERE s.cafe_id = c.id AND s.snap_date = CURRENT_DATE)
      LIMIT ${limit}` as unknown as { id: number; name: string; area: string }[];

    let recorded = 0, noData = 0;
    for (const c of targets) {
      try {
        const places = await fetchPlacesReviews(c.name, c.area ?? "");
        const rating = places.place?.rating ?? null;
        const count = places.place?.ratingCount ?? null;
        if (rating != null || count != null) {
          await sql`INSERT INTO cafe_snapshots (cafe_id, rating, rating_count) VALUES (${c.id}, ${rating}, ${count})`;
          recorded++;
        } else { noData++; }
      } catch { noData++; }
      await new Promise((r) => setTimeout(r, 200));
    }
    const remain = (await sql`
      SELECT COUNT(*)::int AS n FROM cafes c
      WHERE c.published = true AND NOT EXISTS (SELECT 1 FROM cafe_snapshots s WHERE s.cafe_id = c.id AND s.snap_date = CURRENT_DATE)`)[0].n;
    return NextResponse.json({ ok: true, recorded, noData, remaining: remain });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

// GET — 스냅샷 현황
export async function GET() {
  try {
    await ensureSchema(); await ensureSnapTable();
    const days = await sql`SELECT snap_date, COUNT(*)::int AS n, ROUND(AVG(rating)::numeric,2) AS avg_rating FROM cafe_snapshots GROUP BY snap_date ORDER BY snap_date DESC LIMIT 10`;
    const total = (await sql`SELECT COUNT(*)::int AS n FROM cafe_snapshots`)[0].n;
    return NextResponse.json({ ok: true, totalSnapshots: total, byDate: days });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
