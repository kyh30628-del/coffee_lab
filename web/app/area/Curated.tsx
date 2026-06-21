import Link from "next/link";
import { TASTES, SITE, type SeoCafe } from "@/lib/seoData";
import KakaoShare from "../KakaoShare";

const GRADE_BG: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 후보: "#a8927a" };

// 동네×취향 검증 카페 큐레이션 — SEO 콘텐츠 페이지 공용 렌더(서버 컴포넌트).
export default function Curated({ area, tasteKey, heading, intro, cafes, regions, canonical }: {
  area: string; tasteKey?: string; heading: string; intro: string; cafes: SeoCafe[]; regions: { area: string; n: number }[]; canonical: string;
}) {
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList", name: heading, numberOfItems: cafes.length,
    itemListElement: cafes.slice(0, 20).map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/c/${c.id}`, name: c.name })),
  };
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <div className="max-w-2xl mx-auto px-5 py-9">
        <Link href="/area" className="text-[#9c6b3f] text-[13px] underline">← 지역별 카페</Link>
        <div className="text-[#9c6b3f] text-[11px] tracking-[0.25em] uppercase mt-4 mb-1">동네 커피 노트 · 검증 큐레이션</div>
        <h1 className="text-[26px] font-bold leading-tight mb-2">{heading}</h1>
        <p className="text-[14px] text-[#6b5a48] leading-relaxed mb-3">{intro}</p>
        <p className="text-[12px] text-[#8a7458] bg-white/60 border border-[#e6dcc8] rounded-lg px-3 py-2 mb-6">☕ <b>영수증 리뷰·광고·협찬은 빼고</b>, 네이버·구글·유튜브 공개 후기를 교차검증해 진짜 후기로만 골랐어요.</p>

        {/* 취향 내비 */}
        <div className="flex flex-wrap gap-1.5 mb-6">
          <Link href={`/area/${encodeURIComponent(area)}`} className={`text-[12px] px-2.5 py-1 rounded-full border ${!tasteKey ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#6b5a48] border-[#d9c9b0]"}`}>전체</Link>
          {TASTES.map((t) => (
            <Link key={t.key} href={`/area/${encodeURIComponent(area)}/${t.key}`} className={`text-[12px] px-2.5 py-1 rounded-full border ${tasteKey === t.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#6b5a48] border-[#d9c9b0]"}`}>{t.emoji} {t.short}</Link>
          ))}
        </div>

        {/* 목록 */}
        {cafes.length === 0 ? (
          <p className="text-[13px] text-[#a8927a] py-8 text-center">아직 이 조건에 맞는 검증 카페가 적어요. <Link href={`/area/${encodeURIComponent(area)}`} className="underline text-[#9c6b3f]">{area} 전체 보기</Link></p>
        ) : (
          <ol className="space-y-2.5">
            {cafes.map((c, i) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}`} className="block bg-white rounded-xl border border-[#e6dcc8] px-4 py-3 hover:shadow-sm transition">
                  <div className="flex items-center gap-2">
                    <span className="text-[#bcae98] text-[13px] font-bold w-5 shrink-0">{i + 1}</span>
                    <span className="font-bold text-[15px]">{c.name}</span>
                    {c.dong && <span className="text-[12px] text-[#a8927a]">{c.dong}</span>}
                    {c.grade && <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded ml-auto shrink-0" style={{ background: GRADE_BG[c.grade] || "#a8927a" }}>{c.grade}</span>}
                  </div>
                  {c.identity && <p className="text-[12.5px] text-[#6b5a48] leading-snug mt-1.5 line-clamp-2 pl-7">{c.identity}</p>}
                </Link>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-7">
          <Link href={`/?region=${encodeURIComponent(area)}`} className="block w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 text-center font-bold">{area} 카페 앱에서 더 보기 →</Link>
          <KakaoShare
            title={heading}
            description="영수증 리뷰·광고 빼고 진짜 후기로 검증한 우리 동네 카페"
            imageUrl={`${canonical}/opengraph-image`}
            link={canonical}
            label="🟡 카카오톡으로 공유"
            className="block w-full text-center mt-2 bg-[#FEE500] text-[#3c1e1e] rounded-xl py-2.5 font-bold"
          />
          <link rel="preconnect" href="https://t1.kakaocdn.net" />
        </div>

        {/* 다른 지역 크로스링크 */}
        <div className="mt-8 pt-5 border-t border-[#e6dcc8]">
          <div className="text-[12px] font-bold text-[#9c6b3f] mb-2">다른 동네도 둘러보기</div>
          <div className="flex flex-wrap gap-1.5">
            {regions.filter((r) => r.area !== area).slice(0, 24).map((r) => (
              <Link key={r.area} href={`/area/${encodeURIComponent(r.area)}`} className="text-[12px] px-2.5 py-1 rounded-full bg-white text-[#6b5a48] border border-[#d9c9b0]">{r.area}</Link>
            ))}
          </div>
        </div>
        <div className="mt-6 text-[11px] text-[#a8927a]"><Link href="/" className="underline">동네 커피 노트 홈</Link> · 진짜 후기로 고른 우리 동네 카페</div>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
