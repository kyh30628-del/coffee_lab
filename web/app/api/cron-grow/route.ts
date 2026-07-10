import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { discoverRegion, METRO_REGIONS, PRIORITY_REGIONS } from "@/lib/discover";
import { synthAndStore } from "@/lib/synthStore";
import { mineArea } from "@/lib/reviewMiner";
import { recordRun } from "@/lib/agentLog";
import { naverUsedToday, NAVER_DAILY_QUOTA } from "@/lib/naverBudget";
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
    // 🎯 demand→grow 자율 루프: 에이전트(Claude Code)가 수요·공급갭을 추론해 채우는 타겟 큐. 비면 기존 신선도 순회로 폴백.
    await sql`CREATE TABLE IF NOT EXISTS discovery_targets (id SERIAL PRIMARY KEY, region TEXT, area_label TEXT, keywords JSONB, reason TEXT, priority INT DEFAULT 0, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now(), consumed_at TIMESTAMPTZ, found INT, inserted INT)`.catch(() => {});

    // ① 가장 오래된 지역부터 '시간 예산(260초)' 내 공격적 발굴 — sort=comment+random 2패스 + 동/도로
    //    지리 세분화로 검색 창을 최대화(프랜차이즈에 묻힌 리뷰 많은 동네카페 발굴력↑). 호출량이 커서
    //    1회차당 1~2지역만 깊게 훑고(셔플로 매번 다른 영역 커버), deadline으로 함수시간 내 안전 중단.
    //    maxDuration=300초 기준, 마이닝·합성 여유 40초 확보.
    const GROW_BUDGET_MS = 225_000; // 발굴 225s + 마이닝·합성 여유 → maxDuration 300s 안전마진(실측 290s→타임아웃 위험 해소)
    const t0 = Date.now();
    const discoveries: { region: string; found?: number; inserted?: number; stopped?: boolean; error?: string; agent?: boolean }[] = [];
    while (Date.now() - t0 < GROW_BUDGET_MS) {
      // ⚠️ 이중 기아 방지: '5일+ 굶은 지역이면 무조건 큐보다 우선'이 상시 참이 되어(64지역 로테이션이라 항상 뭔가는
      //   5일+ 됨) 큐가 3일+ 전혀 안 내려가는 반대 기아가 발생했다(#109). 진짜 위급(10일+)할 때만 큐를 밀어내고,
      //   그 정도는 평소대로 큐 우선 → 큐 비면 굶은 지역으로 폴백.
      // 🎯 단, PRIORITY_REGIONS(강동·송파·구리)는 사업 우선순위상 10일까지 기다릴 수 없어 3일+ 방치되면
      //   큐를 밀어낸다 — 대상이 64지역 전체가 아니라 이 3곳뿐이라 #109의 상시-기아 재발은 없다(coord#107).
      const priorityStarved = (await sql`SELECT region, area_label FROM discovery_state WHERE region = ANY(${PRIORITY_REGIONS}) AND (last_run IS NULL OR last_run < now() - interval '3 days') ORDER BY last_run ASC NULLS FIRST LIMIT 1`)[0] as { region: string; area_label: string } | undefined;
      const starved = (await sql`SELECT region, area_label, (last_run < now() - interval '10 days') AS critical FROM discovery_state WHERE last_run < now() - interval '5 days' ORDER BY last_run ASC NULLS FIRST LIMIT 1`)[0] as { region: string; area_label: string; critical: boolean } | undefined;
      const critical = priorityStarved ?? (starved?.critical ? starved : undefined);
      const at = critical ? null : (await sql`SELECT id, region, area_label, keywords FROM discovery_targets WHERE status='pending' ORDER BY priority DESC, created_at ASC LIMIT 1`)[0] as any;
      const target = critical ?? (at ?? starved ?? ((await sql`SELECT region, area_label FROM discovery_state
        ORDER BY (region = ANY(${PRIORITY_REGIONS}) AND (last_run IS NULL OR last_run < now() - interval '6 hours')) DESC, last_run ASC NULLS FIRST LIMIT 1`)[0] as { region: string; area_label: string } | undefined));
      if (!target) break;
      const kw = at && Array.isArray(at.keywords) && at.keywords.length ? (at.keywords as string[]) : undefined;
      try {
        const d = await discoverRegion(target.region, target.area_label ?? target.region, kw, { deadlineMs: t0 + GROW_BUDGET_MS, sorts: ["comment", "random"] });
        if ((d as any).apiError) {
          // 🛑 네이버 쿼터 소진 — last_run/큐 그대로 두고 중단(다음 cron이 쿼터 회복 후 재시도).
          discoveries.push({ region: d.region, error: "naver-quota(보존)" });
          break;
        }
        // 요청타깃(at)이든 로테이션이든 실제 발굴한 지역의 로테이션 시계(last_run)를 항상 찍는다.
        //   과거엔 at일 때 discovery_targets만 done하고 discovery_state를 안 찍어, 요청타깃으로 발굴된
        //   로테이션 지역(예: 포천시)이 옛 날짜로 남아 "N일 굶음" 오표기됐다(관제탑 #555 부풀림).
        //   target.region이 discovery_state에 없으면 no-op라 안전.
        if (at) await sql`UPDATE discovery_targets SET status='done', consumed_at=now(), found=${d.found}, inserted=${d.inserted} WHERE id=${at.id}`;
        await sql`UPDATE discovery_state SET last_run=now(), last_found=${d.found}, last_inserted=${d.inserted} WHERE region=${target.region}`;
        discoveries.push({ region: d.region, found: d.found, inserted: d.inserted, stopped: d.stopped, agent: !!at });
      } catch (e) {
        if (at) await sql`UPDATE discovery_targets SET status='done', consumed_at=now() WHERE id=${at.id}`; // 실패해도 큐서 빼 무한루프 방지
        await sql`UPDATE discovery_state SET last_run=now() WHERE region=${target.region}`; // 발굴 시도된 로테이션 지역 시계도 찍어 일관성(없으면 no-op)
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
    const targets = (await sql`SELECT id, name, area FROM cafes ORDER BY synth_updated ASC NULLS FIRST LIMIT 5`) as unknown as { id: number; name: string; area: string }[];
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
    // 🧭 네이버 오늘 사용량 — 소진(=자정까지 발굴 불가)이 '버그'가 아니라 '정상 한도'임을 관제탑에 명시.
    const naverUsed = await naverUsedToday().catch(() => 0);
    const naverPct = Math.round((naverUsed / NAVER_DAILY_QUOTA) * 100);
    const quotaNote = naverUsed >= NAVER_DAILY_QUOTA ? " · 네이버 한도소진(자정 리셋·정상)" : ` · 네이버 ${naverPct}%`;
    await recordRun("cron-grow", true, `발굴 ${discoveries.length}지역 신규 ${totalInserted} 합성 ${synth.length} 공개 ${published}${quotaNote}`, totalInserted);
    return NextResponse.json({
      ok: true, ranAt: new Date().toISOString(),
      regionsSwept: discoveries.length, totalInserted, discoveries, remainingRegions,
      lastDiscovery: discovery, mining,
      synthesized: synth.length, published, llmRescued: rescued, pendingNew,
    });
  } catch (e) {
    await recordRun("cron-grow", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
