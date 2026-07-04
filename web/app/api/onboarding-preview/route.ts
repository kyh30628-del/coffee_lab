import { NextRequest, NextResponse } from "next/server";
import { renderOnboardingEmail } from "@/lib/onboardingEmail";
export const runtime = "nodejs";

// 📧 온보딩(구독 승인) 메일 미리보기 — 관리자가 실제 발송되는 내용을 그대로 확인. 샘플 PIN·카페명(실데이터·PII 없음).
const authed = (req: NextRequest) =>
  !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const cafeName = (req.nextUrl.searchParams.get("cafeName") || "브라운테일커피").slice(0, 40);
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://dongnecoffeenote.com";
  const SAMPLE_PIN = "ABCD1234"; // 미리보기용 예시 열쇠(실제 PIN 아님)
  const trial = renderOnboardingEmail({ cafeName, pin: SAMPLE_PIN, days: 7, site });
  const paid = renderOnboardingEmail({ cafeName, pin: SAMPLE_PIN, days: 30, site });
  return NextResponse.json({ ok: true, cafeName, trial, paid });
}
