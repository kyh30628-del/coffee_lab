import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-950 text-stone-100">
      <div className="max-w-4xl mx-auto px-6 py-24">
        <header className="mb-16">
          <p className="text-amber-500 text-sm tracking-[0.3em] uppercase mb-4">
            Coffee Intelligence
          </p>
          <h1 className="text-5xl font-bold tracking-tight leading-tight">
            데이터로 커피를<br />다시 본다
          </h1>
          <p className="text-stone-400 mt-6 text-lg max-w-xl">
            국제 시세와 환율, 그리고 관능 평가 데이터를 기반으로
            원두를 추천하고 원가를 투명하게 보여줍니다.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-6">
          <Link href="/taste"
                className="group bg-amber-50 text-stone-900 rounded-2xl p-8 hover:scale-[1.02] transition-transform">
            <div className="text-amber-700 text-xs tracking-widest uppercase mb-3">For You · B2C</div>
            <h2 className="text-2xl font-bold mb-2">취향 원두 추천</h2>
            <p className="text-stone-600 text-sm mb-6">
              산미·바디·단맛 취향을 조절하면 CQI 관능 데이터 기반으로
              맞는 원두를 찾아드립니다.
            </p>
            <span className="text-amber-700 font-semibold text-sm group-hover:underline">
              추천 받기 →
            </span>
          </Link>

          <Link href="/cost"
                className="group bg-stone-900 border border-stone-800 rounded-2xl p-8 hover:scale-[1.02] transition-transform">
            <div className="text-amber-500 text-xs tracking-widest uppercase mb-3">For Roasters · B2B</div>
            <h2 className="text-2xl font-bold mb-2">생두 원가 모니터</h2>
            <p className="text-stone-400 text-sm mb-6">
              ICE Coffee C 선물과 한국은행 환율로 산지별 도착원가와
              시세 추이를 실시간 추정합니다.
            </p>
            <span className="text-amber-500 font-semibold text-sm group-hover:underline">
              원가 보기 →
            </span>
          </Link>
        </div>

        <footer className="mt-20 pt-8 border-t border-stone-800 text-xs text-stone-600">
          데이터 출처: CQI 큐핑 데이터 · ICE Coffee C · 한국은행 ECOS. 원가는 추정치입니다.
        </footer>
      </div>
    </main>
  );
}
