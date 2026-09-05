import { sql } from "@/lib/db";

// 프로그래매틱 SEO(동네×취향) 데이터 — 검증 카페 목록을 지역·취향별로 조회.
export const SITE = "https://dongnecoffeenote.com";
export const OG_HINT = "영수증 리뷰·광고 빼고 진짜 후기로 검증 · dongnecoffeenote.com";

export type Taste = { key: string; label: string; short: string; emoji: string; desc: string;
  /** 🔍 사람들이 실제로 검색하는 표현(네이버 데이터랩 실측 기반, 2026-08-15).
   *  우리 label은 '우리 말'이라 검색어와 어긋난다 — 실측: "안산시 작업하기 좋은 카페 검증"은 10위 안 10개가
   *  전부 우리 페이지인데, 정작 사람들이 치는 "안산 카공 카페 추천"에는 **한 개도 안 잡혔다**.
   *  제목 머리는 보존한 채 이 별칭을 뒤에 병기해 같은 자산이 더 큰 검색량 풀에서 싸우게 한다. */
  aliases: string[] };
// char_scores 키와 1:1 (mood/work/quiet/roast/space/dessert)
export const TASTES: Taste[] = [
  { key: "work", label: "작업하기 좋은", short: "카공", emoji: "💻", desc: "노트북·콘센트·집중하기 좋은", aliases: ["카공 카페", "노트북 카페", "공부하기 좋은 카페"] },
  { key: "quiet", label: "조용한", short: "혼자", emoji: "🤍", desc: "혼자 차분히 머물기 좋은", aliases: ["조용한 카페", "혼자 가기 좋은 카페"] },
  { key: "dessert", label: "디저트 맛집", short: "디저트", emoji: "🍰", desc: "달콤한 디저트가 맛있는", aliases: ["디저트 카페", "디저트 맛집", "베이커리 카페"] },
  { key: "roast", label: "스페셜티·로스팅", short: "스페셜티", emoji: "🔥", desc: "직접 로스팅·원두에 진심인", aliases: ["로스터리 카페", "핸드드립 카페", "스페셜티 커피"] },
  { key: "mood", label: "분위기 좋은", short: "감성", emoji: "📸", desc: "분위기·사진이 예쁜", aliases: ["분위기 좋은 카페", "감성 카페", "예쁜 카페"] },
  { key: "space", label: "넓은 대형", short: "대형", emoji: "🪑", desc: "넓고 좌석이 많은", aliases: ["대형카페", "넓은 카페", "주차 되는 카페"] },
  // 2026-08-13 신설(P1 — CEO 승인): 데이터랩 수요 1·2위 테마. char 축과 키 동일(파이프라인 자동 연동).
  { key: "pet", label: "애견동반", short: "반려동반", emoji: "🐶", desc: "반려견과 함께 갈 수 있는", aliases: ["애견카페", "강아지 카페", "반려견 동반 카페"] },
  { key: "brunch", label: "브런치 맛집", short: "브런치", emoji: "🥐", desc: "브런치 메뉴가 맛있는", aliases: ["브런치 카페", "브런치 맛집"] },
  { key: "view", label: "뷰 좋은", short: "뷰맛집", emoji: "🌄", desc: "창밖 풍경·전망이 좋은", aliases: ["뷰맛집 카페", "전망 좋은 카페"] },
  // 2026-08-27 신설(데이터랩 실측 — 베이커리: 브런치의 59%로 미커버 최대 수요 · 테라스: 카공급 수요, 4~5월 2배 피크).
  //   ⚠️ dessert의 alias "베이커리 카페"는 그대로 둔다 — 제목 머리·꼬리 불변 원칙(기존 네이버 랭킹 보호).
  { key: "bakery", label: "베이커리", short: "베이커리", emoji: "🥖", desc: "갓 구운 빵이 맛있는", aliases: ["베이커리카페", "빵집 카페", "빵맛집"] },
  { key: "terrace", label: "테라스·야외", short: "테라스", emoji: "🌿", desc: "테라스·야외 좌석이 있는", aliases: ["테라스카페", "야외 카페", "루프탑 카페"] },
];
export const tasteByKey = (k: string) => TASTES.find((t) => t.key === k);

