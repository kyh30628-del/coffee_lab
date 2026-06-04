// 수집 오케스트레이터 (PRINCIPLES.md 1·3·4·7조)
// 여러 소스를 신뢰도/필터정책/최신성과 함께 통합해 합성 입력을 만든다.
// - 구글 Places: 출처 신뢰 → 필터 off
// - 웹검색(블로그/다이닝코드 등): 필터 on (노이즈·동명 배제)
// - 소스별 "맛 묘사 밀도" 가중치 (블로그 상세 > 평점 요약)
// 실제 검색/Places 호출은 서버에 키 연결 시 connectors로 주입(여기선 인터페이스만).

import { filterReviews } from "./noiseFilter";
import { synthesize, type Review, type SynthResult } from "./synthEngine";

export type RawSource = {
  source: "google" | "blog" | "diningcode" | "tripadvisor" | "instagram" | "etc";
  texts: { text: string; time?: number }[]; // time: epoch초(최신성)
};

// 소스별 신뢰/필터 정책
const POLICY: Record<RawSource["source"], { filter: boolean; weight: number }> = {
  google:     { filter: false, weight: 1.0 }, // 출처 보증, 맛묘사 보통
  blog:       { filter: true,  weight: 1.2 }, // 맛 묘사 진함 → 가중↑
  diningcode: { filter: true,  weight: 1.1 },
  tripadvisor:{ filter: true,  weight: 1.0 },
  instagram:  { filter: true,  weight: 0.8 }, // 홍보성 많음 → 가중↓
  etc:        { filter: true,  weight: 0.7 },
};

export type CollectResult = {
  synth: SynthResult;
  collected: number;
  perSource: { source: string; raw: number; kept: number }[];
};

export function collectAndSynthesize(
  name: string,
  area: string[],
  sources: RawSource[]
): CollectResult {
  const merged: Review[] = [];
  const perSource: { source: string; raw: number; kept: number }[] = [];

  for (const src of sources) {
    const pol = POLICY[src.source];
    let texts = src.texts;

    if (pol.filter) {
      const onlyText = texts.map((t) => t.text);
      const { passed } = filterReviews(onlyText, name, area);
      texts = texts.filter((t) => passed.includes(t.text));
    }
    perSource.push({ source: src.source, raw: src.texts.length, kept: texts.length });

    // 가중치는 합성 엔진의 최신성 가중과 곱해지도록 time을 보존한 채 전달.
    // 소스 가중치는 "중복 투표" 방식으로 반영: weight>=1.2면 한 번 더 카운트되게 복제.
    for (const t of texts) {
      merged.push({ text: t.text, time: t.time });
      if (pol.weight >= 1.2) merged.push({ text: t.text, time: t.time }); // 맛묘사 진한 소스 가중
    }
  }

  const synth = synthesize(name, merged);
  return { synth, collected: merged.length, perSource };
}
