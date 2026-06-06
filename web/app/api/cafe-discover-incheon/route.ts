import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const INCHEON = ["중구","동구","미추홀구","연수구","남동구","부평구","계양구","서구","강화군","옹진군"];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const start = Number(body.start) || 0;
    const count = Math.min(Number(body.count) || 5, 10);
    const targets = INCHEON.slice(start, start + count);

    const base = new URL(req.url).origin;
    const results: any[] = [];
    for (const gu of targets) {
      try {
        // 인천은 "인천 중구"처럼 시 이름을 붙여 검색(다른 지역 중구와 혼동 방지)
        const r = await fetch(`${base}/api/cafe-discover`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ region: `인천 ${gu}` }),
        });
        const d = await r.json();
        results.push({ gu, found: d.found ?? 0, inserted: d.inserted ?? 0, skipped: d.skipped ?? 0 });
      } catch (e) {
        results.push({ gu, error: String(e) });
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const totalInserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0);
    return NextResponse.json({
      ok: true, processed: targets.length, totalInserted,
      nextStart: start + count, remaining: Math.max(0, INCHEON.length - (start + count)),
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