export type SeoCafe = { id: number; name: string; dong: string | null; grade: string | null; count: number | null; identity: string | null; quote: string | null; tasteHits?: number | null;
  /** 🏅 '이 집만의 한 가지' 뱃지 계산용(동네 안 상대비교) — 작은 jsonb라 전송 영향 무시 수준(2026-08-22). */
  char_scores?: Record<string, number> | null;
  /** 🧳🏠 방문객 성격(lib/visitorMix.ts) — REAL 3개라 전송 영향 없음. 판정은 표시 시점(criteria 임계). */
  visitor_n?: number | null; visitor_trip?: number | null; visitor_local?: number | null;
  /** 🔌 카공 시설 사실(합성 시 저장) — [{k:"outlet",n:5}]. 경쟁사가 안 주는 정보라 목록에 세운다. 작은 배열이라 전송 영향 없음. */
  work_facts?: { k: string; n: number }[] | null };

// 🎯 취향 페이지 채택 기준(2026-08-06, CEO "기준 상향") — 예전엔 `char_scores.<취향> > 0`,
//   즉 **후기에 딱 한 번 스쳐도 포함**이었다. 그 결과 "파주시 작업하기 좋은 카페 117곳"인데 실제로
//   작업 언급이 3건 이상인 곳은 37곳뿐이라, 네이버에서 '카공 카페'로 들어온 사람이 만나는 첫 화면이
//   약속과 어긋났다(최대 유입 페이지 UV 1,040/30일).
//   새 기준 = ①절대 근거 3건 이상 ②그 카페 전체 후기의 5% 이상(후기 20건당 1건 이상 그 얘기가 나옴).
//   ①만으로는 후기 300건짜리 대형카페가 3건으로 통과하고, ②만으로는 후기 5건짜리가 1건으로 통과한다.
//   ⚠️ 목록·곳수·등급분포 **세 쿼리가 반드시 같은 조건**을 써야 한다(예전 버그의 본질 = 표시와 카피 불일치).
//   (neon 태그드 템플릿은 조각 합성이 안 되므로 조건을 각 쿼리에 같은 형태로 적어 둔다 — 바꿀 땐 전부 함께.)
// ⚠️ 비율은 **정수 백분율로만** 다룬다(`언급×100 >= 후기×5`). 소수 0.05를 파라미터로 넘기면 Postgres가
//   정수 문맥에서 $n을 integer로 추론해 `invalid input syntax for type integer: "0.05"`로 죽고,
//   호출부 try/catch가 그걸 빈 배열로 삼켜 **페이지가 조용히 0곳이 된다**(구현 중 실제로 밟은 함정).
export const TASTE_MIN_HITS = 3;
export const TASTE_MIN_RATE_PCT = 5;

// 💰 2026-09-05(CEO 승인 다이어트): 이 집계가 pg_stat 1위였다(4.3일 24.1GB·1,554회 — ISR 재생성마다
//   전 테이블 풀스캔). getTasteCounts와 같은 메모리 캐시 패턴 적용 — 지역 목록은 10분 늦어도 무해.
let regionsMem: { at: number; v: { area: string; n: number }[] } | null = null;
export async function getRegions(): Promise<{ area: string; n: number }[]> {
  if (regionsMem && Date.now() - regionsMem.at < 10 * 60_000) return regionsMem.v;
  try {
    const v = (await sql`SELECT area, count(*)::int n FROM cafes WHERE published AND area IS NOT NULL AND area <> '' GROUP BY area HAVING count(*) >= 5 ORDER BY n DESC`) as unknown as { area: string; n: number }[];
    regionsMem = { at: Date.now(), v };
    return v;
  } catch { return regionsMem?.v ?? []; }
}

export async function getRegionCafes(area: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local, work_facts,
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area}
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}

export async function getRegionTasteCafes(area: string, tasteKey: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local, work_facts,
      (char_scores->>${tasteKey})::int AS "tasteHits",
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}
      ORDER BY (char_scores->>${tasteKey})::int DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}

// 지역×취향 공개 카페 곳수 — 취향 페이지 "N곳" 카피의 실제 값(표시 30개를 곳수로 오용 금지).
export async function getRegionTasteCount(area: string, tasteKey: string): Promise<number> {
  return (await getRegionTasteStats(area, tasteKey)).n;
}

