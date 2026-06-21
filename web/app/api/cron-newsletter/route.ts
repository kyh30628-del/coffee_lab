import { NextRequest, NextResponse } from "next/server";
import { generateNewsletter } from "@/lib/newsletterGen";
export const runtime = "nodejs";
export const maxDuration = 120;

// 주간 자동 '초안' 생성 — 발송은 관리자가 검수·승인 후 수동.
//   ⚠️ 기본 OFF(자동 지출 방지). 켜려면 env NEWSLETTER_AUTO=1 + vercel.json cron "0 23 * * 0"(월 08:00 KST) 추가.
//   기본은 관리자 화면 '✨ 이번 주 뉴스레터 생성' 버튼으로 수동 생성(지출 통제).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (process.env.NEWSLETTER_AUTO !== "1") return NextResponse.json({ ok: false, skipped: true, note: "자동 생성 비활성(NEWSLETTER_AUTO!=1) — 관리자 버튼으로 수동 생성" });
  const r = await generateNewsletter();
  // 생성만 하고 끝 — 관리자 화면에서 검수·승인·발송. (크레딧 없으면 ok:false, 다음 주 재시도)
  return NextResponse.json({ ok: r.ok, id: r.id, cost: r.cost, error: r.error, note: "draft generated; admin must approve & send" });
}
