"use client";
import { useEffect, useMemo, useState } from "react";

type Cafe = {
  id: number; name: string; area: string; address: string;
  hours: string; phone: string; rating: number; rating_count: number;
  roasts_own: boolean; beans: string; signature: string; uses: string;
  vibe: string; note: string; price_hint: string; source: string;
  acidity: number; body: number; sweet: number; taste_pick: string; tone: string;
};

const PURPOSES = [
  { key: "", label: "전체", emoji: "☕" },
  { key: "작업", label: "작업·집중", emoji: "💻" },
  { key: "혼자", label: "혼자 조용히", emoji: "🤍" },
  { key: "수다", label: "수다 떨기", emoji: "💬" },
  { key: "빵", label: "빵·디저트", emoji: "🥐" },
];

const TONES: Record<string, { from: string; to: string; ink: string }> = {
  amber:  { from: "#c8893f", to: "#8a5a24", ink: "#fff" },
  brown:  { from: "#6f4e37", to: "#3d2a1d", ink: "#fff" },
  rose:   { from: "#c97a6d", to: "#8f4a44", ink: "#fff" },
  dark:   { from: "#3a2e28", to: "#1a1310", ink: "#fff" },
  green:  { from: "#5f7355", to: "#36412f", ink: "#fff" },
  gold:   { from: "#c9a227", to: "#8a6d15", ink: "#fff" },
  steel:  { from: "#7d8794", to: "#454d57", ink: "#fff" },
  cream:  { from: "#d8c3a0", to: "#a8895f", ink: "#3d2a1d" },
};

function Visual({ c }: { c: Cafe }) {
  const t = TONES[c.tone] ?? TONES.amber;
  const initial = c.name.replace(/\s/g, "").slice(0, 1);
  return (
    <div className="relative h-28 rounded-xl overflow-hidden mb-4"
      style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
      <div className="absolute inset-0 opacity-15"
        style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #fff 1px, transparent 1px), radial-gradient(circle at 70% 70%, #fff 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
      <div className="absolute bottom-3 left-4 flex items-end gap-2" style={{ color: t.ink }}>
        <span className="text-3xl font-bold leading-none opacity-90">{initial}</span>
        {c.roasts_own && <span className="text-[10px] border border-current rounded-full px-2 py-0.5 mb-1 opacity-90">직접 로스팅</span>}
      </div>
      <div className="absolute top-3 right-4 text-[11px] opacity-80" style={{ color: t.ink }}>{c.area}</div>
    </div>
  );
}

