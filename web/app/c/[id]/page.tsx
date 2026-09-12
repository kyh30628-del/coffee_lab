import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { sql, ensureOnce } from "@/lib/db";
import { visitorBadges } from "@/lib/visitorMix";
import KakaoShare from "../../KakaoShare";
import SaveMemoryButton from "./SaveMemoryButton";
import WishButton from "../../WishButton";
import OwnerCtaLink from "./OwnerCtaLink";
import VisitorReviews from "../../VisitorReviews";
import RecentCafes from "../../RecentCafes";
import SavedCafes from "../../SavedCafes";
import { buildAxisDist, cafeProfile, extractHighlights, tasteVector, tasteSimilarity, GRADE_RANK } from "@/lib/cafeProfile";
import { topCharTraits } from "@/lib/charScore";
import { collectionForCafe } from "@/lib/collections";
import { tasteByKey } from "@/lib/seoData";
import { shareHookText } from "@/lib/shareCopy";
import { sortReviews, ensureRecent } from "@/lib/exposureOrder";
import { extractWorkSignals } from "@/lib/workDetail";
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
    return (await sql`SELECT c.id, c.name, c.area, c.dong, c.address, c.lat, c.lng, c.synth_grade, c.synth_identity, c.synth_count, c.char_scores, c.synth_reviews_all, c.synth_reviews, c.reputation_note, c.synth_quality, c.visitor_n, c.visitor_trip, c.visitor_local, c.area_rank, c.area_total,
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
      WHERE cafe_id=${cafeId} AND is_public=true AND finalized=true AND verified=true AND (COALESCE(memory,'')<>'' OR photo_url IS NOT NULL)
      ORDER BY created_at DESC LIMIT 20`;
    return (rows as any[]).map((r) => ({ memory: r.memory || "", photos: Array.isArray(r.photos) && r.photos.length ? r.photos : (r.photo_url ? [r.photo_url] : []), favorite: !!r.favorite, date: r.created_at ? new Date(r.created_at).toISOString() : undefined }));
  } catch { return []; }
}

// 🔁 리텐션 훅 — 같은 동네(area) + 결(taste) 유사도 기반 '비슷한 카페 더보기'.
//   1페이지 이탈↓·2페이지 유도(홍보×경험 #94, decisions #338 — 상세 89% 1페이지 이탈 대응).
//   검증/참고 등급 우선 노출(등급 낮은 순 정렬) → 동급 안에서는 결 유사도·검증후기 수로 정렬. published=true라 오염 카페는 이미 제외.
async function getSimilar(area: string, excludeId: number, char_scores: any, synth_count: number) {
  try {
    const rows = (await sql`SELECT id, name, synth_grade, synth_count, char_scores FROM cafes
      WHERE published=true AND area=${area} AND id<>${excludeId}
      ORDER BY COALESCE(synth_count,0) DESC LIMIT 40`) as any[];
    const mine = tasteVector(char_scores, synth_count);
    return rows
      .map((r) => ({ ...r, sim: tasteSimilarity(mine, tasteVector(r.char_scores, r.synth_count)) }))
      .sort((a, b) =>
        (GRADE_RANK[a.synth_grade] ?? 3) - (GRADE_RANK[b.synth_grade] ?? 3) ||
        b.sim - a.sim ||
        (b.synth_count ?? 0) - (a.synth_count ?? 0))
      .slice(0, 6);
  } catch { return []; }
}

