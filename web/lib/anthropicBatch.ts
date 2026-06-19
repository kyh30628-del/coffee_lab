// Anthropic Message Batches API — 원시 HTTP 코어(판정·그라운딩 배치 공용).
//   비동기 대량 처리, 정가 50% 할인. 형식은 공식 문서 검증:
//   POST /v1/messages/batches {requests:[{custom_id, params}]} → {id, processing_status, request_counts, results_url}
//   GET  /v1/messages/batches/{id} → processing_status: in_progress → ended (results_url 생성)
//   GET  {results_url} → .jsonl, 라인별 {custom_id, result:{type, message, error}} (순서 무보장 → custom_id 매칭)
const HDR = (key: string) => ({ "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" });

export async function createBatch(key: string, requests: any[]): Promise<any> {
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
