import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { sql, ensureOnce } from "@/lib/db";
import { visitorBadges } from "@/lib/visitorMix";
import KakaoShare from "../../KakaoShare";
import SaveMemoryButton from "./SaveMemoryButton";
import WishButton from "../../WishButton";
import OwnerCtaLink from "./OwnerCtaLink";
import ReportButton from "./ReportButton";
import { publicOwnerContent } from "@/lib/ownerContent";
import VisitorReviews from "../../VisitorReviews";
import RecentCafes from "../../RecentCafes";
import SavedCafes from "../../SavedCafes";
import { buildAxisDist, cafeProfile, extractHighlights, amenityFeaturesOf } from "@/lib/cafeProfile";
import { topCharTraits } from "@/lib/charScore";
import { collectionForCafe } from "@/lib/collections";
import { tasteByKey } from "@/lib/seoData";
import { shareHookText } from "@/lib/shareCopy";
import { sortReviews, ensureRecent } from "@/lib/exposureOrder";
import { isOtherBusinessQuote, displayQuote, splitKeyTerms, rankNearby, nearbyTitle, fmtKm, monthlySeries, freshnessOf, CHAR_LABEL, charBarsOf, addrTail, igHandle, igProfileUrl, reviewAge, type NearbyCafe } from "@/lib/cafeDetailView";
import { extractWorkSignals } from "@/lib/workDetail";
import PlaceCta from "@/app/PlaceCta";
import OutboundLink from "../../OutboundLink";
import { isOwnerManaged } from "@/lib/ownerManaged"; // 🏅 사장님 관리 배지(조건·문구 단일출처)

export const runtime = "nodejs";
// 🌙 2026-09-02 — **수면 시간 확보**(CEO 지시: "자는 시간을 무조건 확보하고 깨어 있는 시간에 집중").
//   실측: DB가 하루 22.6h 깨어 있고 **깨어남이 59~90회/일**. Neon 자동절전은 5분(플랜 하한)이라
//   1초짜리 쿼리로 깨워도 5분이 과금된다 → 90회 × 5분 = **7.5h가 순수 꼬리 낭비**(전체의 33%).
//   크론은 이미 4창에 묶여 있고 01~06시엔 잡이 0개인데도 새벽에 75~166분 깨어 있었다.
//   범인은 크론이 아니라 **ISR 재생성**이었다 — 크롤러가 만료된 페이지를 긁을 때마다 DB가 깬다.
//   재생성 주기를 늘리면 같은 크롤 트래픽에서도 DB를 두드리는 횟수가 그만큼 줄어든다.
//   ⚠️ 신선도는 주기가 아니라 **on-demand purge**가 지킨다(cafeCacheInvalidate·/api/admin/revalidate).
//     공개/비공개 변경은 즉시 반영되고, 후기·순위만 최대 주기만큼 늦어진다(천천히 변하는 값).
export const revalidate = 2592000; // ISR 30일 — 🌙 2026-09-09 새벽 절전: 7일이면 23,362곳이 주 1회 재생성되고
//   그 재생성이 크롤러를 따라 새벽에 몰려 DB가 못 잔다. 데이터가 바뀌면 lib/cafeCacheInvalidate가 즉시 지운다.

// 🔴 2026-08-28 비용 근본수리: 위 `revalidate`가 **작동하지 않고 있었다.**
//   Next 문서(generate-static-params.md): "ISR로 런타임에 재검증하려면 generateStaticParams에서
//   빈 배열을 반환해야 한다. 배열을 반환하지 않으면 라우트는 동적으로 렌더링된다."
//   실측: 빌드 산출물 `ƒ /c/[id]`(동적) · 프로덕션 헤더 `no-store` + x-vercel-cache MISS 3회 연속.
//   같은 앱의 /area/[gu]·/taste/[type]은 이 함수가 있어서 `●`(SSG·엣지 HIT)였다 — 상세만 빠져 있었다.
//   결과: 구글에 올라간 공개 카페 18,000여 페이지를 봇이 훑을 때마다 매번 DB를 깨웠고,
//   그래서 Neon이 62일 중 2.3시간밖에 자지 못했다(요금=활성시간×CU라 이게 청구서의 본체).
//
//   빈 배열인 이유: 전 카페를 빌드에 넣으면 빌드마다 18,000페이지를 생성한다(빌드시간=Vercel 비용).
//   빈 배열이면 **빌드 비용 증가 0**, 첫 방문 때 만들어 48시간 캐시 = 봇 재방문은 엣지가 받는다.
//   비공개 처리 시 즉시 반영도 유지된다 — lib/cafeCacheInvalidate.ts 가 이미 revalidatePath(`/c/${id}`)
//   를 호출하고, ISR 페이지는 그 호출로 엣지 캐시까지 무효화된다(동적 페이지였을 땐 이 무효화가 무의미했다).
export async function generateStaticParams() {
  return [];
}

// 전체 카페 결 분포(강·약 판단용).
// 💰 2026-08-13 수리: react cache()는 **요청 내** 메모라, ISR 재생성마다 공개 13,495행을 통째로 읽었다.
//   지난달 ISR 쓰기 45만건(크롤러가 sitemap 14,635 URL 순회) = 그만큼 이 전수 스캔이 반복됐다는 뜻.
//   분포는 전 카페 통계라 몇 시간 묵어도 강·약 판정이 안 바뀐다 → 인스턴스 메모리 6시간 캐시로 전환.
//   웜 인스턴스에서 크롤 폭주가 와도 스캔은 6시간에 1회. (요청 내 중복 방지용 cache()는 유지)
let axisDistMem: { at: number; v: ReturnType<typeof buildAxisDist> } | null = null;
const AXIS_TTL_MS = 6 * 60 * 60 * 1000;
const getAxisDist = cache(async () => {
  if (axisDistMem && Date.now() - axisDistMem.at < AXIS_TTL_MS) return axisDistMem.v;
  try {
    const v = buildAxisDist((await sql`SELECT char_scores, synth_count FROM cafes WHERE published AND char_scores IS NOT NULL`) as any[]);
    axisDistMem = { at: Date.now(), v };
    return v;
  } catch { return axisDistMem?.v ?? buildAxisDist([]); }
});

