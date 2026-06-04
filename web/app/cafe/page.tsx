"use client";
import { useEffect, useMemo, useState } from "react";

type Cafe = {
  id: number; name: string; area: string; address: string;
  hours: string; phone: string; rating: number; rating_count: number;
  roasts_own: boolean; beans: string; signature: string; uses: string;
  vibe: string; note: string; price_hint: string; source: string;
  acidity: number; body: number; sweet: number; taste_pick: string; tone: string;
  photo_url: string | null;
};

const PURPOSES = [
  { key: "작업", label: "작업·집중", emoji: "💻" },
  { key: "혼자", label: "혼자 조용히", emoji: "🤍" },
  { key: "수다", label: "수다 떨기", emoji: "💬" },
  { key: "빵", label: "빵·디저트", emoji: "🥐" },
];

const TASTE_Q = [
  { id: "acidity", q: "산미는 어때요?", opts: [{ label: "상큼한 거 좋아요", v: 0.85 }, { label: "적당히", v: 0.5 }, { label: "부드러운 게 좋아요", v: 0.2 }] },
  { id: "body", q: "진하기는?", opts: [{ label: "묵직·진하게", v: 0.85 }, { label: "중간", v: 0.5 }, { label: "가볍게", v: 0.2 }] },
  { id: "sweet", q: "단맛은?", opts: [{ label: "달달한 게 좋아요", v: 0.8 }, { label: "상관없음", v: 0.5 }, { label: "깔끔한 게 좋아요", v: 0.25 }] },
];

const TONES: Record<string, { from: string; to: string; ink: string }> = {
  amber: { from: "#c8893f", to: "#8a5a24", ink: "#fff" }, brown: { from: "#6f4e37", to: "#3d2a1d", ink: "#fff" },
  rose: { from: "#c97a6d", to: "#8f4a44", ink: "#fff" }, dark: { from: "#3a2e28", to: "#1a1310", ink: "#fff" },
  green: { from: "#5f7355", to: "#36412f", ink: "#fff" }, gold: { from: "#c9a227", to: "#8a6d15", ink: "#fff" },
  steel: { from: "#7d8794", to: "#454d57", ink: "#fff" }, cream: { from: "#d8c3a0", to: "#a8895f", ink: "#3d2a1d" },
};

function Visual({ c }: { c: Cafe }) {
  const t = TONES[c.tone] ?? TONES.amber;
  if (c.photo_url) {
    return (
      <div className="relative h-40 rounded-xl overflow-hidden mb-4">
        <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
        <div className="absolute top-3 right-4 text-[11px] text-white bg-black/40 rounded-full px-2 py-0.5">{c.area}</div>
        {c.roasts_own && <span className="absolute bottom-3 left-4 text-[10px] text-white bg-[#9c6b3f] rounded-full px-2 py-0.5">직접 로스팅</span>}
      </div>
    );
  }
  return (
    <div className="relative h-28 rounded-xl overflow-hidden mb-4" style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #fff 1px, transparent 1px), radial-gradient(circle at 70% 70%, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="absolute bottom-3 left-4 flex items-end gap-2" style={{ color: t.ink }}>
        <span className="text-3xl font-bold leading-none opacity-90">{c.name.replace(/\s/g, "").slice(0, 1)}</span>
        {c.roasts_own && <span className="text-[10px] border border-current rounded-full px-2 py-0.5 mb-1 opacity-90">직접 로스팅</span>}
      </div>
      <div className="absolute top-3 right-4 text-[11px] opacity-80" style={{ color: t.ink }}>{c.area}</div>
    </div>
  );
}

function matchReason(c: Cafe, pref: { acidity: number; body: number; sweet: number } | null): string | null {
  if (!pref || c.acidity == null) return null;
  const diffs = [
    { k: "산미", cafe: c.acidity, want: pref.acidity, high: "산미가 또렷한", low: "산미가 부드러운" },
    { k: "바디", cafe: c.body, want: pref.body, high: "묵직한", low: "가벼운" },
    { k: "단맛", cafe: c.sweet, want: pref.sweet, high: "단맛이 좋은", low: "깔끔한" },
  ];
  for (const d of diffs) {
    if (d.want >= 0.7 && d.cafe >= 0.65) return `${d.k} 좋아하는 당신께 — 여긴 ${d.high} 편이에요`;
    if (d.want <= 0.3 && d.cafe <= 0.35) return `${d.k} 부담스러운 당신께 — 여긴 ${d.low} 편이에요`;
  }
  return null;
}

