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
// 🎯 위험군 게이트(2026-07-05 CEO): 공개 카페 '재판정'은 신뢰도 낮은 등급만 — 파이프라인 자체 등급으로 원리적 선.
//   '검증'(verified, 평균 85리뷰 = 옥석 코어)은 스킵(재판정 불필요), 그 외('참고' 등, 평균 12리뷰)는 판정.
//   근거: 오염 4곳(리코·충무·블라블라·블루다이아) 전부 '참고'였음 — 리뷰 개수(<5) 같은 자의적 선보다 등급이 정확.
//   신규(pending)는 공개 게이트라 항상 판정. ⚠️ 소비자 노출 무영향: 게이트는 후보 SELECT만 좁힘 — 스킵 카페는 현 상태 그대로.
const TRUSTED_GRADE = "검증"; // 이 등급(옥석 코어)만 재판정 스킵

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
    //   그다음 '후보구제'(한 번도 공개 안 된 카페인데 경계리뷰가 있어 AI가 구제하면 등급 문턱을 넘을 수 있는 것) —
    //   실측(2026-07-27): 후보등급 미공개 카페 2,763곳이 평균 74개 경계리뷰를 갖고도 이 쿼리 조건에
    //   한 번도 안 걸려(published=false·pending도 아님) AI판정 자체를 받아본 적이 없었다(구조적 누락, 로직버그 아님).
    //   공개카페 재정제(보조)는 맨 마지막. (이전엔 published DESC라 신규가 영영 차례 안 와 적체됨)
    let submitted = 0, noCand = 0, batchId: string | null = null;
    //   신규(pending)는 항상 판정(공개 게이트). 공개 재판정은 '검증' 아닌 등급만(참고 등 = 낮은 신뢰).
    //   '검증' 등급(옥석 코어, 평균 85리뷰)은 후보에서 제외 → 판정 스킵, 노출 무영향.
    //   후보구제: excluded·held·noise는 등급이 올라도 storeResult가 무조건 publish=false로 고정(영구차단) → 대상에서 제외해 낭비 방지.
    const rows = (await sql`SELECT id, name, area FROM cafes
      WHERE raw_reviews IS NOT NULL
        AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at)
        AND (
          pipeline_status = 'pending'
          OR (published AND synth_grade IS DISTINCT FROM ${TRUSTED_GRADE})
          OR (
            synth_grade = '후보' AND NOT published AND COALESCE(borderline_count, 0) > 0
            AND (pipeline_status IS NULL OR pipeline_status NOT IN ('excluded', 'held', 'noise'))
          )
        )
      ORDER BY (COALESCE(pipeline_status, '') = 'pending') DESC,
               -- ⚠️ pipeline_status IS NULL(grandfather)인 행은 위 비교가 SQL NULL이 되고, Postgres는
               --   DESC에서 NULL을 '가장 큼'으로 취급해 맨 앞으로 보낸다 — COALESCE로 NULL을 없애 방지(실측으로 발견).
               (synth_grade = '후보' AND NOT COALESCE(published, false)) DESC,  -- 후보구제(신규 공개 가능성) > 공개카페 재정제
               COALESCE(synth_count, 0) ASC,           -- 리뷰 적어 취약한 순 우선(옥석 많은 곳은 뒤로)
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
