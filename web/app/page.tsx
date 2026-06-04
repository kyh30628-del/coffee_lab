"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Cafe = { id: number; name: string; area: string; note: string; tone: string; signature: string; photo_url: string | null };
type Theme = { key: string; emoji: string; title: string; desc: string; cafes: Cafe[] };

const TONES: Record<string, { from: string; to: string }> = {
  amber: { from: "#c8893f", to: "#8a5a24" }, brown: { from: "#6f4e37", to: "#3d2a1d" },
  rose: { from: "#c97a6d", to: "#8f4a44" }, dark: { from: "#3a2e28", to: "#1a1310" },
  green: { from: "#5f7355", to: "#36412f" }, gold: { from: "#c9a227", to: "#8a6d15" },
  steel: { from: "#7d8794", to: "#454d57" }, cream: { from: "#d8c3a0", to: "#a8895f" },
};

export default function Home() {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch("/api/themes").then((r) => r.json()).then((d) => { setThemes(d.themes ?? []); setTotal(d.total ?? 0); }).catch(() => {});
  }, []);

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-2xl mx-auto px-6 py-14">
        <header className="mb-10">
          <div className="text-[#9c6b3f] text-xs tracking-[0.4em] uppercase mb-4">강동·구리 동네 커피 노트</div>
          <h1 className="text-5xl font-bold leading-[1.15]">동네 커피 노트</h1>
          <p className="text-[#6b5a48] mt-5 text-lg leading-relaxed">
            프랜차이즈 말고, 내 동네에 숨은 진짜 좋은 커피. 별점이 아니라 커피 좀 아는 사람이 직접 골라 적었어요.
            {total > 0 && <span className="text-[#9c6b3f]"> 지금 {total}곳.</span>}
          </p>
        </header>

        {/* 맞춤 추천 진입 */}
        <Link href="/cafe" className="group block bg-[#2b2018] text-[#f4ece0] rounded-2xl p-7 mb-12 hover:bg-[#3d2f22] transition-colors">
          <div className="text-[#d4a574] text-xs tracking-widest uppercase mb-2">3초 맞춤 추천</div>
          <h2 className="text-2xl font-bold mb-2">오늘 뭐 하러 가세요?</h2>
          <p className="text-[#cbb89f] text-[15px] leading-relaxed mb-3">목적과 취향을 고르면, 왜 맞는지 근거와 함께 골라드려요.</p>
          <span className="text-[#d4a574] font-medium text-sm group-hover:underline">추천 받기 →</span>
        </Link>

        {/* 테마 큐레이션 */}
        {themes.map((t) => (
          <section key={t.key} className="mb-12">
            <div className="mb-4">
              <h2 className="text-2xl font-bold">{t.emoji} {t.title}</h2>
              <p className="text-[#6b5a48] text-sm mt-1">{t.desc}</p>
            </div>
            <div className="grid gap-3">
              {t.cafes.map((c) => {
                const tone = TONES[c.tone] ?? TONES.amber;
                return (
                  <Link key={c.id} href="/cafe" className="group flex gap-4 bg-[#fdfaf4] rounded-xl p-3 border border-[#ece0cd] hover:border-[#9c6b3f] transition-colors items-center">
                    <div className="w-16 h-16 rounded-lg shrink-0 overflow-hidden" style={{ background: c.photo_url ? undefined : `linear-gradient(135deg, ${tone.from}, ${tone.to})` }}>
                      {c.photo_url
                        ? <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold opacity-90">{c.name.replace(/\s/g, "").slice(0, 1)}</div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{c.name}</span>
                        <span className="text-[11px] text-[#9c6b3f]">{c.area}</span>
                      </div>
                      <p className="text-sm text-[#6b5a48] truncate">{c.note}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {/* 사장님 진입 */}
        <Link href="/cafe/register" className="group block bg-[#fdfaf4] border border-[#ece0cd] rounded-2xl p-6 hover:border-[#9c6b3f] transition-colors">
          <div className="text-[#9c6b3f] text-xs tracking-widest uppercase mb-1">사장님이세요?</div>
          <h2 className="text-lg font-bold">우리 가게, 커피 아는 손님에게 소개하기 →</h2>
        </Link>

        <footer className="mt-12 pt-8 border-t border-[#d9c9b0] text-[11px] text-[#a8927a] leading-relaxed">
          위치·시간은 공개 정보 · 한줄평·취향 매칭은 큐레이션입니다. 강동·구리 지역부터 시작합니다.
        </footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
