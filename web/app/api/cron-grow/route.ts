import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { discoverRegion, METRO_REGIONS, PRIORITY_REGIONS, LONGTAIL_TASTE_TARGETS, LONGTAIL_SEED_REASON } from "@/lib/discover";
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
    // 🎯 롱테일 SEO 타겟 시드(coordination#337) — pending이거나 최근 7일 내 처리됐으면 재시딩 생략(중복 적재 방지),
    //   그 외(처음이거나 7일 지나 재보강 필요)면 큐에 다시 올려 로스팅 결 발굴이 계속 우선순위를 받게 한다.
    for (const t of LONGTAIL_TASTE_TARGETS) {
      const recent = await sql`SELECT 1 FROM discovery_targets WHERE region=${t.region} AND reason=${LONGTAIL_SEED_REASON}
        AND (status='pending' OR consumed_at > now() - interval '7 days') LIMIT 1`;
      if (!recent.length) {
        await sql`INSERT INTO discovery_targets (region, area_label, keywords, reason, priority)
          VALUES (${t.region}, ${t.areaLabel}, ${JSON.stringify(t.keywords)}::jsonb, ${t.reason}, ${t.priority})`;
      }
    }

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
      // 🐛 재발방지(2026-07-26): priorityStarved(위 줄)는 NULL(한 번도 미발굴)을 안전 처리하는데 이 쿼리는
      //   WHERE last_run < ... 만 있어 NULL은 SQL에서 '비교 결과 unknown'이라 결과에서 아예 빠졌다 — 즉
      //   한 번도 발굴 안 된 신설 지역(예: 인천 행정구역 개편 신설구)이 '5일+ 굶음'보다도 우선순위가
      //   낮게 취급돼 큐가 안 비는 한 영영 못 뽑혔다. NULL을 최우선(critical)으로 명시 처리.
      const starved = (await sql`SELECT region, area_label, (last_run IS NULL OR last_run < now() - interval '10 days') AS critical FROM discovery_state WHERE last_run IS NULL OR last_run < now() - interval '5 days' ORDER BY last_run ASC NULLS FIRST LIMIT 1`)[0] as { region: string; area_label: string; critical: boolean } | undefined;
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
    //     가장 오래 채굴 안 된 지역 1곳만 처리. 이 채널은 호출당 적중률이 지역발굴(①)보다 ~10배 높다
    //     (실측: 354곳/38일 ≈ 최대 32콜/신규카페 vs ①의 ~260콜/신규카페) — maxCalls=25는 지역당 후보풀
    //     96~114개 중 70~90개를 매번 그냥 버리는 임의 상한이었다(coord 네이버쿼터 딥다이브). 100으로 상향하되
    //     deadlineMs로 ①이 예산을 많이 써버린 회차에도 합성(②) 시간을 절대 침범하지 않게 안전판을 둔다.
    await sql`ALTER TABLE discovery_state ADD COLUMN IF NOT EXISTS last_mined TIMESTAMPTZ`.catch(() => {});
    let mining: any = null;
    try {
      const mt = (await sql`SELECT region, area_label FROM discovery_state ORDER BY last_mined ASC NULLS FIRST LIMIT 1`)[0] as { region: string; area_label: string } | undefined;
      if (mt) {
        mining = await mineArea(mt.area_label ?? mt.region, { maxCalls: 100, apply: true, deadlineMs: t0 + 270_000 });
        await sql`UPDATE discovery_state SET last_mined=now() WHERE region=${mt.region}`;
      }
    } catch (e) { mining = { error: String(e).slice(0, 80) }; }

    // ② 합성/재판정 — 미합성(신규) 우선, 그다음 가장 오래된 순으로 순회.
    //    각 카페가 synthAndStore(규칙+LLM 맥락 재판정)를 거쳐 정확도가 지속적으로 올라간다.
    //    Gemini 쿼터 소진 시 LLM은 자동 폴백(규칙 결과 유지) → 한도 회복되면 다음 회차부터 재판정.
    // 🐛 재발방지(coord#276): 이 루프에 시간 예산이 없어 mining(최대 t0+270s)이 늘어지면 5곳 합성이
    //    maxDuration(300s)을 넘겨 플랫폼에 강제종료됐다 — recordRun(하트비트)이 함수 맨 끝에만 있어서
    //    같이 증발, agent_runs만 끊기고 discovery_state(위 ①, 225s 예산 내)는 계속 갱신되는 오탐성 정지처럼
    //    보였다(하트비트-실작업 괴리). SYNTH_DEADLINE으로 항상 recordRun까지 도달하도록 보장.
    const SYNTH_DEADLINE = t0 + 285_000;
    const targets = (await sql`SELECT id, name, area FROM cafes ORDER BY synth_updated ASC NULLS FIRST LIMIT 5`) as unknown as { id: number; name: string; area: string }[];
    const synth = [];
    let rescued = 0;
    for (const cafe of targets) {
      if (Date.now() > SYNTH_DEADLINE) break;
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
