import { NextRequest, NextResponse } from "next/server";
import { synthesize, type Review } from "@/lib/synthEngine";
import { filterReviews } from "@/lib/noiseFilter";

export const runtime = "nodejs";

// POST { name, area?, reviews:[{text,time?}|string], filter?:bool }
// filter=true면 노이즈 필터 적용(웹검색 등 신뢰 낮은 소스용).
// 구글 Places 같은 신뢰 소스는 filter 생략 가능.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, area, reviews, filter } = body;
    if (!name || !Array.isArray(reviews)) {
      return NextResponse.json({ ok: false, error: "name과 reviews 배열 필요" }, { status: 400 });
    }
    const texts: string[] = reviews.map((r: unknown) => (typeof r === "string" ? r : (r as Review).text ?? ""));

    let filterLog = null;
    let useTexts = texts;
    if (filter) {
      const areaTerms: string[] = Array.isArray(area) ? area : area ? [area] : [];
      const { passed, log } = filterReviews(texts, name, areaTerms);
      useTexts = passed;
      filterLog = { kept: passed.length, dropped: texts.length - passed.length, log };
    }

    const norm: Review[] = reviews
      .map((r: unknown, i: number) => ({
        text: typeof r === "string" ? r : (r as Review).text ?? "",
        time: typeof r === "string" ? undefined : (r as Review).time,
      }))
      .filter((r: Review) => useTexts.includes(r.text));

    const result = synthesize(name, norm.length ? norm : useTexts.map((t) => ({ text: t })));
    return NextResponse.json({ ok: true, result, filter: filterLog });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
