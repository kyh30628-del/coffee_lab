import { NextRequest, NextResponse } from "next/server";
import { generateNewsletter, generateNewsletterFree } from "@/lib/newsletterGen";
export const runtime = "nodejs";
export const maxDuration = 120;

// 주간 자동 '초안' 생성(매주 일요일 KST 20:07 = vercel cron "7 11 * * 0") — 발송은 관리자가 검수·승인 후 수동.
//   기본: 네이버 검색 무료 생성(크레딧 0, 안전). NEWSLETTER_LLM=1이면 Sonnet+웹서치 고급(크레딧).
//   생성만 하고 draft로 둠 → 관리자 화면에서 승인·일괄전송.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const r = process.env.NEWSLETTER_LLM === "1" ? await generateNewsletter() : await generateNewsletterFree();
  return NextResponse.json({ ok: r.ok, id: r.id, cost: r.cost, error: r.error, note: "draft generated; admin must approve & send" });
}
