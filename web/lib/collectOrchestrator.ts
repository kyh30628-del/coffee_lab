// 수집 오케스트레이터 (PRINCIPLES.md 1·2·3·4·7조)
import { filterReviews } from "./noiseFilter";
import { synthesize, type Review, type SynthResult } from "./synthEngine";
import type { WebSnippet } from "./webSearchCollector";

export type RawSource = {
  source: "google" | "blog" | "diningcode" | "tripadvisor" | "instagram" | "etc";
  texts: WebSnippet[];
};

const POLICY: Record<RawSource["source"], { filter: boolean; weight: number }> = {
  google: { filter: false, weight: 1.0 },
  blog: { filter: true, weight: 1.2 },
  diningcode: { filter: true, weight: 1.1 },
  tripadvisor: { filter: true, weight: 1.0 },
  instagram: { filter: true, weight: 0.8 },
  etc: { filter: true, weight: 0.7 },
};

// 카드에 보여줄 근거 리뷰 (A방식: 인용 한 줄 + 링크 + 출처)
export type EvidenceReview = { quote: string; link?: string; source?: string; date?: string };

export type CollectResult = {
  synth: SynthResult;
  collected: number;
  perSource: { source: string; raw: number; kept: number }[];
  evidenceReviews: EvidenceReview[];
};

// 인용은 한 줄로 자름(저작권: 원문 복제 금지, 요약/일부만)
function toQuote(text: string, maxLen = 80): string {
  const t = text.trim();
  return t.length <= maxLen ? t : t.slice(0, maxLen) + "…";
}

export function collectAndSynthesize(name: string, area: string[], sources: RawSource[]): CollectResult {
  const merged: Review[] = [];
  const perSource: { source: string; raw: number; kept: number }[] = [];
  const evidenceReviews: EvidenceReview[] = [];

  for (const src of sources) {
    const pol = POLICY[src.source];
    let texts = src.texts;
    if (pol.filter) {
      const onlyText = texts.map((t) => t.text);
      const { passed } = filterReviews(onlyText, name, area);
      texts = texts.filter((t) => passed.includes(t.text));
    }
    perSource.push({ source: src.source, raw: src.texts.length, kept: texts.length });

    for (const t of texts) {
      merged.push({ text: t.text, time: t.time });
      if (pol.weight >= 1.2) merged.push({ text: t.text, time: t.time });
      // 링크 있는 것 위주로 근거 리뷰에 추가 (최신순 정렬은 아래)
      if (t.link) {
        evidenceReviews.push({ quote: toQuote(t.text), link: t.link, source: t.source, date: t.date });
      }
    }
  }

  // 근거 리뷰: 최신순으로 정렬, 최대 6개만 (카드 호버용)
  evidenceReviews.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const topEvidence = evidenceReviews.slice(0, 6);

  const synth = synthesize(name, merged);
  return { synth, collected: merged.length, perSource, evidenceReviews: topEvidence };
}
