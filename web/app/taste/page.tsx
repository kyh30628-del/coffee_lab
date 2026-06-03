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

// 산지 한 줄 설명 (일반적 경향, 추정)
const ORIGIN_NOTE: Record<string, string> = {
  Ethiopia: "커피의 고향. 화사한 꽃향과 베리, 밝은 산미가 특징.",
  Kenya: "강렬한 베리·토마토 같은 산미와 묵직한 바디의 균형.",
  Colombia: "균형 잡힌 클래식한 맛. 카라멜 단맛과 부드러운 산미.",
  Brazil: "초콜릿·견과 중심의 묵직하고 달콤한 바디. 에스프레소 베이스로 인기.",
  Guatemala: "초콜릿과 은은한 스파이스, 풍부한 바디.",
  "Costa Rica": "깔끔한 시트러스 산미와 단정한 단맛.",
  Honduras: "부드러운 카라멜·견과 톤의 데일리 커피.",
  Indonesia: "흙내음과 허브, 묵직한 바디의 개성 강한 맛.",
  Rwanda: "베리와 꽃향의 산뜻한 아프리카 커피.",
  Guatemala_default: "",
};

// 6축 프로파일 → 추출 추천
function brewFor(b: Bean): string {
  if (b.acidity >= 0.6 && b.body < 0.6) return "핸드드립 · 깔끔하게 산미를 살려요";
  if (b.body >= 0.6) return "에스프레소 · 콜드브루 · 묵직함이 어울려요";
  if (b.sweetness >= 0.6) return "핸드드립 · 콜드브루 · 단맛이 잘 표현돼요";
  return "핸드드립 · 가장 무난하게 즐길 수 있어요";
}

function originNote(origin: string): string {
  for (const key of Object.keys(ORIGIN_NOTE)) {
    if (origin.toLowerCase().includes(key.toLowerCase())) return ORIGIN_NOTE[key];
  }
  return "";
}

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
            취향과 선호 향을 고르면 CQI 관능 데이터 기반으로 맞는 원두를 추천하고, 구매처까지 연결합니다.
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
                <span>약함</span><span>{Math.round(pref[a.key] * 100)}</span><span>강함</span>
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
                  fams.includes(f) ? "bg-amber-700 text-white border-amber-700"
                  : "bg-white text-stone-600 border-amber-200 hover:border-amber-400"}`}>
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
            <p className="text-stone-500 text-sm">데이터 로딩 중...</p>
          ) : (
            <div className="space-y-4">
              {ranked.map((b, i) => {
                const note = originNote(b.origin);
                const q = encodeURIComponent(`${b.origin} 원두`);
                const naver = `https://search.shopping.naver.com/search/all?query=${q}`;
                const kakao = `https://map.kakao.com/?q=${encodeURIComponent("로스터리 " + b.origin)}`;
                return (
                  <div key={`${b.origin}-${b.process}`}
                       className="bg-white rounded-xl p-5 border border-amber-100 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="text-2xl font-bold text-amber-700 w-8 pt-1">{i + 1}</div>
                      <div className="flex-1">
                        <div className="font-semibold text-lg">{b.origin}</div>
                        <div className="text-stone-500 text-sm">{b.process} · 큐핑 {b.cup_total}점 · 표본 {b.samples}종</div>
                        {note && <p className="text-sm text-stone-600 mt-2">{note}</p>}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(b.flavors ?? []).map((f) => (
                            <span key={f} className={`text-xs px-2 py-0.5 rounded-full ${
                              b.matched.includes(f) ? "bg-amber-200 text-amber-900 font-semibold" : "bg-stone-100 text-stone-500"}`}>{f}</span>
                          ))}
                        </div>
                        <div className="text-xs text-stone-400 mt-2">
                          산미 {Math.round(b.acidity*100)} / 바디 {Math.round(b.body*100)} / 단맛 {Math.round(b.sweetness*100)}
                          {b.matchCount > 0 && <span className="text-amber-700"> · 선호 향 {b.matchCount}개 일치</span>}
                        </div>
                        <div className="mt-3 text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">
                          ☕ 추천 추출: {brewFor(b)}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-4 pt-4 border-t border-amber-50">
                      <a href={naver} target="_blank" rel="noopener noreferrer"
                         className="flex-1 text-center bg-amber-700 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-amber-800 transition-colors">
                        원두 사러 가기
                      </a>
                      <a href={kakao} target="_blank" rel="noopener noreferrer"
                         className="flex-1 text-center bg-white border border-amber-300 text-amber-800 rounded-lg py-2.5 text-sm font-semibold hover:border-amber-500 transition-colors">
                        근처 로스터리 찾기
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-12 pt-6 border-t border-amber-200 text-xs text-stone-500">
          맛 데이터는 CQI 큐핑 평가 기반. 산지 향·설명은 일반적 경향(추정). 구매 링크는 검색 결과로 연결됩니다.
        </footer>
      </div>
    </main>
  );
}
