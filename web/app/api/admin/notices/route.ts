import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { listNotices, ensureNoticeSchema } from "@/lib/noticeStore";
export const runtime = "nodejs";

// 📣 공지 관리(관리자) — 목록·이력 조회 + 생성/수정/중지. 무배포로 공지를 운영한다.
const authed = (req: NextRequest) => req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const items = await listNotices();
    // 공지 기간 방문자 수(근사) — 노출을 따로 기록하지 않으므로 기존 traffic_events로 낸다(추가 쓰기 0).
    // 💰 공지마다 count(DISTINCT anon_id)를 돌리면 공지 수만큼 전체 스캔이 반복된다.
    //    **진행중/예정 공지만**(종료된 건 숫자가 더 안 변하니 계산할 이유가 없다) 최대 3건만 계산한다.
    const need = items.filter((n: any) => n.status !== "종료" && n.status !== "중지").slice(0, 3);
    const reachById = new Map<string, number>();
    for (const n of need) {
      try {
        const r = (await sql`SELECT count(DISTINCT anon_id)::int n FROM traffic_events
          WHERE ts >= ${new Date(n.from).toISOString()} AND ts < LEAST(${new Date(n.until).toISOString()}::timestamptz, now())`) as any[];
        reachById.set(n.id, Number(r[0]?.n ?? 0));
      } catch { /* 실패해도 목록은 보여준다 */ }
    }
    return NextResponse.json({ ok: true, items: items.map((n: any) => ({ ...n, reach: reachById.has(n.id) ? reachById.get(n.id) : null })) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 140) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    await ensureNoticeSchema();
    const b = await req.json();
    const act = String(b.action ?? "save");

    if (act === "toggle") {
      await sql`UPDATE notices SET enabled = NOT enabled, updated_at = now() WHERE id = ${String(b.id)}`;
      return NextResponse.json({ ok: true });
    }
    if (act === "delete") {
      // ⚠️ 지운 id는 재사용 금지 — localStorage 해제 기록이 그 id로 남아 있어, 같은 id를 다시 쓰면
      //   예전에 '다시 보지 않기'를 누른 사람에게 새 공지가 영영 안 뜬다.
      await sql`DELETE FROM notices WHERE id = ${String(b.id)}`;
      return NextResponse.json({ ok: true });
    }

    const f = b.fields ?? {};
    const req0 = ["id", "title", "titlePast", "body", "bodyPast", "from", "pastFrom", "until"];
    for (const k of req0) if (!f[k]) return NextResponse.json({ ok: false, error: `필수값 누락: ${k}` }, { status: 400 });
    if (!(new Date(f.from) < new Date(f.pastFrom) && new Date(f.pastFrom) <= new Date(f.until)))
      return NextResponse.json({ ok: false, error: "날짜 순서가 맞지 않습니다(시작 < 완료형전환 ≤ 종료)" }, { status: 400 });

    await sql`INSERT INTO notices (id, emoji, title, title_past, highlight, body, body_past, sub, sub_past, cta, cta_past, from_at, past_from_at, until_at)
      VALUES (${f.id}, ${f.emoji || "📣"}, ${f.title}, ${f.titlePast}, ${f.highlight || null}, ${f.body}, ${f.bodyPast},
              ${f.sub || ""}, ${f.subPast || ""}, ${f.cta || "확인"}, ${f.ctaPast || "확인"},
              ${f.from}, ${f.pastFrom}, ${f.until})
      ON CONFLICT (id) DO UPDATE SET emoji=EXCLUDED.emoji, title=EXCLUDED.title, title_past=EXCLUDED.title_past,
        highlight=EXCLUDED.highlight, body=EXCLUDED.body, body_past=EXCLUDED.body_past, sub=EXCLUDED.sub,
        sub_past=EXCLUDED.sub_past, cta=EXCLUDED.cta, cta_past=EXCLUDED.cta_past,
        from_at=EXCLUDED.from_at, past_from_at=EXCLUDED.past_from_at, until_at=EXCLUDED.until_at, updated_at=now()`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 140) }, { status: 500 });
  }
}
