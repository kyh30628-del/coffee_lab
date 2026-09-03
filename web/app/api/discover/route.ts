import { NextRequest, NextResponse } from "next/server";
import { canonicalGu, areaMatchesRegion } from "@/lib/regionList";
import { currentNotice } from "@/lib/noticeStore";
import { rotateBySido } from "@/lib/sidoRotation";
import { sql } from "@/lib/db";
import { subscriptionLive } from "@/lib/flags";
import { dessertDominance } from "@/lib/charScore";
import { rotateFeatured, rotateByPeriod, dayIndexKST } from "@/lib/exposureRotation";
import { recentN } from "@/lib/reviewDates";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";
export const runtime = "nodejs";

// 🎯 '오늘의 테마' — char_scores 6축과 1:1. dayIndexKST % 길이로 매일 축이 순환한다.
type Theme = { key: string; label: string; emoji: string };
const THEMES: Theme[] = [
  { key: "roast", label: "직접 로스팅에 진심", emoji: "🔥" },
  { key: "work", label: "작업하기 좋은", emoji: "💻" },
  { key: "quiet", label: "조용히 몰입하는", emoji: "🤍" },
  { key: "dessert", label: "디저트까지 완벽한", emoji: "🍰" },
  { key: "mood", label: "분위기 좋은", emoji: "📸" },
  { key: "space", label: "넓고 여유로운", emoji: "🪑" },
];

const REGIONS: Record<string, string[]> = {
  서울: ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"],
  경기: ["수원시","성남시","고양시","용인시","부천시","안산시","안양시","남양주시","화성시","평택시","의정부시","시흥시","파주시","김포시","광명시","광주시","군포시","하남시","오산시","양주시","구리시","안성시","포천시","의왕시","여주시","동두천시","과천시","이천시","양평군","가평군","연천군"],
  인천: ["중구","동구","미추홀구","연수구","남동구","부평구","계양구","서구","강화군","옹진군"],
};
// ⚠️ 2026-08-31 정정(decisions#910): 이 자리에 있던 "2026-07-01 인천 2군9구 개편"(제물포구·영종구·
//   검단구·서해구)은 실존하지 않는 행정구역명이었다(coordination#354) — 실제 인천 10개 구·군으로
//   되돌린다. 예전엔 "동구"⊂"남동구" 부분문자열
//   충돌로 region="인천 동구" 필터가 "인천 남동구"까지 같이 끌어온 적도 있어(실측 확인) area 컬럼이
//   이미 정제된 정확한 키임을 활용해 부분일치 대신 정확히 같은지만 비교하고, guOf도 긴 이름부터 검사한다.
const _longestFirst = (list: string[]) => [...list].sort((a, b) => b.length - a.length);
// 🧭 2026-09-04 — 자체 복제 로직 폐기, 단일출처(lib/regionList) 사용.
//   여기 있던 guOf가 '대전 중구'를 '중구'로 돌려 matchRegion이 실패 →
//   **대전 중구 홈피드가 신규 60곳을 두고 0개를 반환**하던 실사고의 자리다(CEO 발견 건의 연쇄).
const guOf = canonicalGu;
const matchRegion = areaMatchesRegion;
const CHAR_LABELS: Record<string, { label: string; emoji: string }> = {
  roast: { label: "직접로스팅", emoji: "🔥" }, work: { label: "작업하기 좋은", emoji: "💻" },
  quiet: { label: "조용한", emoji: "🤍" }, dessert: { label: "디저트", emoji: "🍰" },
  mood: { label: "분위기", emoji: "📸" }, space: { label: "넓은공간", emoji: "🪑" },
};
// 카페의 "원두·맛의 결" — 리뷰 데이터에서만 (헌법1)
function beanNote(c: any): string[] {
  const cs = c.char_scores ?? {};
  const tags = Object.entries(cs).filter(([, v]: any) => v > 0).sort((a: any, b: any) => b[1] - a[1]).slice(0, 2)
    .map(([k]: any) => CHAR_LABELS[k]?.label ?? k);
  return tags;
}
// created_at ~45일 이내면 '막 발견된' 신규 카페(NEW 배지·숨은 보석 신호)
function isNewCafe(c: any): boolean {
  const t = Date.parse(String(c.created_at ?? ""));
  return !isNaN(t) && Date.now() - t < 45 * 86400000;
}
function reasonFor(c: any, kind: string, theme?: Theme): string {
  const cs = c.char_scores ?? {};
  const cnt = c.synth_count ?? 0;
  const beans = beanNote(c);
  if (kind === "top") return `리뷰 ${cnt}건이 모인 동네 대표 카페. ${beans.length ? beans.join("·") + " 결이 두드러집니다." : "꾸준히 회자되는 곳이에요."}`;
  if (kind === "specialty") {
    const r = cs.roast ?? 0;
    return `직접 로스팅 언급이 ${r}회로 또렷한, 커피에 진심인 집. 검증 등급(리뷰 ${cnt}건)으로 신뢰도도 높아요.`;
  }
  if (kind === "gem") return `검증 등급인데 아직 리뷰 ${cnt}건 — 아직 덜 알려진 숨은 곳이에요.${beans.length ? " " + beans.join("·") + " 결이 잡혀요." : ""}`;
  if (kind === "theme" && theme) return `${theme.label} 신호가 ${cs[theme.key] ?? 0}회로 또렷한 검증 카페(리뷰 ${cnt}건).`;
  if (kind === "fresh") return `최근 우리 지도에 새로 발견된 곳. ${beans.length ? beans.join("·") + " 신호가 잡혔어요." : "리뷰가 쌓이는 중이에요."}`;
  return c.identity ?? "";
}
function slim(c: any, kind = "", theme?: Theme) {
  return { id: c.id, name: c.name, area: c.area, lat: c.lat, lng: c.lng,
    grade: c.synth_grade, count: c.synth_count, identity: c.synth_identity, note: c.note,
    isNew: isNewCafe(c), beanNote: beanNote(c), reason: reasonFor(c, kind, theme) };
}

