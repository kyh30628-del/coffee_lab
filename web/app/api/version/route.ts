import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 항상 최신 — 자동 업데이트 감지용

// 현재 배포 버전. 클라이언트는 자신이 로드한 NEXT_PUBLIC_BUILD_ID와 비교해 다르면 새로고침한다.
export async function GET() {
  const v = process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_BUILD_ID || "dev";
  return NextResponse.json({ v }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
}
