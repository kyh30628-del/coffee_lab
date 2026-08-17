"use client";
import { useEffect, useMemo, useState } from "react";
import BackLink from "../BackLink";
import { trackOutbound } from "../trackOutboundClient";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";
import { decodeCafeScores } from "@/lib/mapCafes";

type EvidenceReview = { quote: string; link?: string; source?: string; date?: string };
type Cafe = {
  id: number; name: string; area: string; address: string;
  hours: string; phone: string; rating: number; rating_count: number;
  signature: string;
  vibe: string; note: string; price_hint: string; source: string;
  tone: string;
  photo_url: string | null;
  char_scores: Record<string, number> | null;
  synth_grade: string | null; synth_identity: string | null;
  synth_basis: string | null; synth_count: number | null;
  synth_reviews: EvidenceReview[] | null;
};

// 🚨 재발방지(2026-07-26): 예전엔 uses/acidity/body/sweet 등 별도 필드로 목적·취향을 매칭했는데,
//   그 필드들은 극초기 카페 11곳에만 값이 있고 나머지 13,380곳(전체의 99.9%)은 전부 비어있어
//   목적을 아무거나 골라도 항상 0곳이 나오는 상태로 방치돼 있었다(스키마가 char_scores 체계로
//   넘어간 뒤 이 페이지만 안 옮겨탐). 실제 전 카페에 값이 있는 char_scores(6축)로 교체.
const PURPOSES = [
  { key: "작업", label: "작업·집중", emoji: "💻", axis: "work" },
  { key: "혼자", label: "혼자 조용히", emoji: "🤍", axis: "quiet" },
  { key: "수다", label: "수다 떨기", emoji: "💬", axis: "mood" },
  { key: "빵", label: "빵·디저트", emoji: "🥐", axis: "dessert" },
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

// 특징 태그 — '대부분 카페가 가진' 특징을 데이터(char_scores)로 뽑아 표시 (질문 아닌 정보)
function featureTags(c: Cafe): string[] {
  const tags: string[] = [];
  const cs = c.char_scores ?? {};
  if ((cs.roast ?? 0) >= 2) tags.push("🔥 직접 로스팅");
  if ((cs.dessert ?? 0) >= 2) tags.push("🍰 디저트");
  if ((c.synth_count ?? 0) >= 30) tags.push("⭐ 평판 많음");
  if ((cs.mood ?? 0) >= 2) tags.push("📸 분위기");
  if ((cs.work ?? 0) >= 2) tags.push("💻 작업");
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

function CafeCard({ c, top, onShowEvidence }: { c: Cafe; top: boolean; onShowEvidence: (c: Cafe) => void }) {
  const g = c.synth_grade ? GRADE_STYLE[c.synth_grade] : null;
  const tags = featureTags(c);
  const hasReviews = (c.synth_reviews?.length ?? 0) > 0;

  return (
    <article className="bg-[#fdfaf4] rounded-2xl p-4 shadow-[0_4px_24px_rgba(80,50,20,0.08)] border border-[#ece0cd] flex flex-col">
      {top && <div className="text-[10px] font-bold text-[#7a4d1c] uppercase tracking-wider mb-2">★ 이 목적에 가장 잘 맞는 곳</div>}
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

      <div className="mt-auto">
        {c.signature && <div className="text-[12px] text-[#524234] mb-2"><span className="text-[#7a4d1c]">추천 </span>{c.signature}</div>}
        <div className="flex gap-2">
          <a href={`https://map.kakao.com/?q=${encodeURIComponent(c.name + " " + c.area)}`} target="_blank" rel="noopener noreferrer" onClick={() => trackOutbound({ target: "kakao_map", cafeId: c.id, source: "동네목록" })} className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-lg py-2 text-xs font-medium hover:bg-[#3d2f22] transition-colors">지도·길찾기</a>
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
  const [step, setStep] = useState<"purpose" | "result">("purpose");
  const [purpose, setPurpose] = useState<string>("");
  const [evidenceCafe, setEvidenceCafe] = useState<Cafe | null>(null);

  useEffect(() => {
    fetch("/api/cafes").then((r) => r.json()).then((d) => { setCafes(decodeCafeScores(d.cafes ?? [])); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // 목적 축(char_scores) 점수 높은 순 정렬 — 실제 전 카페에 값이 있는 데이터로 순위 매김.
  const ranked = useMemo(() => {
    if (!purpose) return cafes;
    const axis = PURPOSES.find((p) => p.key === purpose)?.axis ?? "";
    return cafes
      .filter((c) => ((c.char_scores ?? {})[axis] ?? 0) > 0)
      .sort((a, b) => ((b.char_scores ?? {})[axis] ?? 0) - ((a.char_scores ?? {})[axis] ?? 0));
  }, [cafes, purpose]);

  if (step === "purpose") {
    return (
      <Shell wide={false}>
        <BackLink to="/" label="홈" className="text-[#7a4d1c] mb-4" />
        <div className="text-[#7a4d1c] text-xs tracking-[0.4em] uppercase mb-4">강동·구리 동네 커피 노트</div>
        <h1 className="text-4xl font-bold leading-snug mb-3">오늘 커피,<br />뭐 하러 가세요?</h1>
        <p className="text-[#524234] mb-10 leading-relaxed">목적을 알려주시면, 거기 딱 맞는 동네 로스터리를 <strong className="text-[#2b2018]">근거와 함께</strong> 추천해드려요.</p>
        <div className="grid grid-cols-2 gap-3">
          {PURPOSES.map((p) => (
            <button key={p.key} onClick={() => { setPurpose(p.key); setStep("result"); }}
              className="bg-[#fdfaf4] border border-[#ece0cd] rounded-2xl p-6 text-left hover:border-[#9c6b3f] hover:-translate-y-0.5 transition-all shadow-sm">
              <div className="text-3xl mb-2">{p.emoji}</div><div className="text-lg font-bold">{p.label}</div>
            </button>
          ))}
        </div>
        <button onClick={() => { setPurpose(""); setStep("result"); }} className="mt-6 text-sm text-[#7a4d1c] underline">목적 상관없이 전체 보기 →</button>
      </Shell>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <div className="text-[#7a4d1c] text-[11px] tracking-[0.3em] uppercase">강동·구리 동네 커피 노트</div>
            <h1 className="text-2xl font-bold mt-1">{purpose ? `${PURPOSES.find((p) => p.key === purpose)?.label}` : "전체"}</h1>
          </div>
          <button onClick={() => setStep("purpose")} className="text-xs text-[#7a4d1c] underline">처음부터</button>
        </header>

        {loading ? <p className="text-[#524234]">불러오는 중...</p>
          : ranked.length === 0 ? <p className="text-[#524234] bg-white/50 rounded-2xl p-8 text-center">맞는 곳을 아직 못 찾았어요.</p>
          : (
            <div className="grid md:grid-cols-2 gap-5">
              {ranked.map((c, i) => <CafeCard key={c.id} c={c} top={!!purpose && i === 0} onShowEvidence={setEvidenceCafe} />)}
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
