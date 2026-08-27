// Anthropic Message Batches API — 원시 HTTP 코어(판정·그라운딩 배치 공용).
//   비동기 대량 처리, 정가 50% 할인. 형식은 공식 문서 검증:
//   POST /v1/messages/batches {requests:[{custom_id, params}]} → {id, processing_status, request_counts, results_url}
//   GET  /v1/messages/batches/{id} → processing_status: in_progress → ended (results_url 생성)
//   GET  {results_url} → .jsonl, 라인별 {custom_id, result:{type, message, error}} (순서 무보장 → custom_id 매칭)
const HDR = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" });

/**
 * 🔴 중복 제출 차단(2026-08-28 사고) — 같은 359곳을 24초 사이 3번 사서 **$2.60을 태웠다.**
 *   원인: 제출 성공 뒤 '매니페스트 DB 저장'이 실패하자 그 에러를 "제출 실패"로 읽고 재시도했다.
 *   제출은 되돌릴 수 없는 유료 행위 — 뒷단계 실패가 재제출 사유가 되면 안 된다.
 *
 * 방어: 제출 직전 **최근 배치 목록을 조회**해, 같은 요청 수를 최근 N분 안에 이미 산 적 있으면 거부한다.
 *   (요청 수는 배치의 지문 역할 — 같은 대상 재빌드는 항상 같은 수가 나온다.)
 *   의도적 재제출이 필요하면 allowDuplicate:true를 명시해야 한다.
 */
export async function listBatches(key: string, limit = 20): Promise<any[]> {
  const r = await fetch(`https://api.anthropic.com/v1/messages/batches?limit=${limit}`, { headers: HDR(key) });
  if (!r.ok) return [];
  return (await r.json()).data ?? [];
}

export async function createBatch(key: string, requests: any[], opts?: { allowDuplicate?: boolean; windowMin?: number; dryRun?: boolean }): Promise<any> {
  // ⚠️ 창 기본값 24시간 — 60분으로 뒀다가 1.5시간 전 중복을 못 잡았다(2026-08-28 시험에서 발각).
  //   같은 크기 배치를 하루 안에 두 번 살 일은 사실상 없다. 필요하면 allowDuplicate로 명시.
  const windowMin = opts?.windowMin ?? 1440;
  if (!opts?.allowDuplicate) {
    const recent = await listBatches(key, 20).catch(() => []);
    const cut = Date.now() - windowMin * 60_000;
    const dup = recent.find((b: any) => {
      const total = (b?.request_counts?.processing ?? 0) + (b?.request_counts?.succeeded ?? 0)
        + (b?.request_counts?.errored ?? 0) + (b?.request_counts?.canceled ?? 0) + (b?.request_counts?.expired ?? 0);
      return total === requests.length && new Date(b.created_at).getTime() > cut;
    });
    if (dup) throw new Error(`DUPLICATE_BATCH_BLOCKED: 같은 크기(${requests.length}건) 배치를 ${windowMin}분 내 이미 제출함 — id=${dup.id}. 의도적 재제출이면 allowDuplicate:true`);
  }
  // 🧪 dryRun — 가드 동작을 **돈 쓰지 않고** 검증하는 경로. 시험한다고 실제 배치를 제출해
  //   또 낭비한 사고(2026-08-28)의 재발 방지. 여기까지 왔으면 중복 아님이 확인된 것.
  if (opts?.dryRun) return { id: "DRYRUN", processing_status: "dry_run", request_counts: { processing: requests.length } };
  const r = await fetch("https://api.anthropic.com/v1/messages/batches", { method: "POST", headers: HDR(key), body: JSON.stringify({ requests }) });
  if (!r.ok) throw new Error(`batch create ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

export async function getBatch(key: string, id: string): Promise<any> {
  const r = await fetch(`https://api.anthropic.com/v1/messages/batches/${id}`, { headers: HDR(key) });
  if (!r.ok) throw new Error(`batch get ${r.status}: ${(await r.text()).slice(0, 150)}`);
  return r.json();
}

export async function* streamResults(key: string, url: string): AsyncGenerator<any> {
  const r = await fetch(url, { headers: HDR(key) });
  if (!r.ok) throw new Error(`results ${r.status}`);
  const text = await r.text(); // .jsonl
  for (const line of text.split("\n")) { const t = line.trim(); if (t) { try { yield JSON.parse(t); } catch {} } }
}

// Haiku 4.5 Batches 단가(정가 50%): 입력 $0.50 / 출력 $2.50 per 1M
export const BATCH_PRICE_IN = 0.5 / 1e6;
export const BATCH_PRICE_OUT = 2.5 / 1e6;
