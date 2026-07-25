import Link from "next/link";
import { TASTES, SITE, type SeoCafe, type GradeBreakdown } from "@/lib/seoData";
import KakaoShare from "../KakaoShare";

const GRADE_BG: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 후보: "#a8927a" };

// 동네×취향 검증 카페 큐레이션 — SEO 콘텐츠 페이지 공용 렌더(서버 컴포넌트).
// 동(洞) 단위 페이지(app/area/[gu]/dong/[dong])도 이 컴포넌트를 재사용 — backHref/showTasteNav/crossLinks로 분기.
export default function Curated({ area, tasteKey, heading, intro, cafes, regions = [], grades, canonical, backHref = "/area", backLabel = "지역별 카페", showTasteNav = true, crossLinks, crossLinksLabel = "다른 동네도 둘러보기", extra }: {
  area: string; tasteKey?: string; heading: string; intro: string; cafes: SeoCafe[]; regions?: { area: string; n: number }[]; grades?: GradeBreakdown; canonical: string;
  backHref?: string; backLabel?: string; showTasteNav?: boolean; crossLinks?: { label: string; href: string }[]; crossLinksLabel?: string; extra?: React.ReactNode;
}) {
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList", name: heading, numberOfItems: cafes.length,
    itemListElement: cafes.slice(0, 20).map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/c/${c.id}`, name: c.name })),
  };
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <div className="max-w-2xl mx-auto px-5 py-9">
        <Link href={backHref} className="text-[#7a5122] text-[13px] underline">← {backLabel}</Link>
        <div className="text-[#7a5122] text-[11px] tracking-[0.25em] uppercase mt-4 mb-1">동네 커피 노트 · 검증 큐레이션</div>
        <h1 className="text-[26px] font-bold leading-tight mb-2">{heading}</h1>
        <p className="text-[14px] text-[#524234] leading-relaxed mb-3">{intro}</p>
        <p className="text-[12px] text-[#665036] bg-white/60 border border-[#e6dcc8] rounded-lg px-3 py-2 mb-6">☕ <b>영수증 리뷰·광고·협찬은 빼고</b>, 네이버·구글·유튜브 공개 후기를 교차검증해 진짜 후기로만 골랐어요.</p>

        {/* 후기 근거 요약 — 등급 분포로 검증 신뢰도를 투명하게 표시(콘텐츠 밀도 보강) */}
        {tasteKey && grades && (grades.verified + grades.ref + grades.candidate) > 0 && (
          <p className="text-[11.5px] text-[#665036] -mt-4 mb-6">
            후기 근거: 검증 {grades.verified}곳 · 참고 {grades.ref}곳{grades.candidate ? ` · 후보 ${grades.candidate}곳` : ""}
          </p>
        )}

        {/* 취향 내비 */}
        {showTasteNav && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            <Link href={`/area/${encodeURIComponent(area)}`} className={`text-[12px] px-2.5 py-1 rounded-full border ${!tasteKey ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#524234] border-[#d9c9b0]"}`}>전체</Link>
            {TASTES.map((t) => (
              <Link key={t.key} href={`/area/${encodeURIComponent(area)}/${t.key}`} className={`text-[12px] px-2.5 py-1 rounded-full border ${tasteKey === t.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#524234] border-[#d9c9b0]"}`}>{t.emoji} {t.short}</Link>
            ))}
          </div>
        )}

        {/* 목록 */}
        {cafes.length === 0 ? (
          <p className="text-[13px] text-[#665036] py-8 text-center">아직 이 조건에 맞는 검증 카페가 적어요. <Link href={`/area/${encodeURIComponent(area)}`} className="underline text-[#7a5122]">{area} 전체 보기</Link></p>
        ) : (
          <ol className="space-y-2.5">
            {cafes.map((c, i) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}`} className="block bg-white rounded-xl border border-[#e6dcc8] px-4 py-3 hover:shadow-sm transition">
                  <div className="flex items-center gap-2">
                    <span className="text-[#82714f] text-[13px] font-bold w-5 shrink-0">{i + 1}</span>
                    <span className="font-bold text-[15px]">{c.name}</span>
                    {c.dong && <span className="text-[12px] text-[#665036]">{c.dong}</span>}
                    {c.grade && <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded ml-auto shrink-0" style={{ background: GRADE_BG[c.grade] || "#a8927a" }}>{c.grade}</span>}
                  </div>
                  {c.identity && <p className="text-[12.5px] text-[#524234] leading-snug mt-1.5 line-clamp-2 pl-7">{c.identity}</p>}
                  {c.quote && <p className="text-[11.5px] text-[#665036] leading-snug mt-1 line-clamp-1 pl-7">“{c.quote}”</p>}
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

        {extra}

        {/* 다른 지역/동 크로스링크 — 내부링크로 신규 페이지 크롤 확산 */}
        <div className="mt-8 pt-5 border-t border-[#e6dcc8]">
          <div className="text-[12px] font-bold text-[#7a5122] mb-2">{crossLinksLabel}</div>
          <div className="flex flex-wrap gap-1.5">
            {(crossLinks ?? regions.filter((r) => r.area !== area).slice(0, 24).map((r) => ({ label: r.area, href: `/area/${encodeURIComponent(r.area)}` }))).map((c) => (
              <Link key={c.href} href={c.href} className="text-[12px] px-2.5 py-1 rounded-full bg-white text-[#524234] border border-[#d9c9b0]">{c.label}</Link>
            ))}
          </div>
        </div>
        <div className="mt-6 text-[11px] text-[#665036]"><Link href="/" className="underline">동네 커피 노트 홈</Link> · 진짜 후기로 고른 우리 동네 카페</div>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
