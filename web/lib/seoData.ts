import { sql } from "@/lib/db";
import { ownerManagedIds } from "./ownerManaged"; // 🏅 사장님 관리 배지(조건·문구 단일출처)
import { CHAR_AXES } from "./charScore"; // 🎯 도미넌스 필터(아래) — 축 전수를 단일출처에서 뽑는다(신설 축 자동 반영)

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

export type SeoCafe = { om?: number; id: number; name: string; dong: string | null; grade: string | null; count: number | null; identity: string | null; quote: string | null; tasteHits?: number | null;
  /** 🏅 '이 집만의 한 가지' 뱃지 계산용(동네 안 상대비교) — 작은 jsonb라 전송 영향 무시 수준(2026-08-22). */
  char_scores?: Record<string, number> | null;
  /** 🧳🏠 방문객 성격(lib/visitorMix.ts) — REAL 3개라 전송 영향 없음. 판정은 표시 시점(criteria 임계). */
  visitor_n?: number | null; visitor_trip?: number | null; visitor_local?: number | null;
  /** 🔌 카공 시설 사실(합성 시 저장) — [{k:"outlet",n:5}]. 경쟁사가 안 주는 정보라 목록에 세운다. 작은 배열이라 전송 영향 없음. */
  work_facts?: { k: string; n: number }[] | null;
  /** ⚠️ "이건 알고 가세요"(2026-09-14) — 목록 카드에서도 보여준다. 작은 jsonb라 전송 영향 없음.
   *  왜 목록에도: 우리 우위는 '좋은 곳을 찾아준다'가 아니라 **'헛걸음을 막아준다'** 인데,
   *  그 증거가 상세 페이지 안에만 있으면 목록만 보고 떠나는 사람은 영원히 못 느낀다. */
  cautions?: { label: string; emoji: string; count: number; quote?: string }[] | null;
  /** 🅿️ 시설 패싯 — 카드의 시각 앵커(2026-09-14 A안). 작은 text[]라 전송 영향 없음. */
  facets?: string[] | null };

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

// 🎯 도미넌스 필터 — tasteKey가 아닌 다른 축이 그 카페의 진짜 정체성이면 제외(결재#1087, #1033 일반화).
//   #1033은 dessert-vs-roast 조합만 하드코딩해 brunch-vs-quiet·space-vs-quiet 등은 못 걸렀다(3차 재발).
//   → CHAR_AXES 전 축을 대상으로 "다른 축이 유의미(>20)하고 tasteKey축을 8배 이상 압도"하면 제외.
//   ⚠️ dessert/bakery도 예외 없이 이 검사를 받는다(결재#1113) — 예전엔 "자기 제외 방지"로 dessert/bakery를
//   건너뛰었는데, otherAxisKeys()가 이미 tasteKey 자신을 목록에서 빼므로(자기 축은 애초에 비교 대상이 아님)
//   그 예외는 순수 과잉이었다. 소규모 지역(자격카페 5~15곳)에서 brunch/space가 dessert를 8~16배 압도하는
//   카페가 그대로 "디저트 맛집" 상위에 노출되는 사고로 실증(청송군 등 4건).
function otherAxisKeys(tasteKey: string): string[] {
  return CHAR_AXES.map((a) => a.key).filter((k) => k !== tasteKey);
}

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

/** 🏅 목록에 '사장님이 직접 관리' 표시를 붙인다 — 조건·문구는 lib/ownerManaged.ts 단일출처.
 *  구독이 하나도 없으면 조회 한 번으로 끝나고 아무것도 안 붙는다(현재 상태). */
async function withOwnerBadge(list: SeoCafe[]): Promise<SeoCafe[]> {
  if (!list.length) return list;
  const owned = await ownerManagedIds();
  if (!owned.size) return list;
  return list.map((c) => (owned.has(Number(c.id)) ? { ...c, om: 1 } : c));
}

export async function getRegionCafes(area: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return withOwnerBadge((await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local, work_facts, cautions, facets,
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area}
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[]);
  } catch { return []; }
}

