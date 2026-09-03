// 🗺️ 시·도별 시군구 목록 — **단일 출처**. 의존성 0(클라이언트 번들에 안전하게 들어간다).
//
// 왜 분리했나(2026-08-25): 이 목록이 두 군데에 복제돼 있었다 —
//   ① lib/discover.ts(발굴 대상·area 판정)  ② app/page.tsx(지도앱 시·도/시·군·구 드롭다운)
// 한쪽만 고치면 다른 쪽이 조용히 뒤처진다. 실제로 두 번 사고가 났다:
//   · 2026-07-26 인천 2군9구 개편 때 지도앱 목록이 옛 구만 갖고 있어 신설구 카페 134곳이 **선택 자체 불가**
//   · 2026-08-25 강원 확장 때 지도앱에 강원이 없어 공개된 강원 카페가 지도에서 안 보임(CEO 지적)
// 둘 다 "DB엔 있는데 화면에서 못 고른다"는 같은 병이다. 그래서 목록은 여기 하나만 둔다.
//
// ⚠️ 여기 추가한다고 발굴이 시작되지는 않는다 — 발굴 대상은 lib/discover.ts의 METRO_REGIONS가 따로 정한다
//   (등재=발굴 시작이라는 함정이 있어 그쪽은 의도적으로 별도 판단을 거친다).
export const SIDO_GU: Record<string, string[]> = {
  서울: ["강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"],
  경기: ["수원시", "성남시", "고양시", "용인시", "부천시", "안산시", "안양시", "남양주시", "화성시", "평택시", "의정부시", "시흥시", "파주시", "김포시", "광명시", "광주시", "군포시", "하남시", "오산시", "양주시", "구리시", "안성시", "포천시", "의왕시", "여주시", "동두천시", "과천시", "이천시", "양평군", "가평군", "연천군"],
  // ⚠️ 2026-08-31 정정(coordination#354→decisions#910): "2026-07-01 2군9구 개편"(중구·동구→제물포구·
  //   영종구, 서구→검단구·서해구)은 **실존하지 않는 행정구역명**이었다 — 과거 에이전트가 만든 환각을
  //   "공식 확인"이라며 여러 파일에 사실처럼 박아넣었고(lib/discover.ts·app/api/discover/route.ts 등),
  //   그 결과 cron-grow(2시간마다)가 존재하지 않는 구명으로 계속 네이버를 검색 + discoverRegion의
  //   parseGuArea 폴백이 실주소 매칭에 실패해 가짜 구명을 그대로 area에 찍어 넣는 오염이 진행형이었다
  //   (검증: area='인천 서해구'/'제물포구'/'검단구' 729건, 실제 인천 행정구역은 아래 10개뿐).
  인천: ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"],
  // 2026-08-25 서비스 범위 편입. 관광지 성격은 배제가 아니라 🧳 배지로 구분한다(lib/visitorMix.ts).
  강원: ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군",
        "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"],
  // 2026-09-02 서비스 범위 편입(CEO 지시). 출처: 위키백과 시·군 목록 × DB 실주소 대조(양쪽 일치 확인).
  //   ⚠️ 대전 동구·중구·서구는 서울·인천과 **이름이 겹친다** → discover.ts에서 areaLabel에 '대전' 접두를 붙인다.
  //     안 붙이면 parseGuArea가 서울 중구 카페를 대전으로 찍는다(인천에서 실제로 났던 오염과 같은 병).
  //   ⚠️ 천안시는 서북구·동남구가 있으나 경기(성남·수원)와 같이 **시 단위**로 둔다 — 일관성 유지.
  충북: ["청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군", "진천군", "괴산군", "음성군", "단양군"],
  충남: ["천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시",
        "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군"],
  대전: ["동구", "중구", "서구", "유성구", "대덕구"],
  세종: ["세종시"],
};

