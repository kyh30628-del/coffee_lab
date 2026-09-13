import type { Metadata } from "next";
import Link from "next/link";
import { STARTUP_REPORTS, REPORT_PRICE } from "@/lib/startupReport";

export const revalidate = 86400;
export const metadata: Metadata = { title: "동네 카페 창업 리포트 — 검증 후기로 본 상권 | 동네 커피 노트", description: "성수동·연남동·망원동 카페 창업 리포트. 검증 후기 데이터로 본 성격 12축, 비어 있는 포지션, 개업·폐업(인허가), 손님 검색어.", alternates: { canonical: "https://dongnecoffeenote.com/startup" } };

export default function StartupIndex() {
  return (
    <main className="nt-app nt-paper min-h-screen">
      <div className="max-w-xl mx-auto nt-page pb-12" style={{ ["--nt-mx" as any]: "36px" }}>
        <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}><Link href="/" className="text-[13px] text-[#63523f]">← 동네 커피 노트</Link></div>
        <div className="nt-ruled nt-margin-gutter nt-band nt-torn-b" style={{ paddingTop: 34, paddingBottom: 34 }}>
          <div className="nt-eyebrow">예비 창업자용</div>
          <h1 className="nt-title text-[28px]"><span className="nt-hl latte">동네 카페 창업 리포트</span></h1>
          <p className="text-[14px] text-[#5c4b3c]">상권분석 서비스는 카페가 몇 개인지 알려줍니다. 우리는 손님이 그 동네 카페에서 <b>실제로 무엇을 찾는지</b>를 검증 후기 수만 건에서 읽어 알려드립니다. 비어 있는 자리, 상위 카페의 무기, 최근 1년 개업·폐업까지.</p>
        </div>
        <section className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
          <div className="nt-sec">지금 볼 수 있는 동네</div>
          <ul>
            {STARTUP_REPORTS.map((r) => (
              <li key={r.slug} className="text-[15px]"><Link href={`/startup/${r.slug}`} className="nt-hl">{r.title}</Link> <span className="text-[12px] text-[#63523f]">{r.area} · {r.blurb}</span></li>
            ))}
          </ul>
          <p className="text-[12.5px] text-[#63523f]">미리보기는 무료, 전문은 ₩{REPORT_PRICE.toLocaleString()}(1회). 다른 동네가 필요하면 dongnecoffeenote@gmail.com 으로 알려주세요.</p>
        </section>
      </div>
    </main>
  );
}
