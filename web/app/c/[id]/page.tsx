import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { sql, ensureOnce } from "@/lib/db";
import KakaoShare from "../../KakaoShare";
import SaveMemoryButton from "./SaveMemoryButton";
import WishButton from "../../WishButton";
import OwnerCtaLink from "./OwnerCtaLink";
import VisitorReviews from "../../VisitorReviews";
import RecentCafes from "../../RecentCafes";
import { buildAxisDist, cafeProfile, extractHighlights, tasteVector, tasteSimilarity, GRADE_RANK } from "@/lib/cafeProfile";
import { collectionForCafe } from "@/lib/collections";
import { tasteByKey } from "@/lib/seoData";
import { shareHookText } from "@/lib/shareCopy";
import { sortReviews } from "@/lib/exposureOrder";
import { extractWorkSignals } from "@/lib/workDetail";
import OutboundLink from "../../OutboundLink";

export const runtime = "nodejs";
export const revalidate = 21600; // ISR 1시간

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
const CHAR: Record<string, string> = { roast: "🔥 직접로스팅", work: "💻 작업하기 좋은", quiet: "🤍 조용한", dessert: "🍰 디저트", mood: "📸 분위기", space: "🪑 넓은공간", pet: "🐶 애견동반", brunch: "🥐 브런치", view: "🌄 뷰 좋은" };

type Props = { params: Promise<{ id: string }> };

