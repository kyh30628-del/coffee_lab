import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { collectAndSynthesize, type RawSource } from "@/lib/collectOrchestrator";

export const runtime = "nodejs";

// POST { name, area, sources:[...] } 또는 { name, area, reviews:[...] }
// → 합성 후 해당 카페(name 매칭)에 근거·등급·정체성 저장. (헌법1: 출처 추적)
export async function POST(req: NextRequest) {
  try {
    await ensureSchema();
    // 합성 결과 컬럼 보장
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_grade TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_identity TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_basis TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_count INT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_acidity REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_body REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_sweet REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS synth_updated TIMESTAMPTZ`;

    const body = await req.json();
    const { name, area } = body;
    if (!name) return NextResponse.json({ ok: false, error: "name 필요" }, { status: 400 });
    const areaTerms: string[] = Array.isArray(area) ? area : area ? [area] : [];

    let sources: RawSource[];
    if (Array.isArray(body.sources)) sources = body.sources;
    else if (Array.isArray(body.reviews)) sources = [{ source: "google", texts: body.reviews.map((t: string) => ({ text: t })) }];
    else return NextResponse.json({ ok: false, error: "sources 또는 reviews 필요" }, { status: 400 });

    const { synth, collected } = collectAndSynthesize(name, areaTerms, sources);
    const c = synth.coords;
    // basis를 읽기 쉬운 한 줄로
    const basisLine = ["acidity", "body", "sweet"]
      .filter((ax) => c[ax] != null)
      .map((ax) => `${ax === "acidity" ? "산미" : ax === "body" ? "바디" : "단맛"} ${synth.basis[ax]}`)
      .join(" / ");

    const r = await sql`
      UPDATE cafes SET
        synth_grade=${synth.grade}, synth_identity=${synth.identity},
        synth_basis=${basisLine}, synth_count=${collected},
        synth_acidity=${c.acidity}, synth_body=${c.body}, synth_sweet=${c.sweet},
        synth_updated=now()
      WHERE name=${name}
      RETURNING id, name
    `;
    if (r.length === 0) {
      return NextResponse.json({ ok: false, error: `'${name}' 카페를 DB에서 못 찾음`, synth }, { status: 404 });
    }
    return NextResponse.json({ ok: true, applied: r[0], synth, collected });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
