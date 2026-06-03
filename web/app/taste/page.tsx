"use client";

import { useEffect, useMemo, useState } from "react";

type Bean = {
  origin: string; process: string;
  acidity: number; body: number; sweetness: number;
  cup_total: number; samples: number; flavors: string[];
};

const AXES = [
  { key: "acidity" as const, label: "산미", desc: "밝고 상큼한" },
  { key: "body" as const, label: "바디", desc: "묵직하고 진한" },
  { key: "sweetness" as const, label: "단맛", desc: "은은한 단맛" },
];
const FAMILIES = ["플로럴", "베리/과일", "시트러스", "초콜릿", "견과", "카라멜", "스파이스/허브", "어시/흙내음"];

const ORIGIN_NOTE: Record<string, string> = {
  Ethiopia: "커피의 고향. 화사한 꽃향과 베리, 밝은 산미가 특징.",
  Kenya: "강렬한 베리 산미와 묵직한 바디의 균형.",
  Colombia: "균형 잡힌 클래식. 카라멜 단맛과 부드러운 산미.",
  Brazil: "초콜릿·견과 중심의 달콤하고 묵직한 바디.",
  Guatemala: "초콜릿과 은은한 스파이스, 풍부한 바디.",
  "Costa Rica": "깔끔한 시트러스 산미와 단정한 단맛.",
  Honduras: "부드러운 카라멜·견과의 데일리 커피.",
  Indonesia: "흙내음과 허브, 묵직한 바디의 개성파.",
  Rwanda: "베리와 꽃향의 산뜻한 아프리카 커피.",
};
function originNote(o: string) {
  for (const k of Object.keys(ORIGIN_NOTE)) if (o.toLowerCase().includes(k.toLowerCase())) return ORIGIN_NOTE[k];
  return "";
}
function brewFor(b: Bean) {
  if (b.acidity >= 0.6 && b.body < 0.6) return "핸드드립 · 산미를 깔끔하게";
  if (b.body >= 0.6) return "에스프레소 · 콜드브루 · 묵직함이 어울려요";
  if (b.sweetness >= 0.6) return "핸드드립 · 콜드브루 · 단맛이 잘 표현돼요";
  return "핸드드립 · 무난하게";
}

