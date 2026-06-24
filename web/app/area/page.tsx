import type { Metadata } from "next";
import Link from "next/link";
import { getRegions, TASTES, SITE } from "@/lib/seoData";

export const revalidate = 1800; // 30분 — 비공개/신규 반영 빠르게(이전 1일)

export const metadata: Metadata = {
  title: "동네별 카페 추천 — 수도권 검증 카페 | 동네 커피 노트",
  description: "서울·경기·인천 동네별로 진짜 후기로 검증한 카페를 찾아보세요. 작업·조용·디저트·스페셜티·분위기 취향별 추천.",
  alternates: { canonical: `${SITE}/area` },
  openGraph: { title: "동네별 카페 추천 — 동네 커피 노트", description: "수도권 동네별 검증 카페. 취향별 추천.", url: `${SITE}/area`, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" },
};

export default async function AreaIndex() {
  const regions = await getRegions();
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-2xl mx-auto px-5 py-10">
        <Link href="/" className="text-[#9c6b3f] text-[13px] underline">← 홈</Link>
        <div className="text-[#9c6b3f] text-[11px] tracking-[0.25em] uppercase mt-4 mb-1">동네 커피 노트</div>
        <h1 className="text-[27px] font-bold leading-tight mb-2">동네별 카페 추천</h1>
        <p className="text-[14px] text-[#6b5a48] leading-relaxed mb-6">서울·경기·인천 동네별로 <b>영수증 리뷰·광고 없이 진짜 후기로 검증</b>한 카페를 모았어요. 취향별로도 골라보세요.</p>

        <div className="mb-7">
          <div className="text-[12px] font-bold text-[#9c6b3f] mb-2">취향별</div>
          <div className="flex flex-wrap gap-1.5">
            {TASTES.map((t) => (
              <span key={t.key} className="text-[12.5px] px-3 py-1.5 rounded-full bg-white border border-[#e6dcc8] text-[#52402e]">{t.emoji} {t.label}</span>
            ))}
          </div>
          <p className="text-[11px] text-[#a8927a] mt-1.5">동네를 고르면 취향별 추천이 나와요.</p>
        </div>

        <div className="text-[12px] font-bold text-[#9c6b3f] mb-2">동네별 ({regions.length})</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {regions.map((r) => (
            <Link key={r.area} href={`/area/${encodeURIComponent(r.area)}`} className="flex items-center justify-between bg-white rounded-lg border border-[#e6dcc8] px-3 py-2 hover:shadow-sm transition">
              <span className="text-[13px] font-bold truncate">{r.area}</span>
              <span className="text-[11px] text-[#a8927a] shrink-0">{r.n}</span>
            </Link>
          ))}
        </div>
        <div className="mt-7 text-[11px] text-[#a8927a]"><Link href="/" className="underline">동네 커피 노트 홈</Link> · 진짜 후기로 고른 우리 동네 카페</div>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