// 🍰 정체성과 무관한 대형 카페가 절대 언급량만으로 무관 테마(quiet/work/mood 등) 상위권을 차지하는 편향 방지.
//   결재#1033(2026-09-10 배포)이 dessert-vs-roast 조합만 하드코딩해 걸렀는데, brunch-vs-quiet·space-vs-quiet
//   조합(예: quiet=22인데 space=262가 압도적인 카페)은 못 걸러 3차 재발(결재#1087) — otherAxisKeys()로 일반화.
//   dessert/bakery도 예외 없이 동일 검사를 받는다(결재#1113 — 소규모 지역에서 dessert 자격카페가 몇 곳뿐이면
//   brunch/space가 8배+ 압도하는 카페가 그대로 "디저트 맛집" 상위에 남는 사고가 있었다).
//   ⚠️ neon 태그드 템플릿은 조각 합성이 안 되므로(위 TASTE_MIN_HITS 주석 참조) 아래 4개 쿼리에 같은 문구를 그대로 적는다.
export async function getRegionTasteCafes(area: string, tasteKey: string, limit = 30): Promise<SeoCafe[]> {
  const others = otherAxisKeys(tasteKey);
  try {
    return withOwnerBadge((await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local, work_facts, cautions, facets,
      (char_scores->>${tasteKey})::int AS "tasteHits",
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}
        AND NOT EXISTS (
          SELECT 1 FROM unnest(${others}::text[]) ak(key)
          WHERE COALESCE((char_scores->>ak.key)::int,0) > 20
            AND COALESCE((char_scores->>ak.key)::int,0) >= COALESCE((char_scores->>${tasteKey})::int,0) * 8)
      ORDER BY (char_scores->>${tasteKey})::int DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[]);
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
  const others = otherAxisKeys(tasteKey);
  try {
    const r = (await sql`SELECT count(*)::int n, COALESCE(SUM(synth_count), 0)::int reviews FROM cafes WHERE published AND area=${area}
      AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
      AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}
      AND NOT EXISTS (
        SELECT 1 FROM unnest(${others}::text[]) ak(key)
        WHERE COALESCE((char_scores->>ak.key)::int,0) > 20
          AND COALESCE((char_scores->>ak.key)::int,0) >= COALESCE((char_scores->>${tasteKey})::int,0) * 8)`)[0] as any;
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

export async function computeRegionTasteCounts(): Promise<Record<string, number>> {
  if (tasteCountsMem && Date.now() - tasteCountsMem.at < TASTE_COUNTS_TTL_MS) return tasteCountsMem.v;
  try {
    // ⚠️ 2026-08-15 수리: 예전엔 6개 축(work/quiet/dessert/roast/mood/space)을 **SQL에 하드코딩**했다.
    //   08-13에 TASTES로 pet·brunch·view를 추가했을 때 이 쿼리가 안 따라와, 신설 축은 항상 0으로 집계됐고
    //   그 결과 **sitemap의 `>= 5` 필터에서 전부 탈락 → 신설 테마 171페이지가 검색엔진에 제출조차 안 됐다**
    //   (실측: 사이트맵 내 pet/brunch/view = 0개, 기존 6축 = 391개). "색인 대기"가 아니라 "미제출"이었다.
    //   → TASTES를 단일 출처로 삼아 동적 생성한다. 앞으로 축을 추가해도 여기가 자동으로 따라간다.
    const cols = TASTES.map((t) => {
      const otherAxisList = otherAxisKeys(t.key).map((k) => `'${k}'`).join(",");
      const dominanceFilter = `
        AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[${otherAxisList}]) ak(key)
          WHERE COALESCE((char_scores->>ak.key)::int,0) > 20
            AND COALESCE((char_scores->>ak.key)::int,0) >= COALESCE((char_scores->>'${t.key}')::int,0) * 8)`;
      return `COUNT(*) FILTER (WHERE COALESCE((char_scores->>'${t.key}')::int,0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>'${t.key}')::int,0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}${dominanceFilter})::int "${t.key}"`;
    }).join(",\n      ");
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
  const others = otherAxisKeys(tasteKey);
  try {
    const rows = (await sql`SELECT synth_grade AS grade, count(*)::int n FROM cafes
      WHERE published AND area=${area}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}
        AND NOT EXISTS (
          SELECT 1 FROM unnest(${others}::text[]) ak(key)
          WHERE COALESCE((char_scores->>ak.key)::int,0) > 20
            AND COALESCE((char_scores->>ak.key)::int,0) >= COALESCE((char_scores->>${tasteKey})::int,0) * 8)
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
    return withOwnerBadge((await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local, cautions, facets,
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area} AND dong=${dong}
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[]);
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


// 🅿️ 시설축 페이지용 조회 — 결재 #1083 1단계(2026-09-14).
//   취향(char_scores)과 달리 패싯은 이미 라벨 배열(cafes.facets)로 저장돼 있어 조건이 단순하다.
//   ⚠️ facets에 GIN 인덱스가 있어야 한다(preflight의 '시설 패싯' 뜨거운 쿼리로 감시 중).
export async function getRegionFacetCafes(area: string, label: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return withOwnerBadge((await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local, work_facts, cautions, facets,
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area} AND facets @> ARRAY[${label}]::text[]
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[]);
  } catch { return []; }
}
export async function getRegionFacetCount(area: string, label: string): Promise<number> {
  try { const r = (await sql`SELECT count(*)::int n FROM cafes WHERE published AND area=${area} AND facets @> ARRAY[${label}]::text[]`) as unknown as { n: number }[]; return r[0]?.n ?? 0; } catch { return 0; }
}
/** 전 지역×패싯 카운트 1회 — 칩 표시와 사이트맵이 같은 값을 쓰게 한다(표시와 목록이 어긋나던 과거 버그 방지). */
export async function computeRegionFacetCounts(): Promise<Record<string, number>> {
  try {
    const rows = (await sql`SELECT area, f AS label, count(*)::int n FROM cafes, unnest(facets) f
      WHERE published AND area IS NOT NULL AND facets IS NOT NULL GROUP BY area, f HAVING count(*) >= 5`) as unknown as { area: string; label: string; n: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[`${r.area}|${r.label}`] = Number(r.n);
    return out;
  } catch { return {}; }
}
export async function getRegionFacetGradeBreakdown(area: string, label: string): Promise<GradeBreakdown> {
  try {
    const rows = (await sql`SELECT synth_grade AS grade, count(*)::int n FROM cafes
      WHERE published AND area=${area} AND facets @> ARRAY[${label}]::text[] GROUP BY 1`) as unknown as { grade: string; n: number }[];
    const g = { verified: 0, ref: 0, candidate: 0 };
    for (const r of rows) { if (r.grade === "검증") g.verified = r.n; else if (r.grade === "참고") g.ref = r.n; else g.candidate += r.n; }
    return g;
  } catch { return { verified: 0, ref: 0, candidate: 0 }; }
}


// 🏘️ 동×취향 — 결재 #1083 2단계(CEO 지시 2026-09-14 "지금 열어").
//   왜: 사람이 실제로 치는 형태가 "{동네} {취향} 카페"("연남동 카공 카페")인데 우리는 구 단위뿐이었다.
//   채택 기준은 지역×취향과 **완전히 동일**하다(TASTE_MIN_HITS·TASTE_MIN_RATE_PCT) — 같은 약속을 다른 단위로 지킨다.
//   ⚠️ area+dong+char_scores 조건은 지역×취향과 같은 인덱스를 탄다(preflight로 상시 감시).
export async function getDongTasteCafes(area: string, dong: string, tasteKey: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return withOwnerBadge((await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local, work_facts, cautions, facets,
      (char_scores->>${tasteKey})::int AS "tasteHits",
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area} AND dong=${dong}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>${tasteKey})::int, 0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}
        AND (${tasteKey} IN ('dessert','bakery') OR NOT (
          COALESCE((char_scores->>'dessert')::int,0) > 20
          AND COALESCE((char_scores->>'roast')::int,0) < 5
          AND COALESCE((char_scores->>'dessert')::int,0) >= COALESCE((char_scores->>'roast')::int,0) * 8))
      ORDER BY (char_scores->>${tasteKey})::int DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[]);
  } catch { return []; }
}
/** 전 동×취향 카운트 — **쿼리 1회 + 메모리 캐시**.
 *  ⚠️ 처음엔 취향마다 쿼리를 돌려 11회였다. 이 값은 동 페이지·동×취향 페이지·사이트맵이 모두 부르므로
 *     5,047페이지가 처음 생성될 때 11회 × 5,047 = 5만 5천 쿼리가 될 뻔했다(크롤 몰릴 때 비용 폭발).
 *     지역×취향(getRegionTasteCounts)과 **같은 방식**으로 FILTER 집계 1회 + 6시간 캐시로 맞춘다. */
let dongTasteCountsMem: { at: number; v: Record<string, number> } | null = null;
export async function computeDongTasteCounts(): Promise<Record<string, number>> {
  if (dongTasteCountsMem && Date.now() - dongTasteCountsMem.at < TASTE_COUNTS_TTL_MS) return dongTasteCountsMem.v;
  try {
    const cols = TASTES.map((t) => {
      const skipDominance = t.key === "dessert" || t.key === "bakery";
      const dominanceFilter = skipDominance ? "" : `
        AND NOT (COALESCE((char_scores->>'dessert')::int,0) > 20
          AND COALESCE((char_scores->>'roast')::int,0) < 5
          AND COALESCE((char_scores->>'dessert')::int,0) >= COALESCE((char_scores->>'roast')::int,0) * 8)`;
      return `COUNT(*) FILTER (WHERE COALESCE((char_scores->>'${t.key}')::int,0) >= ${TASTE_MIN_HITS}
        AND COALESCE((char_scores->>'${t.key}')::int,0) * 100 >= COALESCE(synth_count,0) * ${TASTE_MIN_RATE_PCT}${dominanceFilter})::int "${t.key}"`;
    }).join(",\n      ");
    const rows = (await sql.query(`SELECT area, dong,
      ${cols}
      FROM cafes WHERE published AND area IS NOT NULL AND area <> '' AND dong IS NOT NULL AND dong <> ''
      GROUP BY area, dong`)) as unknown as Record<string, any>[];
    const out: Record<string, number> = {};
    for (const r of rows) for (const t of TASTES) {
      const n = Number(r[t.key] ?? 0);
      if (n >= 5) out[`${r.area}|${r.dong}|${t.key}`] = n;   // 5곳 미만은 담지 않는다(사이트맵·칩 기준과 동일)
    }
    dongTasteCountsMem = { at: Date.now(), v: out };
    return out;
  } catch { return dongTasteCountsMem?.v ?? {}; }
}


/** 🇰🇷 받침에 맞는 조사 — "디저트 맛집**를** 찾는다면"처럼 틀린 조사가 수천 페이지에 나갔다(2026-09-14 실측).
 *  한글 마지막 글자의 종성 유무로 고른다. 한글이 아니면(영문·숫자) 뒤 글자를 기준으로 판단할 수 없어 기본값을 쓴다. */
export function josa(word: string, pair: "을/를" | "이/가" | "은/는" | "과/와" | "으로/로"): string {
  const [withJong, withoutJong] = pair.split("/");
  const ch = String(word ?? "").trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return withoutJong;   // 한글이 아니면 받침 없는 쪽
  const jong = (code - 0xac00) % 28;
  if (pair === "으로/로") return jong === 0 || jong === 8 ? withoutJong : withJong;  // ㄹ 받침은 '로'
  return jong === 0 ? withoutJong : withJong;
}


// 🅿️🏘️ 동×시설 — 결재 #1083 확장(CEO 2026-09-14 "동단위로 열었으면 좋겠는데 비용이 많이 들어?").
//   실측 답: 369개뿐이고(주차 142·수제베이킹 66·데이트 39…) 목록 쿼리는 인덱스를 탄다(비용 8.32).
//   ISR 30일이라 하루 12회 재생성 = 약 37쿼리/일. 사실상 공짜다.
//   왜 필요한가: 경쟁사가 1위인 자리가 정확히 "{동네} {시설} 카페"("목동 주차 가능한 카페")다.
export async function getDongFacetCafes(area: string, dong: string, label: string, limit = 30): Promise<SeoCafe[]> {
  try {
    return withOwnerBadge((await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity, char_scores, visitor_n, visitor_trip, visitor_local, work_facts, cautions, facets,
      (SELECT left(r->>'quote', 70) FROM jsonb_array_elements(COALESCE(synth_reviews,'[]'::jsonb)) r
        WHERE COALESCE(r->>'quote','') <> '' ORDER BY COALESCE((r->>'score')::int,0) DESC LIMIT 1) AS quote
      FROM cafes WHERE published AND area=${area} AND dong=${dong} AND facets @> ARRAY[${label}]::text[]
      ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as SeoCafe[]);
  } catch { return []; }
}
/** 전 동×시설 카운트 — 쿼리 1회 + 6시간 캐시(지역×취향과 같은 규약). 5곳 미만은 담지 않는다. */
let dongFacetCountsMem: { at: number; v: Record<string, number> } | null = null;
export async function computeDongFacetCounts(): Promise<Record<string, number>> {
  if (dongFacetCountsMem && Date.now() - dongFacetCountsMem.at < TASTE_COUNTS_TTL_MS) return dongFacetCountsMem.v;
  try {
    const rows = (await sql`SELECT area, dong, f AS label, count(*)::int n FROM cafes, unnest(facets) f
      WHERE published AND dong IS NOT NULL AND dong <> '' GROUP BY area, dong, f HAVING count(*) >= 5`) as unknown as { area: string; dong: string; label: string; n: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[`${r.area}|${r.dong}|${r.label}`] = Number(r.n);
    dongFacetCountsMem = { at: Date.now(), v: out };
    return out;
  } catch { return dongFacetCountsMem?.v ?? {}; }
}


// ═══════════════════════════════════════════════════════════════════════════
// 📦 SEO 카운트 — **집계가 아니라 조회**(2026-09-15)
//
// 🔴 왜 바꿨나(실측): 6시간 메모리 캐시를 걸었는데도 `getRegionFacetCounts`가 하루 **4,406회 · 14GB**를 읽었다.
//   서버리스는 **인스턴스마다 캐시가 따로**라, 크롤러가 새 페이지 4,835개를 동시에 치면 인스턴스 수만큼 집계가 돈다.
//   메모리 캐시로는 못 막는다 — 집계 결과를 테이블에 넣고 페이지는 **작은 테이블 1회 조회**로 끝낸다.
//   집계는 하루 1회 크론(refreshSeoCounts)만 돈다. 4,406회 → 1회.
// ⚠️ 표시와 사이트맵이 같은 값을 써야 한다 — 그래서 단일 테이블 하나로 모은다.
export type SeoCountKind = "region_taste" | "region_facet" | "dong_taste" | "dong_facet";
const countsMem: Partial<Record<SeoCountKind, { at: number; v: Record<string, number> }>> = {};
const COUNTS_TTL_MS = 30 * 60 * 1000;   // 인스턴스 내 30분 — 테이블 조회도 공짜는 아니므로 가볍게만

/** 저장된 카운트를 읽는다. 집계하지 않는다. 테이블이 비어 있으면 빈 객체(페이지는 안전하게 비표시). */
export async function getSeoCounts(kind: SeoCountKind): Promise<Record<string, number>> {
  const m = countsMem[kind];
  if (m && Date.now() - m.at < COUNTS_TTL_MS) return m.v;
  try {
    const rows = (await sql`SELECT key, n FROM seo_counts WHERE kind=${kind}`) as unknown as { key: string; n: number }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.key] = Number(r.n);
    countsMem[kind] = { at: Date.now(), v: out };
    return out;
  } catch { return countsMem[kind]?.v ?? {}; }
}

/** 🕐 하루 1회 갱신 — 크론에서만 부른다. 여기가 유일하게 집계를 도는 곳이다. */
export async function refreshSeoCounts(): Promise<Record<SeoCountKind, number>> {
  const put = async (kind: SeoCountKind, v: Record<string, number>) => {
    const entries = Object.entries(v).filter(([, n]) => n >= 5);
    // 원자적 교체 — 지웠다 넣는 사이에 페이지가 빈 값을 보지 않도록 한 트랜잭션처럼 묶어 쓴다.
    await sql`DELETE FROM seo_counts WHERE kind=${kind}`;
    for (let i = 0; i < entries.length; i += 500) {
      const chunk = entries.slice(i, i + 500);
      await sql`INSERT INTO seo_counts (kind, key, n, updated_at)
        SELECT ${kind}, k, x::int, now() FROM unnest(${chunk.map((e) => e[0])}::text[], ${chunk.map((e) => String(e[1]))}::text[]) AS t(k, x)
        ON CONFLICT (kind, key) DO UPDATE SET n=EXCLUDED.n, updated_at=now()`;
    }
    return entries.length;
  };
  const out = {} as Record<SeoCountKind, number>;
  out.region_taste = await put("region_taste", await computeRegionTasteCounts());
  out.region_facet = await put("region_facet", await computeRegionFacetCounts());
  out.dong_taste = await put("dong_taste", await computeDongTasteCounts());
  out.dong_facet = await put("dong_facet", await computeDongFacetCounts());
  return out;
}

// 호출부를 바꾸지 않기 위한 얇은 래퍼 — 안은 전부 **조회**다(집계 아님).
export const getRegionTasteCounts = () => getSeoCounts("region_taste");
export const getRegionFacetCounts = () => getSeoCounts("region_facet");
export const getDongTasteCounts = () => getSeoCounts("dong_taste");
export const getDongFacetCounts = () => getSeoCounts("dong_facet");
