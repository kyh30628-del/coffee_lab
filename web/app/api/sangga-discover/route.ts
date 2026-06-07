import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { discoverSangga, hasSanggaKey, METRO_SIGNGU } from "@/lib/sangga";
export const runtime = "nodejs";
export const maxDuration = 60;

// 공공데이터포털 상가정보 카페 발굴.
// 인증: Authorization Bearer CRON_SECRET 또는 x-admin-password.
// 기본 dry-run(apply=false): 적재 없이 샘플 반환(위경도·필터 검증). apply=true면 적재(비공개).
// body: { signguCd, areaLabel } 또는 { all:true } (수도권 전체, apply와 함께).
function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!hasSanggaKey()) return NextResponse.json({ ok: false, error: "DATA_GO_KR_KEY 미설정 — 발급 후 추가 필요" }, { status: 400 });
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const apply = !!body.apply;
    const maxPages = Math.min(Math.max(Number(body.maxPages) || 20, 1), 40);

    if (body.all) {
      // 수도권 전체 (apply와 함께 쓰는 게 일반적). maxDuration 고려해 한 호출당 몇 곳씩.
      const start = Math.max(Number(body.start) || 0, 0);
      const count = Math.min(Math.max(Number(body.count) || 3, 1), 8);
      const slice = METRO_SIGNGU.slice(start, start + count);
      const results = [];
      for (const r of slice) results.push(await discoverSangga(r.code, r.areaLabel, { apply, maxPages }));
      return NextResponse.json({ ok: true, processed: slice.length, nextStart: start + count, total: METRO_SIGNGU.length, results });
    }

    const signguCd = String(body.signguCd ?? "").trim();
    const areaLabel = String(body.areaLabel ?? "").trim();
    if (!signguCd || !areaLabel) return NextResponse.json({ ok: false, error: "signguCd·areaLabel 또는 all:true 필요" }, { status: 400 });
    const result = await discoverSangga(signguCd, areaLabel, { apply, maxPages });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
