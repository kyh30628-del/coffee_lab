// 🅿️ 시설축 페이지 사전 — 결재 #1083 1단계(CEO 승인 2026-09-14).
//
// 왜: 우리는 주차·단체·심야 데이터를 **이미 갖고 있는데**(cafes.facets, 22패싯) 그 URL이 없어 노출이 0이었다.
//   실측: "목동 주차 가능한 카페" 네이버 1위가 경쟁사 /c/mokdong/parking 페이지였고 우리는 15위 밖.
//   검색어 형태가 "{동네} {시설} 카페"인데 우리 페이지는 "{구} {취향} 카페"뿐이었다.
//
// ⚠️ 기존 취향 11축(work·quiet·dessert·roast·mood·space·pet·brunch·view·bakery·terrace)과 겹치는 패싯은
//    여기 넣지 않는다 — 같은 내용의 페이지가 두 개면 서로 순위를 깎는다(자기잠식).
// ⚠️ '책·북카페'와 '키즈·놀이공간'은 **만들지 않는다** — CEO 제외 정책(북카페 2026-06·키즈)과 어긋난다.
export type FacetPage = { slug: string; label: string; emoji: string; title: string; desc: string; aliases: string[] };

export const FACET_PAGES: FacetPage[] = [
  { slug: "parking", label: "주차 편함", emoji: "🅿️", title: "주차 되는", desc: "주차가 편하다고 후기에 나온", aliases: ["주차 가능한 카페", "주차 되는 카페", "주차장 있는 카페"] },
  { slug: "group", label: "단체·모임룸", emoji: "👥", title: "단체·모임", desc: "단체석·모임룸이 있다고 후기에 나온", aliases: ["단체 카페", "모임하기 좋은 카페", "대관 되는 카페"] },
  { slug: "latenight", label: "늦게까지·심야", emoji: "🌙", title: "늦게까지 하는", desc: "밤늦게까지 연다고 후기에 나온", aliases: ["심야 카페", "늦게까지 하는 카페", "24시 카페"] },
  { slug: "date", label: "데이트·기념일", emoji: "💕", title: "데이트", desc: "데이트·기념일로 좋았다고 후기에 나온", aliases: ["데이트 카페", "기념일 카페", "데이트 코스"] },
  { slug: "vegan", label: "비건·건강한", emoji: "🌱", title: "비건·건강한", desc: "비건·글루텐프리 메뉴가 있다고 후기에 나온", aliases: ["비건 카페", "글루텐프리 카페", "건강한 디저트"] },
  { slug: "hanok", label: "한옥·전통", emoji: "🏯", title: "한옥", desc: "한옥·고택을 고쳐 쓴다고 후기에 나온", aliases: ["한옥 카페", "전통 카페", "고택 카페"] },
  { slug: "value", label: "가성비 좋은", emoji: "💸", title: "가성비 좋은", desc: "가격이 착하다고 후기에 나온", aliases: ["가성비 카페", "저렴한 카페", "가격 착한 카페"] },
  { slug: "window", label: "통창·창밖 뷰", emoji: "🪟", title: "통창 있는", desc: "통창·창밖 풍경이 좋다고 후기에 나온", aliases: ["통창 카페", "창밖 뷰 카페", "채광 좋은 카페"] },
  { slug: "popular", label: "웨이팅·인기", emoji: "🔥", title: "웨이팅 있는 인기", desc: "줄 서서 갈 만큼 인기라고 후기에 나온", aliases: ["웨이팅 카페", "핫플 카페", "줄 서는 카페"] },
  { slug: "cozy", label: "아늑·따뜻한", emoji: "🕯️", title: "아늑한", desc: "아늑하고 포근하다고 후기에 나온", aliases: ["아늑한 카페", "포근한 카페", "아담한 카페"] },
  { slug: "vintage", label: "빈티지·레트로", emoji: "🪑", title: "빈티지·레트로", desc: "빈티지·레트로 감성이라고 후기에 나온", aliases: ["빈티지 카페", "레트로 카페", "옛날 감성 카페"] },
  { slug: "tea", label: "차·티 전문", emoji: "🍵", title: "차·티 전문", desc: "차가 맛있다고 후기에 나온", aliases: ["티룸", "전통차 카페", "차 전문 카페"] },
  { slug: "garden", label: "정원·자연 속", emoji: "🌳", title: "정원 있는", desc: "정원·마당이 있다고 후기에 나온", aliases: ["정원 카페", "마당 있는 카페", "숲속 카페"] },
  { slug: "wine", label: "와인·주류", emoji: "🍷", title: "와인 파는", desc: "와인·주류도 판다고 후기에 나온", aliases: ["와인 카페", "카페 겸 와인바", "술 파는 카페"] },
  { slug: "nokids", label: "노키즈존", emoji: "🚸", title: "노키즈존", desc: "노키즈존으로 운영한다고 후기에 나온", aliases: ["노키즈존 카페", "노키즈 카페"] },
  { slug: "beans", label: "원두 판매·로스터리", emoji: "🫘", title: "원두 파는", desc: "원두를 판매한다고 후기에 나온", aliases: ["원두 판매 카페", "원두 살 수 있는 카페"] },
  { slug: "signature", label: "시그니처 음료", emoji: "🥤", title: "시그니처 음료가 있는", desc: "여기만의 시그니처 음료가 있다고 후기에 나온", aliases: ["시그니처 음료 카페", "특별한 음료 카페"] },
  { slug: "kind", label: "친절한 응대", emoji: "🙂", title: "친절한", desc: "응대가 친절하다고 후기에 나온", aliases: ["친절한 카페", "사장님 친절한 카페"] },
  { slug: "handmade", label: "수제·당일 베이킹", emoji: "🥐", title: "수제·당일 베이킹", desc: "직접 만들어 당일 굽는다고 후기에 나온", aliases: ["수제 디저트 카페", "당일 베이킹 카페"] },
  { slug: "plant", label: "식물·플랜테리어", emoji: "🪴", title: "식물 가득한", desc: "식물·플랜테리어로 꾸몄다고 후기에 나온", aliases: ["플랜테리어 카페", "식물 카페", "온실 카페"] },
  { slug: "exhibit", label: "전시·작품", emoji: "🖼️", title: "전시 있는", desc: "전시·작품을 건다고 후기에 나온", aliases: ["갤러리 카페", "전시 카페"] },
];
export const facetBySlug = (s: string) => FACET_PAGES.find((f) => f.slug === s);
/** 페이지를 열 최소 카페 수 — 3곳짜리 목록에 "BEST"라고 쓸 수 없다. 사이트맵 기준과 같은 값을 쓴다. */
export const FACET_MIN_CAFES = 5;
