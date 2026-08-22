import Link from "next/link";
import { TASTES, SITE, type SeoCafe, type GradeBreakdown } from "@/lib/seoData";
import { standoutBadges } from "@/lib/standoutBadge";
import KakaoShare from "../KakaoShare";
import RecentCafes from "../RecentCafes";

const GRADE_BG: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 후보: "#a8927a" };

// 동네×취향 검증 카페 큐레이션 — SEO 콘텐츠 페이지 공용 렌더(서버 컴포넌트).
// 동(洞) 단위 페이지(app/area/[gu]/dong/[dong])도 이 컴포넌트를 재사용 — backHref/showTasteNav/crossLinks로 분기.
export default function Curated({ area, tasteKey, tasteLabel, tasteEmoji, heading, intro, cafes, regions = [], grades, canonical, backHref = "/area", backLabel = "지역별 카페", showTasteNav = true, crossLinks, crossLinksLabel = "다른 동네도 둘러보기", extra, tasteCounts, sameTasteNearby = [] }: {
  area: string; tasteKey?: string; tasteLabel?: string; tasteEmoji?: string; heading: string; intro: string; cafes: SeoCafe[]; regions?: { area: string; n: number }[]; grades?: GradeBreakdown; canonical: string;
  backHref?: string; backLabel?: string; showTasteNav?: boolean; crossLinks?: { label: string; href: string }[]; crossLinksLabel?: string; extra?: React.ReactNode;
  /** 이 지역의 테마별 카페 수 — 빈 테마 칩을 숨겨 '눌렀더니 빈 페이지' 이탈을 막는다(2026-08-15). */
  tasteCounts?: Record<string, number>;
  /** 같은 테마를 유지한 인근 지역 링크 — 기존 크로스링크는 테마를 잃어버려 맥락이 끊겼다. */
  sameTasteNearby?: { area: string; n: number }[];
}) {
  // 🧭 BreadcrumbList(2026-08-13, 구글 채널 강화) — 구글이 검색결과에 계층 경로를 표시하고
  //   사이트 구조를 이해하는 근거. 테마 페이지는 홈>지역>테마, 동/지역 페이지는 홈>지역 2단.
  const crumbs = [
    { name: "동네 커피 노트", url: SITE },
    { name: `${area} 카페`, url: `${SITE}/area/${encodeURIComponent(area)}` },
    ...(tasteKey && tasteLabel ? [{ name: `${area} ${tasteLabel} 카페`, url: canonical }] : []),
  ];
  const breadcrumbLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: crumbs.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, item: b.url })),
  };
  // 히어로 = 목록 1위. 3곳 미만이면 "1위"라는 표현 자체가 과장이라 쓰지 않는다(근거 없는 단정 금지).
  // 🏅 "이 집만의 한 가지"(2026-08-22) — 카드 30개가 전부 `등급+후기수+한줄소개`로 똑같아 보여
  //   고를 근거가 없다는 게 이탈 45.4%의 원인이었다. 같은 동네·같은 테마 안에서
  //   **평균보다 두드러진 축**을 하나씩 붙여 카드를 갈라준다(절대 임계는 96%가 걸려 무용지물이었다).
  //   비용 0 — 이미 받은 char_scores로 계산하는 순수함수.
  const badges = standoutBadges(cafes as any[], tasteKey);
  const hero = cafes.length >= 3 ? cafes[0] : null;
  const rest = hero ? cafes.slice(1) : cafes;
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList", name: heading, numberOfItems: cafes.length,
    itemListElement: cafes.slice(0, 20).map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/c/${c.id}`, name: c.name })),
  };
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div className="max-w-2xl mx-auto px-5 py-9">
        <Link href={backHref} className="text-[#7a5122] text-[13px] underline">← {backLabel}</Link>
        <div className="text-[#7a5122] text-[11px] tracking-[0.25em] uppercase mt-4 mb-1">동네 커피 노트 · 검증 큐레이션</div>
        <h1 className="text-[26px] font-bold leading-tight mb-2">{heading}</h1>
        <p className="text-[14px] text-[#524234] leading-relaxed mb-3">{intro}</p>
        <p className="text-[12px] text-[#665036] bg-white/60 border border-[#e6dcc8] rounded-lg px-3 py-2 mb-6">☕ <b>영수증 리뷰·광고·협찬은 빼고</b>, 네이버·구글·유튜브 공개 후기를 교차검증해 진짜 후기로만 골랐어요. <Link href="/trust" className="underline text-[#7a5122]">검증 방법</Link></p>

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
            {TASTES.filter((t) => !tasteCounts || t.key === tasteKey || (tasteCounts[t.key] ?? 0) > 0).map((t) => (
              <Link key={t.key} href={`/area/${encodeURIComponent(area)}/${t.key}`} className={`text-[12px] px-2.5 py-1 rounded-full border ${tasteKey === t.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#524234] border-[#d9c9b0]"}`}>
                {t.emoji} {t.short}{tasteCounts && (tasteCounts[t.key] ?? 0) > 0 && <span className="ml-1 opacity-60">{tasteCounts[t.key]}</span>}
              </Link>
            ))}
          </div>
        )}

        {/* 🥇 "답 먼저" 히어로(2026-08-17) — 목록이 아니라 **결론 하나**를 먼저 준다.
            실측 근거: 테마 페이지가 유입의 87%인데 체류 **중앙값 6.9초**다. 카드 30개를 내려놓으면
            사용자는 고르지 못하고 떠난다. 그리고 우리가 가진 근거(78.5%가 검증후기 10건 이상)는
            카드 안 70자 인용문으로만 새어나가고 있었다 — 해자가 화면에 안 보였다는 뜻이다.
            → 1위 한 곳을 크게, **왜 1위인지 숫자로** 먼저 보여준다. 순위 기준은 목록과 동일
              (테마 페이지=그 결의 언급 건수, 지역 페이지=검증 등급·후기량)이라 목록과 어긋나지 않는다.
            ⚠️ 추가 DB 조회 0 — 이미 받아온 cafes[0]을 다르게 그릴 뿐이다. */}
        {hero && (
          <Link href={`/c/${hero.id}`} className="block bg-white rounded-2xl border-2 border-[#c9b48c] px-5 py-4 mb-4 hover:shadow-md transition">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold text-white bg-[#7a5122] px-2 py-0.5 rounded-full">
                {tasteLabel ? `${tasteEmoji ?? ""} ${tasteLabel} 1위` : "가장 검증이 두꺼운 곳"}
              </span>
              {hero.grade && <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: GRADE_BG[hero.grade] || "#a8927a" }}>{hero.grade}</span>}
              {badges[0] && <span className="text-[10px] font-bold text-[#5a4a2e] bg-[#f0e6d2] border border-[#ddd0b6] px-1.5 py-0.5 rounded-full">{badges[0].emoji} 이 동네에서 유독 {badges[0].label}</span>}
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-bold text-[21px] leading-tight">{hero.name}</span>
              {hero.dong && <span className="text-[12.5px] text-[#665036]">{hero.dong}</span>}
            </div>
            {/* 근거를 문장이 아니라 **숫자**로 — 이게 우리가 다른 서비스와 다른 지점이다. */}
            <p className="text-[13px] font-bold text-[#5f7355] mt-2">
              {tasteKey && typeof hero.tasteHits === "number" && hero.tasteHits > 0 ? (
                <>후기 {hero.count ?? 0}건 중 <span className="text-[15px]">{hero.tasteHits}건</span>이 {tasteLabel} 이야기
                  {hero.count ? <span className="font-normal text-[#665036]"> ({Math.round((hero.tasteHits / hero.count) * 100)}%)</span> : null}</>
              ) : (
                <>교차검증한 진짜 후기 <span className="text-[15px]">{hero.count ?? 0}건</span></>
              )}
            </p>
            {hero.identity && <p className="text-[13px] text-[#3d2f22] leading-relaxed mt-1.5">{hero.identity}</p>}
            {hero.quote && <p className="text-[12.5px] text-[#665036] leading-relaxed mt-2 pl-2.5 border-l-2 border-[#e0d3b8]">“{hero.quote}”</p>}
            <span className="inline-block text-[12.5px] font-semibold text-[#7a5122] mt-2.5">근거 후기 전부 보기 →</span>
          </Link>
        )}

        {/* 🗺️ 지도 CTA를 목록 **위**로(2026-08-16) — 실측: 테마 페이지 착지 377명 중 193명(51%)이 1페이지 이탈인데,
            기존 CTA는 카드 30개 아래에 있어 사실상 안 보였다. 반면 지도(홈)에 도달한 사람의 이탈률은 **3%**
            (78명 중 2명) — 우리 서비스의 체류는 지도에서 만들어진다. 그 입구를 첫 화면으로 올린다.
            ⚠️ taste를 딥링크에 실어 맥락 보존 — 예전 `?region=`만 넘기면 "마포 카공" 보던 사람이 마포 전체로 떨어졌다. */}
        <Link href={`/?region=${encodeURIComponent(area)}${tasteKey ? `&taste=${tasteKey}` : ""}`}
          className="flex items-center justify-between gap-2 w-full rounded-xl px-4 py-3 mb-5 border border-[#d8c8ad] bg-white">
          <span className="text-[13px] font-semibold text-[#3d2f22]">
            🗺️ {area} {tasteLabel ? `${tasteLabel} ` : ""}카페 지도에서 보기
            <span className="block text-[11px] text-[#8a7355] font-normal mt-0.5">위치·거리 확인하고 취향으로 골라보기</span>
          </span>
          <span className="text-[#7a5122] text-[13px]">→</span>
        </Link>

        {/* 목록 */}
        {cafes.length === 0 ? (
          <p className="text-[13px] text-[#665036] py-8 text-center">아직 이 조건에 맞는 검증 카페가 적어요. <Link href={`/area/${encodeURIComponent(area)}`} className="underline text-[#7a5122]">{area} 전체 보기</Link></p>
        ) : (
          <ol className="space-y-2.5">
            {rest.map((c, i) => (
              <li key={c.id}>
                <Link href={`/c/${c.id}`} className="block bg-white rounded-xl border border-[#e6dcc8] px-4 py-3 hover:shadow-sm transition">
                  <div className="flex items-center gap-2">
                    <span className="text-[#82714f] text-[13px] font-bold w-5 shrink-0">{i + (hero ? 2 : 1)}</span>
                    <span className="font-bold text-[15px]">{c.name}</span>
                    {c.dong && <span className="text-[12px] text-[#665036]">{c.dong}</span>}
                    {badges[i + (hero ? 1 : 0)] && (
                      <span className="text-[10px] font-bold text-[#5a4a2e] bg-[#f0e6d2] border border-[#ddd0b6] px-1.5 py-0.5 rounded-full shrink-0">
                        {badges[i + (hero ? 1 : 0)]!.emoji} {badges[i + (hero ? 1 : 0)]!.label}
                      </span>
                    )}
                    {c.grade && <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded ml-auto shrink-0" style={{ background: GRADE_BG[c.grade] || "#a8927a" }}>{c.grade}</span>}
                  </div>
                  {/* 🎯 이 페이지의 취향이 '이 카페 후기에서 실제로 몇 번 나왔는지' — 목록 전체가 같은 한줄소개로
                      보이던 문제(공개 13,460곳 중 고유 한줄 7,654개)를 이 카페만의 숫자로 갈라준다. */}
                  {tasteKey && typeof c.tasteHits === "number" && c.tasteHits > 0 && (
                    <p className="text-[11.5px] font-bold text-[#5f7355] mt-1.5 pl-7">
                      {tasteEmoji} {tasteLabel} 후기 {c.tasteHits}건
                      {c.count ? <span className="font-normal text-[#665036]"> · 전체 후기 {c.count}건 중 {Math.round((c.tasteHits / c.count) * 100)}%</span> : null}
                    </p>
                  )}
                  {c.identity && <p className="text-[12.5px] text-[#524234] leading-snug mt-1.5 line-clamp-2 pl-7">{c.identity}</p>}
                  {c.quote && <p className="text-[11.5px] text-[#665036] leading-snug mt-1 line-clamp-1 pl-7">“{c.quote}”</p>}
                </Link>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-7">
          <Link href={`/?region=${encodeURIComponent(area)}${tasteKey ? `&taste=${tasteKey}` : ""}`} className="block w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 text-center font-bold">🗺️ {area} 카페 지도에서 보기 →</Link>
          <KakaoShare
            title={heading}
            description="영수증 리뷰·광고 빼고 진짜 후기로 검증한 우리 동네 카페"
            imageUrl={`${canonical}/opengraph-image`}
            link={canonical}
            source="동네목록"
            label="🟡 카카오톡으로 공유"
            className="block w-full text-center mt-2 bg-[#FEE500] text-[#3c1e1e] rounded-xl py-2.5 font-bold"
          />
          <link rel="preconnect" href="https://t1.kakaocdn.net" />
        </div>

        {/* 🧭 같은 테마·다른 동네(2026-08-15) — 실측: 테마 페이지 착지 신규방문자의 49%가 1페이지만 보고 이탈.
            기존 크로스링크는 `/area/{다른지역}`으로만 보내 **테마 맥락을 잃었다**("안산 카공" 보던 사람이 파주 전체 목록으로).
            같은 테마를 유지한 채 옆 동네로 넘어가게 해 다음 행동을 만든다. 추가 조회 없음(부모가 이미 가진 카운트 재사용). */}
        {tasteKey && tasteLabel && sameTasteNearby.length > 0 && (
          <div className="mt-7">
            <div className="text-[13px] font-bold text-[#5a4632] mb-2">🧭 다른 동네 {tasteLabel} 카페</div>
            <div className="flex flex-wrap gap-1.5">
              {sameTasteNearby.map((r) => (
                <Link key={r.area} href={`/area/${encodeURIComponent(r.area)}/${tasteKey}`}
                  className="text-[12px] px-2.5 py-1 rounded-full bg-white text-[#524234] border border-[#d9c9b0]">
                  {r.area} <span className="opacity-60">{r.n}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {extra}

        {/* 🕘 최근 본 카페(2026-08-16 리텐션) — 표시만(기록은 상세에서). 재방문자가 테마 페이지에 다시 착지해도
            "내가 보던 것"으로 바로 이어갈 수 있게. 첫 방문자에겐 렌더되지 않는다. */}
        <RecentCafes />

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
