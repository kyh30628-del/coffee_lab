"use client";

import { useEffect, useMemo, useState } from "react";

type Bean = {
  origin: string; process: string;
  acidity: number; body: number; sweetness: number;
  cup_total: number; samples: number; flavors: string[];
};

const AXES = [
  { key: "acidity" as const, label: "산미", desc: "밝고 상큼한 정도" },
  { key: "body" as const, label: "바디", desc: "묵직하고 진한 정도" },
  { key: "sweetness" as const, label: "단맛", desc: "은은한 단맛" },
];

const FAMILIES = ["플로럴", "베리/과일", "시트러스", "초콜릿", "견과", "카라멜", "스파이스/허브", "어시/흙내음"];

export default function TastePage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [pref, setPref] = useState({ acidity: 0.5, body: 0.5, sweetness: 0.5 });
  const [fams, setFams] = useState<string[]>([]);

  useEffect(() => {
    fetch("/data/beans.json")
      .then((r) => r.json())
      .then((d) => setBeans(d.beans ?? []))
      .catch(() => setBeans([]));
  }, []);

  const toggleFam = (f: string) =>
    setFams((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const ranked = useMemo(() => {
    const scored = beans.map((b) => {
      const da = b.acidity - pref.acidity;
      const db = b.body - pref.body;
      const ds = b.sweetness - pref.sweetness;
      const dist = Math.sqrt(da * da + db * db + ds * ds);
      const matched = fams.filter((f) => (b.flavors ?? []).includes(f));
      return { ...b, dist, matchCount: matched.length, matched };
    });
    const sorted = fams.length > 0
      ? scored.sort((a, b) => b.matchCount - a.matchCount || a.dist - b.dist)
      : scored.sort((a, b) => a.dist - b.dist);
    return sorted.slice(0, 5);
  }, [beans, pref, fams]);

  return (
    <main className="min-h-screen bg-amber-50 text-stone-900">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight">취향 원두 추천</h1>
          <p className="text-stone-600 mt-2 text-sm">
            취향과 선호하는 향을 고르면 CQI 관능 데이터 기반으로 맞는 원두를 추천합니다.
          </p>
        </header>

        <section className="space-y-6 mb-8 bg-white rounded-2xl p-7 shadow-sm border border-amber-100">
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

        <section className="mb-12">
          <p className="text-sm font-semibold mb-3">선호하는 향 <span className="text-stone-400 font-normal">(여러 개 선택 가능)</span></p>
          <div className="flex flex-wrap gap-2">
            {FAMILIES.map((f) => (
              <button key={f} onClick={() => toggleFam(f)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  fams.includes(f)
                    ? "bg-amber-700 text-white border-amber-700"
                    : "bg-white text-stone-600 border-amber-200 hover:border-amber-400"
                }`}>
                {f}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm uppercase tracking-wider text-stone-500 mb-4">
            추천 원두 {ranked.length > 0 ? `(상위 ${ranked.length})` : ""}
          </h2>
          {ranked.length === 0 ? (
            <p className="text-stone-500 text-sm">
              데이터 로딩 중... 안 뜨면 data-engine에서 export_beans.py 실행을 확인하세요.
            </p>
          ) : (
            <div className="space-y-3">
              {ranked.map((b, i) => (
                <div key={`${b.origin}-${b.process}`}
                     className="bg-white rounded-xl p-5 border border-amber-100 shadow-sm flex items-start gap-4">
                  <div className="text-2xl font-bold text-amber-700 w-8 pt-1">{i + 1}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{b.origin}</div>
                    <div className="text-stone-500 text-sm">{b.process} · 큐핑 {b.cup_total}점 · 표본 {b.samples}종</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(b.flavors ?? []).map((f) => (
                        <span key={f} className={`text-xs px-2 py-0.5 rounded-full ${
                          b.matched.includes(f) ? "bg-amber-200 text-amber-900 font-semibold" : "bg-stone-100 text-stone-500"
                        }`}>{f}</span>
                      ))}
                    </div>
                    <div className="text-xs text-stone-400 mt-2">
                      산미 {Math.round(b.acidity*100)} / 바디 {Math.round(b.body*100)} / 단맛 {Math.round(b.sweetness*100)}
                      {b.matchCount > 0 && <span className="text-amber-700"> · 선호 향 {b.matchCount}개 일치</span>}
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