export default async function CafePage({ params }: Props) {
  const { id } = await params;
  const c = await getCafe(id);
  if (!c) notFound();
  const tags = topTags(c.char_scores);
  const userReviews = await getPublicReviews(c.id);
  const nearby = await getSimilar(c.area, c.id, c.char_scores, c.synth_count);
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
  const highlights = extractHighlights(quotesAll);
  // 💻 카공 세부 신호(2026-08-17) — "작업하기 좋음" 한 축으로 뭉뚱그리던 것을 콘센트·와이파이·자리로 쪼갠다.
  //   실측: 테마 수요 상위 8개 중 7개가 카공인데 정작 카공족이 묻는 건 이 시설 정보였다.
  //   ⚠️ 추가 조회 0(이미 읽은 인용문 재사용) · LLM 0(규칙) · 근거 없으면 아무것도 안 그린다.
  const work = extractWorkSignals(quotesAll);
  // 🛡️ 검증 근거 공개(2026-08-17) — 우리 해자의 증거가 synth_quality에 다 있는데 화면엔 한 글자도 안 나갔다.
  //   /trust 페이지로 따로 빼뒀더니 30일 방문 **1명**이었다. 설명을 별도 페이지에 가두면 아무도 안 읽는다.
  //   → 이 카페의 실제 숫자로, 결정하는 화면 안에서 보여준다. 추가 조회 없이 같은 행에서 읽는다.
  const sq = (c.synth_quality ?? null) as any;
  const sqRaw = Number(sq?.raw ?? 0);
  const sqReasons: [string, number][] = sq?.rejectReasons && typeof sq.rejectReasons === "object"
    ? (Object.entries(sq.rejectReasons) as [string, number][]).filter(([, n]) => Number(n) > 0).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 3)
    : [];
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
  // 📓 2026-09-12 "한 권의 노트" — 이 페이지는 줄노트 한 장이다.
  //   · 글자는 전부 줄(.nt-ruled, 30px 간격)에 밑선을 맞춰 앉는다. 붙인 종이(.nt-scrap)만 격자 밖.
  //   · 손글씨는 "판정"(우리가 읽고 적은 문장·강약의 배수)에만. 도장은 등급.
  //   · 정보 구조·링크·문구·JSON-LD 전부 그대로(SEO 무변). 비용 0(정적 재질만).
  const stampKind = grade === "참고" ? "ref" : grade === "후보" ? "cand" : "";
  const stampEn = grade === "검증" ? "VERIFIED" : grade === "참고" ? "REFERENCE" : "CANDIDATE";
  return (
    <main className="min-h-screen nt-paper nt-app text-[#2a1f17]" style={{ fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Pen+Script&display=swap" rel="stylesheet" />
      <div className="max-w-xl mx-auto nt-page pb-12 overflow-hidden" style={{ ["--nt-mx" as any]: "36px" }}>
        {/* 장식 — 잔 자국 하나, 오른쪽 위에 반쯤 걸쳐서 */}
        <div className="nt-ring" aria-hidden style={{ right: -78, top: 96, width: 220 }} />

        {/* 첫 줄: 뒤로 · 공유 */}
        <div className="nt-ruled nt-margin-gutter flex items-center justify-between gap-2 relative z-[1]" style={{ paddingTop: 34 }}>
          <Link href="/" className="text-[13px] text-[#8f8071]">← 동네 커피 노트</Link>
          <span className="nt-free">
            <KakaoShare
              title={`${c.name} (${c.area})`}
              description={shareHookText(grade, c.synth_identity)}
              imageUrl={`${SITE}/c/${c.id}/opengraph-image`}
              link={`${SITE}/c/${c.id}`}
              source="카페상세"
              className="inline-flex items-center gap-1.5 bg-[#FEE500] text-[#3c1e1e] rounded-full pl-2.5 pr-3 py-1 text-[12px] font-bold"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#3c1e1e"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.6.1 1.3.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>
              공유
            </KakaoShare>
          </span>
        </div>

        {/* 이름 · 도장 · 배지 */}
        <div className="nt-ruled nt-margin-gutter relative z-[1]" style={{ paddingTop: 34, paddingRight: grade ? 100 : 18 }}>
          {grade && (
            <div className={`nt-stamp in absolute ${stampKind}`} style={{ right: 16, top: 22 }} aria-label={`등급 ${grade}`}>{grade}<small>{stampEn}</small></div>
          )}
          <h1 className="nt-title text-[28px] relative text-balance"><span className="nt-hl latte">{c.name}</span></h1>
          {(ownerManaged || (typeof c.area_rank === "number" && c.area_rank <= 10 && (c.area_total ?? 0) >= 20)) && (
            <div className="nt-chips" style={{ paddingTop: 3, paddingBottom: 3 }}>
              {ownerManaged && (
                <span title="사장님이 직접 정보를 관리하는 카페예요" className="nt-chip soft">🏅 사장님 관리</span>
              )}
              {/* 🏅 동네 순위(2026-08-30) — 상위 10위 이내만(낮은 순위는 그 카페에 해가 된다). 값은 cron-enrich가 하루 2회 계산해 저장(여기서 조회 0). */}
              {typeof c.area_rank === "number" && c.area_rank <= 10 && (c.area_total ?? 0) >= 20 && (
                <span className="nt-mark text-[13px] text-[#5c4b3c]">
                  🏅 {c.area} {c.area_total}곳 중 <b className="text-[#7a5122]">{c.area_rank}위</b>
                  <svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden><path d="M8 20 C 10 6, 40 3, 62 6 S 96 14, 92 24 S 60 38, 36 36 S 3 30, 9 18 S 24 8, 40 9" /></svg>
                </span>
              )}
            </div>
          )}
          {/* 🧳🏠 방문객 성격 — "이 후기를 누가 썼나". 두 배지는 배타적이지 않다. */}
          {(visitorBadges({ n: c.visitor_n ?? 0, trip: c.visitor_trip ?? 0, local: c.visitor_local ?? 0 }).length > 0 || c.dong_tourist) && (
            <div className="nt-chips" style={{ paddingTop: 3, paddingBottom: 3 }}>
              {visitorBadges({ n: c.visitor_n ?? 0, trip: c.visitor_trip ?? 0, local: c.visitor_local ?? 0 }).map((b) => (
                <span key={b.key} className="nt-chip good">{b.emoji} {b.label} <span className="font-normal opacity-80">({b.note})</span></span>
              ))}
              {/* 📰 동 단위 뉴스 판정(2026-08-27) — 후기 말투(위)와 별개의 '위치 속성'. */}
              {c.dong_tourist && (
                <span className="nt-chip" style={{ color: "#4a5a6e", background: "#e6ebf2", borderColor: "#c9d3e0" }}>🗺️ 관광지로 알려진 동네 <span className="font-normal opacity-80">(언론 보도 기준)</span></span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2" style={{ height: 34 }}>
            <p className="text-[12px] text-[#8f8071] min-w-0 truncate">{c.area}{c.dong ? ` ${c.dong}` : ""} · 검증 후기 <b className="text-[#5c4b3c]">{c.synth_count ?? 0}</b>건</p>
            {/* ❤ 2026-08-21: 이 자리는 **고르는 사람**의 자리 — 무마찰 찜. */}
            <span className="nt-free"><WishButton cafeId={c.id} /></span>
          </div>
        </div>

        {/* ❤ 찜 배너 — 붙인 종이 */}
        <div className="px-3 pt-4">
          <div className="nt-scrap flat pink"><WishButton cafeId={c.id} variant="banner" /></div>
        </div>

        {/* 🧭 위치인증 방문기록은 2순위로(실제 방문자에게 계속 열어둔다) */}
        <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
          <details className="group">
            <summary className="cursor-pointer list-none text-[12px] text-[#7a5122] underline underline-offset-2">
              이미 다녀오셨나요? 위치인증하고 추억으로 남기기 →
            </summary>
            <div className="nt-free py-2"><SaveMemoryButton cafeId={c.id} cafeName={c.name} cafeArea={c.area} variant="banner" /></div>
          </details>
        </div>

        {/* 🗺️ 지도 CTA를 첫 화면으로(2026-08-16) — 바로 착지한 방문자 이탈 87%, 지도 도달 시 3%. 테이프로 붙인 메모. */}
        <div className="px-3 pt-4">
          <Link href={`/?region=${encodeURIComponent(c.area)}`} className="nt-scrap r block px-4 py-3">
            <i className="nt-tape sm" aria-hidden />
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-bold text-[#2a1f17]">
                🗺️ {c.area} 카페 지도에서 둘러보기
                <span className="block text-[11px] text-[#8f8071] font-normal mt-0.5">근처 검증 카페를 위치·취향으로 한눈에</span>
              </span>
              <span className="text-[#7a5122] text-[14px]">→</span>
            </span>
          </Link>
        </div>

        {/* 📊 우리가 읽고 적은 판정 — 옥석 후기 핵심. 판정 문장만 손글씨. */}
        {(highlights.length > 0 || c.synth_identity) && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
            <div className="nt-sec">우리가 읽고 적은 판정 · 검증 후기 {c.synth_count ?? 0}건</div>
            {c.synth_identity && <p className="nt-hand"><span className="nt-hl">{c.synth_identity}</span></p>}
            {highlights.length > 0 && (
              <>
                <div className="text-[12px] text-[#8f8071]">후기에서 가장 많이 나온 것 · 숫자=언급 후기 수</div>
                <div className="nt-chips">
                  {highlights.map((h, i) => (
                    <span key={h.label} className={`nt-chip ${i === 0 ? "ink" : ""}`}>{h.emoji} {h.label}<b>{h.count}</b></span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* 🧭 "다음 행동" 묶음(2026-08-22) — 지도·다음 카페를 위로. nearby는 위에서 조회한 값 재사용(추가 쿼리 0). */}
        <div className="px-3 pt-4">
          <div className="nt-scrap px-4 py-3">
            <i className="nt-tape tl sm" aria-hidden />
            <OutboundLink href={mapHref} target="map_cta" cafeId={c.id} source="카페상세" className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] font-bold text-[#2a1f17]">
                🗺️ 지도에서 위치·주변 함께 보기
                <span className="block text-[11px] text-[#8f8071] font-normal mt-0.5">근처 다른 카페까지 한눈에</span>
              </span>
              <span className="text-[#7a5122] text-[14px]">→</span>
            </OutboundLink>
            {nearby.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-dashed border-[#d9cdb9]">
                <div className="text-[11px] text-[#8f8071] mb-1.5">이 동네 비슷한 곳</div>
                <div className="flex flex-wrap gap-1.5">
                  {nearby.slice(0, 3).map((nc: any) => (
                    <OutboundLink key={nc.id} href={`/c/${nc.id}`} target="nearby" cafeId={c.id} source="카페상세" className="nt-chip">
                      {nc.name}
                      {nc.synth_grade === "검증" && <span className="text-[9.5px] font-bold text-[#3e7a5a]">검증</span>}
                    </OutboundLink>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 🛡️ 이 카페를 어떻게 골랐나 — 이 카페의 실제 숫자로. (duplicates는 raw 이전 단계라 여기 넣지 않는다) */}
        {sqRaw > 0 && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
            <div className="nt-sec">이 카페를 어떻게 골랐나</div>
            <p className="text-[14px] text-[#2a1f17]">
              🛡️ 이 카페가 나온 글 <b>{sqRaw.toLocaleString()}건</b>을 확인해
              <b> {(sqRaw - Number(sq?.verified ?? 0) - Number(sq?.reference ?? 0)).toLocaleString()}건을 걸러내고</b>{" "}
              <b>{Number(sq?.verified ?? 0).toLocaleString()}건</b>의 진짜 방문 후기로 판단했어요.
            </p>
            {sqReasons.length > 0 && (
              <ul>
                {sqReasons.map(([why, n]) => (
                  <li key={why} className="text-[12.5px] text-[#5c4b3c] flex gap-2">
                    <span className="text-[#b9a68f]">—</span>
                    <span>{why} <b className="text-[#7a5122]">{Number(n).toLocaleString()}건</b> 제외</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/trust" className="inline-block text-[12px] text-[#7a5122] underline underline-offset-2">검증 방법 자세히 →</Link>
          </div>
        )}

        {/* 💻 카공 시설 — 근거 건수를 반드시 함께. "없다"도 숨기지 않는다. */}
        {(work.signals.length > 0 || work.timeLimit > 0) && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
            <div className="nt-sec">💻 작업하기 전에 확인</div>
            <div className="nt-chips">
              {work.signals.map((sg) => {
                const pos = sg.yes >= sg.no;
                return (
                  <span key={sg.key} className={`nt-chip ${pos ? "good" : "warn"}`}>
                    {sg.emoji} {pos ? sg.label : sg.negLabel}
                    <span className="text-[10px] font-bold opacity-80">후기 {Math.max(sg.yes, sg.no)}건</span>
                  </span>
                );
              })}
              {work.timeLimit > 0 && (
                <span className="nt-chip soft">⏱ 이용 시간 제한 언급<span className="text-[10px] font-bold opacity-80">후기 {work.timeLimit}건</span></span>
              )}
            </div>
            <div className="text-[11.5px] text-[#8f8071]">후기에 실제로 적힌 말만 셌어요. 언급이 없으면 표시하지 않습니다.</div>
          </div>
        )}

        {/* ⚖️ 평판 신선도 */}
        {c.reputation_note && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
            <div className="text-[13px] text-[#8a6a3a]">⚖️ <b>참고</b> · {c.reputation_note}</div>
          </div>
        )}

        {/* 👍 강점 / 🔎 아쉬운점 — 전체 카페 대비. 배수는 손글씨(판정). */}
        {profile.ok ? (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
            <div className="nt-sec">한눈에 강·약 · 전체 카페 대비</div>
            {profile.strong.length > 0 && (
              <>
                <div className="text-[12.5px] font-bold text-[#3e7a5a]">👍 이런 점이 강해요</div>
                {profile.strong.map((s) => (
                  <div key={s.key} className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[15px] w-5 text-center flex-none">{s.emoji}</span>
                    <span className="text-[14.5px] font-bold text-[#2a1f17]">{s.text}</span>
                    <span className="ml-auto flex items-baseline gap-2 whitespace-nowrap">
                      <span className="nt-hand sm coffee">평균의 {s.mult}배</span>
                      <span className="nt-pill verify">상위 {s.topPct}%</span>
                    </span>
                  </div>
                ))}
              </>
            )}
            {profile.weak.length > 0 && (
              <>
                <div className="text-[12.5px] font-bold text-[#b07a2a]">🔎 이런 점은 참고하세요</div>
                {profile.weak.map((w) => (
                  <div key={w.key} className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[14px] w-5 text-center flex-none">{w.emoji}</span>
                    <span className="text-[13.5px] text-[#5c4b3c]">{w.text}</span>
                    <span className="ml-auto nt-hand sm faint whitespace-nowrap">{w.mult < 0.2 ? "거의 언급 없음" : `평균의 ${w.mult}배`}</span>
                  </div>
                ))}
              </>
            )}
            <p className="text-[11px] text-[#8f8071]">기준은 <b>후기 1건당 언급 비율</b>이에요 — 후기 수가 많고 적음을 보정한 공정한 비교입니다. '평균의 N배'·'상위/하위 %'는 전체 카페와 같은 기준으로 비교한 값. 절대 평가가 아닙니다.</p>
          </div>
        ) : tags.length > 0 && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
            <div className="nt-sec">이 카페가 후기에서 자주 언급되는 결</div>
            <div className="nt-chips">{tags.map((t) => <span key={t} className="nt-chip">{t}</span>)}</div>
          </div>
        )}

        {/* ☕ 사장님 CTA — 강·약 바로 다음(2026-08-29). 중복 배치 없음. 클릭 계측: decisions #782 */}
        <div className="px-3 pt-4">
          <OwnerCtaLink cafeId={c.id} cafeName={c.name} className="nt-scrap r kraft flex items-center justify-between gap-2 w-full px-4 py-3">
            <i className="nt-tape g tr sm" aria-hidden />
            <span className="flex flex-col text-left">
              <span className="text-[13px] font-bold text-[#7a5122]">☕ 이 카페 사장님이신가요?</span>
              <span className="text-[11px] text-[#6f6047]">방금 보신 강·약에 <b>동네 순위</b>까지 — 가입 없이 바로 볼 수 있어요</span>
            </span>
            <span className="text-[#b9793b] font-bold whitespace-nowrap">→</span>
          </OwnerCtaLink>
        </div>

        <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
          <p className="text-[12.5px] text-[#5c4b3c]">네이버 공개 후기 <b>{c.synth_count ?? 0}건</b>을 교차검증한 데이터 기반 소개예요. <Link href="/trust" className="underline underline-offset-2 text-[#7a5122]">검증 방법 보기</Link></p>
        </div>

        {/* 방문자 후기 — 하단 버튼 바로 위 */}
        {userReviews.length > 0 && <div className="px-3 pt-3 nt-free"><VisitorReviews reviews={userReviews} /></div>}

        <div className="nt-margin-gutter pt-5 flex flex-col gap-2.5">
          <Link href={mapHref} className="nt-btn-ink py-3.5 text-[15px]">지도·근거 후기 보기 →</Link>
          {/* 메뉴·가격·영업시간은 권위 원천(네이버 플레이스)으로 연결 — 항상 정확·최신 */}
          <OutboundLink href={`/api/naver-place-redirect?id=${c.id}`} target="naver_place" cafeId={c.id} source="카페상세" className="nt-btn-line py-3 text-[13px]" style={{ borderColor: "#03c75a", color: "#03c75a" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#03c75a"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/></svg>
            네이버에서 메뉴·가격·영업시간 보기
          </OutboundLink>
        </div>

        {/* 🔁 비슷한 카페 더보기 — 목차 줄(번호 손글씨). 같은 동네 + 결 유사도, 검증/참고 우선(decisions #338) */}
        {nearby.length > 0 && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
            <div className="flex items-baseline justify-between gap-2">
              <div className="nt-sec">☕ {c.area} 비슷한 카페 더보기</div>
              <Link href={`/area/${encodeURIComponent(c.area)}`} className="text-[11.5px] text-[#7a5122] whitespace-nowrap">동네 전체 보기 →</Link>
            </div>
            {nearby.map((nc: any, i: number) => (
              <Link key={nc.id} href={`/c/${nc.id}`} className="nt-ln">
                <span className="n">{i + 1}.</span>
                <span className="nm text-[14px]">{nc.name}{nc.synth_grade && <span className={`nt-pill ml-1.5 ${nc.synth_grade === "검증" ? "verify" : nc.synth_grade === "참고" ? "ref" : "cand"}`}>{nc.synth_grade}</span>}</span>
                <span className="m">검증후기 {nc.synth_count ?? 0}건</span>
              </Link>
            ))}
          </div>
        )}

        {/* 🧭 테마 페이지 역링크(2026-08-13) — 이 카페가 강한 결 상위 2개를 앵커텍스트로. char_scores 키 = TASTES 키. */}
        {(() => {
          const themed = Object.entries((c.char_scores ?? {}) as Record<string, number>)
            .filter(([k, v]) => Number(v) > 0 && tasteByKey(k))
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 2)
            .map(([k]) => tasteByKey(k)!);
          return themed.length > 0 ? (
            <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
              {themed.map((t) => (
                <Link key={t.key} href={`/area/${encodeURIComponent(c.area)}/${t.key}`} className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-bold text-[#5c4b3c]">{t.emoji} {c.area} {t.label} 카페 더 찾기</span>
                  <span className="text-[#7a5122] text-[13px]">→</span>
                </Link>
              ))}
            </div>
          ) : null;
        })()}

        {/* ❤ 찜한 카페 다시 보기 · 🕘 최근 본 카페 — localStorage 기반 클라이언트 컴포넌트(서버 조회 0) */}
        <div className="nt-margin-gutter nt-free">
          <SavedCafes excludeId={Number(c.id)} />
          <RecentCafes current={{ id: Number(c.id), name: c.name, area: c.area, grade: grade || undefined }} />
        </div>

        {/* 동네 교차검증 컬렉션 상호링크(크롤 동선·SEO) */}
        {(() => {
          const col = collectionForCafe(c.dong, c.area);
          return col ? (
            <div className="px-3 pt-4">
              <Link href={`/collections/${col.slug}`} className="nt-scrap flex items-center justify-between gap-2 w-full px-4 py-3">
                <i className="nt-tape sm" aria-hidden />
                <span className="flex flex-col text-left">
                  <span className="text-[13px] font-bold text-[#5c4b3c]">📌 {col.label} 카페, 협찬 없이 교차검증한 곳</span>
                  <span className="text-[11px] text-[#8f8071]">광고·협찬·타지점 후기 빼고 실방문 후기로만 모아보기</span>
                </span>
                <span className="text-[#7a5122] font-bold whitespace-nowrap">→</span>
              </Link>
            </div>
          ) : null;
        })()}

        {/* ❓ 자주 묻는 질문 — 위 FAQPage JSON-LD와 동일 내용 */}
        {faqs.length > 0 && (
          <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
            <div className="nt-sec">❓ 자주 묻는 질문</div>
            {faqs.map((f) => (
              <details key={f.q}>
                <summary className="text-[13.5px] font-bold text-[#2a1f17] cursor-pointer list-none">
                  <span className="text-[#b9793b] mr-1.5">Q.</span>{f.q}
                </summary>
                <p className="text-[13px] text-[#5c4b3c] pl-5">{f.a}</p>
              </details>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
