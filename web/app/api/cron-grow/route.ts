import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { discoverRegion, METRO_REGIONS } from "@/lib/discover";
import { synthAndStore } from "@/lib/synthStore";
export const runtime = "nodejs";
export const maxDuration = 60;

// 정확도 우선 '카페 성장 에이전트' (PRINCIPLES §0·§1·§2·§7).
// 매일: ① 가장 오래된 지역을 순회 발굴(프랜차이즈 제외, 합법 네이버 소스)
//       ② 미합성 카페를 동일 품질엔진으로 합성 → 노이즈 제거 후 검증/참고만 자동 공개.
// 환각·동명·다른지점은 reviewQuality가 차단하므로, 자동 성장해도 정확도가 유지된다.
export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS discovery_state (region TEXT PRIMARY KEY, area_label TEXT, last_run TIMESTAMPTZ, last_found INT, last_inserted INT)`;
    // 지역 시드(최초 1회)
    for (const r of METRO_REGIONS) await sql`INSERT INTO discovery_state (region, area_label) VALUES (${r.region}, ${r.areaLabel}) ON CONFLICT (region) DO NOTHING`;

    // ① 가장 오래된 지역 1곳 발굴
    const target = (await sql`SELECT region, area_label FROM discovery_state ORDER BY last_run ASC NULLS FIRST LIMIT 1`)[0];
    let discovery: any = null;
    if (target) {
      discovery = await discoverRegion(target.region, target.area_label ?? target.region);
      await sql`UPDATE discovery_state SET last_run=now(), last_found=${discovery.found}, last_inserted=${discovery.inserted} WHERE region=${target.region}`;
    }

    // ② 합성/재판정 — 미합성(신규) 우선, 그다음 가장 오래된 순으로 순회.
    //    각 카페가 synthAndStore(규칙+LLM 맥락 재판정)를 거쳐 정확도가 지속적으로 올라간다.
    //    Gemini 쿼터 소진 시 LLM은 자동 폴백(규칙 결과 유지) → 한도 회복되면 다음 회차부터 재판정.
    const targets = (await sql`SELECT id, name, area FROM cafes ORDER BY synth_updated ASC NULLS FIRST LIMIT 12`) as unknown as { id: number; name: string; area: string }[];
    const synth = [];
    let rescued = 0;
    for (const cafe of targets) {
      try { const r: any = await synthAndStore(cafe); synth.push(r); rescued += r.rescued ?? 0; }
      catch (e) { synth.push({ id: cafe.id, name: cafe.name, ok: false, reason: String(e).slice(0, 80) }); }
      await new Promise((r) => setTimeout(r, 300));
    }
    const pendingNew = (await sql`SELECT COUNT(*)::int n FROM cafes WHERE synth_updated IS NULL`)[0].n;
    const published = synth.filter((s: any) => s.published).length;

    return NextResponse.json({
      ok: true, ranAt: new Date().toISOString(),
      discovered: discovery ? { region: discovery.region, found: discovery.found, inserted: discovery.inserted } : null,
      synthesized: synth.length, published, llmRescued: rescued, pendingNew,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
