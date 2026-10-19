import { NextRequest, NextResponse } from "next/server";
import { sql, ensureOnce } from "@/lib/db";

export const runtime = "nodejs";

// 💬 사용자 한 줄 피드백 (2026-10-19, CEO 지시)
//
// 왜 만드나: 우리에게 **실사용자 직접 피드백 채널이 없었다.** 품질을 전부 내부 지표로 추정했다
//   (노출 후기 AI 거부율 44% · 시설 태그 오분류 53~83% 등). "사용자가 실제로 어떻게 느끼는가"는 0건이었다.
//
// 🔴 왜 '뒤로가기 팝업'이 아닌가(CEO와 합의, 10-19):
//   ① 유입의 34%가 모바일·네이버 경로이고 모바일 뒤로가기는 **제스처**다 — 가로채면 짜증이 수확보다 크다.
//   ② 유입의 81%가 검색이다. 검색 결과로 돌아가려는 사용자를 막는 건 검색 품질 신호에 불리할 수 있다
//      (10-04 robots 차단으로 네이버 유입 90% 붕괴 이력 — 이 축은 보수적으로 간다).
//   ③ 수확 추정: 월 23,000PV × 이탈팝업 응답률 1~3% × 텍스트 작성 5~10% = **월 20~60건**뿐이다.
//   → 대신 **"도움이 됐을 때"** 묻는다: 상세 페이지 하단 상시 + 외부 클릭(지도·전화) 직후.
//
// 💰 비용: 작은 행 INSERT 1건. 큰 컬럼(raw_reviews·synth_reviews_all) 접촉 0. ISR 영향 0.
//   도배 차단: 같은 기기·같은 대상 24시간 1건(INSERT 조건). 본문 500자 상한.
const KINDS = new Set(["like", "meh"]);

async function ensure() {
  await ensureOnce("db.userFeedback.v1", async () => {
    await sql`CREATE TABLE IF NOT EXISTS user_feedback (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,                 -- like | meh
      note TEXT,                          -- 선택 입력(한 줄 후기)
      cafe_id INT,                        -- 카페 상세에서 왔으면 그 카페
      path TEXT,                          -- 어느 화면에서 눌렀나
      place TEXT,                         -- bottom | after-outlink  (어느 자리에서)
      anon TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_feedback_recent ON user_feedback (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_user_feedback_cafe ON user_feedback (cafe_id, created_at DESC)`;
  });
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const kind = String(b?.kind ?? "");
    const anon = String(b?.anon ?? "").slice(0, 64);
    if (!KINDS.has(kind) || anon.length < 8) return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
    const cafeId = Number.isFinite(Number(b?.cafeId)) ? Number(b.cafeId) : null;
    const note = String(b?.note ?? "").trim().slice(0, 500) || null;   // 선택 — 없어도 접수된다(한 탭이면 끝)
    const path = String(b?.path ?? "").slice(0, 200) || null;
    const place = ["bottom", "after-outlink"].includes(String(b?.place)) ? String(b.place) : null;
    await ensure();
    // 같은 기기·같은 대상 24시간 1건. 단, **본문을 새로 적어 보내면 갱신**한다(한 탭 → 뒤에 글 추가하는 흐름 때문).
    const ins = (await sql`INSERT INTO user_feedback (kind, note, cafe_id, path, place, anon)
      SELECT ${kind}, ${note}, ${cafeId}, ${path}, ${place}, ${anon}
      WHERE NOT EXISTS (
        SELECT 1 FROM user_feedback
        WHERE anon = ${anon} AND COALESCE(cafe_id, -1) = COALESCE(${cafeId}::int, -1)
          AND created_at > now() - interval '24 hours')
      RETURNING id`) as any[];
    if (!ins.length) {
      if (note) {
        await sql`UPDATE user_feedback SET note = ${note}, kind = ${kind}
          WHERE id = (SELECT id FROM user_feedback
            WHERE anon = ${anon} AND COALESCE(cafe_id, -1) = COALESCE(${cafeId}::int, -1)
            ORDER BY created_at DESC LIMIT 1)`.catch(() => {});
      }
      return NextResponse.json({ ok: true, dup: true });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 120) }, { status: 500 });
  }
}
