import type { Metadata } from "next";
import { SITE } from "@/lib/seoData";

export const revalidate = 21600; // 💰 2026-08-20: 공유 스냅샷도 6시간이면 충분(데이터는 재합성 ~5일 주기)

type Props = { params: Promise<{ id: string }> };
type Report = {
  ok: boolean; id: number; name: string; area: string; gu: string;
  grade: string; count: number; identity: string; rank: number; hoodCount: number;
  topStrength: { label: string; emoji: string; rare: boolean } | null;
  strengths: { label: string; emoji: string }[];
};

async function getReport(id: string): Promise<Report | null> {
  try {
    const r = await fetch(`${SITE}/api/share-report?id=${encodeURIComponent(id)}`, { next: { revalidate: 3600 } });
    const d = await r.json();
    return d.ok ? d : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const rep = await getReport(id);
  if (!rep) return { title: "사장님 리포트 | 동네 커피 노트" };
  const rankTxt = rep.rank > 0 ? `${rep.gu} ${rep.hoodCount}곳 중 ${rep.rank}위` : `${rep.gu} 검증 카페`;
  const title = `${rep.name} — ${rankTxt} | 동네 커피 노트`;
  const desc = `${rep.name}은(는) ${rankTxt}. 광고·영수증 없이 네이버·구글·유튜브 공개 후기로 검증한 ${rep.grade} 카페예요.${rep.identity ? ` ${rep.identity}` : ""}`;
  const url = `${SITE}/share/${rep.id}`;
  return {
    title, description: desc,
    alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" },
    twitter: { card: "summary", title, description: desc },
  };
}

const GRADE_BG: Record<string, string> = { "검증": "#1f7a4d", "참고": "#9c6b3f", "후보": "#8a7458" };

export default async function SharePage({ params }: Props) {
  const { id } = await params;
  const rep = await getReport(id);

  if (!rep) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f4ece0] px-6 text-center">
        <div>
          <p className="text-[#524234] mb-3">리포트를 찾을 수 없어요(비공개되었거나 잘못된 링크).</p>
          <a href={SITE} className="text-[#7a5122] font-bold underline">동네 커피 노트 →</a>
        </div>
      </main>
    );
  }

  const shareUrl = `${SITE}/share/${rep.id}`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=10&data=${encodeURIComponent(shareUrl)}`;
  const rankTxt = rep.rank > 0 ? `${rep.gu} ${rep.hoodCount}곳 중 ${rep.rank}위` : `${rep.gu} 검증 카페`;

  return (
    <main className="min-h-screen bg-[#f4ece0] px-4 py-8 flex flex-col items-center">
      <div className="w-full max-w-md">
        <div className="text-center mb-2 text-[11px] text-[#665036] tracking-wider uppercase">☕ 동네 커피 노트 · 검증 리포트</div>

        {/* 리포트 카드 */}
        <section className="bg-white rounded-3xl border border-[#ece0cd] shadow-sm p-6">
          <div className="flex items-center justify-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#2b2018]">{rep.name}</h1>
            {rep.grade && <span className="text-[10px] text-white px-2 py-0.5 rounded-full" style={{ background: GRADE_BG[rep.grade] ?? "#8a7458" }}>{rep.grade}</span>}
          </div>
          <p className="text-center text-sm text-[#7a5122] mb-4">{rep.identity}</p>

          {/* 순위 하이라이트 */}
          <div className="rounded-2xl bg-[#faf4ea] border border-[#ece0cd] py-4 text-center mb-4">
            <div className="text-[12px] text-[#665036] mb-1">우리 동네 순위</div>
            <div className="text-xl font-bold text-[#2b2018]">{rankTxt}</div>
            <div className="text-[12px] text-[#665036] mt-1">검증 후기 {rep.count}건 기준</div>
          </div>

          {/* 강점 */}
          {rep.strengths.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              {rep.strengths.map((s, i) => (
                <span key={i} className="text-[13px] bg-[#f4ece0] text-[#52402e] px-3 py-1 rounded-full">{s.emoji} {s.label}</span>
              ))}
            </div>
          )}
          {rep.topStrength?.rare && (
            <p className="text-center text-[12px] text-[#1f7a4d] mb-2">✨ {rep.gu}에서 흔치 않은 <b>{rep.topStrength.label}</b> 강점</p>
          )}

          <a href={`${SITE}/c/${rep.id}`} className="block text-center mt-3 rounded-xl bg-[#2b2018] text-[#f4ece0] font-bold py-3">상세 보기 · 길찾기 →</a>
        </section>

        {/* QR — 가게 비치/공유용 */}
        <section className="bg-white rounded-3xl border border-[#ece0cd] mt-4 p-6 text-center">
          <div className="text-sm font-bold text-[#52402e] mb-1">📱 이 리포트 공유 QR</div>
          <p className="text-[12px] text-[#665036] mb-3">가게에 비치하거나 손님·SNS에 공유하세요</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="공유 QR 코드" width={200} height={200} className="mx-auto rounded-xl border border-[#ece0cd]" />
          <div className="text-[11px] text-[#bcab92] mt-2 break-all">{shareUrl}</div>
        </section>

        {/* 사장님 CTA */}
        <section className="bg-[#fff8ee] rounded-3xl border border-[#e7d3b3] mt-4 p-5 text-center">
          <div className="text-sm font-bold text-[#7a5a2e] mb-1">이 카페 사장님이세요?</div>
          <p className="text-[13px] text-[#665036] mb-3 leading-relaxed">동네 순위·6축 분석·데이터 기반 액션 플랜을 <b>무료</b>로 받아보세요.</p>
          <a href={`${SITE}/owner`} className="inline-block rounded-xl bg-[#9c6b3f] text-white font-bold px-5 py-2.5 text-sm">무료 분석 받기 →</a>
        </section>

        <p className="text-center text-[11px] text-[#665036] mt-5">
          광고·협찬·영수증 없이 공개 후기로만 검증한 큐레이션 · <a href={SITE} className="underline">dongnecoffeenote.com</a>
        </p>
      </div>
    </main>
  );
}
