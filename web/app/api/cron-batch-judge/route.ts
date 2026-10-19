import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getAuditCandidates, getUndecidedAuditCandidates, applyDecisions, markJudged, bumpJudgePass } from "@/lib/synthStore";
import { createBatch, getBatch, streamResults, cancelBatch, BATCH_PRICE_IN, BATCH_PRICE_OUT, batchPriceFor } from "@/lib/anthropicBatch";
import { RUBRIC, buildUserText, parseVerdicts, decisionsFromVerdicts, judgeMaxTokens, CLAUDE_MODEL } from "@/lib/reviewJudge";
import { OLD_REVIEW_MONTHS } from "@/lib/cafeProfile";

export const runtime = "nodejs";
export const maxDuration = 300;

// 클라우드 자동 판정 — Anthropic Batches(50% 할인, 비동기). 실시간 API 대신 사용(품질 동일, 반값).
// 매 실행: ① 지난번 제출 배치가 끝났으면 결과 수거·적용  ② 판정 대기 카페로 새 배치 제출.
//   비동기라 결과가 한 사이클(크론 간격) 늦게 반영되지만, 카페 큐레이션엔 무방.
//   매니페스트(custom_id→cafe·keys)는 DB(judge_batches)에 보관(서버리스 /tmp 비영속 대응).
const BUILD_LIMIT = Number(process.env["BATCH_JUDGE_LIMIT"] || 60);  // 2026-09-20 150→120→60. 120에서 8회차가 300s 타임아웃으로 빈 응답을 냈다(rejected 3,089곳이 남았는데 '대상 없음'처럼 보였다).
//   원인: 후보 선정 정렬이 synth_count ASC(후기 적은 순)라 **회차가 갈수록 무거운 카페**가 온다 — 카페당 합성이 느려진다. // 빌드 시 getAuditCandidates가 카페당 합성 → 300s 내로 제한
const PER_CAFE = 35;
// 🔁 한 카페를 최대 몇 번까지 판정 배치에 올릴 수 있나. 경계 후기 35건 초과 카페(실측 4,280곳,
//   최대 317건)를 끝까지 보려면 여러 번 올라가야 한다. 상한 = 35 × 9 = 315건까지 커버.
//   ⚠️ 상한이 없으면 '모델이 답 안 한 후보는 미결로 남긴다'는 수리와 맞물려 무한 재구매가 된다.
const JUDGE_MAX_PASSES = Number(process.env["JUDGE_MAX_PASSES"] || 9);
// ⚡ 동시 처리 수 (2026-10-19) — **기본 1이라 프로덕션 동작은 그대로다.**
//   병목 실측: 수거 1곳당 재합성(loadRaw→collectAndSynthesize→storeResult)이 돌아 **분당 12.7곳**이었다.
//   후보구제 7,518곳 = 9.9시간, 재정제 24,734곳 = 32.4시간. CEO 지적("왜 며칠이나 걸리냐")의 실체가 이것이다.
//   카페별 처리는 서로 독립이고 Neon은 HTTP 드라이버(요청마다 독립)라 커넥션 풀 고갈이 없다 →
//   동시 처리로 바로 줄어든다. 💰 Neon은 컴퓨트 시간 과금이라 **총 시간이 줄면 비용도 준다**(증가 아님).
//   ⚠️ 라이브 서비스와 같은 DB다. 과하게 올리면 실사용자 응답이 느려진다 — 로컬 집행만 올려 쓰고
//      기본값은 1로 둔다(「서비스 멈출 위험 있으면 아예 하지 말 것」).
// 🔴 2026-10-19 — `process.env.JUDGE_CONCURRENCY` (점 접근)은 **Next가 빌드 시점에 리터럴로 치환**한다.
//   빌드 때 값이 없으면 undefined로 박혀 런타임에 아무리 넣어도 1로 돌았다(실측: 동시6을 줘도 분당 14곳,
//   직렬 기준선 12.7곳과 차이 없음 · 서버 CPU는 1.7%로 한가했다 = 병렬이 아예 안 걸린 증거).
//   대괄호 접근은 치환 대상이 아니라 런타임 값을 읽는다.
const CONC = Math.max(1, Math.min(12, Number(process.env["JUDGE_CONCURRENCY"] || 1)));
// 🛑 판정 대량 비공개 차단기 (2026-10-19) — **판정 경로엔 상한이 없었다.**
//   힐러들은 2026-07-29 보안감사 때 HEAL_UNPUB_CAP(50)을 받았는데, applyDecisions는 무제한이었다.
//   왜 위험한가(실측): 공개 카페는 등급이 '후보'로 떨어지면 비공개된다(grade.floor.reference=2).
//     재정제 대상 21,145곳 중 **후기 2건 이하가 1,778곳(8.4%)** — 거절 1건에도 내려간다.
//     최근 7일 실측으로 판정 후 비공개로 내려간 카페가 **502곳** 있었다. 24,737곳을 한 번에 돌리면
//     루브릭·파싱 회귀 한 번에 수백~수천 곳이 소비자 화면에서 사라질 수 있다.
//   🔴 비공개 자체를 막지는 않는다 — AI가 "이 후기는 이 가게 글이 아니다"라고 보면 내려가는 게 맞고,
//      그게 판정을 돌리는 이유다. 막는 것은 **한 회차의 속도**다: 상한을 넘으면 그 회차의 적용을
//      멈추고 신호를 남긴다(수거는 멱등이라 다음에 이어진다). 「수렴 못하면 멈춤」 원칙.
const JUDGE_UNPUB_CAP = Number(process.env["JUDGE_UNPUB_CAP"] || 100);
async function mapPool<T>(items: T[], worker: (x: T) => Promise<void>) {
  if (CONC <= 1) { for (const x of items) await worker(x); return; }
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(CONC, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await worker(x); }
  }));
}
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
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS judge_passes INT DEFAULT 0`;   // 아래 후보 SELECT가 이 칼럼을 읽는다 — 먼저 만든다
    // 🔴 2026-10-19 비용수리 — 세밀 축을 **cafes 컬럼에 넣으면 안 된다.**
    //   cafes 행은 평균 78KB(벡터·GIN 인덱스 다수)라, 작은 JSONB 하나만 갱신해도 **행 전체를 다시 쓴다.**
    //   판정 40,767곳이면 추가 쓰기 약 3.2GB이고, 더 나쁜 건 storeResult의 UPDATE와 **별개 UPDATE**라
    //   같은 행을 **두 번** 쓴다는 것이다. 2026-09-26에 정확히 이 패턴으로 cost_guard가 자동정지했다
    //   (noncafe UPDATE 89.7GB·offconcept 33.5GB — decision#1262, 해법은 경량 테이블 분리).
    //   → 전용 얇은 테이블. cafes를 전혀 건드리지 않는다. (cafe_scan_state와 같은 사상)
    await sql`CREATE TABLE IF NOT EXISTS cafe_judge_marks (
      cafe_id BIGINT PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
      marks JSONB NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`.catch(() => {});

    // ── ① 끝난 배치 수거·적용 ──
    let appliedCafes = 0, rescued = 0, inTok = 0, outTok = 0, stillRunning = 0, expiredBatches = 0;
    // 🔬 2026-10-19 정확성 계측 — 이 셋이 0이 아니면 'AI가 보지 않은 채 버려진 후기'가 있다는 뜻이다.
    let truncated = 0, parseFailed = 0, unanswered = 0;
    let unpublished = 0, cappedStop = false;   // 🛑 판정으로 공개→비공개가 된 수(차단기 근거)
    // 🔬 2026-10-19 세밀 축 집계 — 협찬 문체·나열글·구체성. 응답에 실어 보고에 쓴다.
    let adStyleN = 0, listicleN = 0, depthSum = 0, depthCafes = 0, marksSaved = 0;
    let costAcc = 0;   // 배치별 모델 단가로 적립한 실비용(아래 보고에 쓴다)
    const open = (await sql`SELECT batch_id, manifest FROM judge_batches WHERE NOT applied ORDER BY created_at LIMIT 5`) as any[];
    for (const row of open) {
      const b = await getBatch(KEY, row.batch_id);
      if (b.processing_status !== "ended") { stillRunning++; continue; }
      // 🔴 2026-09-15 수리 — 이 줄이 없어서 **이 엔드포인트가 07-27부터 아예 죽어 있었다.**
      //   Anthropic은 배치 결과를 29일만 보관한다. 그 뒤엔 processing_status는 "ended"인데
      //   results_url이 null로 돌아온다. 그대로 streamResults(KEY, null)에 넘기면
      //   `Cannot read properties of null (reading 'toString')`로 터지고, 그 순간 ①에서 죽으니
      //   ②(신규 배치 제출)까지 **도달 자체를 못 한다**. 07-27 취소분 12건이 큐 맨 앞에 앉아
      //   그 뒤 모든 수동 청산 호출을 막고 있었다(판정대기 149곳이 안 풀리던 진짜 이유).
      //   → 결과를 못 받는 배치는 적용 완료로 닫고 넘어간다. 되살릴 방법이 없으니 붙잡을 이유도 없다.
      if (!b.results_url) {
        expiredBatches++;
        await sql`UPDATE judge_batches SET applied = true WHERE batch_id = ${row.batch_id}`;
        continue;
      }
      const cafes = row.manifest?.cafes ?? {};
      // 💰 2026-10-18 — **배치마다 쓴 모델의 단가로 계산한다.**
      //   그 전엔 수거 시점의 기본 모델 단가로 계산해서, 모델을 바꿔 돌리면 비용 보고가 틀렸다
      //   (실측: Haiku 4.5로 제출한 584곳 배치를 Sonnet 5 단가로 세면 4배 과대). 예산 가드가 쓰는 숫자다.
      //   매니페스트에 model이 없는 옛 배치는 batchPriceFor의 기본값(구형 Haiku 단가)으로 떨어진다.
      const bp = batchPriceFor(String(row.manifest?.model ?? ""));
      // ⚡ 스트림을 먼저 다 읽어 두고(네트워크) 적용을 풀로 돌린다(DB·재합성). 읽기는 가볍고 적용이 무겁다.
      const toApply: any[] = [];
      for await (const res of streamResults(KEY, b.results_url)) toApply.push(res);
      await mapPool(toApply, async (res: any) => {
        const entry = cafes[res.custom_id];
        if (!entry || res.result?.type !== "succeeded") return;
        // 💰 비용은 **그 배치의 모델 단가**로 바로 적립한다(토큰만 모으면 모델이 섞여 계산이 틀어진다).
        const u = res.result.message?.usage;
        if (u) {
          const i = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
          const o = u.output_tokens || 0;
          inTok += i; outTok += o; costAcc += i * bp.in + o * bp.out;
        }
        if (res.result.message?.stop_reason === "max_tokens") truncated++;
        const text = res.result.message?.content?.find((x: any) => x.type === "text")?.text || "";
        const verdicts = parseVerdicts(text); // Map<i, {about,helpful}>
        // 🔴 2026-10-19 — **답을 못 읽었으면 아무 결정도 남기지 않는다.**
        //   그 전엔 파싱 실패 시 모든 키에 false를 박아 후보 전원이 "AI 판정: 무관/저품질 제외"로
        //   영구 저장됐다(실측: 잘림 0.3~1.9%, 한 배치에서 69건·30건). 규칙 판정을 그대로 두는 게
        //   무회귀 기본값이다 — 커서만 전진시켜 같은 비용을 두 번 쓰지 않는다.
        if (!verdicts) { parseFailed++; try { await markJudged(entry.id); } catch {} return; }
        const mapped = decisionsFromVerdicts(entry.keys as string[], verdicts);
        unanswered += mapped.unanswered;
        adStyleN += mapped.ads; listicleN += mapped.lists;
        if (mapped.depthAvg !== null) { depthSum += mapped.depthAvg; depthCafes++; }
        // 🔬 세밀 축을 카페별로 저장 — 노출 순서(구체성 높은 인용문 우선)와 협찬 감시에 쓴다.
        //   판정 결정(judge_decisions)과 **분리**해 둔다: 결정은 채택/거부라는 계약이고, 이건 부가 신호다.
        //   섞으면 옛 판정과 호환이 깨진다(판정 결정은 재합성이 매번 읽는 핫패스다).
        try {
          // 얇은 테이블에만 쓴다 — cafes(40KB/행)를 건드리지 않아 추가 쓰기가 사실상 0이다.
          // 🔑 축이 비어도 **행은 남긴다** — '세밀 축 미보유' 큐 조건의 종료 보장이다(무한 재판정 차단).
          await sql`INSERT INTO cafe_judge_marks (cafe_id, marks) VALUES (${entry.id}, ${JSON.stringify(mapped.marks)}::jsonb)
            ON CONFLICT (cafe_id) DO UPDATE SET marks = cafe_judge_marks.marks || EXCLUDED.marks, at = now()`;
          if (Object.keys(mapped.marks).length) marksSaved++;
        } catch { /* 부가 신호 저장 실패가 판정을 막지 않는다 */ }
        if (Object.keys(mapped.decisions).length === 0) { try { await markJudged(entry.id); } catch {} return; }
        if (cappedStop) return;   // 상한 초과 — 이 회차는 더 적용하지 않는다(멱등 수거라 다음에 이어진다)
        try {
          const res2: any = await applyDecisions({ id: entry.id, name: entry.name, area: entry.area ?? "" }, mapped.decisions);
          appliedCafes++; rescued += mapped.kept;
          if (res2?.wasPublished && res2?.published === false) {
            unpublished++;
            if (unpublished > JUDGE_UNPUB_CAP) {
              cappedStop = true;
              console.warn(`[judgeGuard] 판정으로 비공개 전환 ${unpublished}곳 > 상한 ${JUDGE_UNPUB_CAP} — 이 회차 적용을 중단합니다`);
            }
          }
        }
        catch { /* 실패분 스킵 — 다음 배치에서 재시도되지 않게 markJudged */ try { await markJudged(entry.id); } catch {} }
      });
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
    // ⚠️ 중복제출 방지(2026-07-27 실측사고): llm_judged_at은 결과가 '적용'될 때만 찍힌다 — 제출 시점엔 안 찍혀서,
    //   배치가 끝나기 전에 이 엔드포인트를 다시 호출하면 SELECT가 매번 같은 상위 N개를 또 뽑아 같은 카페가
    //   여러 배치에 중복 제출된다(수동청산 중 29개 중복배치 발생·취소로 복구). 아직 안 끝난(NOT applied) 배치의
    //   매니페스트에 이미 들어있는 카페는 여기서 명시적으로 제외 — 짧은 간격으로 반복 호출해도 안전(멱등)하게 만든다.
    // 🔴 2026-09-20 ②차 수리 — ①차 가드(진행중이면 차단)가 **수거 직후에 뚫렸다.**
    //   수거를 마치면 stillRunning=0이 되므로 조건이 풀려 그 자리에서 또 제출됐다(112곳 추가 과금).
    //   근본 원인은 이 엔드포인트가 '수거'와 '제출'을 한 호출에 묶어둔 것이다 —
    //   **수거하고 싶을 때마다 제출이 따라온다.** 그래서 둘을 파라미터로 분리한다.
    //   기본(=수거만)이 안전한 쪽이고, 제출은 `&submit=1`을 명시해야만 한다.
    const scope = req.nextUrl.searchParams.get("scope") ?? "";   // "" | rescue | refine (아래 후보 선정에서 사용)
    if (req.nextUrl.searchParams.get("submit") !== "1") {
      return NextResponse.json({ ok: true, mode: "collect-only",
        note: "수거만 수행했다. 신규 제출은 &submit=1 을 명시할 때만 — 상태 확인 목적 호출이 과금을 만들지 않게(09-20 중복제출 사고).",
        applied: { cafes: appliedCafes, rescuedReviews: rescued, costUsd: +costAcc.toFixed(5), inTok, outTok },
        precision: { truncated, parseFailed, unanswered },   // 0이 아니면 'AI가 못 본 후기'가 있다
        marks: { adStyle: adStyleN, listicle: listicleN, depthAvg: depthCafes ? +(depthSum / depthCafes).toFixed(2) : null, saved: marksSaved },
        unpublished, cappedStop,   // 🛑 공개→비공개 전환 수 · 상한 초과로 중단했는지
        pollingBatches: stillRunning, expiredClosed: expiredBatches });
    }
    // 🔴 2026-09-20 하드 가드 — **진행 중 배치가 하나라도 있으면 신규 제출을 아예 하지 않는다.**
    //   사고: 기조실장이 이 엔드포인트를 '상태 폴링'인 줄 알고 반복 호출해, 148곳 배치가 도는 중에
    //   113곳 배치가 추가로 나갔다. 이 엔드포인트는 조회가 아니라 **①수거 ②신규제출**을 같이 한다 —
    //   **호출 = 제출**이다. 기존 inFlight 가드는 '같은 카페 중복'만 막았지 '새 카페 추가 제출'은 못 막았다.
    //   대표님이 크레딧 낭비를 반복해 경고한 지점이라, 사람이 조심하는 대신 코드가 막는다.
    //   상태 확인은 Anthropic API를 직접 읽을 것(과금 0, 배치 생성 없음).
    const openBatches = (await sql`SELECT COUNT(*)::int c FROM judge_batches WHERE NOT applied`) as any[];
    if ((openBatches[0]?.c ?? 0) > 0 && stillRunning > 0) {
      return NextResponse.json({ ok: true, blocked: "in-flight",
        note: `진행 중 배치 ${stillRunning}건 — 끝날 때까지 신규 제출을 막는다(중복 과금 방지). 수거만 수행했다.`,
        applied: { cafes: appliedCafes, rescuedReviews: rescued, costUsd: +costAcc.toFixed(5), inTok, outTok },
        pollingBatches: stillRunning });
    }
    const inFlight = (await sql`
      SELECT DISTINCT (v->>'id')::int AS id
      FROM judge_batches, jsonb_each(manifest->'cafes') AS kv(k, v)
      WHERE NOT applied`) as any[];
    const inFlightIds = inFlight.map((r) => r.id).filter((n) => Number.isInteger(n));
    // 🎯 2026-09-28 CEO 지시("최근 후기 있는 카페 우선") — 리뷰 자체가 오래된 카페(18개월 기준,
    //   lib/cafeProfile.ts OLD_REVIEW_MONTHS와 동일 정의)는 판정해봤자 "의미 있는 최신 리뷰"로서의
    //   가치가 낮다. 하루 상한이 유한하니 최근 리뷰가 있는 카페부터 쓴다.
    //   ⚠️ synth_updated(우리가 언제 합성했나)와는 다른 축이다 — 이건 review_dates(그 리뷰가 언제
    //   쓰였나)를 본다. 둘 다 있는 카페 중에서도 리뷰 자체가 신선한 쪽을 먼저 판정한다.
    const oldCut = new Date(); oldCut.setMonth(oldCut.getMonth() - OLD_REVIEW_MONTHS);
    const oldCutStr = `${oldCut.getFullYear()}.${String(oldCut.getMonth() + 1).padStart(2, "0")}.${String(oldCut.getDate()).padStart(2, "0")}`;
    const rows = (await sql`SELECT id, name, area FROM cafes
      WHERE raw_reviews IS NOT NULL
        -- 🔴 2026-10-19 커서 완화 — 경계 후기가 PER_CAFE(35)를 넘는 카페는 한 번 판정했어도
        --   '아직 안 본 후보'가 남는다. judge_passes(제출 시 +1) 상한 JUDGE_MAX_PASSES로 종료를 보장한다
        --   (모델이 답을 안 한 후보는 미결로 남으므로, 상한이 없으면 같은 카페를 영원히 다시 살 수 있다).
        AND (llm_judged_at IS NULL OR llm_judged_at < raw_collected_at
             OR (COALESCE(borderline_count, 0) > ${PER_CAFE} AND COALESCE(judge_passes, 0) < ${JUDGE_MAX_PASSES})
             -- 🔬 2026-10-19 **세밀 축 미보유분 재판정** — depth·adStyle·listicle은 오늘 신설해서
             --   커버리지가 1.1%(556/49,674)뿐이다. 커서를 그대로 두면 영영 안 채워진다.
             --   💰 llm_judged_at을 NULL로 리셋하는 방법은 쓰지 않는다 — cafes 행이 40KB라
             --      31,124곳 리셋이 **추가 1.25GB 쓰기**가 된다. 조건에 넣으면 **읽기만** 한다.
             --   종료 보장: 판정 경로가 카페마다 marks 행을 반드시 남기므로(후보 0건이면 빈 행) 1회로 끝난다.
             OR (published AND NOT EXISTS (SELECT 1 FROM cafe_judge_marks m WHERE m.cafe_id = cafes.id)
                 AND COALESCE(judge_passes, 0) < ${JUDGE_MAX_PASSES}))
        AND NOT (id = ANY(${inFlightIds}))
        AND (
          pipeline_status = 'pending'
          OR (published AND synth_grade IS DISTINCT FROM ${TRUSTED_GRADE})
          OR (
            synth_grade = '후보' AND NOT published AND COALESCE(borderline_count, 0) > 0
            AND (pipeline_status IS NULL OR pipeline_status NOT IN ('excluded', 'held', 'noise'))
          )
        )
        -- 구간 필터(2026-10-18) — 비싼 모델이 값어치 낮은 구간에 새지 않게 한다.
        --   scope=rescue : 미공개(후보구제) 전용. 판정 통과하면 공개가 늘어난다(파일럿 60곳 -> 공개 35곳).
        --   scope=refine : 이미 공개된 카페의 재정제 전용. 품질은 올리지만 공개 수를 늘리지 않는다.
        --   미지정이면 기존 동작(둘 다. ORDER BY가 후보구제를 먼저 본다).
        --   실측 2026-10-18: 큐 32,470곳 = 후보구제 7,880 + 재정제 24,590.
        --     Sonnet 5로 전부 165.76달러(예산 초과)이지만 후보구제만이면 40.23달러다.
        --     공개를 늘리는 쪽에 좋은 모델, 다듬는 쪽에 싼 모델이 같은 예산에서 최대 효과다.
        --   주의: Neon 태그드 템플릿은 SQL 조각 합성을 지원하지 않는다(lib/metrics.ts 주석과 같은 이유).
        --      조건을 파라미터 하나로 표현한다. 조각을 끼우면 문법 오류가 난다(실제로 한 번 났다).
        --      그리고 이 주석에 백틱을 쓰면 템플릿 문자열이 끊긴다 -- 실제로 한 번 깨졌다.
        --   scope=flip  : 🎯 **AI 판정이 실제로 공개를 만들 수 있는 미공개 카페만.** (2026-10-19)
        --     왜 필요한가 — CEO 질문("후보 구제율이 왜 이렇게 낮은데?")의 답을 파서 나온 결론이다.
        --     신규 공개 게이트(storeResult의 ruleOk)는 네 가지를 **동시에** 요구한다:
        --       ⓐ raw 나이 <= grade.floor.reference_new_fresh_days(30일) 또는 과거 통과이력(임베딩)
        --       ⓑ 네이버 카테고리 존재(비카페 판별 불가면 신규는 막는다)
        --       ⓒ 채택 후기 >= grade.floor.reference_new(2)
        --       ⓓ **주제 글(검증) >= 1건** — 제목이 이 카페인 글
        --     🔴 ⓓ가 급소다. AI가 살린 경계 후기는 collectOrchestrator:213에서
        --        rule.verdict가 verified일 때만 verified, 아니면 reference로 가는데, 경계 후기의
        --        rule.verdict는 항상 "rejected"다 → **채택해도 '참고'가 되고 '검증'이 안 된다.**
        --        즉 주제 글 0건인 카페는 AI가 전부 살려줘도 공개 조건을 못 넘는다.
        --     실측 2026-10-19: 미공개 큐 8,704곳 중 주제 글 0건이 **7,437곳(85.4%)**.
        --       네 조건 전부 통과 = 1,116곳(12.8%)뿐. 관측 전환율 11.6%와 정확히 맞는다.
        --       반증 점검: 최근 2일 판정 후 공개된 206곳 중 **201곳(97.6%)**이 주제 글 보유 — 게이트가 범인.
        --       그래서 큐 전량에 쓰면 Sonnet 5 $29.65 중 $25.71(87%)이 **결과를 바꿀 수 없는 곳**에 간다.
        --     ⚠️ "영원히 불가"가 아니다 — 나중에 수집으로 주제 글이 생기면 자격이 돌아온다.
        --        AI 판정으로는 바꿀 수 없다는 뜻이다. 그 카페는 발굴·수집 레인의 일이다.
        AND (${scope} = ''
             OR (${scope} = 'rescue' AND NOT COALESCE(published, false))
             OR (${scope} = 'refine' AND COALESCE(published, false))
             --   scope=thin : 🛡️ **공개 중인데 공개 문턱(후기 2건)에 가까운 카페만.** (2026-10-19)
             --     왜 따로 두는가 — 모델별 비공개 전환율 실측에서 **위험이 이 구간에 집중**됐다:
             --       배치별 전환율이 '후기 4건 이하 비율'에 정비례했다
             --       (Sonnet 4.9%→0.04% · Haiku#1 6.8%→0.20% · Haiku#2 10.9%→0.42%).
             --       얇은 카페당으로 정규화하면 Haiku 3.0~3.8% vs Sonnet 0.75% — 4~5배 거칠다.
             --     CEO 지시 "비공개는 보수적으로 해"를 지키려면 **이 구간에만 좋은 모델**을 쓰면 된다.
             --     실측 배분: 얇은 5,217곳 Sonnet $31.72 + 나머지 11,085곳 Haiku $4.54 = $36.26
             --       (전량 Sonnet은 $99.12로 예산 초과, 전량 Haiku는 $6.68이지만 비공개가 4~5배)
             --     ⚠️ thin을 먼저 돌리면 llm_judged_at이 찍혀 refine 큐에서 빠진다 → 중복 과금 없음.
             OR (${scope} = 'thin' AND COALESCE(published, false) AND COALESCE(synth_count, 0) <= 4)
             --   scope=verified : 공개 '검증' 카페(옥석 코어) 재판정. 위 외부 게이트 주석 참조 —
             --     9,090곳이 AI 판정 무경험이고 심사 후보가 261,124건 쌓여 있다.
             OR (${scope} = 'verified' AND COALESCE(published, false) AND synth_grade = ${TRUSTED_GRADE})
             OR (${scope} = 'flip' AND NOT COALESCE(published, false)
                 AND (raw_collected_at > now() - interval '30 day' OR embedding IS NOT NULL)
                 AND COALESCE(naver_category, '') <> ''
                 AND COALESCE(synth_count, 0) + COALESCE(borderline_count, 0) >= 2
                 AND COALESCE((synth_quality->>'verified')::int, 0) >= 1))
      ORDER BY (COALESCE(pipeline_status, '') = 'pending') DESC,
               -- ⚠️ pipeline_status IS NULL(grandfather)인 행은 위 비교가 SQL NULL이 되고, Postgres는
               --   DESC에서 NULL을 '가장 큼'으로 취급해 맨 앞으로 보낸다 — COALESCE로 NULL을 없애 방지(실측으로 발견).
               -- 🎯 결재#784(#490 옵션2, 08-20): 크레딧 희소 상황 — 이미 신뢰확보(공개)된 카페 재정제를
               --   후보구제보다 먼저 처리해 늦추지 않되, 그 안에서는 최근합성(synth_updated 최신)순으로
               --   신선한 데이터부터 판정해 무작위 순환보다 효율화.
               -- 🔴 2026-09-20 순서 역전(대표님 지시 "카페 수를 늘려라" + 크레딧 유한).
               --   기존은 '공개 카페 재정제'가 후보구제보다 먼저였다(결재#784, 08-20 크레딧 희소 상황 판단).
               --   그런데 재정제는 **이미 공개된 카페의 품질을 다듬는 것이라 공개 수를 늘리지 않는다.**
               --   pending이 0이 된 지금 그대로 두면 유한한 크레딧이 전부 재정제로 간다.
               --   실측: 판정 397곳 → 공개 377곳(95%)이 나온 건 전부 '미공개였던' 카페다.
               --   남은 대상 18,800곳을 다 돌리려면 $35이고 우리는 $4.3뿐 — **공개를 늘리는 쪽에 먼저 쓴다.**
               (synth_grade = '후보' AND NOT COALESCE(published, false)) DESC,  -- 후보구제(신규 공개) 최우선
               (published AND synth_grade IS DISTINCT FROM ${TRUSTED_GRADE}) DESC,  -- 공개 카페 재정제는 그 다음
               -- 🎯 2026-09-28 CEO 지시 — 리뷰 자체가 최근(18개월 내) 있는 카페 우선. 하루 상한이 유한하니
               --   "의미 있는 최신 리뷰"부터 판정에 쓴다. review_dates 없는 카페는 이 신호가 없으니 기존 순서로.
               (EXISTS (SELECT 1 FROM jsonb_array_elements_text(review_dates) d WHERE d >= ${oldCutStr})) DESC,
               synth_updated DESC NULLS LAST,          -- 최근합성 우선
               COALESCE(synth_count, 0) ASC,           -- 리뷰 적어 취약한 순 우선(옥석 많은 곳은 뒤로)
               id LIMIT ${BUILD_LIMIT}`) as any[];
    const requests: any[] = [];
    const manifestCafes: Record<string, any> = {};
    // ⚡ 빌드도 카페별 재합성(getAuditCandidates)이라 같은 병목이다 — 풀로 돌린다.
    //   requests 순서는 판정 결과에 영향이 없다(custom_id로 매칭하므로).
    await mapPool(rows, async (c: any) => {
      try { // 한 카페 오류(데이터·합성)로 전체 빌드가 멈추지 않게 격리
        // 🔴 2026-10-19 — **이미 판정받은 후보는 빼고 '아직 안 본 것'부터 본다.**
        //   그 전엔 candidates.slice(0, 35)라, 경계 후기가 35건을 넘는 카페는 36번째부터 **영영**
        //   AI 눈에 들어가지 않았다(판정 후 llm_judged_at이 찍혀 큐에서 빠지므로). 실측 2026-10-19:
        //     경계 35건 초과 카페 4,280곳 · 못 본 경계 후기 140,932건 · 그중 이미 큐에서 빠져
        //     영구 미판정 확정 14,019건. "AI가 내용을 보고 가린다"는 약속이 거기서 끊겨 있었다.
        const { candidates, hasRaw } = await getUndecidedAuditCandidates({ id: c.id, name: c.name, area: c.area ?? "" });
        if (!hasRaw) return;
        const items = candidates.slice(0, PER_CAFE).filter((it: any) => it && it.key);
        if (items.length === 0) {
          await markJudged(c.id); noCand++;
          // 🔑 후보가 없어 AI를 안 부른 카페도 marks 행을 남긴다 — 안 남기면 '세밀 축 미보유'로
          //   매 회차 다시 뽑혀 빌드 비용(재합성)을 영원히 쓴다.
          await sql`INSERT INTO cafe_judge_marks (cafe_id, marks) VALUES (${c.id}, '{}'::jsonb)
            ON CONFLICT (cafe_id) DO NOTHING`.catch(() => {});
          return;
        }
        requests.push({
          custom_id: `cafe_${c.id}`,
          params: {
            model: CLAUDE_MODEL, max_tokens: judgeMaxTokens(items.length),   // 🔴 1500 고정이던 자리 — 35항목에서 잘려 오판정을 냈다(reviewJudge.judgeMaxTokens 주석)
            system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
            messages: [{ role: "user", content: buildUserText(c.name, c.area ?? "", items.map((it: any, i: number) => ({ i, title: it.title || "", body: it.body || "" }))) }],
          },
        });
        manifestCafes[`cafe_${c.id}`] = { id: c.id, name: c.name, area: c.area ?? "", keys: items.map((it: any) => it.key) };
      } catch { try { await markJudged(c.id); } catch {} }
    });
    if (requests.length > 0) {
      const b = await createBatch(KEY, requests, {
      // 🔴 2026-09-20 — 크기 중복가드(같은 건수 24h 내 재제출 차단)를 여기서만 푼다.
      //   그 가드는 오늘 두 번 나를 막아준 좋은 장치지만 **크기만 보기 때문에**
      //   150건씩 이어 던지는 정당한 연속 배치까지 막았다(rejected 3,929곳이 그대로 남았다).
      //   대신 더 강한 장치가 이미 위에 있다: **진행 중 배치가 하나라도 있으면 제출 경로를 안 탄다.**
      //   즉 한 번에 하나씩만 나가므로 크기 중복은 구조적으로 불가능하다.
      //   + inFlight(같은 카페 제외) + submit=1 명시 요구까지 3중이다.
      allowDuplicate: true,
    });
      batchId = b.id;
      // 🔴 2026-09-20 — **여기서 실패하면 돈만 나가고 결과를 영영 못 받는다.**
      //   실사고: manifest가 `invalid input syntax for type json`으로 저장 실패했는데 배치는 이미 제출된 뒤라,
      //   고아 배치 3건(240요청 ≈ $0.45)이 수거 불가 상태로 남았다. Postgres jsonb는 \u0000과
      //   짝 없는 서로게이트를 거부한다 — 카페 이름·area·key에 섞여 들어오면 그대로 터진다.
      //   ① 저장 전에 씻는다  ② 그래도 실패하면 **배치를 즉시 취소**해 과금을 끊는다(고아로 남기지 않는다).
      const scrub = (v: unknown): any => typeof v === "string"
        ? v.replace(/[\u0000-\u001F\u007F]/g, "").replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
        : Array.isArray(v) ? v.map(scrub)
        : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)]))
        : v;
      try { await sql`INSERT INTO judge_batches (batch_id, manifest) VALUES (${b.id}, ${JSON.stringify(scrub({ cafes: manifestCafes, model: CLAUDE_MODEL }))}::jsonb) ON CONFLICT (batch_id) DO NOTHING`; }
      catch (e) {
        await cancelBatch(KEY, b.id).catch(() => {});   // 수거 못 할 배치는 살려둘 이유가 없다 — 과금부터 끊는다
        return NextResponse.json({ ok: false, error: "manifest 저장 실패 — 배치 취소함", detail: String(e).slice(0, 120), batchId: b.id });
      }
      await bumpJudgePass(Object.values(manifestCafes).map((x: any) => x.id));   // 🔁 종료 보장 카운터
      submitted = requests.length;
    }

    const cost = inTok * BATCH_PRICE_IN + outTok * BATCH_PRICE_OUT;
    return NextResponse.json({
      ok: true,
      applied: { cafes: appliedCafes, rescuedReviews: rescued, costUsd: Number(cost.toFixed(4)), inTok, outTok },
      precision: { truncated, parseFailed, unanswered },
      marks: { adStyle: adStyleN, listicle: listicleN, depthAvg: depthCafes ? +(depthSum / depthCafes).toFixed(2) : null, saved: marksSaved },
      unpublished, cappedStop,
      concurrency: CONC,
      pollingBatches: stillRunning,
      expiredClosed: expiredBatches, // 결과 보관기간(29일) 지나 회수 불가 → 닫은 배치 수
      submitted: { newBatchId: batchId, cafes: submitted, noBorderlineMarked: noCand },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}
