import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cache } from "react";
import { sql } from "@/lib/db";
import KakaoShare from "../../KakaoShare";
import VisitorReviews from "../../VisitorReviews";
import { buildAxisDist, cafeProfile, extractHighlights } from "@/lib/cafeProfile";

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
    return (await sql`SELECT id, name, area, synth_grade, synth_identity, synth_count, char_scores, synth_reviews_all, synth_reviews FROM cafes WHERE id=${n} AND published=true LIMIT 1`)[0] as any ?? null;
  } catch { return null; }
}
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

export default async function CafePage({ params }: Props) {
  const { id } = await params;
  const c = await getCafe(id);
  if (!c) notFound();
  const tags = topTags(c.char_scores);
  const userReviews = await getPublicReviews(c.id);
  const grade = c.synth_grade || "";
  // 인앱 상세와 동일: 강·약(전체 대비) + 옥석 리뷰 데이터 핵심
  const profile = cafeProfile({ char_scores: c.char_scores, synth_count: c.synth_count }, await getAxisDist());
  const evAll = (c.synth_reviews_all ?? c.synth_reviews ?? []) as any[];
  const highlights = extractHighlights((Array.isArray(evAll) ? evAll : []).map((e: any) => e?.quote || ""));
  const jsonLd = {
    "@context": "https://schema.org", "@type": "CafeOrCoffeeShop",
    name: c.name, address: { "@type": "PostalAddress", addressLocality: c.area, addressCountry: "KR" },
    url: `${SITE}/c/${c.id}`, servesCuisine: "Coffee",
    ...(c.synth_identity ? { description: c.synth_identity } : {}),
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
            description={(c.synth_identity || "진짜 후기로 검증한 동네 카페").slice(0, 80)}
            imageUrl={`${SITE}/c/${c.id}/opengraph-image`}
            link={`${SITE}/c/${c.id}`}
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
          <p className="text-[#9c6b3f] text-sm mb-4">{c.area}</p>
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
                          <span className="text-[10.5px] text-[#6f9577]">{s.count}<span className="text-[#a8927a]"> / 평균 {s.avg}</span></span>
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
                        <span className="ml-auto text-[10.5px] text-[#b9935f] whitespace-nowrap">{w.count} / 평균 {w.avg}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-[#a8927a] mt-2.5 leading-relaxed">'언급수 / 평균'은 이 카페와 전체 카페 평균 언급 건수, '상위 %'는 전체 대비 순위예요. 절대 평가가 아닙니다.</p>
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
        </div>
      </div>
    </main>
  );
}
