import { notFound } from "next/navigation";
import Link from "next/link";
import { buildStartupReport, verifyAccess } from "@/lib/startupReport";
import Report from "../Report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // 코드 검증이 필요해 캐시하지 않는다(구매자만 오는 화면)

export default async function FullReportPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const { slug } = await params; const { k } = await searchParams;
  const ok = await verifyAccess(slug, String(k ?? ""));
  if (!ok) {
    return (
      <main className="nt-app nt-paper min-h-screen"><div className="max-w-xl mx-auto nt-page pb-12" style={{ ["--nt-mx" as any]: "36px" }}>
        <div className="nt-ruled nt-margin-gutter" style={{ paddingTop: 68 }}>
          <div className="nt-sec">열람 코드가 맞지 않아요</div>
          <p className="text-[13.5px]">입금 확인 후 이메일로 보내드린 링크를 그대로 열어주세요. 문의: dongnecoffeenote@gmail.com</p>
          <Link href={`/startup/${slug}`} className="text-[12px] text-[#7a5122] underline underline-offset-2">미리보기로 돌아가기 →</Link>
        </div></div></main>
    );
  }
  const r = await buildStartupReport(slug);
  if (!r) notFound();
  return (
    <main className="nt-app nt-paper min-h-screen">
      <div className="max-w-xl mx-auto nt-page pb-12 overflow-hidden" style={{ ["--nt-mx" as any]: "36px" }}>
        <div className="nt-ruled nt-margin-gutter nt-band nt-torn-b" style={{ paddingTop: 34, paddingBottom: 34 }}>
          <div className="nt-eyebrow">카페 창업 리포트 · 전문 · {r.def.area}</div>
          <h1 className="nt-title text-[28px]"><span className="nt-hl latte">{r.def.title}</span></h1>
          <p className="text-[13px] text-[#5c4b3c]">브라우저 인쇄(⌘/Ctrl+P)로 PDF 저장이 돼요.</p>
        </div>
        <Report r={r} full={true} />
      </div>
    </main>
  );
}
