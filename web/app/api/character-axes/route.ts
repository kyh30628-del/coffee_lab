import { NextResponse } from "next/server";
export const runtime = "nodejs";

// ⚠️ 무력화(2026-07: 기준 관제 Phase2 A 독립검증) — 이 라우트는 in-repo·클라이언트·외부 호출자 0(고아)로 확인됨.
//   보유하던 CHAR_AXES 복제본은 stale(bare "고요" 등)이었고, 친절·서비스/가성비 축은 char_scores에 존재하지 않아
//   성향 6축(lib/charScore.ts·char_scores: mood/work/quiet/roast/space/dessert) 단일출처와 split-brain이었다.
//   삭제하지 않고(disable-don't-delete·가역성) 410으로 무력화 — 실호출자가 나타나면 charScore.CHAR_AXES 기반으로 되살릴 것.
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "gone", detail: "character-axes는 고아 라우트로 무력화됨. 성향축 단일출처=lib/charScore.ts(CHAR_AXES)." },
    { status: 410 },
  );
}