/**
 * 곳수 + **그 카페들의 검증 후기 총합**을 한 번에.
 *
 * 왜 후기 합계인가(2026-08-30): 경쟁사 실측 결과 우리 차별점이 여기에 있다.
 *   naejari.com(내 자리)은 "성남시 카공 카페 **2,180곳** 지도"로 우리(BEST 30) 위 1위인데,
 *   실제 페이지를 열어보면 **이름·주소만** 있고 후기·평점·콘센트 정보가 전혀 없다(전체 나열).
 *   모수(카페 수)로는 우리가 507곳이라 작아 보이지만, 우리 30곳 뒤에는 **검증 후기 14,340건**이 있다.
 *   → 스니펫에서 겨룰 숫자는 '카페 수'가 아니라 '후기 수'다. 그쪽은 0건이라 따라올 수 없다.
 *
 * 💰 비용: 위 count 쿼리에 SUM만 더한 것 — **추가 쿼리 0**(같은 WHERE·같은 스캔).
 *   이 파일 아래 08-17 사고 주석 참조 — 테마 페이지에 조회를 '추가'하면 활성시간이 뛴다. 추가하지 않았다.
 */
export async function getRegionTasteStats(area: string, tasteKey: string): Promise<{ n: number; reviews: number }> {
  try {
    const r = (await sql`SELECT count(*)::int n, COALESCE(SUM(synth_count), 0)::int reviews FROM cafes WHERE published AND area=${area}
      AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
      AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}`)[0] as any;
    return { n: Number(r?.n ?? 0), reviews: Number(r?.reviews ?? 0) };
  } catch { return { n: 0, reviews: 0 }; }
}

// 전 지역×전 취향 곳수를 **쿼리 1회**로 — 사이트맵이 얇은 페이지(기준 미달)를 제출하지 않게 거르는 용도.
//   지역 68 × 취향 6 = 408번 개별 조회는 비용상 금지([[feedback_cost_discipline_hard]]).
// 💰 2026-08-17 비용 사고 수리 — 이 함수는 **전 카페 GROUP BY 전수 스캔**(평균 171ms·디스크판독 6,187)이다.
//   08-15에 테마 페이지 본문(칩 개수·다른 동네 링크)에 붙였는데, 테마 페이지는 ISR 30분이라
//   488개 페이지가 재생성될 때마다 이 스캔이 돈다 → **실측 825회·누적 141초**, DB 활성시간이
//   7.3h/일 → 13.2h/일로 뛰었다(월 $14 → $25 환산). 사장님이 가장 경계하시는 유형의 사고다.
//   → 결과는 전 지역 통계라 몇 시간 묵어도 칩 개수·링크가 안 바뀐다. 인스턴스 메모리 6시간 캐시.
//     (getAxisDist에 이미 같은 처방을 했고 34회·1.1초로 안정적이다 — 같은 패턴을 적용한다.)
let tasteCountsMem: { at: number; v: Record<string, number> } | null = null;
const TASTE_COUNTS_TTL_MS = 6 * 60 * 60 * 1000;

export async function getRegionTasteCounts(): Promise<Record<string, number>> {
  if (tasteCountsMem && Date.now() - tasteCountsMem.at < TASTE_COUNTS_TTL_MS) return tasteCountsMem.v;
  try {
    // ⚠️ 2026-08-15 수리: 예전엔 6개 축(work/quiet/dessert/roast/mood/space)을 **SQL에 하드코딩**했다.
    //   08-13에 TASTES로 pet·brunch·view를 추가했을 때 이 쿼리가 안 따라와, 신설 축은 항상 0으로 집계됐고
    //   그 결과 **sitemap의 `>= 5` 필터에서 전부 탈락 → 신설 테마 171페이지가 검색엔진에 제출조차 안 됐다**
    //   (실측: 사이트맵 내 pet/brunch/view = 0개, 기존 6축 = 391개). "색인 대기"가 아니라 "미제출"이었다.
    //   → TASTES를 단일 출처로 삼아 동적 생성한다. 앞으로 축을 추가해도 여기가 자동으로 따라간다.
    const cols = TASTES.map((t) =>
      `COUNT(*) FILTER (WHERE COALESCE((char_scores->>'${t.key}')::int,0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>'${t.key}')::int,0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT})::int "${t.key}"`
    ).join(",\n      ");
    const rows = (await sql.query(`SELECT area,
      ${cols}
      FROM cafes WHERE published AND area IS NOT NULL AND area <> '' GROUP BY area`)) as unknown as Record<string, any>[];
    const out: Record<string, number> = {};
    for (const r of rows) for (const t of TASTES) out[`${r.area}|${t.key}`] = Number(r[t.key] ?? 0);
    tasteCountsMem = { at: Date.now(), v: out };
    return out;
  } catch { return tasteCountsMem?.v ?? {}; }
}

