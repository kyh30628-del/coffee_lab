import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { applyWhitelist, markJudged } from "@/lib/synthStore";
export const runtime = "nodejs";
export const maxDuration = 60;

// 로컬 Sonnet 배치가 보낸 판정 결과 적용: whitelistKeys(양질로 판정된 경계 리뷰)를
// 화이트리스트로 재합성·저장 + 공개 여부 갱신 + llm_judged_at 기록.
function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const cafeId = Number(body.cafeId);
    const whitelistKeys: string[] = Array.isArray(body.whitelistKeys) ? body.whitelistKeys.map(String) : [];
    if (!cafeId) return NextResponse.json({ ok: false, error: "cafeId 필요" }, { status: 400 });

    const cafe = (await sql`SELECT id, name, area FROM cafes WHERE id=${cafeId} LIMIT 1`)[0] as { id: number; name: string; area: string } | undefined;
    if (!cafe) return NextResponse.json({ ok: false, error: "카페 없음" }, { status: 404 });

    // 통과 리뷰 0이면 재합성 없이 판정완료만 기록(현 상태 유지)
    if (whitelistKeys.length === 0) { await markJudged(cafeId); return NextResponse.json({ ok: true, id: cafeId, rescued: 0, marked: true }); }

    const result = await applyWhitelist(cafe, whitelistKeys);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
