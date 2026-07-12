"use client";
import { useEffect, useMemo, useState } from "react";
import BackLink from "../BackLink";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

type EvidenceReview = { quote: string; link?: string; source?: string; date?: string };
type Cafe = {
  id: number; name: string; area: string; address: string;
  hours: string; phone: string; rating: number; rating_count: number;
  roasts_own: boolean; beans: string; signature: string; uses: string;
  vibe: string; note: string; price_hint: string; source: string;
  acidity: number; body: number; sweet: number; taste_pick: string; tone: string;
  photo_url: string | null;
  synth_grade: string | null; synth_identity: string | null;
  synth_basis: string | null; synth_count: number | null;
  synth_reviews: EvidenceReview[] | null;
};

const PURPOSES = [
  { key: "작업", label: "작업·집중", emoji: "💻" },
  { key: "혼자", label: "혼자 조용히", emoji: "🤍" },
  { key: "수다", label: "수다 떨기", emoji: "💬" },
  { key: "빵", label: "빵·디저트", emoji: "🥐" },
];

// 맛 질문 — 데이터로 검증된 "갈리는 축" 4갈래 단일선택. 각각을 좌표로 변환.
const TASTE_CHOICES = [
  { key: "acidity", label: "산미·상큼", emoji: "🍋", pref: { acidity: 0.85, body: 0.4, sweet: 0.5 }, desc: "밝고 또렷한 과일향" },
  { key: "dark", label: "묵직·다크", emoji: "🍫", pref: { acidity: 0.25, body: 0.85, sweet: 0.5 }, desc: "진하고 묵직한 바디" },
  { key: "nutty", label: "고소·부드러움", emoji: "🌰", pref: { acidity: 0.2, body: 0.6, sweet: 0.5 }, desc: "견과류처럼 구수하게" },
  { key: "sweet", label: "달콤·디저트", emoji: "🍰", pref: { acidity: 0.4, body: 0.5, sweet: 0.85 }, desc: "단맛과 디저트 위주" },
];

const TONES: Record<string, { from: string; to: string; ink: string }> = {
  amber: { from: "#c8893f", to: "#8a5a24", ink: "#fff" }, brown: { from: "#6f4e37", to: "#3d2a1d", ink: "#fff" },
  rose: { from: "#c97a6d", to: "#8f4a44", ink: "#fff" }, dark: { from: "#3a2e28", to: "#1a1310", ink: "#fff" },
  green: { from: "#5f7355", to: "#36412f", ink: "#fff" }, gold: { from: "#c9a227", to: "#8a6d15", ink: "#fff" },
  steel: { from: "#7d8794", to: "#454d57", ink: "#fff" }, cream: { from: "#d8c3a0", to: "#a8895f", ink: "#3d2a1d" },
};
const GRADE_STYLE: Record<string, { bg: string; label: string }> = {
  검증: { bg: "#5f7355", label: "검증" }, 참고: { bg: "#9c6b3f", label: "참고" }, 후보: { bg: "#a8927a", label: "후보" },
};

// 특징 태그 — '대부분 카페가 가진' 특징을 데이터로 뽑아 표시 (질문 아닌 정보)
function featureTags(c: Cafe): string[] {
  const tags: string[] = [];
  if (c.roasts_own) tags.push("🔥 직접 로스팅");
  const id = c.synth_identity ?? "";
  if (id.includes("디저트") || (c.uses ?? "").includes("빵")) tags.push("🍰 디저트");
  if (id.includes("외부 평판") || (c.synth_count ?? 0) >= 30) tags.push("⭐ 평판 많음");
  if ((c.uses ?? "").includes("사진")) tags.push("📸 분위기");
  if ((c.uses ?? "").includes("작업")) tags.push("💻 작업");
  return tags.slice(0, 3);
}

