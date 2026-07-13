import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { sql } from "@/lib/db";
import KakaoShare from "../../KakaoShare";
import SaveMemoryButton from "./SaveMemoryButton";
import VisitorReviews from "../../VisitorReviews";
import { buildAxisDist, cafeProfile, extractHighlights, tasteVector, tasteSimilarity, GRADE_RANK } from "@/lib/cafeProfile";
import { collectionForCafe } from "@/lib/collections";
import { shareHookText } from "@/lib/shareCopy";

export const runtime = "nodejs";
export const revalidate = 3600; // ISR 1시간

// 전체 카페 결 분포(강·약 판단용) — 요청 내 1회만(ISR 캐시와 함께 부하 최소화)
const getAxisDist = cache(async () => {
  try { return buildAxisDist((await sql`SELECT char_scores, synth_count FROM cafes WHERE published AND char_scores IS NOT NULL`) as any[]); }
  catch { return buildAxisDist([]); }
});

const SITE = "https://dongnecoffeenote.com";
const CHAR: Record<string, string> = { roast: "🔥 직접로스팅", work: "💻 작업하기 좋은", quiet: "🤍 조용한", dessert: "🍰 디저트", mood: "📸 분위기", space: "🪑 넓은공간" };

type Props = { params: Promise<{ id: string }> };