// 지도앱 시·도 선택 시 이동할 중심좌표·줌. 시·도를 추가하면 여기도 반드시 채운다(없으면 이동이 안 된다).
export const SIDO_CENTER: Record<string, [number, number, number]> = {
  서울: [37.5665, 126.978, 11],
  경기: [37.37, 127.105, 9],
  인천: [37.4563, 126.7052, 11],
  강원: [37.75, 128.0, 8], // 춘천~강릉을 한 화면에(동서로 길어 줌을 한 단계 넓게)
  충북: [36.80, 127.70, 9],
  충남: [36.50, 126.80, 9],
  대전: [36.3504, 127.3845, 11],
  세종: [36.4801, 127.2890, 11],
};


// ═══════════════════════════════════════════════════════════════════════════════
// 🧭 지역 분류·매칭 **단일출처** (2026-09-04)
//
// 왜 여기인가: '인천만 특별처리'하는 지역 매처가 소비자 API 7곳에 각자 복제돼 있었고,
//   대전 편입(9/2)으로 이름 겹침(중·동·서구)이 생기자 **세 번째 같은 사고**가 났다 —
//   ① 8월 인천 area 오염 729곳 ② 9/3 센티널 하드코딩 목록 ③ 9/4 지도 "대전 153"(CEO 발견,
//   지도는 대전 중구를 서울로·동/서구를 인천으로 세고, 홈피드는 대전 중구 신규 60곳을 0개로 반환).
//   복제된 로직은 반드시 어긋난다. 분류·매칭은 아래 함수만 쓴다 — 새 접두 시도가 생기면
//   PREFIXED_SIDOS 한 줄만 바꾸면 전 부위가 따라온다.
// ⚠️ 이 파일은 의존성 0(클라이언트 번들 안전)을 유지해야 한다 — 순수 함수만 둘 것.

/** 구 이름이 다른 시도와 겹쳐 area에 시도 접두가 붙는 곳("인천 중구"·"대전 중구"). */
export const PREFIXED_SIDOS = ["인천", "대전"] as const;

const _byLen = (l: readonly string[]) => [...l].sort((a, b) => b.length - a.length);
const _LONGEST: Record<string, string[]> = Object.fromEntries(
  Object.entries(SIDO_GU).map(([sido, list]) => [sido, _byLen(list)]),
);

/** area 문자열 → {sido, sigungu}. 접두 시도는 그 시도 안에서만 구를 찾는다(부분일치 오분류 차단). */
export function classifyArea(area: string): { sido: string; sigungu: string } {
  const a = (area ?? "").trim();
  const pre = PREFIXED_SIDOS.find((ps) => a.includes(ps));
  if (pre) { for (const gu of _LONGEST[pre]) if (a.includes(gu)) return { sido: pre, sigungu: gu }; return { sido: pre, sigungu: "" }; }
  for (const [sido, list] of Object.entries(_LONGEST)) for (const gu of list) if (a.includes(gu)) return { sido, sigungu: gu };
  if (a.includes("구리")) return { sido: "경기", sigungu: "구리시" };
  if (a.includes("하남")) return { sido: "경기", sigungu: "하남시" };
  return { sido: "", sigungu: "" };
}

/** area → 정확한 지역 키("대전 중구"·"강남구"·"청주시"). 분류 실패 시 원문 반환(정보 보존). */
export function canonicalGu(area: string): string {
  const { sido, sigungu } = classifyArea(area);
  if (!sigungu) return (area ?? "").trim();
  return (PREFIXED_SIDOS as readonly string[]).includes(sido) ? `${sido} ${sigungu}` : sigungu;
}

/** region 파라미터(시도명 또는 정확 키)와 area의 표준 매칭.
 *  부분일치 금지 원칙 유지("동구"⊂"남동구" 혼입 사고, 2026-07-26 실측) — 정확 키 비교만. */
export function areaMatchesRegion(area: string, region: string): boolean {
  if (!region) return true;
  const a = (area ?? "").trim(); const r = region.trim();
  if ((SIDO_GU as Record<string, string[]>)[r]) return classifyArea(a).sido === r; // 시도명("대전"·"충북")
  return canonicalGu(a) === canonicalGu(r); // 정확 키 비교(양쪽 정규화 — bare "중구"는 서울로 해석됨)
}
