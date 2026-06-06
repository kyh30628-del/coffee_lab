// 임베딩 (Google AI gemini-embedding-001, 768차원으로 축소, 다국어).
// 키는 Places용 GOOGLE_API_KEY와 분리된 GOOGLE_AI_KEY 사용.
// 카페=RETRIEVAL_DOCUMENT, 질의=RETRIEVAL_QUERY 로 비대칭 검색 품질 향상.
// (이 모델은 동기 batchEmbedContents 미지원 → embedContent 병렬 호출, 429는 백오프 재시도)

const MODEL = "models/gemini-embedding-001";
// 로컬은 GOOGLE_AI_KEY, 프로덕션(Vercel)은 GOOGLE_API_KEY_1 — 둘 다 지원
const KEY = process.env.GOOGLE_AI_KEY || process.env.GOOGLE_API_KEY_1;
export const EMBED_DIM = 768;
export const hasEmbedKey = () => !!KEY;

type Task = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function embedOne(text: string, task: Task, tries = 0): Promise<number[] | null> {
  if (!KEY) throw new Error("GOOGLE_AI_KEY 미설정");
  const url = `https://generativelanguage.googleapis.com/v1beta/${MODEL}:embedContent?key=${KEY}`;
  const body = {
    model: MODEL,
    content: { parts: [{ text: (text || "").slice(0, 8000) }] },
    taskType: task,
    outputDimensionality: EMBED_DIM,
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.status === 429 && tries < 5) { await sleep(1200 * (tries + 1)); return embedOne(text, task, tries + 1); }
  if (!res.ok) throw new Error(`embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.embedding?.values ?? null;
}

export async function embedQuery(text: string): Promise<number[] | null> {
  return embedOne(text, "RETRIEVAL_QUERY");
}

// 여러 문서를 제한된 동시성으로 임베딩. 실패 항목은 null(원위치 보존).
export async function embedBatch(texts: string[], task: Task = "RETRIEVAL_DOCUMENT"): Promise<(number[] | null)[]> {
  if (!KEY) throw new Error("GOOGLE_AI_KEY 미설정");
  const out: (number[] | null)[] = new Array(texts.length).fill(null);
  const CONC = 5;
  let i = 0;
  async function worker() {
    while (i < texts.length) {
      const idx = i++;
      try { out[idx] = await embedOne(texts[idx], task); } catch { out[idx] = null; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, texts.length || 1) }, worker));
  return out;
}

// pgvector 리터럴 문자열로 변환 ('[0.1,0.2,...]')
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

// 카페 임베딩 텍스트: 화면·DB·검증 리뷰의 의미를 한 덩어리로(embed-cafes·cron-embed 공용).
import { CHAR_AXES } from "./charScore";
export function buildCafeEmbedText(c: any): string {
  const parts: string[] = [c.name];
  if (c.synth_identity) parts.push(c.synth_identity);
  if (c.signature) parts.push(`추천 ${c.signature}`);
  if (c.note) parts.push(c.note);
  if (c.vibe) parts.push(c.vibe);
  if (c.uses) parts.push(`용도 ${c.uses}`);
  if (c.beans) parts.push(`원두 ${c.beans}`);
  const cs = c.char_scores ?? {};
  const chars = CHAR_AXES.filter((a) => (cs[a.key] ?? 0) > 0).sort((a, b) => (cs[b.key] ?? 0) - (cs[a.key] ?? 0)).map((a) => a.label);
  if (chars.length) parts.push(`특징 ${chars.join(", ")}`);
  if (Array.isArray(c.synth_reviews)) parts.push(c.synth_reviews.map((r: any) => r?.quote ?? "").join(" "));
  if (c.area) parts.push(c.area);
  return parts.filter(Boolean).join(". ").slice(0, 6000);
}