async function getCafe(id: string) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return (await sql`SELECT id, name, area, dong, address, lat, lng, synth_grade, synth_identity, synth_count, char_scores, synth_reviews_all, synth_reviews, reputation_note, synth_quality FROM cafes WHERE id=${n} AND published=true LIMIT 1`)[0] as any ?? null;
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
    // og:image·twitter:image는 같은 폴더의 opengraph-image.tsx(동적 카드)가 자동 적용됨.
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "article", locale: "ko_KR" },
    twitter: { card: "summary_large_image", title, description: desc },
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
  // 인앱 상세와 동일: 강·약(전체 대비) + 옥석 리뷰 데이터 핵심
  const profile = cafeProfile({ char_scores: c.char_scores, synth_count: c.synth_count }, await getAxisDist());
  // 🔴 2026-08-17: 이 SEO 상세는 리뷰 배열을 **정렬 없이 원본 순서로** 하이라이트에 넣고 있었다.
  //   앱 상세(/api/cafe-detail)는 sortReviews(확신도·타지점·광고템플릿 3관문)를 타는데 여기만 안 탔다.
  //   구글에 색인되는 면이 정작 방어를 안 받던 셈이라, 같은 함수를 태워 두 경로를 일치시킨다.
  //   비용 0 — 이미 읽어온 배열에 대한 순수함수 정렬이라 추가 조회가 없다.
  const evRaw = (c.synth_reviews_all ?? c.synth_reviews ?? []) as any[];
  const evAll = Array.isArray(evRaw)
    ? sortReviews(evRaw, c.name ?? "", [c.area, c.dong].filter(Boolean) as string[], Date.now(), c.dong)
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
    } : {}),
  };
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />}
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      <div className="max-w-xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="text-[#7a5122] text-sm">← 동네 커피 노트</Link>
          <KakaoShare
            title={`${c.name} (${c.area})`}
            description={shareHookText(grade, c.synth_identity)}
            imageUrl={`${SITE}/c/${c.id}/opengraph-image`}
            link={`${SITE}/c/${c.id}`}
            source="카페상세"
            className="flex items-center gap-1.5 bg-[#FEE500] text-[#3c1e1e] rounded-full pl-2.5 pr-3 py-1.5 text-[12px] font-bold"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="#3c1e1e"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.6.1 1.3.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>
            공유
          </KakaoShare>
        </div>
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-bold">{c.name}</h1>
            {grade && <span className="text-[11px] font-bold bg-[#2b2018] text-[#e8b87a] px-2 py-0.5 rounded-full">{grade}</span>}
          </div>
          <div className="flex items-center justify-between gap-2 mb-4">
            <p className="text-[#7a5122] text-sm">{c.area}</p>
            {/* ❤ 2026-08-21: 이 자리는 **고르는 사람**의 자리다 — 위치인증 저장(다녀온 사람용) 대신 무마찰 찜.
                실측 근거: 상세 도달 64%인데 위치인증 저장은 누적 6건·발급 PIN 0개(아무도 통과 못 함).
                같은 화면 외부클릭은 15.7% → 의지는 있으나 요구조건이 불가능했다. */}
            <WishButton cafeId={c.id} />
          </div>
          {/* ❤ 찜 배너 — 마찰 0(탭 1번). 우리 사용자는 "어디 갈까" 고르는 중이므로 미래형 저장이 맞다. */}
          <div className="mb-2">
            <WishButton cafeId={c.id} variant="banner" />
          </div>
          {/* 🧭 위치인증 방문기록은 **없애지 않고 2순위로** 내린다.
              GPS 30m로 검증된 방문기는 우리만 가진 자산(해자)이라 실제 방문자에게는 계속 열어둔다.
              다만 첫 자리는 위 찜에 내준다 — 고르는 사람에게 "다녀가셨나요?"는 해당되지 않는 질문이었다. */}
          <details className="mb-3 group">
            <summary className="cursor-pointer list-none text-[11.5px] text-[#7a5122] underline underline-offset-2">
              이미 다녀오셨나요? 위치인증하고 추억으로 남기기 →
            </summary>
            <div className="mt-2">
              <SaveMemoryButton cafeId={c.id} cafeName={c.name} cafeArea={c.area} variant="banner" />
            </div>
          </details>
          {/* 🗺️ 지도 CTA를 첫 화면으로(2026-08-16) — 실측: 카페 상세에 **바로 착지한** 방문자의 이탈률이 87%(79명 중 69명)로
              전 페이지 유형 중 최악이다. 기존 CTA는 후기·분석 전부 아래(279행)에 있어 사실상 안 보였다.
              반면 지도(홈)에 도달하면 이탈률 3% — 체류는 지도에서 만들어진다. 그 입구를 위로 올린다.
              ⚠️ 하단 CTA는 그대로 둔다(끝까지 읽은 사람의 자연스러운 다음 행동). 여기 것은 '근처 카페'를 강조해 중복 아님. */}
          <Link href={`/?region=${encodeURIComponent(c.area)}`}
            className="flex items-center justify-between gap-2 w-full rounded-xl px-4 py-3 mb-3 border border-[#d8c8ad] bg-white">
            <span className="text-[13px] font-semibold text-[#3d2f22]">
              🗺️ {c.area} 카페 지도에서 둘러보기
              <span className="block text-[11px] text-[#8a7355] font-normal mt-0.5">근처 검증 카페를 위치·취향으로 한눈에</span>
            </span>
            <span className="text-[#7a5122] text-[13px]">→</span>
          </Link>

          {/* 📊 리뷰 데이터 분석 — 옥석 후기 핵심 */}
          {(highlights.length > 0 || c.synth_identity) && (
            <div className="bg-gradient-to-b from-[#f4eee2] to-[#ece4d4] rounded-xl px-4 py-3.5 mb-3 border border-[#d8c8ad]">
              <div className="text-[11px] font-bold text-[#7a5f3c] uppercase tracking-wider mb-2">📊 리뷰 데이터 분석 · 검증 후기 {c.synth_count ?? 0}건</div>
              {c.synth_identity && <div className="text-[14px] font-semibold text-[#3d2f22] leading-relaxed mb-2.5">{c.synth_identity}</div>}
              {highlights.length > 0 && (
                <>
                  <div className="text-[10.5px] text-[#7a5122] mb-1.5">후기에서 가장 많이 나온 것 · 숫자=언급 후기 수</div>
                  <div className="flex flex-wrap gap-1.5">
                    {highlights.map((h, i) => (
                      <span key={h.label} className={`text-[12.5px] rounded-full pl-2.5 pr-1.5 py-1 border font-semibold inline-flex items-center gap-1.5 ${i === 0 ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#52402e] border-[#d8c8ad]"}`}>
                        {h.emoji} {h.label}
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-[1px] ${i === 0 ? "bg-[#e8b87a] text-[#2b2018]" : "bg-[#efe9dd] text-[#665036]"}`}>{h.count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {/* 🛡️ 이 카페를 어떻게 골랐나 — 추상적 설명이 아니라 **이 카페의 실제 숫자**로.
              ⚠️ duplicates는 여기 넣지 말 것 — 실측(500곳) 결과 raw = verified+reference+rejected가
                 정확히 성립하고 rejectReasons 합계도 rejected와 같다(498/500). 즉 중복은 raw 이전 단계에서
                 빠져 있어, 제외 목록에 함께 적으면 이중계산처럼 읽힌다. */}
          {sqRaw > 0 && (
            <div className="bg-[#f7f3ea] rounded-xl px-4 py-3 mb-3 border border-[#ddd0b6]">
              <div className="text-[13px] text-[#3d2f22] leading-relaxed">
                🛡️ 이 카페가 나온 글 <b>{sqRaw.toLocaleString()}건</b>을 확인해
                <b> {(sqRaw - Number(sq?.verified ?? 0) - Number(sq?.reference ?? 0)).toLocaleString()}건을 걸러내고</b>{" "}
                <b>{Number(sq?.verified ?? 0).toLocaleString()}건</b>의 진짜 방문 후기로 판단했어요.
              </div>
              {sqReasons.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {sqReasons.map(([why, n]) => (
                    <li key={why} className="text-[11.5px] text-[#6b5740] flex gap-1.5">
                      <span className="text-[#a8927a]">·</span>
                      <span>{why} <b className="text-[#7a5122]">{Number(n).toLocaleString()}건</b> 제외</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/trust" className="inline-block text-[11.5px] text-[#7a5122] underline mt-2">검증 방법 자세히 →</Link>
            </div>
          )}

          {/* 💻 카공 시설 — 콘센트·와이파이·자리. **근거 건수를 반드시 함께** 적어 단정하지 않는다.
              "없다"는 언급도 숨기지 않는다 — 헛걸음을 막아주는 것도 우리가 파는 값이다. */}
          {(work.signals.length > 0 || work.timeLimit > 0) && (
            <div className="bg-white rounded-xl px-4 py-3 mb-3 border border-[#d8c8ad]">
              <div className="text-[11px] font-bold text-[#7a5f3c] uppercase tracking-wider mb-2">💻 작업하기 전에 확인</div>
              <div className="flex flex-wrap gap-1.5">
                {work.signals.map((sg) => {
                  const pos = sg.yes >= sg.no;
                  return (
                    <span key={sg.key} className={`text-[12.5px] rounded-full pl-2.5 pr-1.5 py-1 border font-semibold inline-flex items-center gap-1.5 ${pos ? "bg-[#eef4ea] text-[#3f5537] border-[#c4d6bb]" : "bg-[#fbeeee] text-[#8a4040] border-[#e3c3c3]"}`}>
                      {sg.emoji} {pos ? sg.label : sg.negLabel}
                      <span className={`text-[10px] font-bold rounded-full px-1.5 py-[1px] ${pos ? "bg-[#d6e6cd] text-[#3f5537]" : "bg-[#f0d6d6] text-[#8a4040]"}`}>후기 {Math.max(sg.yes, sg.no)}건</span>
                    </span>
                  );
                })}
                {work.timeLimit > 0 && (
                  <span className="text-[12.5px] rounded-full pl-2.5 pr-1.5 py-1 border font-semibold inline-flex items-center gap-1.5 bg-[#fdf4e3] text-[#8a6a3a] border-[#e7d3b3]">
                    ⏱ 이용 시간 제한 언급
                    <span className="text-[10px] font-bold rounded-full px-1.5 py-[1px] bg-[#f2e2c4] text-[#8a6a3a]">후기 {work.timeLimit}건</span>
                  </span>
                )}
              </div>
              <div className="text-[10.5px] text-[#8a7355] mt-2">후기에 실제로 적힌 말만 셌어요. 언급이 없으면 표시하지 않습니다.</div>
            </div>
          )}

          {/* ⚖️ 평판 신선도 — 최근 평이 갈리거나 노후하면 투명하게 안내 */}
          {c.reputation_note && (
            <div className="bg-[#fbf3ea] rounded-xl px-4 py-2.5 mb-3 border border-[#e7d3b3]">
              <div className="text-[12px] text-[#8a6a3a]">⚖️ <b>참고</b> · {c.reputation_note}</div>
            </div>
          )}
          {/* 👍 강점 / 🔎 아쉬운점 — 전체 카페 대비 */}
          {profile.ok ? (
            <div className="bg-[#efe9dd] rounded-xl px-4 py-3.5 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] font-bold text-[#7a5f3c] uppercase tracking-wider mb-2.5">한눈에 강·약 · 전체 카페 대비</div>
              {profile.strong.length > 0 && (
                <div className={profile.weak.length > 0 ? "mb-2.5" : ""}>
                  <div className="text-[11px] font-bold text-[#3f7a4f] mb-1.5">👍 이런 점이 강해요</div>
                  <div className="flex flex-col gap-1.5">
                    {profile.strong.map((s) => (
                      <div key={s.key} className="flex items-center gap-2 bg-[#e8f3ea] border border-[#c6e2cc] rounded-lg px-2.5 py-1.5">
                        <span className="text-[15px]">{s.emoji}</span><span className="text-[13.5px] font-bold text-[#2f5f3c]">{s.text}</span>
                        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-[10.5px] text-[#6f9577]">평균의 {s.mult}배</span>
                          <span className="text-[10.5px] font-bold text-white bg-[#3f7a4f] px-2 py-[3px] rounded-full">상위 {s.topPct}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.weak.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-[#b06a2e] mb-1.5">🔎 이런 점은 참고하세요</div>
                  <div className="flex flex-col gap-1.5">
                    {profile.weak.map((w) => (
                      <div key={w.key} className="flex items-center gap-2 bg-[#f6ecdf] border border-[#e6d2b5] rounded-lg px-2.5 py-1.5">
                        <span className="text-[14px]">{w.emoji}</span><span className="text-[12.5px] font-medium text-[#8a6534]">{w.text}</span>
                        <span className="ml-auto text-[10.5px] text-[#b9935f] whitespace-nowrap">{w.mult < 0.2 ? "거의 언급 없음" : `평균의 ${w.mult}배`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-[#665036] mt-2.5 leading-relaxed">기준은 <b>후기 1건당 언급 비율</b>이에요 — 후기 수가 많고 적음을 보정한 공정한 비교입니다. '평균의 N배'·'상위/하위 %'는 전체 카페와 같은 기준으로 비교한 값. 절대 평가가 아닙니다.</p>
            </div>
          ) : tags.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-[#7a5122] mb-1.5">이 카페가 후기에서 자주 언급되는 결</div>
              <div className="flex flex-wrap gap-2">{tags.map((t) => <span key={t} className="text-[13px] bg-[#efe6d6] rounded-full px-3 py-1">{t}</span>)}</div>
            </div>
          )}
          <p className="text-[12.5px] text-[#665036] mb-4 leading-relaxed">네이버 공개 후기 <b>{c.synth_count ?? 0}건</b>을 교차검증한 데이터 기반 소개예요. <Link href="/trust" className="underline text-[#7a5122]">검증 방법 보기</Link></p>
          {/* 방문자 후기 — 하단 버튼 바로 위 */}
          {userReviews.length > 0 && <div className="mb-4"><VisitorReviews reviews={userReviews} /></div>}
          <Link href={`/?cafe=${c.id}`} className="block w-full text-center bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-bold">지도·근거 후기 보기 →</Link>
          {/* 메뉴·가격·영업시간은 권위 원천(네이버 플레이스)으로 연결 — 항상 정확·최신 */}
          <OutboundLink href={`/api/naver-place-redirect?id=${c.id}`} target="naver_place" cafeId={c.id} source="카페상세" className="mt-2.5 flex items-center justify-center gap-1.5 w-full text-center border-2 rounded-xl py-3 text-[13px] font-semibold bg-white" style={{ borderColor: "#03c75a", color: "#03c75a" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#03c75a"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/></svg>
            네이버에서 메뉴·가격·영업시간 보기
          </OutboundLink>
          {/* 🔁 비슷한 카페 더보기 — 같은 동네 + 결(taste) 유사도, 검증/참고 등급 우선(리텐션, 홍보×경험 #94, decisions #338) */}
          {nearby.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-bold text-[#5a4632]">☕ {c.area} 비슷한 카페 더보기</div>
                <Link href={`/area/${encodeURIComponent(c.area)}`} className="text-[11px] text-[#7a5122] whitespace-nowrap">동네 전체 보기 →</Link>
              </div>
              <div className="flex flex-col gap-2">
                {nearby.map((nc: any) => (
                  <Link key={nc.id} href={`/c/${nc.id}`} className="flex items-center gap-2 bg-white border border-[#e0d3bd] rounded-xl px-3.5 py-2.5">
                    <span className="flex flex-col text-left min-w-0">
                      <span className="text-[13.5px] font-bold text-[#3d2f22] truncate">{nc.name}</span>
                      <span className="text-[10.5px] text-[#6f6047] truncate">검증후기 {nc.synth_count ?? 0}건</span>
                    </span>
                    {nc.synth_grade && <span className="ml-auto text-[10px] font-bold bg-[#2b2018] text-[#e8b87a] px-2 py-0.5 rounded-full whitespace-nowrap">{nc.synth_grade}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {/* 🧭 테마 페이지 역링크(2026-08-13 신설) — 유입 실측: 성장 엔진이 /area/{지역}/{테마}(성북구/work 41회 등,
              네이버 유입 95%)인데 상세 13,484페이지에서 거기로 가는 링크가 0이었다. 이 카페가 강한 결 상위 2개를
              앵커텍스트("{지역} {테마} 카페")로 연결 → 크롤 동선·테마 페이지 랭킹 강화 + 사용자 다음 행동 제공.
              char_scores 키 = TASTES 키(동일 축)라 별도 매핑·추가 조회 0. */}
          {(() => {
            const themed = Object.entries((c.char_scores ?? {}) as Record<string, number>)
              .filter(([k, v]) => Number(v) > 0 && tasteByKey(k))
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .slice(0, 2)
              .map(([k]) => tasteByKey(k)!);
            return themed.length > 0 ? (
              <div className="mt-4 flex flex-col gap-2">
                {themed.map((t) => (
                  <Link key={t.key} href={`/area/${encodeURIComponent(c.area)}/${t.key}`}
                    className="flex items-center justify-between gap-2 rounded-xl px-4 py-3 border border-[#d8c8ad] bg-white">
                    <span className="text-[12.5px] font-semibold text-[#5a4632]">{t.emoji} {c.area} {t.label} 카페 더 찾기</span>
                    <span className="text-[#7a5122] text-[12px]">→</span>
                  </Link>
                ))}
              </div>
            ) : null;
          })()}
          {/* 🕘 최근 본 카페(2026-08-16 리텐션) — 이 카페를 기록하고, 이전에 본 카페들을 이어보게 한다.
              저장 행동을 요구하지 않는 자동 축적 방식(기존 북마크는 4건뿐이었다). localStorage·서버 조회 0. */}
          <RecentCafes current={{ id: Number(c.id), name: c.name, area: c.area, grade: grade || undefined }} />

          {/* 동네 교차검증 컬렉션 상호링크(크롤 동선·SEO) — 레지스트리 게이팅 */}
          {(() => {
            const col = collectionForCafe(c.dong, c.area);
            return col ? (
              <Link href={`/collections/${col.slug}`} className="mt-3 flex items-center justify-between gap-2 w-full rounded-xl px-4 py-3 border border-[#d8c8ad] bg-white">
                <span className="flex flex-col text-left">
                  <span className="text-[12.5px] font-bold text-[#5a4632]">📌 {col.label} 카페, 협찬 없이 교차검증한 곳</span>
                  <span className="text-[10.5px] text-[#6f6047]">광고·협찬·타지점 후기 빼고 실방문 후기로만 모아보기</span>
                </span>
                <span className="text-[#7a5122] font-bold whitespace-nowrap">→</span>
              </Link>
            ) : null;
          })()}
          {/* ❓ 자주 묻는 질문 — AI답변엔진(ChatGPT 등) 인용 최적화, 위 FAQPage JSON-LD와 동일 내용(coordination#226) */}
          {faqs.length > 0 && (
            <div className="mt-6">
              <div className="text-[13px] font-bold text-[#5a4632] mb-2">❓ 자주 묻는 질문</div>
              <div className="flex flex-col gap-2">
                {faqs.map((f) => (
                  <details key={f.q} className="bg-white border border-[#e0d3bd] rounded-xl px-3.5 py-2.5">
                    <summary className="text-[13px] font-bold text-[#3d2f22] cursor-pointer">{f.q}</summary>
                    <p className="text-[12.5px] text-[#665036] mt-1.5 leading-relaxed">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          )}
          {/* 사장님 CTA — 카페 상세 → owner 인사이트 진입(B2B 퍼널, decisions #15). 클릭 계측: decisions #782 */}
          <OwnerCtaLink cafeId={c.id} cafeName={c.name} className="mt-3 flex items-center justify-between gap-2 w-full rounded-xl px-4 py-3 border border-[#e6d2b5]" style={{ background: "linear-gradient(90deg,#fbf3e4,#f4ece0)" }}>
            <span className="flex flex-col text-left">
              <span className="text-[12.5px] font-bold text-[#7a5a2a]">☕ 이 카페 사장님이신가요?</span>
              <span className="text-[10.5px] text-[#6f6047]">후기 데이터로 보는 우리 가게 강점·약점 — 무료 인사이트</span>
            </span>
            <span className="text-[#c98a3c] font-bold whitespace-nowrap">→</span>
          </OwnerCtaLink>
        </div>
      </div>
    </main>
  );
}
