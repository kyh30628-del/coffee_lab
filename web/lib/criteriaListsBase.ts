// 키워드/리스트 사전 — 클라이언트 안전 코어(BASE 정의 + 동기 getter + 캐시 상태). ⚠️ db 임포트 절대 금지.
//   이 파일은 'use client' 홈(app/page.tsx → cafeProfile → charScore)에서 도달 가능하다.
//   따라서 서버전용 db(neon)를 정적으로도 동적으로도 import하지 않는다(그러면 db가 클라 번들에 실림 → 사고 재발).
//   DB 오버레이를 읽어 캐시를 채우는 async 로직은 서버전용 lib/criteriaLists.ts가 담당하고,
//   여기 applyCache()로 캐시를 주입한다. 서버에선 진입점이 loadCriteriaLists()로 프라임 → getListSync가 현재값 반환.
//   클라이언트에선 캐시가 비어 있어 항상 BASE 폴백(현재값)으로 동작 — 서비스 출력 무변.
//   ⚠️ 이 파일은 '리스트 정의(BASE)'의 단일출처다. 소비처는 반드시 여기 키를 통해 읽는다(하드코딩 재정의 금지 → 드리프트 방지).

export type ListMeta = {
  key: string;
  category: string;
  label: string;
  consumer: string; // 어느 코드가 소비하는지(어드민 표시·추적용)
  items: string[]; // 하드코딩 폴백 = 진실원본(현재값). DB가 죽어도 이 값으로 안전동작.
};