export default function CafePage() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"purpose" | "taste" | "result">("purpose");
  const [purpose, setPurpose] = useState<string>("");
  const [taste, setTaste] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch("/api/cafes").then((r) => r.json()).then((d) => { setCafes(d.cafes ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const pref = useMemo(() => {
    if (Object.keys(taste).length < 3) return null;
    return { acidity: taste.acidity, body: taste.body, sweet: taste.sweet };
  }, [taste]);

  const ranked = useMemo(() => {
    let list = purpose ? cafes.filter((c) => (c.uses ?? "").split(",").includes(purpose)) : cafes;
    if (pref) {
      list = [...list].sort((a, b) => {
        const da = Math.hypot((a.acidity ?? 0.5) - pref.acidity, (a.body ?? 0.5) - pref.body, (a.sweet ?? 0.5) - pref.sweet);
        const db = Math.hypot((b.acidity ?? 0.5) - pref.acidity, (b.body ?? 0.5) - pref.body, (b.sweet ?? 0.5) - pref.sweet);
        return da - db;
      });
    }
    return list;
  }, [cafes, purpose, pref]);

  if (step === "purpose") {
    return (
      <Shell>
        <div className="text-[#9c6b3f] text-xs tracking-[0.4em] uppercase mb-4">강동·구리 동네 커피 노트</div>
        <h1 className="text-4xl font-bold leading-snug mb-3">오늘 커피,<br />뭐 하러 가세요?</h1>
        <p className="text-[#6b5a48] mb-10 leading-relaxed">목적과 취향을 알려주시면, 거기 딱 맞는 동네 로스터리를 <strong className="text-[#2b2018]">근거와 함께</strong> 추천해드려요.</p>
        <div className="grid grid-cols-2 gap-3">
          {PURPOSES.map((p) => (
            <button key={p.key} onClick={() => { setPurpose(p.key); setStep("taste"); }}
              className="bg-[#fdfaf4] border border-[#ece0cd] rounded-2xl p-6 text-left hover:border-[#9c6b3f] hover:-translate-y-0.5 transition-all shadow-sm">
              <div className="text-3xl mb-2">{p.emoji}</div><div className="text-lg font-bold">{p.label}</div>
            </button>
          ))}
        </div>
        <button onClick={() => { setPurpose(""); setStep("taste"); }} className="mt-6 text-sm text-[#9c6b3f] underline">목적 상관없이 취향만으로 →</button>
      </Shell>
    );
  }

  if (step === "taste") {
    const allAnswered = Object.keys(taste).length === 3;
    return (
      <Shell>
        <button onClick={() => setStep("purpose")} className="text-xs text-[#9c6b3f] underline mb-6">← 목적 다시</button>
        <h1 className="text-3xl font-bold leading-snug mb-2">커피 취향을 알려주세요</h1>
        <p className="text-[#6b5a48] mb-8 leading-relaxed">이걸로 “왜 이 집이 당신께 맞는지” 근거를 만들어요.</p>
        <div className="space-y-7">
          {TASTE_Q.map((q) => (
            <div key={q.id}>
              <div className="font-bold mb-3">{q.q}</div>
              <div className="flex flex-wrap gap-2">
                {q.opts.map((o) => (
                  <button key={o.label} onClick={() => setTaste({ ...taste, [q.id]: o.v })}
                    className={`px-4 py-2.5 rounded-xl text-sm border transition-colors ${taste[q.id] === o.v ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-[#fdfaf4] text-[#6b5a48] border-[#cbb89f] hover:border-[#9c6b3f]"}`}>{o.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setStep("result")} disabled={!allAnswered} className="w-full mt-10 bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-medium disabled:opacity-40 transition-opacity">
          {allAnswered ? "내게 맞는 카페 보기 →" : "세 가지 모두 골라주세요"}
        </button>
        <button onClick={() => setStep("result")} className="w-full mt-3 text-sm text-[#9c6b3f] underline">취향 없이 전체 보기</button>
      </Shell>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-xl mx-auto px-6 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-[#9c6b3f] text-[11px] tracking-[0.3em] uppercase">강동·구리 동네 커피 노트</div>
            <h1 className="text-2xl font-bold mt-1">{purpose ? `${PURPOSES.find((p) => p.key === purpose)?.label}` : "전체"}{pref ? " · 취향 맞춤" : ""}</h1>
          </div>
          <button onClick={() => setStep("purpose")} className="text-xs text-[#9c6b3f] underline">처음부터</button>
        </header>

        {pref && (
          <div className="bg-[#2b2018] text-[#f4ece0] rounded-xl px-4 py-3 mb-6 text-sm">
            당신의 취향: 산미 {Math.round(pref.acidity*100)} · 바디 {Math.round(pref.body*100)} · 단맛 {Math.round(pref.sweet*100)} <span className="text-[#d4a574]">— 가까운 순 정렬</span>
          </div>
        )}

        {loading ? <p className="text-[#6b5a48]">불러오는 중...</p>
          : ranked.length === 0 ? <p className="text-[#6b5a48] bg-white/50 rounded-2xl p-8 text-center">맞는 곳을 아직 못 찾았어요.</p>
          : (
            <div className="space-y-6">
              {ranked.map((c, i) => {
                const reason = matchReason(c, pref);
                return (
                  <article key={c.id} className="bg-[#fdfaf4] rounded-2xl p-5 shadow-[0_4px_24px_rgba(80,50,20,0.08)] border border-[#ece0cd]">
                    {pref && i === 0 && <div className="text-[11px] font-bold text-[#9c6b3f] uppercase tracking-wider mb-2">★ 당신께 가장 가까운 곳</div>}
                    <Visual c={c} />
                    <h2 className="text-2xl font-bold leading-tight">{c.name}</h2>
                    <div className="text-[#9c6b3f] text-sm mt-0.5 mb-3">{c.vibe}</div>
                    {c.note && <p className="text-[18px] leading-relaxed text-[#3d2f22] font-medium mb-4">“{c.note}”</p>}
                    {reason && (
                      <div className="bg-[#e8f0e3] border border-[#bcd4ad] rounded-xl px-4 py-3 mb-3">
                        <div className="text-[11px] text-[#5f7355] uppercase tracking-wider mb-0.5">추천 근거</div>
                        <div className="text-[15px] text-[#3f4f32]">{reason}</div>
                      </div>
                    )}
                    {c.taste_pick && (
                      <div className="bg-[#f0e6d4] rounded-xl px-4 py-3 mb-4">
                        <div className="text-[11px] text-[#9c6b3f] uppercase tracking-wider mb-0.5">이런 분께</div>
                        <div className="text-[15px] text-[#52402e] leading-snug">{c.taste_pick}</div>
                      </div>
                    )}
                    {c.acidity != null && (
                      <div className="flex gap-4 mb-4 text-[11px] text-[#8a7458]">
                        {([["산미", c.acidity], ["바디", c.body], ["단맛", c.sweet]] as [string, number][]).map(([l, v]) => (
                          <div key={l} className="flex-1"><div className="mb-1">{l}</div>
                            <div className="h-1 bg-[#e3d6c2] rounded-full overflow-hidden"><div className="h-full bg-[#9c6b3f]" style={{ width: `${(v ?? 0.5) * 100}%` }} /></div></div>
                        ))}
                      </div>
                    )}
                    <dl className="text-sm space-y-1 text-[#6b5a48] mb-4">
                      {c.signature && <div><dt className="inline text-[#9c6b3f]">추천 </dt><dd className="inline">{c.signature}</dd></div>}
                      {c.price_hint && <div><dt className="inline text-[#9c6b3f]">가격 </dt><dd className="inline">{c.price_hint}</dd></div>}
                    </dl>
                    <div className="flex gap-2">
                      <a href={`https://map.kakao.com/?q=${encodeURIComponent(c.name + " " + c.area)}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-sm font-medium hover:bg-[#3d2f22] transition-colors">지도·길찾기</a>
                      {c.phone && <a href={`tel:${c.phone}`} className="px-4 text-center bg-transparent border border-[#cbb89f] text-[#524434] rounded-lg py-2.5 text-sm font-medium flex items-center">전화</a>}
                    </div>
                    <div className="text-[11px] text-[#a8927a] mt-3">{c.hours} · 공개평점 {c.rating}({c.rating_count})</div>
                  </article>
                );
              })}
            </div>
          )}
        <a href="/cafe/register" className="block mt-10 text-center text-sm text-[#9c6b3f] underline">사장님이세요? 우리 가게 등록하기 →</a>
        <footer className="mt-8 pt-6 border-t border-[#d9c9b0] text-[11px] text-[#a8927a] leading-relaxed">위치·시간·평점은 공개 정보 · 한줄평·취향 매칭은 큐레이션입니다. 강동·구리 지역.</footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018] flex items-center" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-xl mx-auto px-6 py-16 w-full">{children}</div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
