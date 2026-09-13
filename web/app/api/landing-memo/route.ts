import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const revalidate = 600;

// ✍ 랜딩 메모 전용 초경량 풀(2026-09-13).
//   왜: 랜딩 글씨는 /api/discover(홈 피드 전체)를 기다렸는데, 폰 첫 실행에선 **4초 안에도 안 왔다**(landing_debug 실측
//   mount+5,096ms). 그래서 고정 문구가 먼저 써지고 다음 진입에 진짜 메모가 써져 '두 번 써지는' 것으로 보였다.
//   → 메모에 필요한 필드만 40곳, 몇 KB짜리로 잘라 **CDN 10분 캐시**로 내린다. 첫 바이트가 수백 ms에 도착한다.
//   무작위성은 클라이언트가 이 풀에서 고르는 것으로 유지(캐시와 충돌 없음). 비용: 작은 컬럼 1쿼리 × 최대 6회/시간.
export async function GET() {
  try {
    await ensureSchema();
    const rows = (await sql`SELECT id, name, area, synth_grade, synth_count, synth_identity,
        (created_at > now() - interval '30 days') AS is_new
      FROM cafes
      WHERE published = true AND synth_grade = '검증' AND synth_count >= 10 AND synth_identity IS NOT NULL AND length(synth_identity) BETWEEN 4 AND 40
      ORDER BY synth_updated DESC NULLS LAST LIMIT 40`) as any[];
    const pool = rows.map((c) => ({ id: Number(c.id), name: c.name, area: c.area, grade: c.synth_grade,
      count: c.synth_count == null ? null : Number(c.synth_count), identity: c.synth_identity, note: null, beanNote: [] as string[], isNew: !!c.is_new }));
    return NextResponse.json({ ok: true, pool }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=600, stale-while-revalidate=3600" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 100), pool: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