export default function TastePage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [pref, setPref] = useState({ acidity: 0.5, body: 0.5, sweetness: 0.5 });
  const [fams, setFams] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/data/beans.json").then((r) => r.json()).then((d) => setBeans(d.beans ?? [])).catch(() => setBeans([]));
  }, []);

  // URL에 취향이 있으면 복원 (공유 링크로 들어온 경우)
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const a = sp.get("a"), b = sp.get("b"), s = sp.get("s"), f = sp.get("f");
      if (a || b || s) {
        setPref({
          acidity: a ? Math.min(1, Math.max(0, parseFloat(a))) : 0.5,
          body: b ? Math.min(1, Math.max(0, parseFloat(b))) : 0.5,
          sweetness: s ? Math.min(1, Math.max(0, parseFloat(s))) : 0.5,
        });
      }
      if (f) setFams(f.split(",").filter((x) => FAMILIES.includes(x)));
    } catch {}
  }, []);

  const toggleFam = (f: string) => setFams((c) => (c.includes(f) ? c.filter((x) => x !== f) : [...c, f]));

  const share = async () => {
    const sp = new URLSearchParams({
      a: pref.acidity.toFixed(2), b: pref.body.toFixed(2), s: pref.sweetness.toFixed(2),
    });
    if (fams.length) sp.set("f", fams.join(","));
    const url = `${window.location.origin}${window.location.pathname}?${sp.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("아래 링크를 복사하세요", url);
    }
  };

  const ranked = useMemo(() => {
    const scored = beans.map((b) => {
      const da = b.acidity - pref.acidity, db = b.body - pref.body, ds = b.sweetness - pref.sweetness;
      const dist = Math.sqrt(da*da + db*db + ds*ds);
      const matched = fams.filter((f) => (b.flavors ?? []).includes(f));
      return { ...b, dist, matchCount: matched.length, matched };
    });
    return (fams.length > 0
      ? scored.sort((a, b) => b.matchCount - a.matchCount || a.dist - b.dist)
      : scored.sort((a, b) => a.dist - b.dist)).slice(0, 5);
  }, [beans, pref, fams]);

  return (
    <main className="min-h-screen bg-[#f5efe6] text-stone-900" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="border-b border-stone-300/70 pb-5 mb-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-amber-800/70 text-[11px] tracking-[0.35em] uppercase">Beanmark · For You</div>
            <h1 className="text-3xl font-bold tracking-tight mt-1">취향 원두 찾기</h1>
          </div>
          <a href="/" className="text-xs text-stone-500 hover:text-amber-800 underline">← 홈</a>
        </header>

        <p className="text-stone-600 text-sm mb-8 leading-relaxed">
          산미·바디·단맛과 선호 향을 고르면, <strong className="text-stone-800">전 세계 1,300여 종의 실제 큐핑 평가 데이터(CQI)</strong>를 바탕으로
          취향에 맞는 원두를 찾아 구매처까지 연결해 드립니다.
        </p>

        <section className="space-y-6 mb-7 bg-white rounded-2xl p-7 shadow-sm border border-stone-200/70">
          {AXES.map((ax) => (
            <div key={ax.key}>
              <div className="flex justify-between items-baseline mb-2">
                <label className="font-semibold">{ax.label}</label>
                <span className="text-xs text-stone-400">{ax.desc}</span>
              </div>
              <input type="range" min={0} max={1} step={0.01} value={pref[ax.key]}
                onChange={(e) => setPref({ ...pref, [ax.key]: parseFloat(e.target.value) })}
                className="w-full accent-amber-700" />
              <div className="flex justify-between text-xs text-stone-400 mt-1">
                <span>약함</span><span className="text-amber-800 font-semibold">{Math.round(pref[ax.key]*100)}</span><span>강함</span>
              </div>
            </div>
          ))}
        </section>

        <section className="mb-8">
          <p className="text-sm font-semibold mb-3">선호하는 향 <span className="text-stone-400 font-normal">(여러 개 가능)</span></p>
          <div className="flex flex-wrap gap-2">
            {FAMILIES.map((f) => (
              <button key={f} onClick={() => toggleFam(f)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${fams.includes(f) ? "bg-amber-800 text-white border-amber-800" : "bg-white text-stone-600 border-stone-300 hover:border-amber-500"}`}>
                {f}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-wider text-stone-500">추천 원두 {ranked.length > 0 ? `· 상위 ${ranked.length}` : ""}</h2>
            <button onClick={share}
              className="text-xs px-3 py-1.5 rounded-full bg-stone-900 text-amber-50 hover:bg-stone-700 transition-colors">
              {copied ? "링크 복사됨 ✓" : "내 취향 공유"}
            </button>
          </div>
          {ranked.length === 0 ? (
            <p className="text-stone-500 text-sm">데이터 로딩 중...</p>
          ) : (
            <div className="space-y-4">
              {ranked.map((b, i) => {
                const note = originNote(b.origin);
                const q = encodeURIComponent(`${b.origin} 원두`);
                return (
                  <div key={`${b.origin}-${b.process}`} className="bg-white rounded-2xl p-5 border border-stone-200/70 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="text-2xl font-bold text-amber-800/90 w-8 pt-0.5">{i+1}</div>
                      <div className="flex-1">
                        <div className="font-bold text-lg">{b.origin}</div>
                        <div className="text-stone-500 text-sm">{b.process} · 큐핑 {b.cup_total}점 · 표본 {b.samples}종</div>
                        {note && <p className="text-sm text-stone-600 mt-2">{note}</p>}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(b.flavors ?? []).map((f) => (
                            <span key={f} className={`text-xs px-2 py-0.5 rounded-full ${b.matched.includes(f) ? "bg-amber-200 text-amber-900 font-semibold" : "bg-stone-100 text-stone-500"}`}>{f}</span>
                          ))}
                        </div>
                        <div className="text-xs text-stone-400 mt-2">
                          산미 {Math.round(b.acidity*100)} / 바디 {Math.round(b.body*100)} / 단맛 {Math.round(b.sweetness*100)}
                          {b.matchCount > 0 && <span className="text-amber-800"> · 선호 향 {b.matchCount}개 일치</span>}
                        </div>
                        <div className="mt-3 text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">☕ {brewFor(b)}</div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4 pt-4 border-t border-stone-100">
                      <a href={`https://search.shopping.naver.com/search/all?query=${q}`} target="_blank" rel="noopener noreferrer"
                         className="flex-1 text-center bg-amber-800 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-amber-900 transition-colors">원두 사러 가기</a>
                      <a href={`https://map.kakao.com/?q=${encodeURIComponent("로스터리 " + b.origin)}`} target="_blank" rel="noopener noreferrer"
                         className="flex-1 text-center bg-white border border-amber-300 text-amber-800 rounded-lg py-2.5 text-sm font-semibold hover:border-amber-500 transition-colors">근처 로스터리</a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-12 pt-6 border-t border-stone-300/70 text-[11px] text-stone-500 leading-relaxed">
          맛 데이터 CQI 큐핑 평가 기반 · 산지 향·설명은 일반적 경향(추정) · 구매 링크는 검색 결과로 연결됩니다.
        </footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
    </main>
  );
}
