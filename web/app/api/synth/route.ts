import { NextRequest, NextResponse } from "next/server";
import { synthesize, type Review } from "@/lib/synthEngine";
import { collectAndSynthesize, type RawSource } from "@/lib/collectOrchestrator";

export const runtime = "nodejs";

// 두 가지 입력 모드:
// (1) 단순: { name, area?, reviews:[...], filter? }  — 기존 호환
// (2) 다중소스: { name, area, sources:[{source, texts:[{text,time?}]}] } — B단계 정식
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, area } = body;
    if (!name) return NextResponse.json({ ok: false, error: "name 필요" }, { status: 400 });
    const areaTerms: string[] = Array.isArray(area) ? area : area ? [area] : [];

    // 모드 2: 다중소스 오케스트레이션
    if (Array.isArray(body.sources)) {
      const result = collectAndSynthesize(name, areaTerms, body.sources as RawSource[]);
      return NextResponse.json({ ok: true, mode: "multi", ...result });
    }

    // 모드 1: 단순 reviews
    if (Array.isArray(body.reviews)) {
      const norm: Review[] = body.reviews.map((r: unknown) =>
        typeof r === "string" ? { text: r } : { text: (r as Review).text ?? "", time: (r as Review).time }
      );
      const result = synthesize(name, norm);
      return NextResponse.json({ ok: true, mode: "simple", result });
    }

    return NextResponse.json({ ok: false, error: "reviews 또는 sources 필요" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
