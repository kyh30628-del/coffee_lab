import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { sql } from "@/lib/db";
import KakaoShare from "../../KakaoShare";

export const runtime = "nodejs";
export const revalidate = 3600; // ISR 1시간

const SITE = "https://dongnecoffeenote.com";
const CHAR: Record<string, string> = { roast: "🔥 직접로스팅", work: "💻 작업하기 좋은", quiet: "🤍 조용한", dessert: "🍰 디저트", mood: "📸 분위기", space: "🪑 넓은공간" };

type Props = { params: Promise<{ id: string }> };

async function getCafe(id: string) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return (await sql`SELECT id, name, area, synth_grade, synth_identity, synth_count, char_scores FROM cafes WHERE id=${n} AND published=true LIMIT 1`)[0] as any ?? null;
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

export default async function CafePage({ params }: Props) {
  const { id } = await params;
  const c = await getCafe(id);
  if (!c) notFound();
  const tags = topTags(c.char_scores);
  const grade = c.synth_grade || "";
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
          {c.synth_identity && <p className="text-[15px] leading-relaxed text-[#52402e] bg-white rounded-xl p-4 border border-[#e6dcc8] mb-4">{c.synth_identity}</p>}
          {tags.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-bold text-[#9c6b3f] mb-1.5">이 카페가 후기에서 자주 언급되는 결</div>
              <div className="flex flex-wrap gap-2">{tags.map((t) => <span key={t} className="text-[13px] bg-[#efe6d6] rounded-full px-3 py-1">{t}</span>)}</div>
            </div>
          )}
          <p className="text-[12.5px] text-[#8a7458] mb-6 leading-relaxed">네이버 공개 후기 <b>{c.synth_count ?? 0}건</b>을 교차검증한 데이터 기반 소개예요. (절대 평가가 아니라 후기에서 자주 언급된 정도입니다)</p>
          <Link href={`/?cafe=${c.id}`} className="block w-full text-center bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-bold">지도·근거 후기 보기 →</Link>
        </div>
      </div>
    </main>
  );
}
