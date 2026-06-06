import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

const GYEONGGI = ["수원시","성남시","고양시","용인시","부천시","안산시","안양시","남양주시","화성시","평택시","의정부시","시흥시","파주시","김포시","광명시","광주시","군포시","하남시","오산시","양주시","구리시","안성시","포천시","의왕시","여주시","동두천시","과천시","의왕시","이천시","양평군","가평군","연천군"];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const start = Number(body.start) || 0;
    const count = Math.min(Number(body.count) || 5, 8);
    // 중복 제거된 시군구 목록
    const uniq = [...new Set(GYEONGGI)];
    const targets = uniq.slice(start, start + count);

    const base = new URL(req.url).origin;
    const results: any[] = [];
    for (const city of targets) {
      try {
        const r = await fetch(`${base}/api/cafe-discover`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ region: city }),
        });
        const d = await r.json();
        results.push({ city, found: d.found ?? 0, inserted: d.inserted ?? 0, skipped: d.skipped ?? 0 });
      } catch (e) {
        results.push({ city, error: String(e) });
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const totalInserted = results.reduce((s, r) => s + (r.inserted ?? 0), 0);
    return NextResponse.json({
      ok: true, processed: targets.length, totalInserted,
      nextStart: start + count, remaining: Math.max(0, uniq.length - (start + count)),
      results,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
