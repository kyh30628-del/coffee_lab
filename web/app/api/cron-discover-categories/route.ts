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
    await ensureSchema();
    // 🆓 LLM 비활성(콘솔키 없음/크레딧 소진/인증문제)은 '실패'가 아니라 '스킵'으로 기록 — 월1회·제안전용 비핵심 잡이
    //   크레딧 소진(CEO 충전 사안)만으로 관제탑에 빨간 HIGH(크론 실패)를 계속 띄우던 false-red 제거.
    //   판단: consoleKeyProbe 단일소스(console_key_state.signal). 진짜 코드오류는 아래 catch로 그대로 실패(빨강) 유지.
    const noKey = !process.env.ANTHROPIC_API_KEY;
    const st = noKey ? null : (await sql`SELECT signal FROM console_key_state WHERE id = 1`.catch(() => []))[0] as any;
    const llmDown = noKey || (st && ["credit", "authkey", "nokey"].includes(st.signal));
    if (llmDown) {
      const why = noKey ? "ANTHROPIC_API_KEY 미설정" : `콘솔키 ${st.signal}`;
      await recordRun("cron-discover-categories", true, `LLM 비활성(${why}) — 이번 회차 스킵(제안 전용·비핵심, 충전 시 재개)`, 0).catch(() => {});
      return NextResponse.json({ ok: true, skipped: true, reason: why });
    }
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
