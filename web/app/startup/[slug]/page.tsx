import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { buildStartupReport, reportBySlug, STARTUP_REPORTS, REPORT_PRICE } from "@/lib/startupReport";
import Report from "./Report";
import OrderForm from "./OrderForm";

export const runtime = "nodejs";
export const revalidate = 86400; // 무료 미리보기: 하루 1회만 DB
export const dynamicParams = false;
export function generateStaticParams() { return STARTUP_REPORTS.map((r) => ({ slug: r.slug })); }

const SITE = "https://dongnecoffeenote.com";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const d = reportBySlug(slug); if (!d) return {};
  const title = `${d.title} 카페 창업 리포트 — 검증 후기로 본 상권·빈 자리·개업·폐업`;
  const desc = `${d.title} 카페 ${d.dongs.join('·')} 검증 후기 데이터로 본 성격 12축, 비어 있는 포지션, 상위 카페, 최근 1년 개업·폐업(인허가), 손님 검색어. 예비 창업자용.`;
  return { title, description: desc, alternates: { canonical: `${SITE}/startup/${slug}` }, openGraph: { title, description: desc, url: `${SITE}/startup/${slug}`, siteName: "동네 커피 노트", type: "article", locale: "ko_KR" } };
}

export default async function StartupReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await buildStartupReport(slug);
  if (!r) notFound();
  return (
    <main className="nt-app nt-paper min-h-screen">
      <div className="max-w-xl mx-auto nt-page pb-12 overflow-hidden" style={{ ["--nt-mx" as any]: "36px" }}>
        <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
          <Link href="/" className="text-[13px] text-[#63523f]">← 동네 커피 노트</Link>
        </div>
        <div className="nt-ruled nt-margin-gutter nt-band nt-torn-b" style={{ paddingTop: 34, paddingBottom: 34 }}>
          <div className="nt-eyebrow">카페 창업 리포트 · {r.def.area}</div>
          <h1 className="nt-title text-[28px]"><span className="nt-hl latte">{r.def.title}</span></h1>
          <p className="text-[14px] text-[#5c4b3c]">{r.def.blurb}</p>
        </div>
        <Report r={r} full={false} />
        <section className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
          <div className="nt-sec">전문 열람 · ₩{REPORT_PRICE.toLocaleString()} (1회)</div>
          <p className="text-[13.5px] text-[#2a1f17]">비어 있는 자리, 상위 5곳의 무기, 최근 1년 개업·폐업 명단, 후기 추세, 손님 검색어까지 잠긴 5개 섹션이 열려요. 소진공 상권분석엔 없는 "손님이 뭘 좋아하는지"가 이 리포트의 전부입니다.</p>
          <div className="nt-free py-2"><OrderForm slug={slug} price={REPORT_PRICE} /></div>
        </section>
      </div>
    </main>
  );
}
