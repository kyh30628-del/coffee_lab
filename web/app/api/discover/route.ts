import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
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
function guOf(area: string): string {
  const a = (area ?? "").trim();
  if (a.includes("인천")) { for (const g of REGIONS["인천"]) if (a.includes(g)) return "인천 " + g; return "인천"; }
  for (const list of Object.values(REGIONS)) for (const g of list) if (a.includes(g)) return g;
  if (a.includes("구리")) return "구리시";
  return a;
}
// region 파라미터를 DB area와 매칭하는 함수 — 인천 구는 "연수구" → "인천 연수구" 변환
function matchRegion(area: string, region: string): boolean {
  if (!region) return true;
  const a = area ?? "";
  // 🗺️ 인천 동명 구(중구·동구) 구분: region="인천 OO"면 인천만, bare면 인천 제외(서울 중구≠인천 중구)
  if (region === "인천") return a.startsWith("인천");
  if (region.startsWith("인천")) { const gu = region.replace(/^인천\s*/, ""); return a.startsWith("인천") && a.includes(gu); }
  if (a.startsWith("인천")) return false;
  return guOf(area) === region;
}
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

export async function GET(req: NextRequest) {
  try {
    // ⚡ 독립 프라임 병렬 + featRows를 본쿼리(all)와 동시 발사(둘 다 네트워크라 왕복 겹침). 결과·정렬 불변.
    await Promise.all([ensureSchema(), loadCriteria()]); // loadCriteria: 노출상한 기준 캐시 프라임(동기 getCriterionSync가 읽음)
    const region = req.nextUrl.searchParams.get("region") ?? ""; // 시군구 이름(선택)
    const featRowsP = sql`SELECT cafe_id FROM cafe_promos WHERE featured = true AND approved = true AND (featured_until IS NULL OR featured_until > now())` as unknown as Promise<{ cafe_id: number }[]>;
    const all = await sql`
      SELECT id, name, area, lat, lng, synth_grade, synth_count, synth_identity, note, char_scores, created_at, review_dates
      FROM cafes WHERE published = true` as unknown as any[];
    const scope = region ? all.filter((c) => matchRegion(c.area, region)) : all;

    // 정렬된 후보 — 헤드라인 제외 '후' 잘라야 개수가 안 줄어든다(예: Top3가 2개로 줄던 버그)
    const byReview = [...scope].sort((a, b) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
    const byNew = [...scope].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const bySpecialty = scope.filter((c) => c.synth_grade === "검증" && ((c.char_scores ?? {}).roast ?? 0) >= 2)
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
    const gemPick = rotateByPeriod(gemPool)[0];
    // 폴백(지역 pool 비면): 기존 headlineA 로직 = 검증 로스터리 리뷰 1위
    const headlineA = gemPick ? slim(gemPick, "gem") : (() => {
      const vs = scope.filter((c: any) => c.synth_grade === "검증");
      const sr = vs.filter((c: any) => ((c.char_scores ?? {}).roast ?? 0) >= 5).sort((a: any, b: any) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
      const vr = [...vs].sort((a: any, b: any) => (b.synth_count ?? 0) - (a.synth_count ?? 0));
      const pick = sr[0] ?? vr[0] ?? byReview[0];
      return pick ? slim(pick, "top") : null;
    })();

    // 🎯 슬롯B — 오늘의 테마: char_scores 축이 매일 순환, 축 상위 8 중 회전(강신호 유지 + 교대).
    const theme = THEMES[((dayIndexKST() % THEMES.length) + THEMES.length) % THEMES.length];
    const scOf = (c: any) => (c.char_scores ?? {})[theme.key] ?? 0;
    const themePool = scope.filter((c: any) =>
      c.synth_grade === "검증" && scOf(c) >= 2 && c.id !== headlineA?.id
      && !dessertDominance(c.char_scores).dominant)  // 커피 브랜드 유지 — 디저트 테마도 '커피 카페 중 디저트 좋은 곳'만(순수 베이커리 제외)
      .sort((a: any, b: any) => scOf(b) - scOf(a)).slice(0, 8);
    const themePick = rotateByPeriod(themePool)[0];
    // 폴백(테마 pool 비면): 기존 headlineB = 스페셜티(로스팅) 1위, themeB=null이면 클라가 기존 문구로.
    const headlineB = themePick ? slim(themePick, "theme", theme)
      : (() => { const f = bySpecialty.find((c: any) => c.id !== headlineA?.id); return f ? slim(f, "specialty") : null; })();
    const themeB = themePick ? { emoji: theme.emoji, label: theme.label } : null;

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
      featured: subscriptionLive() ? featured : [], // 구독 라이브 전엔 소비자에 '추천 카페' 숨김

      headlineA, headlineB, themeB,
      // 헤드라인 제외 후 잘라서 항상 꽉 채움(공개 카페가 충분하면 Top3=3개)
      top3: byReview.filter((c) => !usedIds.has(c.id)).slice(0, 3).map((c: any) => slim(c, "top")),
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
        return deduped.slice(0, 5).map((c: any) => slim(c, "fresh"));
      })(),
      specialty: bySpecialty.filter((c) => !usedIds.has(c.id)).slice(0, 5).map((c: any) => slim(c, "specialty")),
    }, {
      // 엣지 캐시(지역별로 따로 캐시됨). 추천·featured는 5분 신선도면 충분.
      headers: { "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
