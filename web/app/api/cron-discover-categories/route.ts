import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { recordRun } from "@/lib/agentLog";
import { proposeCategories } from "@/lib/categoryDiscover";

export const runtime = "nodejs";
export const maxDuration = 120;

// 월 1회 카테고리 자동 발굴 — 검증 리뷰 샘플을 Haiku가 읽고 '없는 특징 카테고리' 제안 → 후보 저장.
// ⚠️ 제안만(자동 추가 안 함). 사람이 검토 후 lib/cafeProfile.ts에 엄격 phrase로 추가. 콘솔키만(구독토큰 없음).
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}` && req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!process.env.ANTHROPIC_API_KEY) { await recordRun("cron-discover-categories", false, "ANTHROPIC_API_KEY 미설정 — 발굴 비활성").catch(() => {}); return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정 — 발굴 비활성" }); }
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS category_candidates (id SERIAL PRIMARY KEY, found_at TIMESTAMPTZ DEFAULT now(), candidates JSONB, applied BOOLEAN DEFAULT false)`;

    // 여러 카페에서 인용문 샘플 수집(편향 줄이려 무작위 120곳 × 상위 4건)
    const rows = (await sql`SELECT synth_reviews_all FROM cafes WHERE published AND synth_reviews_all IS NOT NULL ORDER BY md5((id*31+now()::date::text::int)::text) LIMIT 120`.catch(() =>
      sql`SELECT synth_reviews_all FROM cafes WHERE published AND synth_reviews_all IS NOT NULL ORDER BY md5(id::text) LIMIT 120`)) as any[];
    const quotes: string[] = [];
    for (const r of rows) for (const e of (Array.isArray(r.synth_reviews_all) ? r.synth_reviews_all : []).slice(0, 4)) if (e?.quote) quotes.push(e.quote);

    const cands = await proposeCategories(quotes);
    if (!cands) { await recordRun("cron-discover-categories", false, "발굴 실패(크레딧/오류) — 다음 달 재시도").catch(() => {}); return NextResponse.json({ ok: false, error: "발굴 실패(크레딧/오류) — 다음 달 재시도" }); }
    await sql`INSERT INTO category_candidates (candidates) VALUES (${JSON.stringify(cands)}::jsonb)`;
    await recordRun("cron-discover-categories", true, `카테고리후보 ${cands.length}`, cands.length);
    return NextResponse.json({ ok: true, found: cands.length, candidates: cands, note: "후보 저장됨 — 검토 후 cafeProfile.ts에 추가" });
  } catch (e: any) {
    await recordRun("cron-discover-categories", false, `에러: ${String(e?.message ?? e).slice(0, 120)}`).catch(() => {});
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}