// 🌏 구(區) 라운드로빈 인터리브 — 구별로 묶어 한 곳씩 번갈아 뽑아 재배열.
//   결과 배열은 인접 원소가 서로 다른 구 → 이 순서로 하루 1칸씩 회전하면 '연속일'이 다른 지역이 된다.
//   (전체 뷰의 id-순 회전이 같은 지역을 며칠씩 이어 노출하던 문제 해소. 지역 필터 뷰는 단일 구라 무영향.)
function interleaveByRegion<T extends { id: number | string; area?: string }>(pool: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of [...pool].sort((a, b) => Number(a.id) - Number(b.id))) { // 그룹 내부는 id 안정
    const g = guOf(c.area ?? "");
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }
  const buckets = [...groups.values()];
  const out: T[] = [];
  for (let i = 0, more = true; more; i++) {
    more = false;
    for (const b of buckets) if (i < b.length) { out.push(b[i]); more = true; }
  }
  return out;
}

export async function GET(req: NextRequest) {
  try {
    // ⚡ 홈 로딩 속도 — ensureSchema()는 이미 오래 안정된 스키마를 매 콜드스타트마다 순차 DDL 4회
    // 왕복으로 재확인했다(무의미). 다른 쓰기 경로에서 계속 보장되므로 이 읽기전용 핫패스는 생략,
    // loadCriteria(노출상한 기준 캐시 프라임)만 유지(2026-07-26, 동작 무변·순수 성능).
    await loadCriteria();
    const region = req.nextUrl.searchParams.get("region") ?? ""; // 시군구 이름(선택)
    const featRowsP = sql`SELECT cafe_id FROM cafe_promos WHERE featured = true AND approved = true AND (featured_until IS NULL OR featured_until > now())` as unknown as Promise<{ cafe_id: number }[]>;
    const all = await sql`
      SELECT id, name, area, lat, lng, synth_grade, synth_count, synth_identity, note, char_scores, created_at, review_dates
      FROM cafes WHERE published = true` as unknown as any[];
    const scope = region ? all.filter((c) => matchRegion(c.area, region)) : all;

    // 정렬된 후보 — 헤드라인 제외 '후' 잘라야 개수가 안 줄어든다(예: Top3가 2개로 줄던 버그)
    const byReview = [...scope].sort((a, b) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
    const byNew = [...scope].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const bySpecialty = scope.filter((c) => c.synth_grade === "검증" && ((c.char_scores ?? {}).roast ?? 0) >= 2 && !dessertDominance(c.char_scores).dominant)
      .sort((a, b) => ((b.char_scores ?? {}).roast ?? 0) - ((a.char_scores ?? {}).roast ?? 0));

    // 💎 슬롯A — 오늘의 숨은 보석: 검증·저노출(리뷰 거인 제외)·최근 살아있음·커피정체성·결있음, 매일 회전.
    //   프라임 자리를 늘 1등에게 주지 않고 '아직 덜 알려진 검증 카페'에 공정히 돌린다(롱테일).
    const GEM_CEILING = getCriterionSync("exposure.gem_ceiling"); // 저노출 기준(폴백 80)
    const gemPool = scope.filter((c: any) =>
      c.synth_grade === "검증"
      && (c.synth_count ?? 0) < GEM_CEILING
      && recentN(c.review_dates, 90) >= 1
      && !dessertDominance(c.char_scores).dominant
      && beanNote(c).length > 0);
    // 구 라운드로빈 인터리브 순서로 회전(preordered) → 전체 뷰 연속일이 다른 지역. cap=5 → 오늘의 1픽(첫자리) +
    //   스와이프로 볼 수 있는 다음 순번 후보 몇 개(홈 '숨은 보석' 섹션을 스와이프 가능하게, CEO 2026-07-25).
    const gemPicks = rotateByPeriod(interleaveByRegion(gemPool), Date.now(), 1, 5, true);
    const gemPick = gemPicks[0];
    // 폴백(지역 pool 비면): 기존 headlineA 로직 = 검증 로스터리 리뷰 1위
    const headlineA = gemPick ? slim(gemPick, "gem") : (() => {
      const vs = scope.filter((c: any) => c.synth_grade === "검증");
      const sr = vs.filter((c: any) => ((c.char_scores ?? {}).roast ?? 0) >= 5).sort((a: any, b: any) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
      const vr = [...vs].sort((a: any, b: any) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
      const pick = sr[0] ?? vr[0] ?? byReview[0];
      return pick ? slim(pick, "top") : null;
    })();
    // 스와이프용 후보 목록(최대 5, 첫 자리=오늘의 1픽). 폴백 시엔 headlineA 하나만.
    const headlineAList = gemPicks.length ? gemPicks.map((c: any) => slim(c, "gem")) : (headlineA ? [headlineA] : []);

    // 🎯 슬롯B — 오늘의 테마: char_scores 축이 매일 순환, 축 상위 8 중 회전(강신호 유지 + 교대).
    const theme = THEMES[((dayIndexKST() % THEMES.length) + THEMES.length) % THEMES.length];
    const scOf = (c: any) => (c.char_scores ?? {})[theme.key] ?? 0;
    const themePool = scope.filter((c: any) =>
      c.synth_grade === "검증" && scOf(c) >= 2 && c.id !== headlineA?.id
      && !dessertDominance(c.char_scores).dominant)  // 커피 브랜드 유지 — 디저트 테마도 '커피 카페 중 디저트 좋은 곳'만(순수 베이커리 제외)
      .sort((a: any, b: any) => scOf(b) - scOf(a)).slice(0, 8);
    // cap=5 → '오늘의 테마'도 스와이프 가능하게(첫자리=오늘의 1픽 + 같은 테마 다음 순번 후보).
    const themePicks = rotateByPeriod(themePool, Date.now(), 1, 5);
    const themePick = themePicks[0];
    // 폴백(테마 pool 비면): 기존 headlineB = 스페셜티(로스팅) 1위, themeB=null이면 클라가 기존 문구로.
    const headlineB = themePick ? slim(themePick, "theme", theme)
      : (() => { const f = bySpecialty.find((c: any) => c.id !== headlineA?.id); return f ? slim(f, "specialty") : null; })();
    const themeB = themePick ? { emoji: theme.emoji, label: theme.label } : null;
    const headlineBList = themePicks.length ? themePicks.map((c: any) => slim(c, "theme", theme)) : (headlineB ? [headlineB] : []);

    const usedIds = new Set([headlineA?.id, headlineB?.id].filter(Boolean));

    // ✨ 우선 노출(featured) — 유료 상품. 기간(featured_until) 만료 시 자동 제외.
    // 🔁 공정 노출: 리뷰 수와 무관하게 구독 카페가 균등하게 순번을 나눈다(다 같은 돈 낸 자리).
    //    피크 시간대엔 짧은 슬라이스로 자주 회전 → 프라임타임(상단 자리 포함)을 모두가 균등히.
    //    scope가 지역(동네)으로 필터돼 있어, 지역 쿼리 시 동네 단위로 순번이 돈다. (lib/exposureRotation.ts)
    const FEAT_CAP = getCriterionSync("exposure.featured_cap"); // 노출상한 단일출처(폴백 6)
    const featRows = await featRowsP; // 위에서 all과 동시 발사됨
    const featSet = new Set(featRows.map((r) => Number(r.cafe_id)));
    const featPool = scope.filter((c) => featSet.has(Number(c.id))); // 리뷰순 아님 — 회전 함수가 균등 순번 결정
    const featured = rotateFeatured(featPool, FEAT_CAP).map((c: any) => ({ ...slim(c, "top"), featured: true }));

    return NextResponse.json({
      ok: true, region: region || "전체", scopeCount: scope.length,
      // 📣 공지를 여기 얹는다 — 별도 엔드포인트를 만들면 접속마다 요청이 하나 늘어난다.
      //   이 응답은 이미 CDN 5분 캐시라 추가 DB 깨움도 사실상 없다(캐시 미스 때 작은 쿼리 1건).
      notice: await currentNotice().catch(() => null),
      featured: subscriptionLive() ? featured : [], // 구독 라이브 전엔 소비자에 '추천 카페' 숨김

      headlineA, headlineB, themeB, headlineAList, headlineBList,
      // 헤드라인 제외 후 잘라서 항상 꽉 채움(공개 카페가 충분하면 Top3=3개)
      // ⚖️ 시·도 순환(lib/sidoRotation.ts) — 순수 정렬이면 후기 많은 수도권이 독식해 강원이 영영 못 오른다.
      //   시·도별 라운드로빈 + 날짜별 시작점 회전으로 4일에 한 번은 각 시·도가 첫 자리에 온다.
      top3: rotateBySido(byReview.filter((c) => !usedIds.has(c.id)), 3).map((c: any) => slim(c, "top")),
      fresh: (() => {
        // 검증 등급이라도 리뷰가 적으면(예: count=6) 신뢰도 낮음 → 최소 리뷰수 기준 추가(제안F)
        // + 디저트 우세 카페는 momentum과 동일 기준으로 제외(결함C, coordination#88 — fresh엔 이 편향완화가 누락돼 있었음)
        const candidates = byNew.filter((c) => !usedIds.has(c.id) && c.synth_grade === "검증" && (c.synth_count ?? 0) >= 20 && !dessertDominance(c.char_scores).dominant).slice(0, 60);
        const areaCnt = new Map<string, number>();
        const deduped: any[] = [];
        for (const c of candidates) {
          const gu = guOf(c.area ?? "");
          const n = areaCnt.get(gu) ?? 0;
          if (n < 1) { deduped.push(c); areaCnt.set(gu, n + 1); }
        }
        return rotateBySido(deduped, 5).map((c: any) => slim(c, "fresh")); // 구 중복제거 후 시·도 순환
      })(),
      specialty: rotateBySido(bySpecialty.filter((c) => !usedIds.has(c.id)), 5).map((c: any) => slim(c, "specialty")),
    }, {
      // 엣지 캐시(지역별로 따로 캐시됨). 추천·featured는 5분 신선도면 충분.
      //   ⚠️ 2026-07-29: 기존엔 s-maxage가 없어 CDN 캐시가 안 걸리고 홈 진입마다 공개카페 전량을 DB에서 재조회했다(주석 의도와 불일치).
      //   s-maxage=300(CDN 5분 캐시)+SWR로 실제 엣지 캐시 활성화 — 브라우저는 재검증(max-age=0), CDN이 5분 흡수해 DB 부하 급감.
      headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
