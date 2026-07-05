import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getAuditCandidates, applyDecisions, markJudged } from "@/lib/synthStore";
import { createBatch, getBatch, streamResults, BATCH_PRICE_IN, BATCH_PRICE_OUT } from "@/lib/anthropicBatch";
import { RUBRIC, buildUserText, parseVerdicts, CLAUDE_MODEL } from "@/lib/reviewJudge";

export const runtime = "nodejs";
export const maxDuration = 300;

// 클라우드 자동 판정 — Anthropic Batches(50% 할인, 비동기). 실시간 API 대신 사용(품질 동일, 반값).
// 매 실행: ① 지난번 제출 배치가 끝났으면 결과 수거·적용  ② 판정 대기 카페로 새 배치 제출.
//   비동기라 결과가 한 사이클(크론 간격) 늦게 반영되지만, 카페 큐레이션엔 무방.
//   매니페스트(custom_id→cafe·keys)는 DB(judge_batches)에 보관(서버리스 /tmp 비영속 대응).
const BUILD_LIMIT = Number(process.env.BATCH_JUDGE_LIMIT || 150); // 빌드 시 getAuditCandidates가 카페당 합성 → 300s 내로 제한
const PER_CAFE = 35;
// 🎯 위험군 게이트(2026-07-05 CEO): 공개 카페 '재판정'은 오염 위험군만 — 이름이 명확하고 리뷰 충분한
//   깨끗한 공개 카페(예: 옥석 리뷰 300건)는 재판정 스킵(비용·불필요). 신규(pending)는 공개 게이트라 항상 판정.
//   위험 신호 = ①부실 리뷰(<5건) ②짧은 이름(≤4자, 토큰충돌 잦음) ③충돌 토큰(신도시·복합시설·지명 — 오염 실적).
//   ⚠️ 소비자 노출 무영향: 이 게이트는 '무엇을 판정할지' 후보만 좁힘 — 스킵된 카페는 현 상태 그대로 유지(공개·리뷰 불변).
const RISK_TOKENS = "충무|위례|미사|다산|별내|광교|동탄|운정|송도|청라|영종|마곡|고덕|감일|갈매|스타필드|롯데몰|신세계|현대백화점|아울렛|휴게소|터미널|캠퍼스";

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    // 🛑 AI 판정 배치 상시(자동제출) OFF — 대표님 지시(비용 통제). 백로그가 쌓이면 '몰아서 청산'만 수동 허용.
    //   ⚠️ 어떤 스케줄러(vercel cron·launchd·에이전트)에도 등록 금지 — 이 게이트가 자동제출을 막는 최후 방어선.
    //   수동 청산: ?manual=1 + CRON_SECRET 일 때만 동작(예약/자동 호출은 manual 없으니 차단). 결정론 엔진은 별개로 상시 가동.
    const manual = req.nextUrl.searchParams.get("manual") === "1";
    if (!manual) {
      return NextResponse.json({ ok: false, disabled: true, mode: "manual-only", note: "AI 판정 상시 OFF(대표님 지시) — 수동 청산은 ?manual=1 로만" });
    }
    const KEY = process.env.ANTHROPIC_API_KEY;
    if (!KEY) return NextResponse.json({ ok: false, error: "ANTHROPIC_API_KEY 미설정 — 판정 비활성" });
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS judge_batches (batch_id TEXT PRIMARY KEY, manifest JSONB, applied BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`;

    // ── ① 끝난 배치 수거·적용 ──
    let appliedCafes = 0, rescued = 0, inTok = 0, outTok = 0, stillRunning = 0;
    const open = (await sql`SELECT batch_id, manifest FROM judge_batches WHERE NOT applied ORDER BY created_at LIMIT 5`) as any[];
    for (const row of open) {
      const b = await getBatch(KEY, row.batch_id);
      if (b.processing_status !== "ended") { stillRunning++; continue; }
      const cafes = row.manifest?.cafes ?? {};
      for await (const res of streamResults(KEY, b.results_url)) {
        const entry = cafes[res.custom_id];
        if (!entry || res.result?.type !== "succeeded") continue;
        const u = res.result.message?.usage; if (u) { inTok += (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); outTok += u.output_tokens || 0; }
        const text = res.result.message?.content?.find((x: any) => x.type === "text")?.text || "";
        const verdicts = parseVerdicts(text); // Map<i, {about,helpful}>
        const decisions: Record<string, boolean> = {};
        (entry.keys as string[]).forEach((k, i) => { const v = verdicts?.get(i); decisions[k] = !!(v && v.about && v.helpful); });
        try { await applyDecisions({ id: entry.id, name: entry.name, area: entry.area ?? "" }, decisions); appliedCafes++; rescued += Object.values(decisions).filter(Boolean).length; }
        catch { /* 실패분 스킵 — 다음 배치에서 재시도되지 않게 markJudged */ try { await markJudged(entry.id); } catch {} }
      }
      await sql`UPDATE judge_batches SET applied = true WHERE batch_id = ${row.batch_id}`;
    }

    // ── ② 판정 대기 카페로 새 배치 제출 ──
    //   ⚠️ 우선순위: 신규(pending) 먼저! pending은 판정이 '공개 필수 게이트'라 미루면 영영 공개 안 됨.
    //   공개카페 재정제(보조)는 그 다음. (이전엔 published DESC라 신규가 영영 차례 안 와 적체됨)
    let submitted = 0, noCand = 0, batchId: string | null = null;
    //   신규(pending)는 항상 판정(공개 게이트). 공개 재판정은 위험군만(부실<5 · 짧은이름≤4 · 충돌토큰).
    //   깨끗한 공개 카페(리뷰 충분·명확한 이름)는 후보에서 제외 = 사실상 '제일 뒤로' → 판정 스킵, 노출 무영향.
    const rows = (await sql`SELECT id, name, area FROM cafes
      WHERE raw_reviews IS NOT NULL
        AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)
        AND (
          pipeline_status = 'pending'
          OR (published AND (synth_count < 5 OR length(name) <= 4 OR name ~ ${RISK_TOKENS}))
        )
      ORDER BY (pipeline_status = 'pending') DESC,
               (COALESCE(synth_count, 0) < 5) DESC,   -- 부실 리뷰 우선
               (length(name) <= 4) DESC,               -- 짧은/충돌 이름 다음
               COALESCE(synth_count, 0) ASC,           -- 리뷰 적은 순(옥석 많은 곳은 뒤로)
               id LIMIT ${BUILD_LIMIT}`) as any[];
    const requests: any[] = [];
    const manifestCafes: Record<string, any> = {};
    for (const c of rows) {
      try { // 한 카페 오류(데이터·합성)로 전체 빌드가 멈추지 않게 격리
        const { candidates, hasRaw } = await getAuditCandidates({ id: c.id, name: c.name, area: c.area ?? "" });
        if (!hasRaw) continue;
        const items = candidates.slice(0, PER_CAFE).filter((it: any) => it && it.key);
        if (items.length === 0) { await markJudged(c.id); noCand++; continue; } // 후보 없음 → 무과금 판정완료
        requests.push({
          custom_id: `cafe_${c.id}`,
          params: {
            model: CLAUDE_MODEL, max_tokens: 1500,
            system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: buildUserText(c.name, c.area ?? "", items.map((it: any, i: number) => ({ i, title: it.title || "", body: it.body || "" }))) }],
          },
        });
        manifestCafes[`cafe_${c.id}`] = { id: c.id, name: c.name, area: c.area ?? "", keys: items.map((it: any) => it.key) };
      } catch { try { await markJudged(c.id); } catch {} }
    }
    if (requests.length > 0) {
      const b = await createBatch(KEY, requests);
      batchId = b.id;
      try { await sql`INSERT INTO judge_batches (batch_id, manifest) VALUES (${b.id}, ${JSON.stringify({ cafes: manifestCafes })}::jsonb) ON CONFLICT (batch_id) DO NOTHING`; }
      catch (e) { return NextResponse.json({ ok: false, error: "manifest 저장 실패", detail: String(e).slice(0, 120), batchId: b.id }); }
      submitted = requests.length;
    }

    const cost = inTok * BATCH_PRICE_IN + outTok * BATCH_PRICE_OUT;
    return NextResponse.json({
      ok: true,
      applied: { cafes: appliedCafes, rescuedReviews: rescued, costUsd: Number(cost.toFixed(4)), inTok, outTok },
      pollingBatches: stillRunning,
      submitted: { newBatchId: batchId, cafes: submitted, noBorderlineMarked: noCand },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}
