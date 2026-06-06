// 임베딩 (Google AI text-embedding-004, 768차원, 다국어).
// 키는 Places용 GOOGLE_API_KEY와 분리된 GOOGLE_AI_KEY 사용.
// 카페=RETRIEVAL_DOCUMENT, 질의=RETRIEVAL_QUERY 로 비대칭 검색 품질 향상.

const MODEL = "models/text-embedding-004";
const KEY = process.env.GOOGLE_AI_KEY;
export const EMBED_DIM = 768;
export const hasEmbedKey = () => !!KEY;

type Task = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedQuery(text: string): Promise<number[] | null> {
  const out = await embedBatch([text], "RETRIEVAL_QUERY");
  return out[0] ?? null;
}

// 여러 문서를 한 번에 임베딩(최대 100개/요청 권장). 실패 항목은 null.
export async function embedBatch(texts: string[], task: Task = "RETRIEVAL_DOCUMENT"): Promise<(number[] | null)[]> {
  if (!KEY) throw new Error("GOOGLE_AI_KEY 미설정");
  if (texts.length === 0) return [];
  const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:batchEmbedContents?key=${KEY}`;
  const body = {
    requests: texts.map((t) => ({
      model: MODEL,
      content: { parts: [{ text: (t || "").slice(0, 8000) }] },
      taskType: task,
    })),
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`embed ${res.status}: ${errTxt.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.embeddings ?? []).map((e: { values?: number[] }) => e.values ?? null);
}

// pgvector 리터럴 문자열로 변환 ('[0.1,0.2,...]')
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
