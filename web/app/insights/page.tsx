"use client";
import { useEffect, useState } from "react";

type Stats = {
  total: number;
  top_origins: { top_origin: string; n: number }[];
  avg: { acidity: number; body: number; sweetness: number } | null;
};

export default function InsightsPage() {
  const [s, setS] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/taste").then((r) => r.json()).then((d) => { setS(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const maxN = s?.top_origins?.[0]?.n ?? 1;

  return (
    <main className="min-h-screen bg-[#f5efe6] text-stone-900" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="border-b border-stone-300/70 pb-5 mb-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-amber-800/70 text-[11px] tracking-[0.35em] uppercase">Beanmark · Insights</div>
            <h1 className="text-3xl font-bold tracking-tight mt-1">취향 트렌드</h1>
          </div>
          <a href="/taste" className="text-xs text-stone-500 hover:text-amber-800 underline">취향 찾기 →</a>
        </header>

        <p className="text-stone-600 text-sm mb-8 leading-relaxed">
          Beanmark 이용자들의 익명 취향 데이터를 모아 보여드립니다. 지금 사람들이 어떤 원두를 찾고 어떤 맛을 좋아하는지 한눈에.
        </p>

        {loading ? (
          <p className="text-stone-500 text-sm">불러오는 중...</p>
        ) : !s || s.total === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-stone-200/70 text-center">
            <p className="text-stone-600">아직 데이터가 모이는 중이에요.</p>
            <a href="/taste" className="inline-block mt-4 text-amber-800 font-semibold text-sm underline">첫 취향 등록하러 가기 →</a>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="bg-stone-900 text-amber-50 rounded-2xl p-7">
              <div className="text-amber-500/80 text-xs uppercase tracking-wider">누적 취향 분석</div>
              <div className="text-5xl font-bold mt-2">{s.total.toLocaleString("ko-KR")}<span className="text-xl text-stone-400 ml-2">건</span></div>
            </div>

            <section>
              <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">가장 많이 추천된 산지 TOP</h2>
              {s.top_origins.length === 0 ? (
                <p className="text-stone-500 text-sm">집계 중...</p>
              ) : (
                <div className="space-y-2">
                  {s.top_origins.map((o, i) => (
                    <div key={o.top_origin} className="bg-white rounded-xl p-4 border border-stone-200/70">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold"><span className="text-amber-800 mr-2">{i+1}</span>{o.top_origin}</span>
                        <span className="text-stone-500 text-sm">{o.n}회</span>
                      </div>
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-700 rounded-full" style={{ width: `${Math.max(6, (o.n / maxN) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {s.avg && (
              <section>
                <h2 className="text-xs uppercase tracking-wider text-stone-500 mb-4">이용자 평균 취향</h2>
                <div className="bg-white rounded-2xl p-6 border border-stone-200/70 space-y-4">
                  {([["산미", s.avg.acidity], ["바디", s.avg.body], ["단맛", s.avg.sweetness]] as [string, number][]).map(([label, v]) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-stone-600">{label}</span>
                        <span className="text-amber-800 font-semibold">{Math.round((v ?? 0) * 100)}</span>
                      </div>
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-700 rounded-full" style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <footer className="mt-12 pt-6 border-t border-stone-300/70 text-[11px] text-stone-500">
          익명 취향 통계 · 개인을 식별하는 정보는 수집하지 않습니다.
        </footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
    </main>
  );
}