// ⚠️ 아래 items 는 각 소비처의 '현재 하드코딩 리스트'와 100% 동일해야 한다(서비스 출력 무변). 시드·폴백 모두 이 값.
export const LIST_META: ListMeta[] = [
  // ── 성향 6축 키워드 (lib/charScore.ts · CHAR_AXES.kws) — 성향점수→개념검색·큐레이션 직접형성 ──
  { key: "char.roast.kws", category: "성향축", label: "성향축: 직접로스팅 🔥", consumer: "charScore.computeCharScores",
    items: ["로스팅", "로스터리", "직접 볶", "자가배전", "스페셜티", "싱글오리진"] },
  { key: "char.work.kws", category: "성향축", label: "성향축: 작업·공부 💻", consumer: "charScore.computeCharScores",
    items: ["작업", "노트북", "공부", "콘센트", "집중", "와이파이"] },
  { key: "char.quiet.kws", category: "성향축", label: "성향축: 조용·혼자 🤍", consumer: "charScore.computeCharScores",
    items: ["조용", "차분", "혼자", "사색", "한적", "고요한", "고요함", "고요히", "고요하게"] },
  { key: "char.dessert.kws", category: "성향축", label: "성향축: 디저트 🍰", consumer: "charScore.computeCharScores",
    items: ["디저트", "케이크", "스콘", "크로플", "티라미수", "베이커리", "쿠키", "빵"] },
  // #359: 바른 "뷰" 단독 매칭이 "리뷰"·"인터뷰"·"벨뷰"·"뷰티"·"트리뷰트"·"랑데자뷰"(카페 상호) 등과
  //   발음/부분일치 충돌 → mood 언급률 3.2배 허위 급등(coord#114 "고요"→"최고요"와 동일 근본원인).
  //   view를 실제로 서술하는 복합어 형태만 인정(리뷰 등과 겹치지 않는 접두 결합어).
  { key: "char.mood.kws", category: "성향축", label: "성향축: 분위기 📸", consumer: "charScore.computeCharScores",
    items: ["분위기", "예쁜", "감성", "인테리어", "사진", "오션뷰", "시티뷰", "한강뷰", "리버뷰", "루프탑뷰", "야경뷰", "노을뷰", "전망", "루프탑", "아늑"] },
  { key: "char.space.kws", category: "성향축", label: "성향축: 넓은공간 🪑", consumer: "charScore.computeCharScores",
    items: ["넓", "대형", "규모", "테라스", "주차"] },
  // 🐶🥐🌄 2026-08-13 신설 3축(CEO 승인 P1) — 근거: 네이버 데이터랩 수요 1·2위(애견동반·브런치)가 미커버였고
  //   노출 리뷰 신호 보유 카페가 각 1,100곳+(공급 확보). 오탐 방지: 단독 애매어 금지 원칙 준수 —
  //   pet은 '강아지' 단독 금지(동반 서술형만), view는 '뷰' 단독 금지("리뷰" 부분일치, #359 학습사항).
  { key: "char.pet.kws", category: "성향축", label: "성향축: 애견동반 🐶", consumer: "charScore.computeCharScores",
    items: ["애견동반", "애견 동반", "반려견", "반려동물", "펫프렌들리", "펫 프렌들리", "강아지 동반", "강아지랑", "강아지와 함께", "강아지 데리고", "댕댕이랑", "댕댕이 동반"] },
  { key: "char.brunch.kws", category: "성향축", label: "성향축: 브런치 🥐", consumer: "charScore.computeCharScores",
    items: ["브런치", "에그베네딕트", "프렌치토스트", "샌드위치 맛집", "샐러드 카페"] },
  // 2026-08-27 신설 2축(데이터랩 실측: 베이커리=브런치의 59%로 미커버 수요 1위 · 테라스=카공급 수요+봄 피크 2배).
  //   ⚠️ #359 교훈: 단독 애매어 금지 — "빵" 단독은 붕어빵·호빵 오탐(dessert에 이미 있어 여기선 제외),
  //   "야외" 단독은 "야외 주차장" 오탐 → 좌석 맥락이 있는 표현만.
  { key: "char.bakery.kws", category: "성향축", label: "성향축: 베이커리 🥖", consumer: "charScore.computeCharScores",
    items: ["베이커리", "빵집", "빵맛집", "소금빵", "크루아상", "크로플", "휘낭시에", "스콘", "바게트", "식빵", "베이글", "마들렌", "까눌레", "갓 구운 빵", "갓구운 빵", "빵이 맛있"] },
  { key: "char.terrace.kws", category: "성향축", label: "성향축: 테라스·야외 🌿", consumer: "charScore.computeCharScores",
    items: ["테라스", "루프탑", "야외 좌석", "야외좌석", "야외 테이블", "야외석", "노천", "야장"] },
  { key: "char.view.kws", category: "성향축", label: "성향축: 뷰 🌄", consumer: "charScore.computeCharScores",
    items: ["오션뷰", "시티뷰", "한강뷰", "리버뷰", "산뷰", "논뷰", "숲뷰", "바다뷰", "호수뷰", "노을뷰", "야경뷰", "뷰맛집", "뷰 맛집", "뷰가 좋", "뷰가 예쁘", "뷰가 이쁘", "전망이 좋", "창밖 풍경", "탁 트인"] },
  // decisions#959(2026-09-04): "노키즈존" 검색 0건 — lib/cafeProfile.ts(HIGHLIGHTS)·lib/categoryDiscover.ts엔
  //   이미 있는데 검색 개념축(concept.nokids.triggers 아래)엔 없어 트리거 사전에서 누락돼 있었다.
  //   ⚠️ 신설 축이라 기존 카페의 char_scores엔 즉시 반영 안 됨 — scripts/backfill-newaxes.mjs류 1회성 소급 필요.
  { key: "char.nokids.kws", category: "성향축", label: "성향축: 노키즈존 🚸", consumer: "charScore.computeCharScores",
    items: ["노키즈존", "노키즈 존", "노키즈"] },

  // ── 맛 3축 신호어 (lib/synthEngine.ts · SIGNALS/AMBIGUOUS) — 맛 좌표(산미·바디·단맛) 직접형성 ──
  { key: "taste.acidity.strong", category: "맛축", label: "맛: 산미 강신호", consumer: "synthEngine.synthesize",
    items: ["산미", "신맛", "상큼", "과일향", "베리", "시트러스", "플로럴", "꽃향", "게이샤", "acidity", "acidic", "sour", "fruity", "floral", "berry", "citrus", "bright", "geisha"] },
  { key: "taste.acidity.weak", category: "맛축", label: "맛: 산미 약신호(부정)", consumer: "synthEngine.synthesize",
    items: ["산미가 없", "산미없", "신맛이 없", "산미 거의", "산미가 적", "산미 불호", "산미가 약", "not sour", "no acidity", "without acidity", "low acidity", "less acidic", "not much sour"] },
  { key: "taste.acidity.ambiguous", category: "맛축", label: "맛: 산미 모호어(부정 취급)", consumer: "synthEngine.synthesize",
    items: [] },
  { key: "taste.body.strong", category: "맛축", label: "맛: 바디 강신호", consumer: "synthEngine.synthesize",
    items: ["묵직", "진한", "바디감", "다크", "스모키", "고소", "견과", "다크초콜릿", "full body", "full-bodied", "heavy body", "dark chocolate", "nutty", "robust", "bold", "rich body"] },
  { key: "taste.body.weak", category: "맛축", label: "맛: 바디 약신호(부정)", consumer: "synthEngine.synthesize",
    items: ["가볍", "연한", "밍밍", "물 같", "라이트", "light body", "watery", "thin", "light-bodied"] },
  { key: "taste.body.ambiguous", category: "맛축", label: "맛: 바디 모호어(부정 취급)", consumer: "synthEngine.synthesize",
    items: ["smooth", "부드러", "clean", "깔끔", "mellow", "mild", "soft", "delicate"] },
  { key: "taste.sweet.strong", category: "맛축", label: "맛: 단맛 강신호", consumer: "synthEngine.synthesize",
    items: ["단맛", "달달", "달콤", "카라멜", "바닐라", "꿀", "sweet", "sweetness", "caramel", "vanilla", "honey", "sugary"] },
  { key: "taste.sweet.weak", category: "맛축", label: "맛: 단맛 약신호(부정)", consumer: "synthEngine.synthesize",
    items: ["안 달", "안달", "달지 않", "씁쓸", "쓴맛", "not sweet", "bitter", "less sweet"] },
  { key: "taste.sweet.ambiguous", category: "맛축", label: "맛: 단맛 모호어(부정 취급)", consumer: "synthEngine.synthesize",
    items: [] },

  // ── 용도 신호어 (lib/synthEngine.ts · USE_SIGNALS) — 카페 용도 태그 형성 ──
  { key: "use.작업", category: "용도", label: "용도: 작업", consumer: "synthEngine.synthesize",
    items: ["작업", "노트북", "공부", "콘센트", "좌석", "read", "work", "laptop", "study", "books"] },
  { key: "use.혼자", category: "용도", label: "용도: 혼자", consumer: "synthEngine.synthesize",
    items: ["혼자", "조용", "사색", "차분", "고요", "quiet", "serene", "calm", "low key", "low-key", "peaceful"] },
  { key: "use.수다", category: "용도", label: "용도: 수다", consumer: "synthEngine.synthesize",
    items: ["수다", "친구", "대화", "일행", "함께", "group", "friends", "together", "chat"] },
  { key: "use.사진", category: "용도", label: "용도: 사진", consumer: "synthEngine.synthesize",
    items: ["사진", "인테리어", "예쁜", "감성", "분위기", "루프탑", "interior", "ambience", "ambiance", "aesthetic", "rooftop"] },
  { key: "use.빵", category: "용도", label: "용도: 빵", consumer: "synthEngine.synthesize",
    items: ["빵", "베이커리", "스콘", "크루아상", "디저트", "케이크", "티라미수", "bread", "bakery", "scone", "croissant", "dessert", "cake", "tiramisu", "pastry"] },

  // ── 용도구체어 확장사전 (lib/synthEngine.ts · reviewSpecificTermExt) — 정합성조사 #536→#583→#605→#642(4회
  //   재발) 원인: 용도문구 분기용 구체어가 코드 고정 SPECIFIC_TERM_KEYWORDS뿐이라 협소해 절대다수가 generic
  //   USE_PHRASE로 폴백·동일문구 수렴. #642 조사에서 리뷰텍스트 형태소분석 없는 단순 빈도추출은 SEO 잡음
  //   (전화번호·운영시간·가능한 등)이 상위를 차지해 신뢰 불가로 기각(실측, 명사추출 오채택 시 환각·비문 위험) —
  //   대신 이 사전(코드 고정 SPECIFIC_TERM_KEYWORDS의 2차 폴백)을 무배포 편집 가능하게 분리해, 다음 재발부터는
  //   dev_task 없이 기획조정실장(L2)이 /admin/criteria에서 항목만 추가하면 되도록 구조 전환.
  { key: "specific_term.빵", category: "용도구체어", label: "구체어 확장: 빵", consumer: "synthEngine.reviewSpecificTermExt",
    items: ["휘낭시에", "마카롱", "크로플", "파운드케이크", "롤케이크", "단팥빵", "소금빵"] },
  { key: "specific_term.작업", category: "용도구체어", label: "구체어 확장: 작업", consumer: "synthEngine.reviewSpecificTermExt",
    items: ["스터디룸", "전용좌석"] },
  { key: "specific_term.혼자", category: "용도구체어", label: "구체어 확장: 혼자", consumer: "synthEngine.reviewSpecificTermExt",
    items: ["다락", "바자리", "소파자리"] },
  { key: "specific_term.수다", category: "용도구체어", label: "구체어 확장: 수다", consumer: "synthEngine.reviewSpecificTermExt",
    items: ["회의실", "넓은테이블"] },
  { key: "specific_term.사진", category: "용도구체어", label: "구체어 확장: 사진", consumer: "synthEngine.reviewSpecificTermExt",
    items: ["정원", "포토존", "대형창", "중정", "마당", "다락방", "통창"] },

  // ── 운영 정체성 신호어 (lib/synthEngine.ts · OP_SIGNALS) — 직접로스팅·원두판매·권위 주장 탐지 ──
  { key: "op.직접로스팅", category: "운영신호", label: "운영: 직접로스팅 주장", consumer: "synthEngine.synthesize",
    items: ["직접 로스팅", "직접로스팅", "자가배전", "직접 볶", "직접볶", "로스터리", "빈투바", "bean to bar", "in-house roast", "in house roast", "house roasted", "roast in-house", "직접 볶은", "직접 볶아", "로스팅합니다", "로스팅 합니다"] },
  { key: "op.원두판매", category: "운영신호", label: "운영: 원두판매", consumer: "synthEngine.synthesize",
    items: ["원두 판매", "원두 구매", "원두 사", "원두 한봉", "bag of bean", "beans to take", "buy a bag", "roasted coffee beans"] },
  { key: "op.권위", category: "운영신호", label: "운영: 권위·수상", consumer: "synthEngine.synthesize",
    items: ["블루리본", "수상", "10년 연속", "미슐랭", "blue ribbon", "best specialty", "key player", "reputation", "hidden gem"] },

  // ── 검색 개념 트리거 (app/api/search/route.ts · CONCEPTS.triggers) — 질의→개념 매칭·랭킹 직접형성 ──
  { key: "concept.quiet.triggers", category: "검색개념", label: "개념: 조용·혼자", consumer: "search.route",
    items: ["조용", "혼자", "차분", "사색", "고요", "한적", "혼카", "평온", "힐링", "나홀로", "한가"] },
  { key: "concept.work.triggers", category: "검색개념", label: "개념: 작업·공부", consumer: "search.route",
    // 2026-08-30(#901): "카공"(카페공부) 단독검색이 트리거 목록에 없어 0건이었다(SEO aliases엔 있었으나
    //   /api/search 질의 정규화엔 미연결) — 실질 수요어라 트리거에 직접 추가.
    items: ["작업", "공부", "노트북", "콘센트", "스터디", "와이파이", "오래", "독서", "집중", "책", "카공"] },
  { key: "concept.mood.triggers", category: "검색개념", label: "개념: 분위기·감성", consumer: "search.route",
    items: ["분위기", "감성", "예쁜", "이쁜", "데이트", "사진", "인테리어", "뷰", "루프탑", "아늑", "무드", "빈티지", "힙", "감각", "조명", "이국적"] },
  { key: "concept.dessert.triggers", category: "검색개념", label: "개념: 디저트·빵", consumer: "search.route",
    items: ["빵", "디저트", "케이크", "베이커리", "달달", "달콤", "스콘", "크로플", "쿠키", "티라미수", "마카롱", "휘낭시에", "과자", "구움"] },
  { key: "concept.brunch.triggers", category: "검색개념", label: "개념: 브런치", consumer: "search.route",
    items: ["브런치", "브런치카페", "브런치맛집", "브런치집", "에그베네딕트", "팬케이크", "와플", "리코타"] },
  { key: "concept.roast.triggers", category: "검색개념", label: "개념: 직접로스팅·스페셜티", consumer: "search.route",
    items: ["로스팅", "스페셜티", "원두", "핸드드립", "드립", "커피맛", "고급", "로스터리", "싱글", "에스프레소", "진심", "커피가 맛", "커피 맛"] },
  { key: "concept.space.triggers", category: "검색개념", label: "개념: 넓은공간", consumer: "search.route",
    items: ["넓", "대형", "테라스", "주차", "규모", "아이", "쾌적", "층고", "단체"] },
  // 검색결함B(#345): "애견동반" 등 반려동반 의도가 "넓은공간" 라벨로 뭉뚱그려짐(07-10 상신, 3일째 재현) —
  //   "애견"·"반려"를 space triggers에서 분리해 별도 개념으로. 코어 카페 데이터엔 반려 전용 char축/uses가 없어(cafeProfile.ts HIGHLIGHTS만 존재)
  //   axis/uses 매핑 없이 라벨만 정확히 붙인다(넓은공간 축 가산 오귀속 제거).
  { key: "concept.pet.triggers", category: "검색개념", label: "개념: 반려동반", consumer: "search.route",
    items: ["애견", "반려", "강아지", "펫동반"] },
  { key: "concept.bakery.triggers", category: "검색개념", label: "개념: 베이커리", consumer: "search.route",
    items: ["베이커리", "빵집", "빵맛집", "소금빵", "크루아상", "베이글", "식빵", "빵 맛있는"] },
  { key: "concept.terrace.triggers", category: "검색개념", label: "개념: 테라스·야외", consumer: "search.route",
    items: ["테라스", "루프탑", "야외", "노천", "야장"] },
  { key: "concept.view.triggers", category: "검색개념", label: "개념: 뷰 좋은", consumer: "search.route",
    items: ["뷰맛집", "뷰 좋은", "뷰좋은", "한강뷰", "리버뷰", "오션뷰", "시티뷰", "전망 좋은", "창밖", "노을", "야경"] },
  // decisions#959: search_log 실사용자 질의("노키즈존")가 3사이클 연속 0건이었다 — 개념 미등재가 근본원인.
  { key: "concept.nokids.triggers", category: "검색개념", label: "개념: 노키즈존", consumer: "search.route",
    items: ["노키즈존", "노키즈", "노 키즈존", "노키즈카페"] },
  { key: "concept.acidity.triggers", category: "검색개념", label: "개념: 산미 또렷", consumer: "search.route",
    items: ["산미", "상큼", "과일", "베리", "시트러스", "플로럴", "꽃향", "새콤", "산뜻", "후르츠"] },
  { key: "concept.body.triggers", category: "검색개념", label: "개념: 묵직·고소", consumer: "search.route",
    items: ["고소", "묵직", "진한", "다크", "스모키", "견과", "바디", "구수", "진하게"] },
  { key: "concept.sweet.triggers", category: "검색개념", label: "개념: 단맛", consumer: "search.route",
    items: ["단맛", "카라멜", "바닐라", "꿀", "초콜릿", "달콤한"] },
    // 🔴 2026-09-01 — 강원(강원·춘천·원주·강릉·속초)을 뺐다. 8/25부터 강원 카페 1,610곳을 공개해놓고
  //   검색하면 "수도권만 서비스합니다"라고 답하고 있었다(결과 24건을 보여주면서 동시에). 실측 확인.
  //   ⚠️ 서비스 범위는 lib/serviceScope.ts가 진실원본이다 — 지역을 늘리면 **이 목록도 같이** 손봐야 한다.
  //   DB 오버레이(criteria_lists)에도 고성·대관령·동해·삼척이 남아 있었다. 사전이 두 군데라 한쪽만 고치면 안 된다.
  // 🔴 2026-09-02 — 충북·충남·대전·세종 편입으로 12개 더 제거(충청/충북/충남/대전/세종/청주/충주/제천/천안/아산/공주/서산).
{ key: "search.out_of_coverage", category: "검색개념", label: "검색: 미서비스 지역 키워드", consumer: "search.route",
    items: ["부산", "대구", "광주광역시", "광주 광역시", "울산", "전북", "전남", "전라", "경북", "경남", "경상", "제주", "포항", "경주", "안동", "구미", "창원", "진주", "통영", "김해", "거제", "양산", "밀양", "전주", "군산", "익산", "목포", "순천", "여수", "광양", "제주시", "서귀포"] },

  // ── 오염/비카페 순수 리스트 (lib/discover.ts) — 로직(regex) 제외, 순수 문자열 리스트만 ──
  { key: "discover.non_cafe", category: "오염리스트", label: "발굴: 비카페 상호 토큰(부분일치)", consumer: "discover.isNonCafe",
    items: ["고로케", "정육", "세탁소", "치킨집", "피자", "분식", "국밥", "삼겹", "횟집", "노래방", "PC방", "문구"] },
  { key: "discover.manual_noncafe", category: "오염리스트", label: "발굴: 수동 지목 비카페", consumer: "discover.isNonCafe",
    items: ["차덕분"] },

  // ── 초약체 유일토큰 (lib/reviewQuality.ts · WEAK_IDENTITY_TOKEN) — 리뷰 매칭 엄격도 게이트 ──
  // 룰갭 P8(#224): '에스엠' id13181(파주 에스엠카페) 5/6 동명 브랜드 혼입(SM엔터·에스엠웍스·에스엠바이크 등).
  // 룰갭 P14(#224): '우리동네구멍가게' id17927(시흥) 6/6 무관(동명 도서 서평·미니어처 장난감 후기, 카페 언급 0).
  // 룰갭 P38(#386, coord#202): 전체이름=흔한 단일단어 카페명(nameIsSoleToken) 실측 오염 — 오븐(id13621
  //   "꿈꾸는 오븐")·꿈꾸는·우주(id17852)·사이(id16323)·톤앤매너(id1520)·좋은친구들(id11937). 5자 이상이라
  //   nameIsSoleToken의 4자이하 폴백만으론 못 잡혀 큐레이션 병행 필요(좋은친구들).
  // 룰갭 P44(#412): '시너지'(id14692 "시너지커피 선정릉점") 6건 중 3건이 파인다이닝 리뷰의 일반명사
  //   "시너지" 오매칭·'프렌즈'(id10683 "프렌즈카페") 6건 중 2건이 스타벅스 프렌즈굿즈 후기 오매칭.
  // 룰갭 P46(#428): '스토리'(id1338 "커피91스토리") — 한글↔숫자 경계 분리로 순수숫자 토큰("91") 제거 후
  //   남는 유일토큰이 "스토리"뿐이면, 무관 콘텐츠(타업종 시공후기·개인 사연 등)가 그 단어와 OR매칭만으로 통과.
  // 룰갭 P55(#477): '우상향'(id19003, 김포시 빵집) — 부동산/재무 관용구("가격 우상향", "수요곡선 우상향")와
  //   동명 충돌(offctx_rate=0.4286). '향초'(id2010, 고양시 로스터리) — "향+초(incense candle)"와 동음이의로
  //   향초 판매업체 블로그 등 무관 콘텐츠 매칭(offctx_rate=0.5).
  // 룰갭(rulegap-20260818-1614, decisions#765): 이 사전은 원래 '유일토큰' 전용이었으나, 다중토큰(공백 포함)
  // 상호명의 매칭 기여 토큰 판정에도 확장 적용된다(reviewQuality.ts distinctInTitle/Body) — "작업실"·"하우스"·
  // "포레스트"는 카페 업태어(GENERIC_WORD)는 아니지만 워크샵과 동급으로 흔한 부가어라, 단독 일치만으로
  // 무관 콘텐츠가 매칭됐다(id9683 '카야씨의 작업실' 6/6 무관, id19744 '포레스트 하우스' 1/6 무관).
  // 룰갭(rulegap-20260822, decisions#802): "크리스탈"(id6435, 고양시) 19건중17건+ 무관(액세서리·건물명·
  // 인피니티풀·놀이기구 등 동음이의 전멸) · "허니브라운"(id6844, 영등포구) 10건중4건 무관(타 매장 주류메뉴명과
  // 우연일치) · "소문난"(id18115, 인천 서해구) 15건중10건 내외 무관("~하기로 소문난"이 블로그 제목 관용수식어라
  // 무관 소고기집·핸드드립카페·헤어샵·TV 구매후기까지 매칭).
  // 룰갭(rulegap-20260822-2, decisions#804): "플랫폼"(id9605 "237플랫폼", 성북구 정릉동) — 순수 보통명사(온라인
  // 플랫폼 의미로도 흔함)라 근거풀(synth_reviews_all 40건) 중 최소 6건이 무관 콘텐츠(고려대 안암 보드게임카페
  // 방문기 등, 지리적으로도 정릉시장 vs 안암으로 무관) 오혼입.
  // 룰갭(rulegap-20260828, decisions#854): "사무소"(id21579, 의정부시 우남빌딩 1층) — 순수 보통명사(사무실·회사
  // 사무소 의미로 흔함)라 표시 리뷰 2/2건 전부 카페와 무관한 오피스 클리닝 업체 광고와 매칭됐다.
  { key: "identity.weak_token", category: "정체성", label: "약한 식별토큰(유일·다중토큰 매칭 기여 시 엄격 매칭 요구)", consumer: "reviewQuality",
    items: ["공간", "다이아", "블라블라", "충무", "브라더스", "2005", "인테리어", "조도", "회전목마", "실험실", "청하동길", "스위치", "에스엠", "우리동네구멍가게", "오븐", "꿈꾸는", "우주", "사이", "톤앤매너", "좋은친구들", "시너지", "프렌즈", "향기로운", "온전한", "스토리", "우상향", "향초", "워크샵", "작업실", "하우스", "포레스트", "크리스탈", "허니브라운", "소문난", "플랫폼", "사무소"] },
  // 룰갭(rulegap-20260817, decisions#745): 관용구/일반명사형 상호명 — "동네방네"(id1819)·"우리동네"(id2778)는
  // titleHasCafeWord/CAFE_CONTEXT_STRONG OR우회로 무관 콘텐츠(입소문 관용구·딴 상호 부분일치)까지 통과했다.
  // "골목"은 동일 유형의 선제 등재(관용구 상호명 카테고리, 실측 오염 사례는 아직 없음).
  // 룰갭(rulegap-20260821, decisions#795): "카페투어"(id7265, 화성시 병점구)는 방문후기 작성자들이 카페와
  // 무관하게 보편적으로 쓰는 행위 관용구/해시태그와 상호명이 완전일치해, titleHasCafeWord/CAFE_CONTEXT_STRONG
  // OR우회로 표시리뷰 6/6건이 전부 다른 업체(카페 더포레·한옥버치 등) 후기였다(전수확인). "카페산책"·
  // "카페콩투어"·"커피여행" 등 수식어 결합형 5곳은 대사 결과 정상이라 등재 안 함(순수 관용구 완전일치만).
  { key: "identity.idiom_dong_token", category: "정체성", label: "관용구 상호명(동 단위 지역어 필수 AND)", consumer: "reviewQuality",
    items: ["동네방네", "우리동네", "골목", "카페투어"] },
  // 룰갭(rulegap-20260817, decisions#745): "마실"(id11801)은 동사 '마시다'의 관형사형(잠재형 "~마실 수 있는")과
  // 동음이의라, 딴 카페를 다루는 글의 "커피를 마실 수 있는" 구문만으로 오매칭됐다(id11801 6건중1건).
  { key: "identity.verb_homonym_token", category: "정체성", label: "동사 활용형 동음이의 상호명(잠재형 패턴 무효화)", consumer: "reviewQuality",
    items: ["마실"] },
];

