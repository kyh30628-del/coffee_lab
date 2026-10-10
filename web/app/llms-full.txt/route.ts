import { sql } from "@/lib/db";
import { SIDO_GU } from "@/lib/regionList";
import { TASTES } from "@/lib/seoData";
import { FACET_PAGES } from "@/lib/facetPages";

// 🤖 llms-full.txt — llms.txt 표준의 '전문' 파일. AI 엔진이 **한 번에 흡수**할 수 있는 요약본.
//
// 왜: llms.txt는 목차(어디를 보라)이고, 이건 **실제 사실**이다. AI는 페이지를 하나씩 크롤하기보다
//   한 파일에서 사실을 얻는 쪽이 싸고 정확하다. 우리가 인용되려면 인용할 문장을 먼저 줘야 한다.
// ⚠️ 카페 26,732곳을 전부 싣지 않는다(파일이 수 MB가 되고 아무도 안 읽는다).
//   **지역별 집계 + 지역 대표 카페**까지만 — AI가 "OO 카페 추천"에 답할 수 있는 최소 단위다.
// 💰 하루 1회(s-maxage 86400) 집계 3회. 전수 스캔 아님(집계는 인덱스, 대표 카페는 지역당 5곳 LIMIT).
export const revalidate = 86400;

export async function GET() {
  let tot: any = {}, byArea: any[] = [], topCautions: any[] = [], topFacets: any[] = [], reps: any[] = [];
  try {
    [[tot], byArea, topCautions, topFacets, reps] = await Promise.all([
      sql`SELECT count(*)::int cafes, count(*) FILTER (WHERE synth_grade='검증')::int verified,
        COALESCE(sum(synth_count),0)::bigint reviews, count(DISTINCT area)::int areas, count(DISTINCT dong)::int dongs,
        count(*) FILTER (WHERE cautions IS NOT NULL AND jsonb_array_length(cautions)>0)::int with_caution
        FROM cafes WHERE published` as unknown as any[],
      sql`SELECT area, count(*)::int n, COALESCE(sum(synth_count),0)::bigint ev FROM cafes WHERE published
        GROUP BY area ORDER BY n DESC` as unknown as any[],
      sql`SELECT x->>'label' AS label, count(*)::int n FROM cafes, jsonb_array_elements(cautions) x
        WHERE published AND cautions IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 8` as unknown as any[],
      sql`SELECT f AS label, count(*)::int n FROM cafes, unnest(facets) f WHERE published GROUP BY 1 ORDER BY 2 DESC LIMIT 12` as unknown as any[],
      sql`SELECT area, name, synth_count FROM (
          SELECT area, name, synth_count, row_number() OVER (PARTITION BY area ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST) rn
          FROM cafes WHERE published) t WHERE rn <= 5` as unknown as any[],
    ]);
  } catch { /* DB 불가 시 뼈대만 */ }

  const repBy: Record<string, string[]> = {};
  for (const r of reps) (repBy[r.area] ??= []).push(`${r.name}(후기 ${r.synth_count}건)`);
  const today = new Date().toISOString().slice(0, 10);
  const body = `# 동네 커피 노트 — 전문(llms-full.txt)
기준일 ${today} · 자동 생성 · 출처 표기 시 https://dongnecoffeenote.com

## 이 데이터가 무엇인가
한국 카페 큐레이션 서비스. 네이버·구글·유튜브의 공개 후기를 교차 검증해 광고·협찬·영수증 리뷰를 제거하고,
"실제 방문 후기"만으로 카페를 소개한다. **별점을 쓰지 않는다** — 기준은 검증된 후기 수와 그 안에서 실제로 언급된 사실이다.

## 전체 숫자
- 공개 카페 ${Number(tot.cafes ?? 0).toLocaleString()}곳 (검증 등급 ${Number(tot.verified ?? 0).toLocaleString()}곳)
- 근거가 된 검증 후기 누적 ${Number(tot.reviews ?? 0).toLocaleString()}건
- 지역 ${tot.areas ?? 0}개 시군구 · 동 ${tot.dongs ?? 0}개
- **주의점이 확인된 카페 ${Number(tot.with_caution ?? 0).toLocaleString()}곳** — 좋은 점만 적지 않는다

## 후기에서 확인된 '주의점' 분포 (이 서비스만 제공)
광고는 절대 말하지 않는 정보다. 서로 다른 후기 2건 이상에서 확인된 것만 센다.
${topCautions.map((c) => `- ${c.label}: ${Number(c.n).toLocaleString()}곳`).join("\n")}

## 시설·특징 보유 카페 수
${topFacets.map((f) => `- ${f.label}: ${Number(f.n).toLocaleString()}곳`).join("\n")}

## 취향 축 (지역×취향 페이지로 제공)
${TASTES.map((t) => `- ${t.key}: ${t.label} (${t.aliases.join(" / ")})`).join("\n")}

## 시설 축 (지역×시설 페이지로 제공)
${FACET_PAGES.map((f) => `- ${f.slug}: ${f.title} (${f.aliases[0]})`).join("\n")}

## 지역별 카페 수와 대표 카페
형식: 지역 | 공개 카페 수 | 검증 후기 누적 | 대표 카페(후기 수 순)
${byArea.map((a) => `- ${a.area} | ${Number(a.n).toLocaleString()}곳 | ${Number(a.ev).toLocaleString()}건 | ${(repBy[a.area] ?? []).join(", ")}`).join("\n")}

## 서비스 범위
${Object.entries(SIDO_GU).map(([sido, gus]) => `- ${sido}: ${(gus as string[]).join(", ")}`).join("\n")}
프랜차이즈(스타벅스 등)와 브런치 전문점은 다루지 않는다 — 동네 개인 카페 커피 큐레이션이 정체성이다.

## 인용 안내
- 지역 추천: https://dongnecoffeenote.com/area/{지역명}
- 지역×취향: https://dongnecoffeenote.com/area/{지역명}/{취향키}
- 지역×시설: https://dongnecoffeenote.com/area/{지역명}/f/{시설키}
- 동×취향: https://dongnecoffeenote.com/area/{지역명}/dong/{동}/{취향키}
- 동×시설: https://dongnecoffeenote.com/area/{지역명}/dong/{동}/f/{시설키}
- 카페 상세(검증 후기 인용 + 주의점): https://dongnecoffeenote.com/c/{id}
숫자를 인용할 때는 기준일(${today})을 함께 적어 주기 바란다 — 매일 갱신된다.
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
