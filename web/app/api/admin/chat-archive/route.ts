import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 🗂 대화기록 조회 전용(읽기전용) — /api/admin/chat(chat_queue)이 24h 지나 purge하기 전에
//   미리 복제해 둔 chat_archive를 세션(날짜) 단위로 열람·검색한다.
//   이 라우트는 GET만 존재 — 기존 대화 데이터·서비스 로직(chat_queue 흐름)은 절대 건드리지 않는다.

async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS chat_archive (
    id SERIAL PRIMARY KEY, question TEXT, answer TEXT, mode TEXT, created_at TIMESTAMPTZ
  )`.catch(() => {});
}

// GET ?q=검색어(선택) : 세션(날짜) 목록.  GET ?date=YYYY-MM-DD&q=선택 : 그 세션의 전문(읽기전용).
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await ensure();
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  const date = (req.nextUrl.searchParams.get("date") || "").trim().slice(0, 10);
  const like = q ? `%${q}%` : null;

  if (date) {
    const rows = (await (like
      ? sql`SELECT question, answer, mode, to_char(created_at AT TIME ZONE 'Asia/Seoul','HH24:MI') t
          FROM chat_archive
          WHERE to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') = ${date}
            AND (question ILIKE ${like} OR answer ILIKE ${like})
          ORDER BY id ASC`
      : sql`SELECT question, answer, mode, to_char(created_at AT TIME ZONE 'Asia/Seoul','HH24:MI') t
          FROM chat_archive
          WHERE to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') = ${date}
          ORDER BY id ASC`
    ).catch(() => [])) as any[];
    return NextResponse.json({ ok: true, date, messages: rows });
  }

  const rows = (await (like
    ? sql`SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') d, count(*)::int cnt,
          (array_agg(question ORDER BY id ASC))[1] first_q
        FROM chat_archive
        WHERE question ILIKE ${like} OR answer ILIKE ${like}
        GROUP BY d ORDER BY d DESC LIMIT 60`
    : sql`SELECT to_char(created_at AT TIME ZONE 'Asia/Seoul','YYYY-MM-DD') d, count(*)::int cnt,
          (array_agg(question ORDER BY id ASC))[1] first_q
        FROM chat_archive
        GROUP BY d ORDER BY d DESC LIMIT 60`
  ).catch(() => [])) as any[];
  return NextResponse.json({ ok: true, sessions: rows.map((r) => ({ date: r.d, count: r.cnt, title: String(r.first_q || "").slice(0, 40) })) });
}
