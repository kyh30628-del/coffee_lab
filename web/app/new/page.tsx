import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { SITE } from "@/lib/seoData";

// 🆕 "새로 발굴한 카페"(2026-08-13, P2 — CEO 승인) — 월 500곳+ 신규 발굴은 자율 발굴 엔진이 만드는
//   **경쟁자가 못 베끼는 독점 데이터**다(데이터랩 '신상카페' 수요 상시 존재). 최근 30일 공개분을 지역별로 노출.
//   비용: 작은 컬럼 조회 1회 · ISR 12시간(하루 2회 재생성).
export const runtime = "nodejs";
export const revalidate = 43200;

export const metadata: Metadata = {
  title: "이번 달 새로 발굴한 카페 — 동네 커피 노트",
  description: "동네 커피 노트가 최근 30일 사이 새로 발굴하고 리뷰 교차검증을 마친 수도권 신상 카페. 광고·협찬 후기는 빼고 진짜 후기로만 검증했어요.",
  alternates: { canonical: `${SITE}/new` },
  openGraph: { title: "이번 달 새로 발굴한 카페", description: "리뷰 교차검증을 마친 수도권 신상 카페", url: `${SITE}/new`, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" },
};

async function getNew() {
  try {
    return (await sql`
      SELECT id, name, area, dong, synth_grade, synth_count, synth_identity,
        (created_at AT TIME ZONE 'Asia/Seoul')::date AS found_on
      FROM cafes WHERE published AND created_at > now() - interval '30 days'
      ORDER BY created_at DESC LIMIT 300`) as any[];
  } catch { return []; }
}

export default async function NewCafesPage() {
  const rows = await getNew();
  // 지역별 그룹(많은 순) — 한 지역 안에서는 최신순 유지
  const byArea = new Map<string, any[]>();
  for (const r of rows) { const k = r.area ?? "기타"; if (!byArea.has(k)) byArea.set(k, []); byArea.get(k)!.push(r); }
  const areas = [...byArea.entries()].sort((a, b) => b[1].length - a[1].length);
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList", name: "이번 달 새로 발굴한 카페", numberOfItems: rows.length,
    itemListElement: rows.slice(0, 20).map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/c/${c.id}`, name: c.name })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "동네 커피 노트", item: SITE },
      { "@type": "ListItem", position: 2, name: "새로 발굴한 카페", item: `${SITE}/new` },
    ],
  };
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div className="max-w-2xl mx-auto px-5 py-9">
        <Link href="/area" className="text-[#7a5122] text-[13px] underline">← 지역별 카페</Link>
        <div className="text-[#7a5122] text-[11px] tracking-[0.25em] uppercase mt-4 mb-1">동네 커피 노트 · 새 발굴</div>
        <h1 className="text-[26px] font-bold leading-tight mb-2">🆕 이번 달 새로 발굴한 카페 {rows.length}곳</h1>
        <p className="text-[14px] text-[#524234] leading-relaxed mb-3">최근 30일 사이 새로 찾아내고 <b>리뷰 교차검증</b>까지 마친 카페들이에요. 매일 자동 발굴이 돌고 있어 이 목록은 계속 새로워져요.</p>
        <p className="text-[12px] text-[#665036] bg-white/60 border border-[#e6dcc8] rounded-lg px-3 py-2 mb-6">☕ <b>영수증 리뷰·광고·협찬은 빼고</b>, 네이버·구글·유튜브 공개 후기를 교차검증해 진짜 후기로만 골랐어요. <Link href="/trust" className="underline text-[#7a5122]">검증 방법</Link></p>
        {areas.map(([area, cafes]) => (
          <section key={area} className="mb-7">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-[17px] font-bold">{area} <span className="text-[12px] text-[#8a7355] font-normal">{cafes.length}곳</span></h2>
              <Link href={`/area/${encodeURIComponent(area)}`} className="text-[11px] text-[#7a5122] underline">{area} 전체 보기</Link>
            </div>
            <div className="flex flex-col gap-2">
              {cafes.map((c) => (
                <Link key={c.id} href={`/c/${c.id}`} className="flex items-center gap-2.5 bg-white border border-[#e0d3bd] rounded-xl px-3.5 py-2.5">
                  <span className="flex flex-col text-left min-w-0">
                    <span className="text-[13.5px] font-bold text-[#3d2f22] truncate">{c.name}</span>
                    <span className="text-[10.5px] text-[#6f6047] truncate">{[c.dong, c.synth_identity].filter(Boolean).join(" · ").slice(0, 46)}</span>
                  </span>
                  {c.synth_grade && <span className="ml-auto text-[10px] font-bold bg-[#2b2018] text-[#e8b87a] px-2 py-0.5 rounded-full whitespace-nowrap">{c.synth_grade}</span>}
                </Link>
              ))}
            </div>
          </section>
        ))}
        <div className="text-center text-[11px] text-[#9c8a6c] mt-8">매일 자동 발굴·검증 · 동네 커피 노트</div>
      </div>
    </main>
  );
}