async function getCafe(id: string) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return (await sql`SELECT id, name, area, dong, address, lat, lng, synth_grade, synth_identity, synth_count, char_scores, synth_reviews_all, synth_reviews, reputation_note FROM cafes WHERE id=${n} AND published=true LIMIT 1`)[0] as any ?? null;
  } catch { return null; }
}
// 등급(검증/참고/후보)→JSON-LD aggregateRating.ratingValue 근사치. 별점을 직접 수집하지 않으므로 등급 기반 대리값.
const GRADE_RATING: Record<string, number> = { "검증": 4.8, "참고": 4.5, "후보": 4.2 };
function topTags(cs: any): string[] {
  if (!cs || typeof cs !== "object") return [];
  return Object.entries(cs).filter(([k, v]) => CHAR[k] && (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 4).map(([k]) => CHAR[k]);
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
    await sql`ALTER TABLE user_visits ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false`.catch(() => {});
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
  const evAll = (c.synth_reviews_all ?? c.synth_reviews ?? []) as any[];
  const highlights = extractHighlights((Array.isArray(evAll) ? evAll : []).map((e: any) => e?.quote || ""));
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
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      <div className="max-w-xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="text-[#9c6b3f] text-sm">← 동네 커피 노트</Link>
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
            <p className="text-[#9c6b3f] text-sm">{c.area}</p>
            <SaveMemoryButton cafeId={c.id} cafeName={c.name} cafeArea={c.area} />
          </div>
          {/* ❤ MY PIN(내 카페 추억) 노출 배너 — 상세페이지에서 인지도가 낮아 CTA로 강화(#339). 2단계 저장·무가입 원칙 무변, 노출만 강화 */}
          <div className="mb-3">
            <SaveMemoryButton cafeId={c.id} cafeName={c.name} cafeArea={c.area} variant="banner" />
          </div>
          {/* 📊 리뷰 데이터 분석 — 옥석 후기 핵심 */}
          {(highlights.length > 0 || c.synth_identity) && (
            <div className="bg-gradient-to-b from-[#f4eee2] to-[#ece4d4] rounded-xl px-4 py-3.5 mb-3 border border-[#d8c8ad]">
              <div className="text-[11px] font-bold text-[#7a5f3c] uppercase tracking-wider mb-2">📊 리뷰 데이터 분석 · 검증 후기 {c.synth_count ?? 0}건</div>
              {c.synth_identity && <div className="text-[14px] font-semibold text-[#3d2f22] leading-relaxed mb-2.5">{c.synth_identity}</div>}
              {highlights.length > 0 && (
                <>
                  <div className="text-[10.5px] text-[#9c6b3f] mb-1.5">후기에서 가장 많이 나온 것 · 숫자=언급 후기 수</div>
                  <div className="flex flex-wrap gap-1.5">
                    {highlights.map((h, i) => (
                      <span key={h.label} className={`text-[12.5px] rounded-full pl-2.5 pr-1.5 py-1 border font-semibold inline-flex items-center gap-1.5 ${i === 0 ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#52402e] border-[#d8c8ad]"}`}>
                        {h.emoji} {h.label}
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-[1px] ${i === 0 ? "bg-[#e8b87a] text-[#2b2018]" : "bg-[#efe9dd] text-[#8a7458]"}`}>{h.count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
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
              <p className="text-[10px] text-[#a8927a] mt-2.5 leading-relaxed">기준은 <b>후기 1건당 언급 비율</b>이에요 — 후기 수가 많고 적음을 보정한 공정한 비교입니다. '평균의 N배'·'상위/하위 %'는 전체 카페와 같은 기준으로 비교한 값. 절대 평가가 아닙니다.</p>
            </div>
          ) : tags.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-[#9c6b3f] mb-1.5">이 카페가 후기에서 자주 언급되는 결</div>
              <div className="flex flex-wrap gap-2">{tags.map((t) => <span key={t} className="text-[13px] bg-[#efe6d6] rounded-full px-3 py-1">{t}</span>)}</div>
            </div>
          )}
          <p className="text-[12.5px] text-[#8a7458] mb-4 leading-relaxed">네이버 공개 후기 <b>{c.synth_count ?? 0}건</b>을 교차검증한 데이터 기반 소개예요.</p>
          {/* 방문자 후기 — 하단 버튼 바로 위 */}
          {userReviews.length > 0 && <div className="mb-4"><VisitorReviews reviews={userReviews} /></div>}
          <Link href={`/?cafe=${c.id}`} className="block w-full text-center bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-bold">지도·근거 후기 보기 →</Link>
          {/* 메뉴·가격·영업시간은 권위 원천(네이버 플레이스)으로 연결 — 항상 정확·최신 */}
          <a href={`/api/naver-place-redirect?id=${c.id}`} target="_blank" rel="noopener noreferrer" className="mt-2.5 flex items-center justify-center gap-1.5 w-full text-center border-2 rounded-xl py-3 text-[13px] font-semibold bg-white" style={{ borderColor: "#03c75a", color: "#03c75a" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#03c75a"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/></svg>
            네이버에서 메뉴·가격·영업시간 보기
          </a>
          {/* 🔁 비슷한 카페 더보기 — 같은 동네 + 결(taste) 유사도, 검증/참고 등급 우선(리텐션, 홍보×경험 #94, decisions #338) */}
          {nearby.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-bold text-[#5a4632]">☕ {c.area} 비슷한 카페 더보기</div>
                <Link href={`/area/${encodeURIComponent(c.area)}`} className="text-[11px] text-[#9c6b3f] whitespace-nowrap">동네 전체 보기 →</Link>
              </div>
              <div className="flex flex-col gap-2">
                {nearby.map((nc: any) => (
                  <Link key={nc.id} href={`/c/${nc.id}`} className="flex items-center gap-2 bg-white border border-[#e0d3bd] rounded-xl px-3.5 py-2.5">
                    <span className="flex flex-col text-left min-w-0">
                      <span className="text-[13.5px] font-bold text-[#3d2f22] truncate">{nc.name}</span>
                      <span className="text-[10.5px] text-[#9c8a6c] truncate">검증후기 {nc.synth_count ?? 0}건</span>
                    </span>
                    {nc.synth_grade && <span className="ml-auto text-[10px] font-bold bg-[#2b2018] text-[#e8b87a] px-2 py-0.5 rounded-full whitespace-nowrap">{nc.synth_grade}</span>}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {/* 동네 교차검증 컬렉션 상호링크(크롤 동선·SEO) — 레지스트리 게이팅 */}
          {(() => {
            const col = collectionForCafe(c.dong, c.area);
            return col ? (
              <Link href={`/collections/${col.slug}`} className="mt-3 flex items-center justify-between gap-2 w-full rounded-xl px-4 py-3 border border-[#d8c8ad] bg-white">
                <span className="flex flex-col text-left">
                  <span className="text-[12.5px] font-bold text-[#5a4632]">📌 {col.label} 카페, 협찬 없이 교차검증한 곳</span>
                  <span className="text-[10.5px] text-[#9c8a6c]">광고·협찬·타지점 후기 빼고 실방문 후기로만 모아보기</span>
                </span>
                <span className="text-[#9c6b3f] font-bold whitespace-nowrap">→</span>
              </Link>
            ) : null;
          })()}
          {/* 사장님 CTA — 카페 상세 → owner 인사이트 진입(B2B 퍼널, decisions #15) */}
          <Link href={`/owner?name=${encodeURIComponent(c.name)}`} className="mt-3 flex items-center justify-between gap-2 w-full rounded-xl px-4 py-3 border border-[#e6d2b5]" style={{ background: "linear-gradient(90deg,#fbf3e4,#f4ece0)" }}>
            <span className="flex flex-col text-left">
              <span className="text-[12.5px] font-bold text-[#7a5a2a]">☕ 이 카페 사장님이신가요?</span>
              <span className="text-[10.5px] text-[#9c8a6c]">후기 데이터로 보는 우리 가게 강점·약점 — 무료 인사이트</span>
            </span>
            <span className="text-[#c98a3c] font-bold whitespace-nowrap">→</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
