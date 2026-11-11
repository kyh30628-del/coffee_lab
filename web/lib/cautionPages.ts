// ⚠️ 주의점 집계 페이지 사전 — 2026-11-10 (AI·검색 노출 대책 #2).
//
// 왜: AI·검색에서 "○○ 카페 추천" 같은 발견형 질의는 블로그 물량에 못 이긴다(09-16 Perplexity 0/4).
//   반면 "광고 협찬 없는 진짜 후기로 검증한 카페 정보" 같은 **우리만 주장하는 질의**는 1순위로 인용됐다(1/1).
//   우리만 가진 데이터 = 후기 2건 이상에서 확인된 주의점(cafes.cautions, 4,695곳) + 근거 후기 문장.
//   광고는 단점을 말하지 않는다 → "마포구 주차 어려운 카페"는 우리 데이터가 곧 답이다.
//
// 💰 비용: 시설축 페이지(f/[facet])와 같은 규약 — 사전생성 0, ISR 30일, 집계는 하루 1회 크론(seo_counts)만.
// ⚠️ 크롤 예산: 구글 색인이 제출 대비 9%라 URL을 늘리면 카페 상세가 굶는다 → 수요가 확실한 4유형만, 5곳 이상만 연다(약 200쪽).
//   나머지 유형(콘센트·소음·계단 등)은 지역당 5곳을 넘는 곳이 거의 없어 열지 않는다.
// ⚠️ 라벨은 lib/cafeProfile.ts CAUTIONS의 label과 글자 하나까지 같아야 한다(조회 키).
export type CautionPage = { slug: string; label: string; emoji: string; title: string; ask: string; desc: string; aliases: string[] };

export const CAUTION_PAGES: CautionPage[] = [
  { slug: "parking", label: "주차 어려움", emoji: "🅿️", title: "주차 어려운", ask: "주차가 어렵다", desc: "주차가 어렵다고 후기에 나온",
    aliases: ["주차 어려운 카페", "주차 힘든 카페", "주차 불편한 카페"] },
  { slug: "waiting", label: "웨이팅 있음", emoji: "⏳", title: "웨이팅 있는", ask: "줄을 서야 한다", desc: "웨이팅이 길다고 후기에 나온",
    aliases: ["웨이팅 있는 카페", "줄 서는 카페", "대기 긴 카페"] },
  { slug: "seats", label: "좌석 부족", emoji: "💺", title: "자리 잡기 힘든", ask: "자리가 부족하다", desc: "자리가 부족하다고 후기에 나온",
    aliases: ["자리 없는 카페", "좌석 부족한 카페", "자리 잡기 힘든 카페"] },
  { slug: "breaktime", label: "브레이크타임", emoji: "⏸️", title: "브레이크타임 있는", ask: "브레이크타임이 있다", desc: "브레이크타임이 있다고 후기에 나온",
    aliases: ["브레이크타임 있는 카페", "브레이크타임 카페"] },
];
export const cautionBySlug = (s: string) => CAUTION_PAGES.find((c) => c.slug === s);
/** 페이지를 열 최소 카페 수 — 시설축과 같다. 3곳짜리 목록에 "카페 N곳"이라 쓸 수 없다. */
export const CAUTION_MIN_CAFES = 5;
