import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { discoverRegion, METRO_REGIONS } from "@/lib/discover";
import { synthAndStore } from "@/lib/synthStore";
import { mineArea } from "@/lib/reviewMiner";
export const runtime = "nodejs";
export const maxDuration = 300; // 여러 지역 발굴 + 합성 (플랜 상한까지 사용)

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

    // ① 가장 오래된 지역부터 '시간 예산(40초) 내에서 여러 곳' 발굴 — 매일 네이버 한도를 실제로 활용해
    //    미발굴 지역(수십 곳)을 빠르게 순회한다. (1곳/일 → 수십일 걸리던 문제 해소)
    const GROW_BUDGET_MS = 40_000;
    const t0 = Date.now();
    const discoveries: { region: string; found?: number; inserted?: number; error?: string }[] = [];
    while (Date.now() - t0 < GROW_BUDGET_MS) {
      const target = (await sql`SELECT region, area_label FROM discovery_state ORDER BY last_run ASC NULLS FIRST LIMIT 1`)[0] as { region: string; area_label: string } | undefined;
      if (!target) break;
      try {
        const d = await discoverRegion(target.region, target.area_label ?? target.region);
        await sql`UPDATE discovery_state SET last_run=now(), last_found=${d.found}, last_inserted=${d.inserted} WHERE region=${target.region}`;
        discoveries.push({ region: d.region, found: d.found, inserted: d.inserted });
      } catch (e) {
        await sql`UPDATE discovery_state SET last_run=now() WHERE region=${target.region}`; // 실패해도 last_run 갱신(무한루프·재시도 폭주 방지)
        discoveries.push({ region: target.region, error: String(e).slice(0, 60) });
        break; // 네이버 한도/오류 시 이번 회차 발굴 중단(다음 cron에서 이어감)
      }
    }
    const discovery = discoveries[discoveries.length - 1] ?? null;
    const totalInserted = discoveries.reduce((s, d) => s + (d.inserted ?? 0), 0);

    // ①-B 리뷰 속 숨은 카페 발굴 — 이미 수집한 raw_reviews에서 상호 추출→네이버 검증→신규 적재(토큰 0).
    //     가장 오래 채굴 안 된 지역 1곳만 바운드(maxCalls)로 처리 → 매일 조금씩 수도권 순회(네이버 한도·함수시간 안전).
    await sql`ALTER TABLE discovery_state ADD COLUMN IF NOT EXISTS last_mined TIMESTAMPTZ`.catch(() => {});
    let mining: any = null;
    try {
      const mt = (await sql`SELECT region, area_label FROM discovery_state ORDER BY last_mined ASC NULLS FIRST LIMIT 1`)[0] as { region: string; area_label: string } | undefined;
      if (mt) {
        mining = await mineArea(mt.area_label ?? mt.region, { maxCalls: 25, apply: true });
        await sql`UPDATE discovery_state SET last_mined=now() WHERE region=${mt.region}`;
      }
    } catch (e) { mining = { error: String(e).slice(0, 80) }; }

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

    const remainingRegions = (await sql`SELECT COUNT(*)::int n FROM discovery_state WHERE last_run IS NULL`)[0].n;
    return NextResponse.json({
      ok: true, ranAt: new Date().toISOString(),
      regionsSwept: discoveries.length, totalInserted, discoveries, remainingRegions,
      lastDiscovery: discovery, mining,
      synthesized: synth.length, published, llmRescued: rescued, pendingNew,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
