"use client";

import { useEffect, useMemo, useState } from "react";

type Bean = {
  origin: string; process: string;
  acidity: number; body: number; sweetness: number;
  cup_total: number; samples: number;
};

const AXES = [
  { key: "acidity" as const, label: "산미", desc: "밝고 상큼한 정도" },
  { key: "body" as const, label: "바디", desc: "묵직하고 진한 정도" },
  { key: "sweetness" as const, label: "단맛", desc: "은은한 단맛" },
];

export default function TastePage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [pref, setPref] = useState({ acidity: 0.5, body: 0.5, sweetness: 0.5 });

  useEffect(() => {
    fetch("/data/beans.json")
      .then((r) => r.json())
      .then((d) => setBeans(d.beans ?? []))
      .catch(() => setBeans([]));
  }, []);

  const ranked = useMemo(() => {
    return beans
      .map((b) => {
        const da = b.acidity - pref.acidity;
        const db = b.body - pref.body;
        const ds = b.sweetness - pref.sweetness;
        const dist = Math.sqrt(da * da + db * db + ds * ds);
        // 가장 잘 맞은 축 찾기 (설명용)
        const diffs = [
          { label: "산미", v: Math.abs(da) },
          { label: "바디", v: Math.abs(db) },
          { label: "단맛", v: Math.abs(ds) },
        ].sort((a, b) => a.v - b.v);
        return { ...b, dist, bestAxis: diffs[0].label };
      })
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);
  }, [beans, pref]);

  return (
    <main className="min-h-screen bg-amber-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">취향 원두 추천</h1>
          <p className="text-stone-600 mt-2 text-sm">
            슬라이더로 취향을 조절하면 CQI 관능 데이터 기반으로 맞는 원두를 추천합니다.
          </p>
        </header>

        <section className="space-y-6 mb-12 bg-white rounded-2xl p-7 shadow-sm border border-amber-100">
          {AXES.map((a) => (
            <div key={a.key}>
              <div className="flex justify-between items-baseline mb-2">
                <label className="font-semibold">{a.label}</label>
                <span className="text-xs text-stone-500">{a.desc}</span>
              </div>
              <input
                type="range" min={0} max={1} step={0.01}
                value={pref[a.key]}
                onChange={(e) => setPref({ ...pref, [a.key]: parseFloat(e.target.value) })}
                className="w-full accent-amber-700"
              />
              <div className="flex justify-between text-xs text-stone-400 mt-1">
                <span>약함</span>
                <span>{Math.round(pref[a.key] * 100)}</span>
                <span>강함</span>
              </div>
            </div>
          ))}
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-4">
            추천 원두 {ranked.length > 0 ? `(상위 ${ranked.length})` : ""}
          </h2>
          {ranked.length === 0 ? (
            <p className="text-stone-500 text-sm">
              데이터 로딩 중... 안 뜨면 data-engine에서 export_beans.py를 실행했는지 확인하세요.
            </p>
          ) : (
            <div className="space-y-3">
              {ranked.map((b, i) => (
                <div key={`${b.origin}-${b.process}`}
                     className="bg-white rounded-xl p-5 border border-amber-100 shadow-sm flex items-center gap-4">
                  <div className="text-2xl font-bold text-amber-700 w-8">{i + 1}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{b.origin}</div>
                    <div className="text-stone-500 text-sm">{b.process} · 큐핑 {b.cup_total}점 · 표본 {b.samples}종</div>
                    <div className="text-xs text-amber-800 mt-1">
                      {b.bestAxis}이(가) 취향과 잘 맞아요 · 산미 {Math.round(b.acidity*100)} / 바디 {Math.round(b.body*100)} / 단맛 {Math.round(b.sweetness*100)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
