import Link from "next/link";
import dynamic from "next/dynamic";

const CoffeeHero = dynamic(() => import("./components/CoffeeHero"), {
  ssr: false,
  loading: () => <div style={{ aspectRatio: "1 / 1", maxHeight: 580 }} />,
});

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=Nanum+Pen+Script&display=swap" rel="stylesheet" />
      <div className="max-w-5xl mx-auto px-6">
        <header className="flex justify-between items-baseline pt-7">
          <div className="font-bold text-lg">동네 커피 노트</div>
          <nav className="text-sm text-[#6b5a48]">
            <Link href="/cafe" className="ml-5">카페 가이드</Link>
            <Link href="/area" className="ml-5">우리 카페 알리기</Link>
          </nav>
        </header>

        <section className="grid gap-7 items-center py-10 md:py-16 md:grid-cols-[1fr_1.1fr] min-h-[72vh]">
          <div>
            <h1 className="font-bold leading-[1.15] text-[clamp(2.3rem,5.2vw,4rem)]">
              프랜차이즈 말고,<br />내 동네에 숨어 있는<br />진짜 좋은 커피.
            </h1>
            <p className="text-[#6b5a48] mt-5 text-lg leading-relaxed max-w-[28em]">
              별점이 아니라 커피 좀 아는 사람이 직접 마시고 적은 노트입니다. 오늘 뭐 하러 나가는지에 맞춰 강동의 카페를 골라 드려요.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link href="/cafe" className="rounded-full bg-[#2b2018] text-[#f4ece0] px-6 py-3 border-[1.5px] border-[#2b2018] transition hover:-translate-y-0.5">강동 카페 가이드 열기</Link>
              <Link href="/area" className="rounded-full px-6 py-3 border-[1.5px] border-[#2b2018] transition hover:-translate-y-0.5">우리 카페 알리기</Link>
            </div>
          </div>
          <div className="order-first md:order-none" data-hero>
            <CoffeeHero />
          </div>
        </section>

        <footer className="py-12 text-sm text-[#6b5a48]">동네 커피 노트 · 강동구 생활권</footer>
      </div>
    </main>
  );
}
