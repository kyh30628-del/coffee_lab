import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { discoverLocaldata, hasLocaldataKey } from "@/lib/localdata";
export const runtime = "nodejs";
export const maxDuration = 60;

// 공공데이터(LOCALDATA) 카페 발굴.
// 인증: Authorization Bearer CRON_SECRET 또는 x-admin-password.
// 기본 dry-run(apply=false): 적재하지 않고 샘플 반환 → 좌표·형식 검증용.
// apply=true 일 때만 DB 적재(비공개). localCode=행정구역코드(시·군·구).
function authed(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  if (req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    if (!hasLocaldataKey()) return NextResponse.json({ ok: false, error: "LOCALDATA_KEY 미설정 — 발급 후 추가 필요" }, { status: 400 });
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const localCode = String(body.localCode ?? "").trim();
    const areaLabel = String(body.areaLabel ?? "").trim();
    if (!localCode || !areaLabel) return NextResponse.json({ ok: false, error: "localCode·areaLabel 필요" }, { status: 400 });
    const apply = !!body.apply;
    const maxPages = Math.min(Math.max(Number(body.maxPages) || 6, 1), 40);

    const result = await discoverLocaldata(localCode, areaLabel, { apply, maxPages });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