const BY_KEY: Record<string, ListMeta> = Object.fromEntries(LIST_META.map((m) => [m.key, m]));
export const BASE_BY_KEY: Record<string, string[]> = Object.fromEntries(LIST_META.map((m) => [m.key, m.items]));
const BASE_SET: Record<string, Set<string>> = {};
export function listKeys(): string[] { return LIST_META.map((m) => m.key); }
export function isListKey(key: string): boolean { return key in BY_KEY; }

// 유효리스트 계산 — BASE에서 remove 제외 후 add append. 오버라이드 없으면 BASE 그대로(순서·내용 동일 → 서비스 무변).
export function effective(key: string, overrides?: Map<string, "add" | "remove">): string[] {
  const base = BASE_BY_KEY[key] ?? [];
  if (!overrides || overrides.size === 0) return base.slice();
  const removes = new Set<string>();
  for (const [item, op] of overrides) if (op === "remove") removes.add(item);
  const out = base.filter((x) => !removes.has(x));
  for (const [item, op] of overrides) if (op === "add" && !removes.has(item) && !out.includes(item)) out.push(item);
  return out;
}

// 모듈 캐시(TTL 60s) — 서버에서 loadCriteriaLists()가 applyCache로 채운다. 클라이언트에선 비어 있어 BASE 폴백.
let CACHE: Record<string, string[]> = {};
let CACHE_SET: Record<string, Set<string>> = {};

// 서버전용 로더(lib/criteriaLists.ts)가 DB 오버레이 반영 후 캐시를 주입한다. 클라이언트는 절대 호출하지 않음.
export function applyCache(nextArr: Record<string, string[]>, nextSet: Record<string, Set<string>>): void {
  CACHE = nextArr;
  CACHE_SET = nextSet;
}

// 규칙(동기)에서 조회 — 캐시 우선, 미프라임/미지정이면 BASE 폴백(항상 안전, db 미접촉).
export function getListSync(key: string): string[] {
  return CACHE[key] ?? BASE_BY_KEY[key] ?? [];
}

// Set 형태 동기 조회(reviewQuality 등 .has() 소비처용). 캐시 우선, 폴백은 BASE Set(지연생성).
export function getListSetSync(key: string): Set<string> {
  const c = CACHE_SET[key];
  if (c) return c;
  if (!BASE_SET[key]) BASE_SET[key] = new Set(BASE_BY_KEY[key] ?? []);
  return BASE_SET[key];
}
