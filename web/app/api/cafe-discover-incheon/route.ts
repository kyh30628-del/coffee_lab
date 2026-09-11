import { NextResponse } from "next/server";
import { SIDO_GU } from "@/lib/regionList";

export const runtime = "nodejs";
export const maxDuration = 300;

// 🔁 2026-09-07 재정정(decisions#1048): "2026-07-01 인천 2군9구 개편"(제물포구·영종구·검단구·서해구)은
//   인천시 공식(incheon.go.kr) 1차소스로 확인된 실재 행정구역이다 — 08-31의 "존재하지 않는다"는
//   결론(decisions#910)이 오히려 틀렸다(자세한 경위는 lib/regionList.ts 참조). 단일출처(SIDO_GU) 사용.
const INCHEON = SIDO_GU.인천;

export async function POST(req: Request) {
  try {
    // 🔒 네이버 유료검색 유발 라우트 — 무인증 노출 금지(2026-07-29 보안감사).
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
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
          method: "POST",
          headers: { "Content-Type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
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
