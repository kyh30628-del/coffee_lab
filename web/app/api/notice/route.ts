import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 📣 '다시 보지 않기' 기록 **전용** 엔드포인트.
//
// 💰 GET(공지 조회)은 여기 두지 않는다(2026-08-25 CEO "비용 절대 금지" 재확인 후 재설계).
//   별도 GET을 두면 CDN 캐시로 DB는 막아도 **접속마다 HTTP 요청이 하나 늘어난다**.
//   공지는 지도앱이 어차피 부르는 /api/discover(이미 CDN 5분 캐시) 응답에 얹어 보낸다 →
//   추가 요청 0 · 추가 DB 깨움 0(캐시 미스 때만 작은 쿼리 1건이 얹힌다).
//
// '다시 보지 않기' 기록 — 관리자 화면에서 공지 효과를 보기 위한 유일한 쓰기.
//   ⚠️ '노출'은 기록하지 않는다. 접속마다 INSERT면 DB를 계속 깨워 비용이 는다.
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const id = String(b.id ?? "").slice(0, 64);
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    await sql`INSERT INTO notice_dismissals (notice_id, anon_id) VALUES (${id}, ${String(b.anonId ?? "").slice(0, 64) || null})`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 }); // 기록 실패가 사용자 동작을 막으면 안 된다
  }
}
