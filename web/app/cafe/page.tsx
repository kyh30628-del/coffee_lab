"use client";
import { useEffect, useMemo, useState } from "react";

type Cafe = {
  id: number; name: string; area: string; address: string;
  lat: number; lng: number; hours: string; phone: string;
  rating: number; rating_count: number; roasts_own: boolean;
  beans: string; signature: string; uses: string; vibe: string;
  note: string; price_hint: string; source: string;
};

const USES = [
  { key: "", label: "전체" },
  { key: "작업", label: "작업하기" },
  { key: "혼자", label: "혼자 조용히" },
  { key: "수다", label: "수다 떨기" },
  { key: "빵", label: "빵·디저트" },
];

function CafeCard({ c }: { c: Cafe }) {
  return (
    <article className="bg-[#fdfaf4] rounded-2xl p-7 shadow-[0_2px_20px_rgba(80,50,20,0.06)] border border-[#ece0cd]">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="text-2xl font-bold">{c.name}</h2>
        {c.roasts_own && <span className="shrink-0 text-[11px] bg-[#9c6b3f] text-white px-2.5 py-1 rounded-full">직접 로스팅</span>}
      </div>
      <div className="text-[#9c6b3f] text-sm mb-4">{c.area} · {c.vibe}</div>
      {c.note && (
        <blockquote className="border-l-[3px] border-[#9c6b3f] pl-4 my-4 text-[17px] leading-relaxed text-[#3d2f22]">“{c.note}”</blockquote>
      )}
      <dl className="text-sm space-y-1.5 mt-4 text-[#524434]">
        {c.beans && <div><dt className="inline text-[#9c6b3f]">원두 </dt><dd className="inline">{c.beans}</dd></div>}
        {c.signature && <div><dt className="inline text-[#9c6b3f]">추천 </dt><dd className="inline">{c.signature}</dd></div>}
        {c.price_hint && <div><dt className="inline text-[#9c6b3f]">가격 </dt><dd className="inline">{c.price_hint}</dd></div>}
      </dl>
      <div className="flex flex-wrap gap-1.5 mt-4">
        {(c.uses ?? "").split(",").filter(Boolean).map((u) => (
          <span key={u} className="text-xs bg-[#efe6d6] text-[#6b5a48] px-2.5 py-1 rounded-full">{u}</span>
        ))}
      </div>
      <div className="flex gap-2 mt-5 pt-5 border-t border-[#ece0cd]">
        <a href={`https://map.kakao.com/?q=${encodeURIComponent(c.name + " " + c.area)}`} target="_blank" rel="noopener noreferrer"
           className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-sm font-medium hover:bg-[#3d2f22] transition-colors">지도·길찾기</a>
        {c.phone && <a href={`tel:${c.phone}`} className="flex-1 text-center bg-transparent border border-[#cbb89f] text-[#524434] rounded-lg py-2.5 text-sm font-medium hover:border-[#9c6b3f] transition-colors">전화</a>}
      </div>
      <div className="text-[11px] text-[#a8927a] mt-3">{c.hours} · 공개평점 {c.rating}({c.rating_count})</div>
    </article>
  );
}

export default function CafePage() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [use, setUse] = useState("");
  const [view, setView] = useState<"list" | "area">("list");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/cafes").then((r) => r.json()).then((d) => { setCafes(d.cafes ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!use) return cafes;
    return cafes.filter((c) => (c.uses ?? "").split(",").includes(use));
  }, [cafes, use]);

  // 동네별 그룹
  const byArea = useMemo(() => {
    const m: Record<string, Cafe[]> = {};
    filtered.forEach((c) => { (m[c.area || "기타"] ??= []).push(c); });
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }, [filtered]);

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <header className="mb-8">
          <div className="text-[#9c6b3f] text-xs tracking-[0.4em] uppercase mb-3">Neighborhood Coffee Guide</div>
          <h1 className="text-4xl font-bold leading-tight">강동, 동네 커피 노트</h1>
          <p className="text-[#6b5a48] mt-3 leading-relaxed">
            별점 말고, 커피 좀 아는 사람이 직접 골라 적은 동네 카페 안내.
            오늘 뭐 하러 가는지 고르면 거기 맞는 곳을 보여드려요.
          </p>
        </header>

        {/* 용도 필터 + 뷰 토글 */}
        <div className="flex items-center justify-between gap-3 mb-8 flex-wrap">
          <div className="flex flex-wrap gap-2">
            {USES.map((u) => (
              <button key={u.key} onClick={() => setUse(u.key)}
                className={`px-4 py-2 rounded-full text-sm border transition-colors ${use === u.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-transparent text-[#6b5a48] border-[#cbb89f] hover:border-[#9c6b3f]"}`}>
                {u.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-full border border-[#cbb89f] overflow-hidden text-sm">
            <button onClick={() => setView("list")} className={`px-3.5 py-1.5 ${view === "list" ? "bg-[#9c6b3f] text-white" : "text-[#6b5a48]"}`}>목록</button>
            <button onClick={() => setView("area")} className={`px-3.5 py-1.5 ${view === "area" ? "bg-[#9c6b3f] text-white" : "text-[#6b5a48]"}`}>동네별</button>
          </div>
        </div>

        {loading ? (
          <p className="text-[#6b5a48]">불러오는 중...</p>
        ) : filtered.length === 0 ? (
          <p className="text-[#6b5a48] bg-white/50 rounded-2xl p-8 text-center">
            {use ? "이 용도에 맞는 곳을 아직 못 찾았어요." : "아직 등록된 카페가 없어요."}
          </p>
        ) : view === "list" ? (
          <div className="space-y-6">
            {filtered.map((c) => <CafeCard key={c.id} c={c} />)}
          </div>
        ) : (
          <div className="space-y-10">
            {byArea.map(([area, list]) => (
              <section key={area}>
                <div className="flex items-baseline gap-2 mb-4">
                  <h2 className="text-xl font-bold text-[#9c6b3f]">{area}</h2>
                  <span className="text-sm text-[#a8927a]">{list.length}곳</span>
                </div>
                <div className="space-y-6">
                  {list.map((c) => <CafeCard key={c.id} c={c} />)}
                </div>
              </section>
            ))}
          </div>
        )}

        <a href="/cafe/register" className="block mt-10 text-center text-sm text-[#9c6b3f] underline">사장님이세요? 우리 가게 등록하기 →</a>
        <footer className="mt-8 pt-6 border-t border-[#d9c9b0] text-[11px] text-[#a8927a] leading-relaxed">
          위치·영업시간·평점은 공개 정보 · 큐레이션(원두·추천·한줄평)은 직접 확인하거나 사장님이 등록한 정보입니다.
        </footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