const SITE = "https://dongnecoffeenote.com";
const CHAR: Record<string, string> = { roast: "🔥 직접로스팅", work: "💻 작업하기 좋은", quiet: "🤍 조용한", dessert: "🍰 디저트", mood: "📸 분위기", space: "🪑 넓은공간", pet: "🐶 애견동반", brunch: "🥐 브런치", view: "🌄 뷰 좋은", bakery: "🥖 베이커리", terrace: "🌿 테라스·야외" };

type Props = { params: Promise<{ id: string }> };

// 🔴 2026-08-30 장애 재발방지: 이 함수의 catch가 **모든 실패를 404로 바꾼다.**
//   그날 area_rank/area_total을 SELECT에 추가하면서 컬럼 생성(cron-enrich)보다 배포가 먼저 나갔고,
//   "column does not exist"가 이 catch에 먹혀 **공개 카페 전체가 404**가 됐다.
//   더 나쁜 건 ISR이 그 404를 48시간 캐시한다는 점 — DB를 고쳐도 페이지는 계속 404였다(재배포로 해소).
//   ⚠️ 규칙: 이 SELECT에 컬럼을 추가할 때는 **먼저 ALTER로 컬럼을 만들고 나서** 배포한다.
//     스키마 변경을 크론에만 맡기지 말 것 — 크론은 배포보다 늦게 돈다.
async function getCafe(id: string) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return (await sql`SELECT c.id, c.name, c.area, c.dong, c.address, c.lat, c.lng, c.synth_grade, c.synth_identity, c.synth_count, c.char_scores, c.synth_reviews_all, c.synth_reviews, c.reputation_note, c.synth_quality, c.visitor_n, c.visitor_trip, c.visitor_local, c.area_rank, c.area_total, c.review_dates, c.cautions, c.instagram_url, c.facets,
      COALESCE(dt.is_tourist, false) AS dong_tourist
      FROM cafes c LEFT JOIN dong_tourism dt ON dt.area = c.area AND dt.dong = c.dong
      WHERE c.id=${n} AND c.published=true LIMIT 1`)[0] as any ?? null;
  } catch { return null; }
}
// 등급(검증/참고/후보)→JSON-LD aggregateRating.ratingValue 근사치. 별점을 직접 수집하지 않으므로 등급 기반 대리값.
const GRADE_RATING: Record<string, number> = { "검증": 4.8, "참고": 4.5, "후보": 4.2 };
function topTags(cs: any): string[] {
  if (!cs || typeof cs !== "object") return [];
  return Object.entries(cs).filter(([k, v]) => CHAR[k] && (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 4).map(([k]) => CHAR[k]);
}

// AI답변엔진(ChatGPT 등) 인용 최적화용 FAQ — 실제 페이지 데이터로만 생성, 데이터 없으면 문항 생략(coordination#226/decisions#424)
function buildFaq(c: any, grade: string, highlights: { emoji: string; label: string; count: number }[], profile: any, tags: string[]): { q: string; a: string }[] {
  const faqs: { q: string; a: string }[] = [];
  if (c.synth_identity) {
    faqs.push({ q: `${c.name}은(는) 어떤 카페인가요?`, a: c.synth_identity });
  }
  if (grade && (c.synth_count ?? 0) > 0) {
    faqs.push({
      q: `${c.name}의 검증등급은 무엇인가요?`,
      a: `동네 커피 노트가 네이버 공개 후기 ${c.synth_count}건을 교차검증해 '${grade}' 등급을 부여했어요. 옆가게·동명·광고성 후기는 제외하고 실제 방문 후기만 반영합니다.`,
    });
  }
  if (highlights.length > 0) {
    faqs.push({ q: `${c.name}의 특징은 무엇인가요?`, a: `후기에서 가장 많이 언급된 특징은 ${highlights.slice(0, 3).map((h) => h.label).join(", ")}이에요.` });
  } else if (tags.length > 0) {
    faqs.push({ q: `${c.name}의 특징은 무엇인가요?`, a: `후기에서 자주 언급되는 결은 ${tags.join(", ")}이에요.` });
  }
  if (profile.ok && (profile.strong.length > 0 || profile.weak.length > 0)) {
    const parts: string[] = [];
    if (profile.strong.length > 0) parts.push(`강점은 ${profile.strong.map((s: any) => s.text).join(", ")}이에요(전체 카페 평균 대비)`);
    if (profile.weak.length > 0) parts.push(`아쉬운 점은 ${profile.weak.map((w: any) => w.text).join(", ")}이에요`);
    faqs.push({ q: `${c.name}의 강점과 아쉬운 점은 무엇인가요?`, a: `${parts.join(". ")}.` });
  }
  const locParts = [c.area, c.dong].filter(Boolean).join(" ");
  if (c.address || locParts) {
    faqs.push({ q: `${c.name}은 어디에 있나요?`, a: c.address ? `${c.address} (${locParts})에 있어요.` : `${locParts}에 있어요.` });
  }
  return faqs;
}

// ⚠️ 체크표시(✓)는 OG 폰트에 없어서 두부(□)로 깨진다 — 운영 로그의 "Failed to load dynamic font for ✓"가 이것이다.
//   글자만 쓴다(2026-09-10 로컬 렌더로 확인).
const OG_GRADE_BADGE: Record<string, string> = { "검증": "검증", "참고": "참고" };
/** 카페 한 곳의 OG 카드 URL — 이미지에 필요한 값만 쿼리로 넘긴다(이미지 라우트는 DB를 안 읽는다). */
function ogUrl(c: any): string {
  const loc = [c.area, c.dong].filter(Boolean).join(" ");
  const p = new URLSearchParams({
    t: String(c.name ?? ""),
    s: String(c.synth_identity ? String(c.synth_identity).slice(0, 60) : loc),
    f: `${loc} · 진짜 후기로 검증`,
  });
  const badge = (c.synth_grade && OG_GRADE_BADGE[c.synth_grade]) || c.synth_grade;
  if (badge) p.set("b", String(badge));
  const traits = topCharTraits(c.char_scores, 2);
  if (traits?.length) p.set("r", traits.join("|"));
  return `${SITE}/api/og/cafe?${p.toString()}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const c = await getCafe(id);
  if (!c) return { title: "카페를 찾을 수 없어요 — 동네 커피 노트" };
  const title = `${c.name} (${c.area}) — 동네 커피 노트`;
  const desc = ((c.synth_identity || `${c.area}의 카페 ${c.name}.`) + ` 네이버 공개 후기 ${c.synth_count ?? 0}건을 데이터로 교차검증했어요.`).slice(0, 155);
  const url = `${SITE}/c/${c.id}`;
  return {
    title, description: desc,
    alternates: { canonical: url },
    // 🌙 2026-09-10: og:image를 **DB를 안 치는** /api/og/cafe 로 돌린다(CEO 결재).
    //   예전엔 같은 폴더 opengraph-image.tsx가 자동 적용됐는데, 크롤러가 이미지를 가져갈 때마다
    //   그 라우트가 자기 요청으로 DB를 쳤다(2026-09-09 새벽 8시간에 2,146회·전부 캐시 미스).
    //   필요한 값은 여기서 이미 읽어둔 c 하나로 충분하다 → 쿼리에 실어 보내면 이미지 쪽 DB 접속 0.
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "article", locale: "ko_KR", images: [ogUrl(c)] },
    twitter: { card: "summary_large_image", title, description: desc, images: [ogUrl(c)] },
  };
}

async function getPublicReviews(cafeId: number) {
  try {
    // 💰 2026-08-20: 이 ALTER가 **ISR 재생성마다**(공개 13,517페이지) 돌고 있었다 — 배포 단위 1회로.
    await ensureOnce("c-id.user_visits.is_public", async () => {
      await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`;
    }).catch(() => {});
    const rows = await sql`SELECT memory, photos, photo_url, favorite, created_at FROM user_visits
      -- 🔐 승인 게이트(결재 #1084, 2026-09-14): **사진이 붙은 기록은 관리자 승인 후에만** 노출한다.
      --   남의 가게에 엉뚱한·부적절한 사진이 걸리면 우리 해자가 통째로 무너진다. 글만 있는 기록은 종전대로.
      WHERE cafe_id=${cafeId} AND is_public=true AND finalized=true AND verified=true
        AND (COALESCE(memory,'')<>'' OR photo_url IS NOT NULL)
        AND (photo_approved = true OR (photo_url IS NULL AND jsonb_array_length(COALESCE(photos,'[]'::jsonb)) = 0))
      ORDER BY created_at DESC LIMIT 20`;
    return (rows as any[]).map((r) => ({ memory: r.memory || "", photos: Array.isArray(r.photos) && r.photos.length ? r.photos : (r.photo_url ? [r.photo_url] : []), favorite: !!r.favorite, date: r.created_at ? new Date(r.created_at).toISOString() : undefined }));
  } catch { return []; }
}

