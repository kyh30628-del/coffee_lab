import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#0c0a09] text-stone-100" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-4xl mx-auto px-6 py-20">
        <header className="mb-16">
          <div className="flex items-center gap-2 mb-6">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-amber-500/90 text-sm tracking-[0.3em] uppercase font-semibold">Beanmark</span>
          </div>
          <h1 className="text-5xl font-bold tracking-tight leading-[1.1]">커피를 데이터로<br />다시 본다</h1>
          <p className="text-stone-400 mt-6 text-lg max-w-xl leading-relaxed">
            국제 시세·환율과 실제 관능 평가 데이터를 기반으로,
            소비자에겐 취향에 맞는 원두를, 로스터리에겐 투명한 원가와 구매 판단을 제공합니다.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-5">
          <Link href="/taste" className="group bg-[#f5efe6] text-stone-900 rounded-2xl p-8 hover:-translate-y-1 transition-transform">
            <div className="text-amber-800 text-xs tracking-widest uppercase mb-3 font-semibold">For You · 소비자</div>
            <h2 className="text-2xl font-bold mb-2">취향 원두 찾기</h2>
            <p className="text-stone-600 text-sm mb-6 leading-relaxed">취향을 조절하면 1,300여 종 큐핑 데이터로 맞는 원두를 찾고 구매처까지 연결.</p>
            <span className="text-amber-800 font-semibold text-sm group-hover:underline">시작하기 →</span>
          </Link>
          <Link href="/cost" className="group bg-stone-900 border border-stone-800 rounded-2xl p-8 hover:-translate-y-1 transition-transform">
            <div className="text-amber-500 text-xs tracking-widest uppercase mb-3 font-semibold">For Roasters · 로스터리</div>
            <h2 className="text-2xl font-bold mb-2">생두 원가 · 구매 판단</h2>
            <p className="text-stone-400 text-sm mb-6 leading-relaxed">ICE 시세·환율·FTA 관세로 산지별 원가를 추정하고, 지금이 살 때인지 판단을 제시.</p>
            <span className="text-amber-500 font-semibold text-sm group-hover:underline">대시보드 →</span>
          </Link>
        </div>

        <Link href="/insights" className="block mt-5 bg-stone-900/60 border border-stone-800 rounded-2xl p-6 hover:border-amber-700/60 transition-colors group">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-amber-500/80 text-xs tracking-widest uppercase mb-1 font-semibold">Insights</div>
              <h2 className="text-lg font-bold">취향 트렌드 — 지금 사람들이 찾는 원두</h2>
            </div>
            <span className="text-amber-500 font-semibold text-sm group-hover:underline">보기 →</span>
          </div>
        </Link>

        <section className="mt-12 grid grid-cols-3 gap-4 text-center">
          {[["1,300+", "큐핑 평가 원두"], ["매일", "자동 시세 갱신"], ["FTA 반영", "산지별 관세"]].map(([big, small]) => (
            <div key={small} className="border border-stone-800 rounded-xl py-5">
              <div className="text-amber-400 text-xl font-bold">{big}</div>
              <div className="text-stone-500 text-xs mt-1">{small}</div>
            </div>
          ))}
        </section>

        <footer className="mt-16 pt-8 border-t border-stone-800 text-xs text-stone-600">
          데이터 출처: CQI 큐핑 데이터 · ICE Coffee C · 한국은행 ECOS. 원가·향 정보는 추정치를 포함합니다.
        </footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
    </main>
  );
}