// 지역×취향 후기 근거 등급 분포(검증/참고/후보) — 표시 30개가 아닌 전체 모수 기준. 콘텐츠 밀도 보강용 근거 요약.
export type GradeBreakdown = { verified: number; ref: number; candidate: number };
export async function getRegionTasteGradeBreakdown(area: string, tasteKey: string): Promise<GradeBreakdown> {
  try {
    const rows = (await sql`SELECT synth_grade AS grade, count(*)::int n FROM cafes
      WHERE published AND area=${area}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}
      GROUP BY synth_grade`) as unknown as { grade: string | null; n: number }[];
    const find = (g: string) => rows.find((r) => r.grade === g)?.n ?? 0;
    return { verified: find("검증"), ref: find("참고"), candidate: find("후보") };
  } catch { return { verified: 0, ref: 0, candidate: 0 }; }
}

// 동(洞) 단위 프로그래매틱 SEO — "정자동 카페"처럼 실제 검색행태와 가장 가까운 단위(서비스명 "동네" 그 자체).
// 콘텐츠 얇음(thin content) 방지용 최소 카페수 기준은 구 단위(getRegions)와 동일한 5곳.
let dongsMem: { at: number; key: number; v: { area: string; dong: string; n: number }[] } | null = null;
export async function getDongs(minCount = 5): Promise<{ area: string; dong: string; n: number }[]> {
  // 💰 2026-09-05: getRegions와 동일 사유(ISR 재생성마다 풀스캔) — 10분 메모리 캐시.
  if (dongsMem && dongsMem.key === minCount && Date.now() - dongsMem.at < 10 * 60_000) return dongsMem.v;
  try {
    const v = (await sql`SELECT area, dong, count(*)::int n FROM cafes
      WHERE published AND area IS NOT NULL AND area <> '' AND dong IS NOT NULL AND dong <> ''
      GROUP BY area, dong HAVING count(*) >= ${minCount} ORDER BY n DESC`) as unknown as { area: string; dong: string; n: number }[];
    dongsMem = { at: Date.now(), key: minCount, v };
    return v;
  } catch { return dongsMem?.v ?? []; }
}

// 같은 구 안의 다른 동 목록 — 동 페이지 하단 크로스링크(내부링크로 크롤 확산)용.
export async function getDongsInArea(area: string, minCount = 5): Promise<{ dong: string; n: number }[]> {
  try {
    return (await sql`SELECT dong, count(*)::int n FROM cafes
      WHERE published AND area=${area} AND dong IS NOT NULL AND dong <> ''
      GROUP BY dong HAVING count(*) >= ${minCount} ORDER BY n DESC`) as unknown as { dong: string; n: number }[];
  } catch { return []; }
}

export async function getDongCafes(area: string, dong: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local,
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area} AND dong=${dong}
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[];
  } catch { return []; }
}

// 동 공개 카페 곳수 — "N곳" 카피의 실제 값(표시 30개를 곳수로 오용 금지, lib/region.ts regionPublishedCount와 동일 원칙).
export async function getDongPublishedCount(area: string, dong: string): Promise<number> {
  try { return Number(((await sql`SELECT count(*)::int n FROM cafes WHERE published AND area=${area} AND dong=${dong}`)[0] as any)?.n ?? 0); }
  catch { return 0; }
}

/**
 * 🗺️ 지역 축약형 — 제목·설명에 병기해 검색어 정합을 넓힌다(2026-08-15).
 *   실측: 사람들은 "안산 카페"로 치는데 우리 제목은 "안산시"만 있었다.
 *   "인천 연수구"처럼 광역 접두가 붙은 경우 구 이름 단독형도 함께 노출한다.
 */
export function areaAliases(area: string): string[] {
  const out: string[] = [];
  const push = (v: string) => { if (v.length >= 2 && v !== area && !out.includes(v)) out.push(v); };
  const parts = area.split(/\s+/);
  if (parts.length > 1) {
    // 광역 접두형("인천 연수구")은 **구 이름 단독**이 자연스럽다 — "인천 연수 대형카페"는 어색하고
    //   실제로 아무도 그렇게 검색하지 않는다. 자치구명 → 축약 → 광역제거형 순으로 우선한다.
    push(parts[parts.length - 1]);                                    // 인천 연수구 → 연수구
    push(parts[parts.length - 1].replace(/(시|군|구)$/, ""));          // → 연수
  }
  push(area.replace(/(특별시|광역시|시|군|구)$/, ""));                  // 안산시 → 안산
  return out;
}
