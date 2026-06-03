"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ShareCard from "./ShareCard";
import { QUESTIONS, buildProfile, type Answers } from "./profile";

type Bean = {
  origin: string; process: string;
  acidity: number; body: number; sweetness: number;
  cup_total: number; samples: number; flavors: string[];
};

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
  const [ans, setAns] = useState<Answers>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);
  const interacted = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/data/beans.json").then((r) => r.json()).then((d) => setBeans(d.beans ?? [])).catch(() => setBeans([]));
  }, []);

  const profile = useMemo(() => buildProfile(ans), [ans]);
  const answeredCount = Object.keys(ans).length;

  const pick = (qid: string, value: string, multi?: boolean) => {
    interacted.current = true;
    setAns((cur) => {
      if (multi) {
        const arr = Array.isArray(cur[qid]) ? (cur[qid] as string[]) : [];
        const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
        return { ...cur, [qid]: next };
      }
      return { ...cur, [qid]: value };
    });
  };
  const isPicked = (qid: string, value: string) => {
    const v = ans[qid];
    return Array.isArray(v) ? v.includes(value) : v === value;
  };

  const ranked = useMemo(() => {
    if (answeredCount === 0) return [];
    const fams = profile.flavors;
    const scored = beans.map((b) => {
      const da = b.acidity - profile.acidity, db = b.body - profile.body, ds = b.sweetness - profile.sweetness;
      const dist = Math.sqrt(da*da + db*db + ds*ds);
      const matched = fams.filter((f) => (b.flavors ?? []).includes(f));
      return { ...b, dist, matchCount: matched.length, matched };
    });
    return scored.sort((a, b) => (b.matchCount - a.matchCount) || (a.dist - b.dist)).slice(0, 5);
  }, [beans, profile, answeredCount]);

  useEffect(() => {
    if (!interacted.current || ranked.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      fetch("/api/taste", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, top_origin: ranked[0]?.origin ?? "" }) }).catch(() => {});
    }, 1500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [profile, ranked]);

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { prompt("아래 링크를 복사하세요", url); }
  };

  const visibleQ = QUESTIONS.filter((q) => !q.advanced || showAdvanced);

  return (
    <main className="min-h-screen bg-[#f5efe6] text-stone-900" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <header className="border-b border-stone-300/70 pb-5 mb-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="text-amber-800/70 text-[11px] tracking-[0.35em] uppercase">Beanmark · For You</div>
            <h1 className="text-3xl font-bold tracking-tight mt-1">취향 진단</h1>
          </div>
          <a href="/" className="text-xs text-stone-500 hover:text-amber-800 underline">← 홈</a>
        </header>

        <p className="text-stone-600 text-sm mb-8 leading-relaxed">
          평소 마시는 습관과 취향을 고르면, <strong className="text-stone-800">1,300여 종 큐핑 데이터(CQI)</strong>로 정밀하게 맞는 원두를 찾아드려요.
          전문 용어는 몰라도 괜찮아요.
        </p>

        <section className="space-y-5 mb-6">
          {visibleQ.map((q) => (
            <div key={q.id} className="bg-white rounded-2xl p-5 shadow-sm border border-stone-200/70">
              <div className="font-semibold mb-3 text-[15px]">{q.title}</div>
              <div className="flex flex-wrap gap-2">
                {q.options.map((o) => (
                  <button key={o.value} onClick={() => pick(q.id, o.value, q.multi)}
                    className={`px-3.5 py-2 rounded-xl text-sm border transition-colors ${isPicked(q.id, o.value) ? "bg-amber-800 text-white border-amber-800" : "bg-stone-50 text-stone-700 border-stone-200 hover:border-amber-400"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        {!showAdvanced && (
          <button onClick={() => setShowAdvanced(true)}
            className="w-full mb-10 py-3 rounded-xl border border-dashed border-amber-400 text-amber-800 text-sm font-semibold hover:bg-amber-50 transition-colors">
            + 더 자세히 (정확도 ↑)
          </button>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-wider text-stone-500">추천 원두 {ranked.length > 0 ? `· 상위 ${ranked.length}` : ""}</h2>
            {ranked.length > 0 && (
              <button onClick={share} className="text-xs px-3 py-1.5 rounded-full bg-stone-900 text-amber-50 hover:bg-stone-700 transition-colors">
                {copied ? "링크 복사됨 ✓" : "공유"}
              </button>
            )}
          </div>

          {answeredCount === 0 ? (
            <p className="text-stone-500 text-sm bg-white rounded-2xl p-6 border border-stone-200/70 text-center">위 질문에 답하면 추천이 나타나요 ☕</p>
          ) : ranked.length === 0 ? (
            <p className="text-stone-500 text-sm">데이터 로딩 중...</p>
          ) : (
            <>
              <ShareCard pref={{ acidity: profile.acidity, body: profile.body, sweetness: profile.sweetness }} top={ranked[0]} />
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
            </>
          )}
        </section>

        <footer className="mt-12 pt-6 border-t border-stone-300/70 text-[11px] text-stone-500 leading-relaxed">
          맛 데이터 CQI 큐핑 평가 기반 · 산지 향·설명은 일반적 경향(추정) · 익명 취향 통계가 서비스 개선에 활용됩니다.
        </footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />
    </main>
  );
}
