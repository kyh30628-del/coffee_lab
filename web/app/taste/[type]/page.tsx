import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ShareBtn from "./ShareBtn";

export const dynamic = "force-static";

const SITE = "https://dongnecoffeenote.com";
const TASTE: Record<string, { name: string; emoji: string; line: string; accent: string }> = {
  roast: { name: "스페셜티파", emoji: "🔥", line: "원두 한 알까지 따지는 진심파. 직접 로스팅하는 집에서 진가를 알아봐요.", accent: "#c87f2e" },
  work: { name: "카공파", emoji: "💻", line: "노트북 펴고 오래 머무는 게 행복한 타입. 콘센트와 적당한 소음이 중요해요.", accent: "#3f7bb0" },
  quiet: { name: "조용파", emoji: "🤍", line: "혼자만의 차분한 커피 시간을 사랑하는 타입. 조용한 동네 카페가 딱이에요.", accent: "#8a7458" },
  dessert: { name: "디저트파", emoji: "🍰", line: "커피보다 옆에 곁들일 달콤한 게 더 설레는 타입. 디저트 맛집 카페를 찾아요.", accent: "#c75f7a" },
};

export function generateStaticParams() {
  return Object.keys(TASTE).map((type) => ({ type }));
}

type Props = { params: Promise<{ type: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type } = await params;
  const t = TASTE[type];
  if (!t) return { title: "동네 커피 노트" };
  const title = `나는 '${t.name}' ☕ — 동네 커피 노트`;
  const desc = `${t.line} 내 취향에 맞는 동네 카페를 데이터로 찾아보세요.`;
  const url = `${SITE}/taste/${type}`;
  const img = `/taste-${type}.png`;
  return {
    title, description: desc,
    alternates: { canonical: url },
    openGraph: { title, description: desc, url, siteName: "동네 커피 노트", type: "article", locale: "ko_KR", images: [img] },
    twitter: { card: "summary_large_image", title, description: desc, images: [img] },
  };
}

export default async function TastePage({ params }: Props) {
  const { type } = await params;
  const t = TASTE[type];
  if (!t) notFound();
  return (
    <main className="min-h-screen flex items-center justify-center px-6 text-[#f4ece0]" style={{ fontFamily: "'Gowun Batang', serif", background: "linear-gradient(135deg,#4a3526,#2b2018 60%,#1f1610)" }}>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
      <div className="w-full max-w-sm text-center">
        <div className="text-[15px] text-[#cbb89f] mb-1">나의 커피 취향은</div>
        <div className="text-[80px] leading-none my-2">{t.emoji}</div>
        <h1 className="text-4xl font-bold mb-3" style={{ color: t.accent === "#8a7458" ? "#cbb89f" : t.accent }}>{t.name}</h1>
        <p className="text-[15px] text-[#e6dcc8] leading-relaxed mb-7">{t.line}</p>
        <Link href={`/?taste=${type}`} className="block w-full bg-[#f4ece0] text-[#2b2018] rounded-xl py-3.5 font-bold mb-2.5">내 취향 카페 보러가기 →</Link>
        <ShareBtn name={t.name} />
        <Link href="/" className="text-[12px] text-[#a8927a] underline">동네 커피 노트 홈</Link>
      </div>
    </main>
  );
}
