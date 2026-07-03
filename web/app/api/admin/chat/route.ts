import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

// 💬 관제 챗봇 (구독 LLM·claude -p 경유) — 서비스 전 상태를 그라운딩해 자연어로 답한다.
//   ⚠️ 구독토큰 백엔드 금지(약관) → 서버는 *질문을 큐에 넣고 답을 폴링*만. 실제 LLM은 로컬 watcher가 claude -p로 돌려 답을 DB에 기록.
//   POST: 질문 적재(pending) → {id}.  GET?id=: 답 폴링.  GET: 24h 대화기록.
//   콘솔키(ANTHROPIC_API_KEY) 크레딧이 있으면 즉답 폴백도 가능하지만 기본은 claude -p 경로.

async function ensure() {
  await sql`CREATE TABLE IF NOT EXISTS chat_queue (
    id SERIAL PRIMARY KEY, question TEXT, history JSONB, status TEXT DEFAULT 'pending',
    answer TEXT, mode TEXT, created_at TIMESTAMPTZ DEFAULT now(), answered_at TIMESTAMPTZ
  )`.catch(() => {});
  await sql`CREATE TABLE IF NOT EXISTS work_orders (id SERIAL PRIMARY KEY, command TEXT, action TEXT, tier TEXT, created_at TIMESTAMPTZ DEFAULT now())`.catch(() => {}); // 챗봇 작업지시 감사
  await sql`DELETE FROM chat_queue WHERE created_at < now()-interval '24 hours'`.catch(() => {}); // 24h 보존
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await ensure();
  try {
    const { message, history } = await req.json();
    if (!message || typeof message !== "string") return NextResponse.json({ ok: false, error: "no message" }, { status: 400 });
    const r = (await sql`INSERT INTO chat_queue (question, history) VALUES (${message.slice(0, 2000)}, ${JSON.stringify(Array.isArray(history) ? history.slice(-8) : [])}::jsonb) RETURNING id`) as any[];
    return NextResponse.json({ ok: true, id: r[0].id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 150) }, { status: 500 });
  }
}

// GET ?id= : 답 폴링 / GET : 24h 기록
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await ensure();
  // 🗺️ 지역 전용 모드 — 결정론 SQL 즉답(LLM 안 씀·$0). dong(동)·area(구/시) 매칭 집계.
  const region = req.nextUrl.searchParams.get("region");
  if (region !== null) {
    const q = region.trim().slice(0, 40);
    if (!q) return NextResponse.json({ ok: false, error: "지역명을 입력하세요" }, { status: 400 });
    const like = `%${q}%`;
    try {
      const a = (await sql`SELECT
        count(*) FILTER (WHERE published)::int pub,
        count(*) FILTER (WHERE published AND synth_grade='검증')::int verified,
        count(*) FILTER (WHERE published AND synth_grade='참고')::int ref,
        count(*) FILTER (WHERE NOT published)::int unpub,
        count(*)::int total
        FROM cafes WHERE dong LIKE ${like} OR area LIKE ${like}`)[0] as any;
      const names = ((await sql`SELECT name FROM cafes WHERE published AND (dong LIKE ${like} OR area LIKE ${like})
        ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT 8`) as any[]).map((r) => r.name);
      return NextResponse.json({ ok: true, region: q, pub: a.pub, verified: a.verified, ref: a.ref, unpub: a.unpub, total: a.total, names });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
    }
  }
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const r = (await sql`SELECT status, answer, mode FROM chat_queue WHERE id=${Number(id)}`.catch(() => [])) as any[];
    if (!r.length) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, status: r[0].status, answer: r[0].answer, mode: r[0].mode });
  }
  const rows = (await sql`SELECT question, answer, status, to_char(created_at AT TIME ZONE 'Asia/Seoul','HH24:MI') t FROM chat_queue WHERE created_at > now()-interval '24 hours' ORDER BY id ASC LIMIT 100`.catch(() => [])) as any[];
  return NextResponse.json({ ok: true, history: rows });
}

// 대화기록 전체 삭제
export async function DELETE(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const r = (await sql`DELETE FROM chat_queue RETURNING id`.catch(() => [])) as any[];
  return NextResponse.json({ ok: true, deleted: r.length });
}
