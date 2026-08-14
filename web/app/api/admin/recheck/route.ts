import { NextRequest, NextResponse } from "next/server";
import { openRechecks, reviewedRechecks, resolveRecheck } from "@/lib/recheckQueue";
export const runtime = "nodejs";

// ♻️ 정책 소급 재판정 큐 리뷰 화면 — 하네스 L6(2026-08-08 도입, 2026-08-14 해소 경로 추가).
//   lib/recheckQueue.ts가 큐를 쌓기만 하던 것을 여기서 처음으로 "사람이 보고 판정"하게 연결한다.
//   ⚠️ 이 API는 verdict만 기록한다. republish 집행(공개 전환)은 화면에서 기존 /api/admin/cafes
//   토글 경로를 그대로 재사용한다(자동 재공개 절대 없음 — 사람이 버튼을 눌러야만 실행).
const authed = (req: NextRequest) => !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const [open, history] = await Promise.all([openRechecks(200), reviewedRechecks(50)]);
    return NextResponse.json({ ok: true, open, history }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
}

const VERDICTS = new Set(["keep_excluded", "republish", "needs_look"]);

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const { id, verdict, note } = await req.json();
    if (!id || !VERDICTS.has(verdict)) return NextResponse.json({ ok: false, error: "invalid id/verdict" }, { status: 400 });
    await resolveRecheck(Number(id), verdict, String(note ?? ""), "CEO(관제)");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }, { status: 500 });
  }
}
