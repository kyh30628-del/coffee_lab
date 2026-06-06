import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const SEOUL_GU = ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"];

// POST { start?: 0, count?: 5 } — 구를 start부터 count개씩 (폭주 방지, 나눠 실행)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const start = Number(body.start) || 0;
    const count = Math.min(Number(body.count) || 5, 8);
    const targets = SEOUL_GU.slice(start, start + count);

    const base = new URL(req.url).origin;
    const results: any[] = [];
    for (const gu of targets) {
      try {
        const r = await fetch(`${base}/api/cafe-discover`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ region: gu }),
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
      nextStart: start + count, remaining: Math.max(0, SEOUL_GU.length - (start + count)),
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