function Visual({ c }: { c: Cafe }) {
  const t = TONES[c.tone] ?? TONES.amber;
  if (c.photo_url) {
    return (
      <div className="relative h-32 rounded-xl overflow-hidden mb-3">
        <img src={c.photo_url} alt={c.name} className="w-full h-full object-cover" />
        <div className="absolute top-2 right-3 text-[10px] text-white bg-black/40 rounded-full px-2 py-0.5">{c.area}</div>
      </div>
    );
  }
  return (
    <div className="relative h-24 rounded-xl overflow-hidden mb-3" style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}>
      <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #fff 1px, transparent 1px), radial-gradient(circle at 70% 70%, #fff 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
      <div className="absolute bottom-2 left-3 flex items-end gap-2" style={{ color: t.ink }}>
        <span className="text-2xl font-bold leading-none opacity-90">{c.name.replace(/\s/g, "").slice(0, 1)}</span>
      </div>
      <div className="absolute top-2 right-3 text-[10px] opacity-80" style={{ color: t.ink }}>{c.area}</div>
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

function CafeCard({ c, pref, top, onShowEvidence }: { c: Cafe; pref: { acidity: number; body: number; sweet: number } | null; top: boolean; onShowEvidence: (c: Cafe) => void }) {
  const g = c.synth_grade ? GRADE_STYLE[c.synth_grade] : null;
  const reason = matchReason(c, pref);
  const tags = featureTags(c);
  const hasReviews = (c.synth_reviews?.length ?? 0) > 0;

  return (
    <article className="bg-[#fdfaf4] rounded-2xl p-4 shadow-[0_4px_24px_rgba(80,50,20,0.08)] border border-[#ece0cd] flex flex-col">
      {top && <div className="text-[10px] font-bold text-[#7a4d1c] uppercase tracking-wider mb-2">★ 당신께 가장 가까운 곳</div>}
      <Visual c={c} />
      <div className="flex items-center gap-1.5 flex-wrap mb-1">
        <h2 className="text-xl font-bold leading-tight">{c.name}</h2>
        {g && <span className="text-[10px] text-white px-2 py-0.5 rounded-full" style={{ background: g.bg }}>{g.label}</span>}
      </div>
      <div className="text-[#7a4d1c] text-xs mb-2">{c.vibe}</div>

      {/* 특징 태그 — 대부분 카페가 가진 특징을 정보로 표시 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((t) => <span key={t} className="text-[10px] bg-[#f0e6d4] text-[#8a6d3f] px-2 py-0.5 rounded-full">{t}</span>)}
        </div>
      )}

      {c.note && <p className="text-[15px] leading-relaxed text-[#3d2f22] font-medium mb-3">“{c.note}”</p>}

      {reason && (
        <div className="bg-[#e8f0e3] border border-[#bcd4ad] rounded-lg px-3 py-2 mb-2">
          <div className="text-[10px] text-[#5f7355] uppercase tracking-wider mb-0.5">추천 근거</div>
          <div className="text-[13px] text-[#3f4f32]">{reason}</div>
        </div>
      )}

      {c.synth_identity && (
        <div className="bg-[#efe9dd] rounded-lg px-3 py-2 mb-2 border border-[#ddd0bb]">
          <div className="text-[13px] text-[#52402e] leading-snug">{c.synth_identity}</div>
        </div>
      )}

      {c.synth_count != null && c.synth_count > 0 && (
        <button onClick={() => hasReviews && onShowEvidence(c)} disabled={!hasReviews}
          className={`mb-3 text-left rounded-lg px-3 py-2 flex items-center justify-between transition-colors ${hasReviews ? "bg-[#f0e6d4] hover:bg-[#e9dcc4] cursor-pointer" : "bg-[#f0e6d4]"}`}>
          <span className="text-[12px] text-[#8a6d3f]">📋 리뷰 {c.synth_count}건 종합 {hasReviews && "· 근거 보기"}</span>
          {hasReviews && <span className="text-[#7a4d1c] text-xs">→</span>}
        </button>
      )}

      {c.acidity != null && (
        <div className="flex gap-3 mb-3 text-[10px] text-[#8a7458]">
          {([["산미", c.acidity], ["바디", c.body], ["단맛", c.sweet]] as [string, number][]).map(([l, v]) => (
            <div key={l} className="flex-1"><div className="mb-1">{l}</div>
              <div className="h-1 bg-[#e3d6c2] rounded-full overflow-hidden"><div className="h-full bg-[#9c6b3f]" style={{ width: `${(v ?? 0.5) * 100}%` }} /></div></div>
          ))}
        </div>
      )}

      <div className="mt-auto">
        {c.signature && <div className="text-[12px] text-[#6b5a48] mb-2"><span className="text-[#7a4d1c]">추천 </span>{c.signature}</div>}
        <div className="flex gap-2">
          <a href={`https://map.kakao.com/?q=${encodeURIComponent(c.name + " " + c.area)}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-lg py-2 text-xs font-medium hover:bg-[#3d2f22] transition-colors">지도·길찾기</a>
          {c.phone && <a href={`tel:${c.phone}`} className="px-3 text-center bg-transparent border border-[#cbb89f] text-[#524434] rounded-lg py-2 text-xs font-medium flex items-center">전화</a>}
        </div>
      </div>
    </article>
  );
}

// 우측 슬라이드 근거 패널
function EvidencePanel({ cafe, onClose }: { cafe: Cafe | null; onClose: () => void }) {
  useLockBodyScroll(!!cafe);
  if (!cafe) return null;
  const reviews = cafe.synth_reviews ?? [];
  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/30 z-40" />
      <aside className="fixed top-0 right-0 h-full w-full max-w-md bg-[#fdfaf4] z-50 shadow-2xl overflow-y-auto" style={{ fontFamily: "'Gowun Batang', serif" }}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-2xl font-bold">{cafe.name}</h3>
            <button onClick={onClose} className="text-2xl text-[#7a4d1c] leading-none">×</button>
          </div>
          <div className="text-[#7a4d1c] text-sm mb-4">리뷰 {cafe.synth_count}건 종합 · 근거</div>
          {cafe.synth_identity && <div className="bg-[#efe9dd] rounded-lg px-4 py-3 mb-4 text-[14px] text-[#52402e]">{cafe.synth_identity}</div>}
          <div className="text-[11px] text-[#6b5847] mb-3">이 분석의 근거가 된 실제 후기 (네이버 공개 글)</div>
          <div className="space-y-3">
            {reviews.map((rv, i) => (
              <div key={i} className="border-b border-[#f0e6d4] pb-3 last:border-0">
                <div className="text-[14px] text-[#3d2f22] leading-relaxed">“{rv.quote}”</div>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[#6b5847]">
                  <span>{rv.source}</span>{rv.date && <span>· {rv.date}</span>}
                  {rv.link && <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#7a4d1c] underline ml-auto">원문 보기 →</a>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-[#6b5847] mt-6 leading-relaxed">네이버 공개 검색 결과의 요약·출처 링크입니다. 원문 저작권은 각 작성자에게 있습니다.</div>
        </div>
      </aside>
    </>
  );
}

export default function CafePage() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"purpose" | "taste" | "result">("purpose");
  const [purpose, setPurpose] = useState<string>("");
  const [tastePref, setTastePref] = useState<{ acidity: number; body: number; sweet: number } | null>(null);
  const [evidenceCafe, setEvidenceCafe] = useState<Cafe | null>(null);

  useEffect(() => {
    fetch("/api/cafes").then((r) => r.json()).then((d) => { setCafes(d.cafes ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const ranked = useMemo(() => {
    let list = purpose ? cafes.filter((c) => (c.uses ?? "").split(",").includes(purpose)) : cafes;
    if (tastePref) {
      const p = tastePref;
      list = [...list].sort((a, b) => {
        const da = Math.hypot((a.acidity ?? 0.5) - p.acidity, (a.body ?? 0.5) - p.body, (a.sweet ?? 0.5) - p.sweet);
        const db = Math.hypot((b.acidity ?? 0.5) - p.acidity, (b.body ?? 0.5) - p.body, (b.sweet ?? 0.5) - p.sweet);
        return da - db;
      });
    }
    return list;
  }, [cafes, purpose, tastePref]);

  if (step === "purpose") {
    return (
      <Shell wide={false}>
        <BackLink to="/" label="홈" className="text-[#7a4d1c] mb-4" />
        <div className="text-[#7a4d1c] text-xs tracking-[0.4em] uppercase mb-4">강동·구리 동네 커피 노트</div>
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
        <button onClick={() => { setPurpose(""); setStep("taste"); }} className="mt-6 text-sm text-[#7a4d1c] underline">목적 상관없이 취향만으로 →</button>
      </Shell>
    );
  }

  if (step === "taste") {
    return (
      <Shell wide={false}>
        <button onClick={() => setStep("purpose")} className="text-xs text-[#7a4d1c] underline mb-6">← 목적 다시</button>
        <h1 className="text-3xl font-bold leading-snug mb-2">어떤 커피 좋아해요?</h1>
        <p className="text-[#6b5a48] mb-8 leading-relaxed">동네 카페 리뷰에서 가장 많이 갈리는 취향이에요. 하나 고르면 맞는 집을 근거와 함께 찾아드려요.</p>
        <div className="grid grid-cols-2 gap-3">
          {TASTE_CHOICES.map((t) => (
            <button key={t.key} onClick={() => { setTastePref(t.pref); setStep("result"); }}
              className="bg-[#fdfaf4] border border-[#ece0cd] rounded-2xl p-5 text-left hover:border-[#9c6b3f] hover:-translate-y-0.5 transition-all shadow-sm">
              <div className="text-3xl mb-2">{t.emoji}</div>
              <div className="text-lg font-bold">{t.label}</div>
              <div className="text-xs text-[#6b5a48] mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
        <button onClick={() => { setTastePref(null); setStep("result"); }} className="mt-6 text-sm text-[#7a4d1c] underline">취향 상관없이 전체 보기 →</button>
      </Shell>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-[#7a4d1c] text-[11px] tracking-[0.3em] uppercase">강동·구리 동네 커피 노트</div>
            <h1 className="text-2xl font-bold mt-1">{purpose ? `${PURPOSES.find((p) => p.key === purpose)?.label}` : "전체"}{tastePref ? " · 취향 맞춤" : ""}</h1>
          </div>
          <button onClick={() => setStep("purpose")} className="text-xs text-[#7a4d1c] underline">처음부터</button>
        </header>

        {loading ? <p className="text-[#6b5a48]">불러오는 중...</p>
          : ranked.length === 0 ? <p className="text-[#6b5a48] bg-white/50 rounded-2xl p-8 text-center">맞는 곳을 아직 못 찾았어요.</p>
          : (
            <div className="grid md:grid-cols-2 gap-5">
              {ranked.map((c, i) => <CafeCard key={c.id} c={c} pref={tastePref} top={!!tastePref && i === 0} onShowEvidence={setEvidenceCafe} />)}
            </div>
          )}

        <a href="/cafe/register" className="block mt-10 text-center text-sm text-[#7a4d1c] underline">사장님이세요? 우리 가게 등록하기 →</a>
        <footer className="mt-8 pt-6 border-t border-[#d9c9b0] text-[11px] text-[#6b5847] leading-relaxed">위치·시간·평점은 공개 정보 · 리뷰 종합 분석은 네이버 공개 후기를 교차검증한 결과이며 근거 원문을 함께 제공합니다. 강동·구리 지역.</footer>
      </div>
      <EvidencePanel cafe={evidenceCafe} onClose={() => setEvidenceCafe(null)} />
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide: boolean }) {
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018] flex items-center" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className={`${wide ? "max-w-4xl" : "max-w-xl"} mx-auto px-6 py-16 w-full`}>{children}</div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
