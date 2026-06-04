import { NextRequest, NextResponse } from "next/server";
import { synthesize, type Review } from "@/lib/synthEngine";

export const runtime = "nodejs";

// POST { name, reviews:[{text, time?}] } → 합성 결과(근거 포함)
export async function POST(req: NextRequest) {
  try {
    const { name, reviews } = await req.json();
    if (!name || !Array.isArray(reviews)) {
      return NextResponse.json({ ok: false, error: "name과 reviews 배열이 필요합니다." }, { status: 400 });
    }
    const norm: Review[] = reviews.map((r: unknown) =>
      typeof r === "string" ? { text: r } : { text: (r as Review).text ?? "", time: (r as Review).time }
    );
    const result = synthesize(name, norm);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