function CafeCard({ c }: { c: Cafe }) {
  return (
    <article className="bg-[#fdfaf4] rounded-2xl p-5 shadow-[0_4px_24px_rgba(80,50,20,0.08)] border border-[#ece0cd]">
      <Visual c={c} />
      <h2 className="text-2xl font-bold leading-tight">{c.name}</h2>
      <div className="text-[#9c6b3f] text-sm mt-0.5 mb-3">{c.vibe}</div>

      {/* 한 줄평 — 주인공 */}
      {c.note && (
        <p className="text-[18px] leading-relaxed text-[#3d2f22] font-medium mb-4">“{c.note}”</p>
      )}

      {/* 취향 연결 — 우리만의 것 */}
      {c.taste_pick && (
        <div className="bg-[#f0e6d4] rounded-xl px-4 py-3 mb-4">
          <div className="text-[11px] text-[#9c6b3f] uppercase tracking-wider mb-0.5">이런 분께</div>
          <div className="text-[15px] text-[#52402e] leading-snug">{c.taste_pick}</div>
        </div>
      )}

      {/* 맛 좌표 미니 바 */}
      {(c.acidity != null) && (
        <div className="flex gap-4 mb-4 text-[11px] text-[#8a7458]">
          {([["산미", c.acidity], ["바디", c.body], ["단맛", c.sweet]] as [string, number][]).map(([l, v]) => (
            <div key={l} className="flex-1">
              <div className="flex justify-between mb-1"><span>{l}</span></div>
              <div className="h-1 bg-[#e3d6c2] rounded-full overflow-hidden">
                <div className="h-full bg-[#9c6b3f]" style={{ width: `${(v ?? 0.5) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <dl className="text-sm space-y-1 text-[#6b5a48] mb-4">
        {c.signature && <div><dt className="inline text-[#9c6b3f]">추천 </dt><dd className="inline">{c.signature}</dd></div>}
        {c.price_hint && <div><dt className="inline text-[#9c6b3f]">가격 </dt><dd className="inline">{c.price_hint}</dd></div>}
      </dl>

      <div className="flex gap-2">
        <a href={`https://map.kakao.com/?q=${encodeURIComponent(c.name + " " + c.area)}`} target="_blank" rel="noopener noreferrer"
           className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-sm font-medium hover:bg-[#3d2f22] transition-colors">지도·길찾기</a>
        {c.phone && <a href={`tel:${c.phone}`} className="px-4 text-center bg-transparent border border-[#cbb89f] text-[#524434] rounded-lg py-2.5 text-sm font-medium flex items-center">전화</a>}
      </div>
      <div className="text-[11px] text-[#a8927a] mt-3">{c.hours} · 공개평점 {c.rating}({c.rating_count})</div>
    </article>
  );
}

export default function CafePage() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [purpose, setPurpose] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cafes").then((r) => r.json()).then((d) => { setCafes(d.cafes ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!purpose) return cafes;
    return cafes.filter((c) => (c.uses ?? "").split(",").includes(purpose));
  }, [cafes, purpose]);

  // 진입 화면: 아직 목적 안 고름
  if (purpose === null) {
    return (
      <main className="min-h-screen bg-[#f4ece0] text-[#2b2018] flex items-center" style={{ fontFamily: "'Gowun Batang', serif" }}>
        <div className="max-w-xl mx-auto px-6 py-16 w-full">
          <div className="text-[#9c6b3f] text-xs tracking-[0.4em] uppercase mb-4">강동 동네 커피 노트</div>
          <h1 className="text-4xl font-bold leading-snug mb-3">오늘 커피,<br />뭐 하러 가세요?</h1>
          <p className="text-[#6b5a48] mb-10 leading-relaxed">고르면, 거기 딱 맞는 동네 로스터리를 커피 아는 사람의 노트와 함께 보여드려요.</p>
          <div className="grid grid-cols-2 gap-3">
            {PURPOSES.filter((p) => p.key !== "").map((p) => (
              <button key={p.key} onClick={() => setPurpose(p.key)}
                className="bg-[#fdfaf4] border border-[#ece0cd] rounded-2xl p-6 text-left hover:border-[#9c6b3f] hover:-translate-y-0.5 transition-all shadow-sm">
                <div className="text-3xl mb-2">{p.emoji}</div>
                <div className="text-lg font-bold">{p.label}</div>
              </button>
            ))}
          </div>
          <button onClick={() => setPurpose("")} className="mt-6 text-sm text-[#9c6b3f] underline">그냥 전체 둘러볼래요 →</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-xl mx-auto px-6 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-[#9c6b3f] text-[11px] tracking-[0.3em] uppercase">강동 동네 커피 노트</div>
            <h1 className="text-2xl font-bold mt-1">
              {purpose ? `${PURPOSES.find((p) => p.key === purpose)?.label} 좋은 곳` : "전체 카페"}
            </h1>
          </div>
          <button onClick={() => setPurpose(null)} className="text-xs text-[#9c6b3f] underline">목적 다시</button>
        </header>

        <div className="flex flex-wrap gap-2 mb-7">
          {PURPOSES.map((p) => (
            <button key={p.key} onClick={() => setPurpose(p.key)}
              className={`px-3.5 py-1.5 rounded-full text-sm border transition-colors ${purpose === p.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-transparent text-[#6b5a48] border-[#cbb89f] hover:border-[#9c6b3f]"}`}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>

        {loading ? <p className="text-[#6b5a48]">불러오는 중...</p>
          : filtered.length === 0 ? (
            <p className="text-[#6b5a48] bg-white/50 rounded-2xl p-8 text-center">이 목적에 맞는 곳을 아직 못 찾았어요. 곧 더 채울게요.</p>
          ) : (
            <div className="space-y-6">{filtered.map((c) => <CafeCard key={c.id} c={c} />)}</div>
          )}

        <a href="/cafe/register" className="block mt-10 text-center text-sm text-[#9c6b3f] underline">사장님이세요? 우리 가게 등록하기 →</a>
        <footer className="mt-8 pt-6 border-t border-[#d9c9b0] text-[11px] text-[#a8927a] leading-relaxed">
          위치·시간·평점은 공개 정보 · 한줄평·취향 안내는 큐레이션입니다. 강동 지역부터 시작합니다.
        </footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