// 📍 근처 카페(2026-09-20 CEO 승인) — 종전엔 같은 시군구(area) 안에서 결 유사도로 골라 "이 동네 비슷한 곳"이라 불렀다.
//   실측: 서귀포시 성산읍 카페의 '이 동네'가 31·67·71km 떨어진 곳이었다(시군구가 넓으면 동네가 아니다).
//   → 순서를 **같은 읍면동 → 반경 10km → 같은 시군구**로 바꾸고, 화면엔 실제 거리(km)를 적는다.
//   비용: 좌표 박스 조회 1회(부분 인덱스 idx_cafes_geo(lat,lng) WHERE published — 09-20 실재 확인). 박스 안이 6곳 미만인
//   희소 지역만 시군구 조회 1회를 보탠다. 좌표 없는 카페는 종전 시군구 조회로 폴백(회귀 없음).
// 💰 2026-09-25 비용수리(decision#1255) — char_scores 포함 넓은 행(최대 120행)을 페이지뷰마다 반복 조회해
//   cost_guard 자동정지(210,739회 호출·104.52GB)를 유발했다. 결과는 몇 시간 묵어도 안 바뀌는 값(발굴·재합성
//   주기)이라 unstable_cache로 카페id당 6시간 캐시 — SEO 페이지라 실시간성 불요, 크롤러 반복조회를 흡수한다.
//   순위 계산(rankNearby)은 순수함수라 캐시 밖에서 매번 돌려도 조회 비용이 0이다.
const getNearbyRows = unstable_cache(
  async (excludeId: number, lat: number | null, lng: number | null, dong: string | null, area: string): Promise<any[]> => {
    try {
      let rows: any[] = [];
      if (typeof lat === "number" && typeof lng === "number") {
        const dLat = 0.09, dLng = 0.11; // ≈ 위도 10km · 경도 10km(북위 35~38°)
        rows = (await sql`SELECT id, name, synth_grade, synth_count, char_scores, area, dong, lat, lng FROM cafes
          WHERE published=true AND id<>${excludeId} AND lat IS NOT NULL
            AND lat BETWEEN ${lat - dLat} AND ${lat + dLat} AND lng BETWEEN ${lng - dLng} AND ${lng + dLng}
          ORDER BY (dong = ${dong ?? ""} AND area = ${area}) DESC, COALESCE(synth_count,0) DESC LIMIT 80`) as any[];
      }
      if (rows.length < 6) {
        const more = (await sql`SELECT id, name, synth_grade, synth_count, char_scores, area, dong, lat, lng FROM cafes
          WHERE published=true AND area=${area} AND id<>${excludeId}
          ORDER BY COALESCE(synth_count,0) DESC LIMIT 40`) as any[];
        const seen = new Set(rows.map((r) => r.id));
        for (const r of more) if (!seen.has(r.id)) rows.push(r);
      }
      return rows;
    } catch { return []; }
  },
  ["c-id.nearby-rows"],
  { revalidate: 6 * 60 * 60 },
);
async function getNearby(c: any): Promise<NearbyCafe[]> {
  const excludeId = Number(c.id);
  const lat = typeof c.lat === "number" ? c.lat : null;
  const lng = typeof c.lng === "number" ? c.lng : null;
  try {
    const rows = await getNearbyRows(excludeId, lat, lng, c.dong ?? null, c.area);
    return rankNearby(c, rows);
  } catch { return []; }
}
export default async function CafePage({ params }: Props) {
  const { id } = await params;
  const c = await getCafe(id);
  if (!c) notFound();
  const tags = topTags(c.char_scores);
  const userReviews = await getPublicReviews(c.id);
  const nearby = await getNearby(c);
  const grade = c.synth_grade || "";
  const ownerManaged = await isOwnerManaged(Number(c.id)); // 🏅 구독·체험 유효한 사장님 카페인가(단일출처)
  // 인앱 상세와 동일: 강·약(전체 대비) + 옥석 리뷰 데이터 핵심
  const profile = cafeProfile({ char_scores: c.char_scores, synth_count: c.synth_count }, await getAxisDist());
  // 🔴 2026-08-17: 이 SEO 상세는 리뷰 배열을 **정렬 없이 원본 순서로** 하이라이트에 넣고 있었다.
  //   앱 상세(/api/cafe-detail)는 ensureRecent(sortReviews(확신도·타지점·광고템플릿 3관문))를 타는데 여기만 안 탔다.
  //   구글에 색인되는 면이 정작 방어를 안 받던 셈이라, 같은 함수를 태워 두 경로를 일치시킨다.
  //   비용 0 — 이미 읽어온 배열에 대한 순수함수 정렬이라 추가 조회가 없다.
  const evRaw = (c.synth_reviews_all ?? c.synth_reviews ?? []) as any[];
  const evAll = Array.isArray(evRaw)
    ? ensureRecent(sortReviews(evRaw, c.name ?? "", [c.area, c.dong].filter(Boolean) as string[], Date.now(), c.dong))
    : [];
  const quotesAll = evAll.map((e: any) => e?.quote || "");
  // 📖 화면에 보여줄 후기(2026-09-20) — 이 페이지는 후기 100건을 읽어 통계만 뽑고 **문장은 한 줄도 안 보여주고 있었다.**
  //   대표님: "상세 페이지 열어서 문구들이 제대로 보이냐? 글자만 오지게 많고 난장판". 통계·방법론·면책만 있고 정작
  //   사람이 쓴 말이 없었다. 정렬 순서 그대로 최대 3건. 2건 미만이면 안 보여준다.
  //   🔴 2026-09-22: '읽히는 문장만' 관문 폐지(최신 검증 후기가 통째로 사라지던 원인, CEO 지적). 다른 업종 글만 빼고
  //   정렬(검증 우선·최신순) 그대로 보여주되, 제목 조각·정보카드는 displayQuote가 다듬어 제목 줄로 렌더한다.
  const readable = evAll.filter((e: any) => !isOtherBusinessQuote(e?.quote, c.name ?? "") && !displayQuote(e?.quote, c.name ?? "").empty);
  const shownQuotes = readable.slice(0, 3);
  const moreQuotes = readable.slice(3, 12); // 접힘 — 페이지 길이는 안 늘고 정보는 있다
  const showQuotes = shownQuotes.length >= 2;
  const highlights = extractHighlights(quotesAll, 6, evAll.map((e: any) => e?.date)); // 🕰️ 최근 후기 가중(09-24)
  // 💻 카공 세부 신호(2026-08-17) — "작업하기 좋음" 한 축으로 뭉뚱그리던 것을 콘센트·와이파이·자리로 쪼갠다.
  //   실측: 테마 수요 상위 8개 중 7개가 카공인데 정작 카공족이 묻는 건 이 시설 정보였다.
  //   ⚠️ 추가 조회 0(이미 읽은 인용문 재사용) · LLM 0(규칙) · 근거 없으면 아무것도 안 그린다.
  const work = extractWorkSignals(quotesAll);
  // 🛡️ 검증 근거 공개(2026-08-17) — 우리 해자의 증거가 synth_quality에 다 있는데 화면엔 한 글자도 안 나갔다.
  //   /trust 페이지로 따로 빼뒀더니 30일 방문 **1명**이었다. 설명을 별도 페이지에 가두면 아무도 안 읽는다.
  //   → 이 카페의 실제 숫자로, 결정하는 화면 안에서 보여준다. 추가 조회 없이 같은 행에서 읽는다.
  const oc = await publicOwnerContent(Number(c.id)).catch(() => null); // 📷✍ 사장님 사진·한마디(구독 활성일 때만 값)
  const sq = (c.synth_quality ?? null) as any;
  const sqRaw = Number(sq?.raw ?? 0);
  // 🕒 최신성 — review_dates는 검증+참고 후기의 발행일("YYYY.MM.DD") 배열. 최근 12개월 건수·최신 월·1년 공백 여부.
  const freshness = freshnessOf(c.review_dates);
  const faqs = buildFaq(c, grade, highlights, profile, tags);
  const faqJsonLd = faqs.length > 0 ? {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  } : null;
  // 🧭 BreadcrumbList(2026-08-13, 구글 채널 강화) — 홈 > 지역 > 카페. 검색결과 계층 표시 + 구조 이해.
  // 📝 Review JSON-LD(2026-09-01, coordination#357/전략기획 5회 제언) — 검증 후기 원문을 구조화 마크업으로 노출.
  //   evAll은 이미 sortReviews(확신도·타지점·광고템플릿)로 걸러진 배열이라 오염 방어가 그대로 적용된다.
  //   개별 별점은 수집하지 않으므로 reviewRating은 넣지 않는다(아래 aggregateRating은 등급 기반 대리값, #77행).
  //   작성자는 실명·닉네임을 저장하지 않으므로(개인정보0 원칙) 고정 라벨을 쓴다.
  const reviewsForLd = evAll
    .map((e: any) => ({ quote: String(e?.quote || "").trim(), date: e?.date }))
    .filter((e) => e.quote.length >= 15 && e.quote.length <= 500)
    .slice(0, 5)
    .map((e) => ({
      "@type": "Review",
      reviewBody: e.quote.slice(0, 300),
      author: { "@type": "Person", name: "동네 커피 노트 검증 방문자" },
      ...(typeof e.date === "string" && /^\d{4}\.\d{2}\.\d{2}$/.test(e.date) ? { datePublished: e.date.replace(/\./g, "-") } : {}),
    }));
  const breadcrumbLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "동네 커피 노트", item: SITE },
      { "@type": "ListItem", position: 2, name: `${c.area} 카페`, item: `${SITE}/area/${encodeURIComponent(c.area)}` },
      { "@type": "ListItem", position: 3, name: c.name, item: `${SITE}/c/${c.id}` },
    ],
  };
  const jsonLd = {
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop",
    name: c.name,
    address: {
      "@type": "PostalAddress",
      ...(c.address ? { streetAddress: c.address } : {}),
      addressLocality: c.dong || c.area,
      addressRegion: c.area,
      addressCountry: "KR",
    },
    url: `${SITE}/c/${c.id}`, servesCuisine: "Coffee",
    ...(typeof c.lat === "number" && typeof c.lng === "number" ? { geo: { "@type": "GeoCoordinates", latitude: c.lat, longitude: c.lng } } : {}),
    ...(c.synth_identity ? { description: c.synth_identity } : {}),
    ...(Array.isArray(c.facets) && c.facets.length > 0 ? { amenityFeature: amenityFeaturesOf(c.facets) } : {}),
    ...(c.synth_count > 0 ? {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: GRADE_RATING[c.synth_grade] ?? 4.2,
        reviewCount: c.synth_count,
        bestRating: 5, worstRating: 1,
      },
      ...(reviewsForLd.length > 0 ? { review: reviewsForLd } : {}),
    } : {}),
  };
  // 🗺️ 지도 딥링크(2026-09-12) — 좌표를 실어 보내 지도 탭이 이 카페로 줌인하고 핀을 강조한다.
  //   좌표가 없는 카페(지오코딩 전)는 예전 링크로 폴백해 회귀가 없다.
  const mapHref = (typeof c.lat === "number" && typeof c.lng === "number")
    ? `/?cafe=${c.id}&clat=${c.lat}&clng=${c.lng}&cz=17`
    : `/?cafe=${c.id}`;
  // 📓 2026-09-20 2차(CEO 승인 시안 → 적용). "한 권의 노트"는 유지 — 줄(34px)·여백선·도장·찢은 띠·손글씨 판정.
  //   바뀐 것: 본문 명조·이름 Hahmlet·라벨 고딕(글씨 종류 3), 이모지 0, 강조색 커피 하나,
  //   정보 블록 추가(주소·인스타·자주 나온 말·후기 더 읽기·결 막대·상위% 타일·후기 흐름·근처 거리),
  //   CTA는 하단 고정 2개로. 정보 구조·링크·JSON-LD는 그대로(SEO 무변). 추가 조회는 근처 좌표 박스 1회뿐.
  const stampKind = grade === "참고" ? "ref" : grade === "후보" ? "cand" : "";
  const stampEn = grade === "검증" ? "VERIFIED" : grade === "참고" ? "REFERENCE" : "CANDIDATE";
  const series = monthlySeries(c.review_dates);
  const seriesMax = series ? Math.max(1, ...series.map((m) => m.n)) : 1;
  const seriesLast = series ? series.reduce((acc, m, i) => (m.n > 0 ? i : acc), -1) : -1;
  const charBars = charBarsOf(c.char_scores);
  const barMax = charBars.length ? Number(charBars[0][1]) : 1;
  const addrRest = addrTail(c.address, c.area, c.dong);
  const ig = igHandle(c.instagram_url);
  const facts = highlights.slice(0, 4);
  const vBadges = visitorBadges({ n: c.visitor_n ?? 0, trip: c.visitor_trip ?? 0, local: c.visitor_local ?? 0 });
  const showRank = typeof c.area_rank === "number" && c.area_rank <= 10 && (c.area_total ?? 0) >= 20;
  const nearTitle = nearbyTitle(nearby, c.area, c.dong);
  const checkedOn = new Date().toISOString().slice(0, 10);
  const srcLine = (
    <p className="nt-src">네이버 공개 후기 {(c.synth_count ?? 0).toLocaleString()}건 교차검증 · 영수증 리뷰·광고·협찬 제외 · {checkedOn} 확인</p>
  );
  const quoteOf = (e: any, i: number) => {
    const dq = displayQuote(e?.quote, c.name ?? "");
    const body = splitKeyTerms(dq.text).map((seg, j) => seg.k ? <mark key={j} className="nt-key">{seg.t}</mark> : <span key={j}>{seg.t}</span>);
    return (
      <blockquote key={e?.link ?? i} className={dq.readable ? "nt-q" : "nt-q t"}>
        {dq.readable ? <>“{body}”</> : body}
        {(e?.source || e?.date) && (() => { const ag = reviewAge(e?.date); return <span className="m">{e?.source ?? ""}{ag?.old ? <span className="nt-old">{ag.ym} · {ag.ago} 후기</span> : e?.date ? ` · ${String(e.date).slice(0, 7)}` : ""}</span>; })()}
      </blockquote>
    );
  };
  const themed = Object.entries((c.char_scores ?? {}) as Record<string, number>)
    .filter(([k, v]) => Number(v) > 0 && tasteByKey(k))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, 2)
    .map(([k]) => tasteByKey(k)!);
  const col = collectionForCafe(c.dong, c.area);
  const IcoPin = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="10" r="2.6"/></svg>;
  const IcoInfo = () => <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>;
  return (
    <main className="min-h-screen nt-paper nt-detail">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}
      {/* 서체는 layout에서 로드(Noto Serif KR·Pretendard) — 여기서 따로 싣지 않는다 */}
      <div className="max-w-xl mx-auto nt-page pb-6" style={{ ["--nt-mx" as any]: "36px" }}>
        {/* 장식 — 잔 자국 하나, 오른쪽 위에 반쯤 걸쳐서 */}
        <div className="nt-ring" aria-hidden style={{ right: -78, top: 96, width: 220 }} />

        {/* 첫 줄: 뒤로 · 공유 */}
        <div className="nt-ruled nt-margin-gutter flex items-center justify-between gap-2 relative z-[1]" style={{ paddingTop: 34 }}>
          <Link href="/" className="nt-g text-[12.5px] text-[#63523f]">← 동네 커피 노트</Link>
          <span className="nt-free">
            <KakaoShare
              title={`${c.name} (${c.area})`}
              description={shareHookText(grade, c.synth_identity)}
              imageUrl={`${SITE}/c/${c.id}/opengraph-image`}
              link={`${SITE}/c/${c.id}`}
              source="카페상세"
              className="inline-flex items-center gap-1.5 bg-[#FEE500] text-[#3c1e1e] rounded-full pl-2.5 pr-3 py-1 text-[12px] font-bold nt-g"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#3c1e1e"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.6.1 1.3.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>
              공유
            </KakaoShare>
          </span>
        </div>

        {/* 머리 — 등급줄 · 이름 · 주소 · 인스타 · 배지. 도장은 오른쪽. */}
        <header className="nt-ruled nt-margin-gutter relative z-[1] nt-band nt-torn-b" style={{ paddingTop: 34, paddingBottom: 34, paddingRight: grade ? 100 : 20, ["--nt-rule" as any]: "rgba(84,104,140,0.22)" }}>
          {grade && (
            <div className={`nt-stamp in absolute ${stampKind}`} style={{ right: 16, top: 30 }} aria-label={`등급 ${grade}`}>{grade}<small>{stampEn}</small></div>
          )}
          <div className={`nt-grade ${stampKind}`}>{grade || "카페"} · 후기 {(c.synth_count ?? 0).toLocaleString()}건</div>
          <h1 className={`nt-name ${String(c.name).length > 12 ? "long" : ""}`}>{c.name}</h1>
          <p className="nt-addr"><IcoPin /><span><b>{c.area}{c.dong ? ` ${c.dong}` : ""}</b>{addrRest ? ` ${addrRest}` : ""}</span></p>
          {/* 인스타 줄 — 오른쪽 끝(도장 바로 아래)에 ❤ 추억 저장 */}
          <div className="nt-mem-line" style={{ marginRight: grade ? -80 : 0 }}>
            {ig ? (
              <a className="nt-ig" href={igProfileUrl(c.instagram_url) ?? undefined} target="_blank" rel="noopener noreferrer nofollow">
                <svg viewBox="0 0 24 24" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17.4" cy="6.6" r=".9" fill="currentColor" stroke="none"/></svg>
                <span>@{ig}</span>
              </a>
            ) : <span />}
            <span className="nt-free"><SaveMemoryButton cafeId={c.id} cafeName={c.name} cafeArea={c.area} variant="pill" /></span>
          </div>
          {(ownerManaged || showRank || vBadges.length > 0 || c.dong_tourist) && (
            <div className="nt-chips">
              {ownerManaged && <span title="사장님이 직접 정보를 관리하는 카페예요" className="nt-chip soft">사장님 관리</span>}
              {/* 🏅 동네 순위 — 상위 10위 이내만(낮은 순위는 그 카페에 해가 된다). cron-enrich가 하루 2회 계산(조회 0). */}
              {showRank && (
                <span className="nt-mark nt-g text-[12.5px] text-[#5c4b3c]">
                  {c.area} {c.area_total}곳 중 <b className="text-[#7a5122]">{c.area_rank}위</b>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden><path d="M8 20 C 10 6, 40 3, 62 6 S 96 14, 92 24 S 60 38, 36 36 S 3 30, 9 18 S 24 8, 40 9" /></svg>
                </span>
              )}
              {/* 🧳🏠 방문객 성격 — "이 후기를 누가 썼나". 두 배지는 배타적이지 않다. */}
              {vBadges.map((b) => <span key={b.key} className="nt-chip good" title={b.note}>{b.label}</span>)}
              {/* 📰 동 단위 뉴스 판정 — 후기 말투(위)와 별개의 '위치 속성'. */}
              {c.dong_tourist && <span className="nt-chip" title="언론 보도 기준">관광지로 알려진 동네</span>}
            </div>
          )}
        </header>

        {/* ✍ 우리가 읽고 적은 판정 — 손글씨 한 줄 + 후기에 자주 나온 말 */}
        {(c.synth_identity || facts.length > 0) && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            {c.synth_identity && <p className="nt-verdict"><span className="nt-hl">{c.synth_identity}</span></p>}
            {facts.length > 0 && (
              <div className="nt-chips">
                {facts.map((h, i) => <span key={h.label} className={`nt-chip ${i === 0 ? "ink" : ""}`}>{h.label}<b>{h.count}</b></span>)}
              </div>
            )}
          </div>
        )}

        {/* 📖 사람들이 쓴 말 — 이 페이지에서 가장 먼저 읽혀야 할 것. 정렬 순서 그대로 읽히는 문장 3건 + 접힘 9건. */}
        {showQuotes && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <div className="nt-lbl">사람들이 쓴 말 <em>· 후기 원문</em></div>
            {shownQuotes.map(quoteOf)}
            {moreQuotes.length > 0 && (
              <details className="nt-more">
                <summary className="nt-free"><span className="nt-btn-ghost"><span className="t1">후기 {moreQuotes.length}건 더 보기</span><span className="t2">접기</span><svg viewBox="0 0 24 24" aria-hidden><path d="m6 9 6 6 6-6"/></svg></span></summary>
                {moreQuotes.map(quoteOf)}
              </details>
            )}
            {srcLine}
          </div>
        )}

        {/* ⚠️ 이건 알고 가세요 — 후기 2건 이상에서 확인된 주의점 + 손님이 쓴 근거 문장. cafes.cautions(합성 때 계산, 조회 0). */}
        {Array.isArray(c.cautions) && c.cautions.length > 0 && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <div className="nt-lbl">이건 알고 가세요 <em>· 후기 2건 이상에서 확인된 것만</em></div>
            <div className="nt-chips">
              {(c.cautions as any[]).map((x: any) => <span key={x.label} className="nt-chip warn">{x.label}<b>{x.count}</b></span>)}
            </div>
            {(c.cautions as any[])[0]?.quote && (
              <blockquote className="nt-q" style={{ borderColor: "#a93a32" }}>“…{(c.cautions as any[])[0].quote}…”</blockquote>
            )}
          </div>
        )}

        {/* 📊 이곳의 결 — char_scores 상위 5축. 현재 페이지엔 아예 안 나오던 값. */}
        {charBars.length > 0 && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <div className="nt-lbl">이곳의 결 <em>· 후기에서 언급된 횟수</em></div>
            <div className="nt-free">
              {charBars.map(([k, v], i) => (
                <div key={k} className={`nt-bar ${i === 0 ? "top" : ""}`}>
                  <span>{CHAR_LABEL[k]}</span>
                  <span className="tr"><span className="fl" style={{ width: `${Math.max(4, Math.round((Number(v) / barMax) * 100))}%` }} /></span>
                  <span className="n">{Number(v).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 👍 다른 카페보다 — 전체 검증 카페 대비 상위 %(후기당 언급률 순위). 약점은 한 줄로. */}
        {profile.ok && profile.strong.length > 0 && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <div className="nt-lbl">다른 카페보다 <em>· 전체 검증 카페 대비</em></div>
            <div className="nt-free nt-tiles">
              {profile.strong.slice(0, 3).map((s) => (
                <div key={s.key} className="nt-tile">
                  <div className="k">{CHAR_LABEL[s.key] ?? s.label}</div>
                  <div className="v">{s.topPct}<small>% 안</small></div>
                </div>
              ))}
            </div>
            {profile.weak.length > 0 && (
              <p className="nt-note"><IcoInfo /><span>‘{profile.weak.map((w) => CHAR_LABEL[w.key] ?? w.label).join(" · ")}’는 후기에 거의 언급이 없어요.</span></p>
            )}
          </div>
        )}

        {/* 💻 작업하기 전에 확인 — 근거 건수를 반드시 함께. 언급이 없으면 표시하지 않는다. */}
        {(work.signals.length > 0 || work.timeLimit > 0) && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <div className="nt-lbl">작업하기 전에 확인 <em>· 후기에 실제로 적힌 말만</em></div>
            <div className="nt-chips">
              {work.signals.map((sg) => {
                const pos = sg.yes >= sg.no;
                return <span key={sg.key} className={`nt-chip ${pos ? "good" : "warn"}`}>{pos ? sg.label : sg.negLabel}<b>{Math.max(sg.yes, sg.no)}</b></span>;
              })}
              {work.timeLimit > 0 && <span className="nt-chip soft">이용 시간 제한 언급<b>{work.timeLimit}</b></span>}
            </div>
          </div>
        )}

        {/* 📈 후기 흐름 — 월별 스파크라인 + 최근 12개월·최신 월. review_dates(작은 jsonb) 기반, 조회 0. */}
        {series && freshness && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <div className="nt-lbl">후기 흐름 <em>· 최근 {series.length}개월</em></div>
            <div className="nt-free nt-flow">
              <svg viewBox={`0 0 ${series.length * 10} 44`} preserveAspectRatio="none" role="img" aria-label={`월별 후기 수, 최근 ${series.length}개월`}>
                {series.map((m, i) => {
                  const h = m.n > 0 ? Math.max(3, Math.round((m.n / seriesMax) * 40)) : 2;
                  return <rect key={m.key} x={1 + i * 10} y={44 - h} width={8} height={h} fill={i === seriesLast ? "#7a5122" : m.n > 0 ? "#c9a26b" : "rgba(90,70,50,0.18)"}><title>{`${m.key} · ${m.n}건`}</title></rect>;
                })}
              </svg>
              <div className="fs"><b>{freshness.recent}건</b>최근 12개월 · 최신 {freshness.latest}{freshness.stale && <span style={{ color: "#a93a32" }}> · 1년 넘게 새 후기 없음</span>}</div>
            </div>
          </div>
        )}

        {/* 📷✍ 사장님 사진·한마디 — 사장님이 직접 올린 것. 후기·판정과 분리 표기. 구독 활성일 때만. */}
        {oc && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <div className="nt-lbl">사장님이 직접 올린 사진과 한마디</div>
            {oc.photos.length > 0 && (
              <div className="nt-free flex gap-3 overflow-x-auto pb-2" style={{ marginLeft: -6 }}>
                {oc.photos.map((p, i) => (
                  <figure key={p.url} className="nt-scrap flat shrink-0" style={{ padding: 6, transform: `rotate(${i % 2 ? 1.2 : -1.4}deg)` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`${c.name} 사장님 제공 사진 ${i + 1}`} loading="lazy" className="block rounded-[3px] object-cover" style={{ width: 168, height: 126 }} />
                  </figure>
                ))}
              </div>
            )}
            {oc.note.trim() && <p className="nt-verdict"><span className="nt-hl latte">“{oc.note.trim()}”</span></p>}
            <p className="nt-src">사장님 제공 · 검증 후기·등급과는 별개예요{oc.noteAt ? ` · ${new Date(oc.noteAt).getFullYear()}.${String(new Date(oc.noteAt).getMonth() + 1).padStart(2, "0")}` : ""}</p>
          </div>
        )}

        {/* ⚖️ 평판 참고 */}
        {c.reputation_note && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <p className="nt-note"><IcoInfo /><span><b>참고</b> · {c.reputation_note}</span></p>
          </div>
        )}

        {/* 📍 근처 카페 — 같은 읍면동 → 10km → 시군구. 거리는 실제 km. */}
        {nearby.length > 0 && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
            <div className="nt-lbl">{nearTitle} <em>· 검증 우선 · 거리 표시</em></div>
            {nearby.map((nc) => (
              <OutboundLink key={nc.id} href={`/c/${nc.id}`} target="nearby" cafeId={c.id} source="카페상세" className="nt-near">
                <span className="nm">{nc.name}</span>
                <span className="s">
                  {nc.synth_grade && <span className={nc.synth_grade === "검증" ? "g" : ""}>{nc.synth_grade}</span>}
                  <span>{nc.synth_count ?? 0}건</span>
                  {nc.km !== null && <span>{fmtKm(nc.km)}</span>}
                </span>
              </OutboundLink>
            ))}
            <Link href={`/area/${encodeURIComponent(c.area)}`} className="nt-g text-[12.5px] text-[#7a5122] block">{c.area} 전체 보기 →</Link>
          </div>
        )}

        {!showQuotes && <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>{srcLine}</div>}

        {/* 방문자 후기 */}
        {userReviews.length > 0 && <div className="px-3 pt-3 nt-free"><VisitorReviews reviews={userReviews} /></div>}

        {/* 접힘 — 판정 방법 · 자주 묻는 질문 · 더 하기(담아두기·추억·사진·사장님·더 찾기) */}
        <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
          {sqRaw > 0 && (
            <details className="nt-x">
              <summary>이 판정을 어떻게 냈나</summary>
              <div className="nt-body">
                <p>이 카페가 나온 글 <b>{sqRaw.toLocaleString()}건</b>을 확인해 <b>{(sqRaw - Number(sq?.verified ?? 0) - Number(sq?.reference ?? 0)).toLocaleString()}건</b>을 걸러내고 <b>{Number(sq?.verified ?? 0).toLocaleString()}건</b>의 실제 방문 후기로 판단했어요.</p>
                <p>'이곳의 결'은 후기에서 그 말이 나온 횟수, '다른 카페보다'는 후기 1건당 언급 비율을 전체 검증 카페와 비교한 순위예요. 절대 평가가 아닙니다.</p>
                <p className="flex items-center gap-3 flex-wrap"><Link href="/trust">검증 방법 자세히 →</Link><span className="nt-free"><ReportButton cafeId={Number(c.id)} /></span></p>
              </div>
            </details>
          )}
          {faqs.length > 0 && (
            <details className="nt-x">
              <summary>자주 묻는 질문</summary>
              <div className="nt-body">
                {faqs.map((f) => (
                  <details key={f.q}>
                    <summary className="cursor-pointer list-none"><b>Q.</b> {f.q}</summary>
                    <p className="pl-5">{f.a}</p>
                  </details>
                ))}
              </div>
            </details>
          )}
          <details className="nt-x">
            <summary>더 하기 — 담아두기 · 추억 저장 · 사진 보태기 · 사장님</summary>
            <div className="nt-free flex flex-col gap-3" style={{ padding: "10px 0 16px" }}>
              {/* ❤ 찜 — 가입도 위치확인도 없는 탭 한 번 */}
              <div className="nt-scrap flat pink"><WishButton cafeId={c.id} variant="banner" /></div>
              {/* 📷 손님 사진 제보(결재 #1084) — 찍은 사람이 권리자. 본인 촬영본만, 저작권은 올린 분에게, 사람 나온 사진 금지. */}
              <div className="nt-scrap flat">
                <p className="text-[12.5px] text-[#63523f] mb-2">직접 찍은 사진을 보태주시면 다음 사람이 고를 때 큰 도움이 돼요. 저작권은 올려주신 분에게 그대로 있고, 사람이 나온 사진은 받지 않아요(초상권). 확인 후 올라갑니다.</p>
                <SaveMemoryButton cafeId={c.id} cafeName={c.name} cafeArea={c.area} variant="banner" />
              </div>
              {/* ☕ 사장님 CTA — 클릭 계측: decisions #782 */}
              <OwnerCtaLink cafeId={c.id} cafeName={c.name} className="nt-scrap r kraft flex items-center justify-between gap-2 w-full px-4 py-3">
                <i className="nt-tape g tr sm" aria-hidden />
                <span className="flex flex-col text-left">
                  <span className="text-[13px] font-bold text-[#7a5122]">이 카페 사장님이신가요?</span>
                  <span className="text-[11px] text-[#544636]">방금 보신 강·약에 <b>동네 순위</b>까지 — 가입 없이 바로 볼 수 있어요</span>
                </span>
                <span className="text-[#b9793b] font-bold whitespace-nowrap">→</span>
              </OwnerCtaLink>
              {/* 동네 교차검증 컬렉션 · 테마 역링크 · 동네 지도(크롤 동선·SEO) */}
              {col && (
                <Link href={`/collections/${col.slug}`} className="nt-scrap flex items-center justify-between gap-2 w-full px-4 py-3">
                  <span className="flex flex-col text-left">
                    <span className="text-[13px] font-bold text-[#5c4b3c]">{col.label} 카페, 협찬 없이 교차검증한 곳</span>
                    <span className="text-[11px] text-[#63523f]">광고·협찬·타지점 후기 빼고 실방문 후기로만 모아보기</span>
                  </span>
                  <span className="text-[#7a5122] font-bold whitespace-nowrap">→</span>
                </Link>
              )}
              {themed.map((t) => (
                <Link key={t.key} href={`/area/${encodeURIComponent(c.area)}/${t.key}`} className="nt-g flex items-center justify-between gap-2 px-1 text-[13px] text-[#5c4b3c]">
                  <span>{c.area} {t.label} 카페 더 찾기</span><span className="text-[#7a5122]">→</span>
                </Link>
              ))}
              <Link href={`/?region=${encodeURIComponent(c.area)}`} className="nt-g flex items-center justify-between gap-2 px-1 text-[13px] text-[#5c4b3c]">
                <span>{c.area} 카페 지도에서 둘러보기</span><span className="text-[#7a5122]">→</span>
              </Link>
            </div>
          </details>
        </div>

        {/* ❤ 찜한 카페 다시 보기 · 🕘 최근 본 카페 — localStorage 기반 클라이언트 컴포넌트(서버 조회 0) */}
        <div className="nt-margin-gutter nt-free nt-g">
          <SavedCafes excludeId={Number(c.id)} />
          <RecentCafes current={{ id: Number(c.id), name: c.name, area: c.area, grade: grade || undefined }} />
        </div>

        {/* 하단 고정 행동 2개 — 지도 · 네이버(메뉴·가격·영업시간은 권위 원천으로) */}
        <PlaceCta cafeId={c.id} mapHref={mapHref} mapLabel="지도에서 보기" screen="카페상세" />{/* 🧪 A/B — app/PlaceCta.tsx */}
      </div>
    </main>
  );
}
