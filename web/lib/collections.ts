// 동네 교차검증 컬렉션 레지스트리 — SEO 에디토리얼 랜딩의 단일 출처.
// 확장: 데이터 밀도(검증카페·채택후기)가 충분한 동네만 여기에 slug 추가하면
// /collections/[slug] 페이지·sitemap·/area 허브·카페 상세 상호링크가 자동 반영된다.
// 선정 기준(2026-07): 검증카페 ≥35곳 & 채택(실방문) 후기 ≥2,800건.
export type Collection = { slug: string; label: string; area: string };

export const COLLECTIONS: Collection[] = [
  { slug: "seongsu", label: "성수동", area: "성동구" },
  { slug: "bongcheon", label: "봉천동", area: "관악구" },
  { slug: "songdo", label: "송도동", area: "인천 연수구" },
  { slug: "seocho", label: "서초동", area: "서초구" },
  { slug: "seogyo", label: "서교동", area: "마포구" },
  { slug: "sinsa", label: "신사동", area: "강남구" },
  { slug: "bangbae", label: "방배동", area: "서초구" },
  { slug: "yeoksam", label: "역삼동", area: "강남구" },
  { slug: "nonhyeon", label: "논현동", area: "강남구" },
  { slug: "mangwon", label: "망원동", area: "마포구" },
  { slug: "seongnae", label: "성내동", area: "강동구" },
  { slug: "magok", label: "마곡동", area: "강서구" },
  { slug: "yeonnam", label: "연남동", area: "마포구" },
  { slug: "yangjae", label: "양재동", area: "서초구" },
  { slug: "samseong", label: "삼성동", area: "강남구" },
];

export const collectionBySlug = (slug: string) => COLLECTIONS.find((c) => c.slug === slug);

// dong 정규화(숫자+가 접미 제거) — '성수동2가' → '성수동'. 집계·매칭 단일 규칙.
export const normDong = (d: string | null | undefined) => (d || "").replace(/[0-9]+가$/, "");

// 카페(동/구)가 속한 컬렉션 — 카페 상세 상호링크 게이팅용.
export function collectionForCafe(dong: string | null | undefined, area: string | null | undefined) {
  const nd = normDong(dong);
  if (!nd) return undefined;
  return COLLECTIONS.find((c) => c.label === nd && c.area === area);
}

// 컬렉션 키워드(메타) — label 기반 파생.
export function collectionKeywords(label: string): string[] {
  const base = label.replace(/동$/, "");
  return [`${label} 카페`, `${label} 카페 추천`, `${base} 로스터리`, `${base} 핸드드립`, `${label} 디저트 카페`, `${label} 가볼만한곳`];
}
