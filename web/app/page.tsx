"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type EvidenceReview = { quote: string; link?: string; source?: string; date?: string };
type Cafe = {
  id: number; name: string; area: string; lat: number; lng: number;
  hours: string; phone: string; roasts_own: boolean; signature: string; uses: string;
  vibe: string; note: string; tone: string; photo_url: string | null;
  acidity: number; body: number; sweet: number;
  synth_grade: string | null; synth_identity: string | null;
  synth_count: number | null; synth_reviews?: EvidenceReview[] | null;
  char_scores?: Record<string, number> | null;
};

const REGIONS: Record<string, string[]> = {
  서울: ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"],
  경기: ["수원시","성남시","고양시","용인시","부천시","안산시","안양시","남양주시","화성시","평택시","의정부시","시흥시","파주시","김포시","광명시","광주시","군포시","하남시","오산시","양주시","구리시","안성시","포천시","의왕시","여주시","동두천시","과천시","이천시","양평군","가평군","연천군"],
  인천: ["중구","동구","미추홀구","연수구","남동구","부평구","계양구","서구","강화군","옹진군"],
};
const SIDO_CENTER: Record<string, [number, number, number]> = { 서울: [37.5665, 126.978, 11], 경기: [37.4138, 127.5183, 9], 인천: [37.4563, 126.7052, 11] };

function toGu(area: string): { sido: string; sigungu: string } {
  const a = (area ?? "").trim();
  if (a.includes("인천")) { for (const gu of REGIONS["인천"]) { if (a.includes(gu)) return { sido: "인천", sigungu: gu }; } return { sido: "인천", sigungu: "" }; }
  for (const [sido, list] of Object.entries(REGIONS)) { for (const gu of list) { if (a.includes(gu)) return { sido, sigungu: gu }; } }
  if (a.includes("구리")) return { sido: "경기", sigungu: "구리시" };
  if (a.includes("하남")) return { sido: "경기", sigungu: "하남시" };
  return { sido: "", sigungu: "" };
}

// 성격 기반 취향 선택 (데이터 검증된 변별력 있는 축)
const TASTE_CHOICES = [
  { key: "roast", label: "직접 로스팅", emoji: "🔥", desc: "커피에 진심인 집" },
  { key: "work", label: "작업·공부", emoji: "💻", desc: "오래 머물기 좋은" },
  { key: "quiet", label: "조용·혼자", emoji: "🤍", desc: "차분한 시간" },
  { key: "dessert", label: "디저트", emoji: "🍰", desc: "달콤한 게 강한" },
];
// 카페 결 표시용 라벨
const CHAR_LABELS: Record<string, { label: string; emoji: string }> = {
  roast: { label: "직접로스팅", emoji: "🔥" }, work: { label: "작업하기 좋은", emoji: "💻" },
  quiet: { label: "조용한", emoji: "🤍" }, dessert: { label: "디저트", emoji: "🍰" },
  mood: { label: "분위기", emoji: "📸" }, space: { label: "넓은공간", emoji: "🪑" },
};
const GRADE_STYLE: Record<string, { bg: string; label: string }> = { 검증: { bg: "#5f7355", label: "검증" }, 참고: { bg: "#9c6b3f", label: "참고" }, 발굴: { bg: "#a8927a", label: "발굴" } };

function makePinHtml(c: Cafe, isMatch: boolean): string {
  const grade = c.synth_grade ?? "발굴";
  const color = isMatch ? "#5f7355" : (GRADE_STYLE[grade]?.bg ?? "#9c6b3f");
  const size = isMatch ? 36 : 28;
  const ring = isMatch ? "box-shadow:0 0 0 4px rgba(95,115,85,0.3),0 2px 6px rgba(0,0,0,0.3);" : "box-shadow:0 1px 4px rgba(0,0,0,0.3);";
  return `<div style="transform:translate(-50%,-100%);text-align:center;">
    <div style="width:${size}px;height:${size}px;background:${color};border:2px solid #fdfaf4;border-radius:50% 50% 50% 0;transform:rotate(-45deg);${ring}display:flex;align-items:center;justify-content:center;margin:0 auto;">
      <span style="transform:rotate(45deg);font-size:${isMatch ? 14 : 11}px;">☕</span></div>
    <div style="margin-top:2px;background:rgba(253,250,244,0.95);color:#2b2018;padding:1px 5px;border-radius:7px;font-size:9px;font-weight:600;white-space:nowrap;display:inline-block;">${c.name}${isMatch ? " ✓" : ""}</div>
  </div>`;
}

// 카페의 "결" 상위 추출 (점수 큰 순, 0 제외)
function topChars(c: Cafe, n = 3): { label: string; emoji: string; score: number }[] {
  const cs = c.char_scores ?? {};
  return Object.entries(cs).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => ({ ...(CHAR_LABELS[k] ?? { label: k, emoji: "" }), score: v }));
}

export default function Home() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [selected, setSelected] = useState<Cafe | null>(null);
  const [tasteKey, setTasteKey] = useState<string | null>(null);
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  useEffect(() => { fetch("/api/cafes").then((r) => r.json()).then((d) => setCafes(d.cafes ?? [])).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapRef.current || mapObj.current) return;
      LRef.current = L;
      mapObj.current = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([37.5, 127.05], 10);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 20 }).addTo(mapObj.current);
      layerRef.current = L.layerGroup().addTo(mapObj.current);
      setTimeout(() => mapObj.current?.invalidateSize(), 300);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setTimeout(() => mapObj.current?.invalidateSize(), 350); }, [sheetOpen]);

  const filtered = useMemo(() => cafes.filter((c) => {
    if (!c.lat || !c.lng) return false;
    const g = toGu(c.area);
    if (sido && g.sido !== sido) return false;
    if (sigungu && g.sigungu !== sigungu) return false;
    return true;
  }), [cafes, sido, sigungu]);

  // 취향(성격) 매칭: 선택한 축의 char_score가 동네에서 상위면 강조
  const matchSet = useMemo(() => {
    if (!tasteKey) return new Set<number>();
    const scored = filtered.map((c) => ({ id: c.id, s: (c.char_scores ?? {})[tasteKey] ?? 0 })).filter((x) => x.s > 0);
    // 점수 1 이상이면 매칭(해당 결이 실제 언급된 카페)
    return new Set(scored.map((x) => x.id));
  }, [filtered, tasteKey]);

  useEffect(() => {
    const L = LRef.current;
    if (!L || !mapObj.current || !layerRef.current) return;
    layerRef.current.clearLayers();
    filtered.forEach((c) => {
      const isMatch = matchSet.has(c.id);
      const icon = L.divIcon({ className: "", html: makePinHtml(c, isMatch), iconSize: [0, 0] });
      L.marker([c.lat, c.lng], { icon, zIndexOffset: isMatch ? 1000 : 0 }).addTo(layerRef.current).on("click", () => setSelected(c));
    });
    if (filtered.length > 0 && (sido || sigungu)) {
      const lats = filtered.map((c) => c.lat), lngs = filtered.map((c) => c.lng);
      mapObj.current.fitBounds(L.latLngBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]), { padding: [50, 50], maxZoom: 15 });
    } else if (sido && SIDO_CENTER[sido]) { const [la, ln, z] = SIDO_CENTER[sido]; mapObj.current.setView([la, ln], z); }
  }, [filtered, matchSet, sido, sigungu]);

  const onSido = (v: string) => { setSido(v); setSigungu(""); };
  const matchCount = matchSet.size;

  const Controls = (
    <>
      <div className="mb-5">
        <div className="text-sm font-bold text-[#52402e] mb-2.5">📍 지역</div>
        <div className="flex gap-2">
          <select value={sido} onChange={(e) => onSido(e.target.value)} className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white text-[#2b2018]">
            <option value="">시·도</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sigungu} onChange={(e) => setSigungu(e.target.value)} disabled={!sido} className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white text-[#2b2018] disabled:opacity-50">
            <option value="">시·군·구</option>{sido && REGIONS[sido].map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {(sido || sigungu) && <button onClick={() => { setSido(""); setSigungu(""); }} className="text-xs text-[#9c6b3f] underline mt-2">전체 보기</button>}
      </div>
      <div className="mb-5">
        <div className="text-sm font-bold text-[#52402e] mb-2.5">☕ 어떤 카페 찾으세요?</div>
        <div className="grid grid-cols-2 gap-2.5">
          {TASTE_CHOICES.map((t) => (
            <button key={t.key} onClick={() => setTasteKey(tasteKey === t.key ? null : t.key)}
              className={`rounded-xl p-3 text-left border transition-colors ${tasteKey === t.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#2b2018] border-[#cbb89f]"}`}>
              <div className="text-xl mb-0.5">{t.emoji}</div>
              <div className="text-xs font-bold">{t.label}</div>
              <div className={`text-[10px] mt-0.5 ${tasteKey === t.key ? "text-[#d4a574]" : "text-[#a8927a]"}`}>{t.desc}</div>
            </button>
          ))}
        </div>
        {tasteKey && <p className="text-xs text-[#9c6b3f] mt-2">이 결이 자주 언급되는 {matchCount}곳을 ✓로 강조했어요</p>}
      </div>
      <div>
        <div className="text-sm font-bold text-[#52402e] mb-2.5">목록 ({filtered.length})</div>
        {filtered.length === 0 ? <p className="text-xs text-[#a8927a] bg-[#f4ece0] rounded-lg p-4">선택한 지역엔 아직 등록된 카페가 없어요.</p> : (
          <div className="space-y-2">
            {filtered.slice(0, 50).map((c) => (
              <button key={c.id} onClick={() => { setSelected(c); setSheetOpen(false); }} className="w-full text-left bg-[#f4ece0] rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-[#2b2018]">{c.name}</span>
                  {c.synth_grade && GRADE_STYLE[c.synth_grade] && <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: GRADE_STYLE[c.synth_grade].bg }}>{GRADE_STYLE[c.synth_grade].label}</span>}
                  {tasteKey && matchSet.has(c.id) && <span className="text-[10px] text-[#5f7355]">✓</span>}
                  <span className="text-[10px] text-[#a8927a] ml-auto">{c.area}</span>
                </div>
                <div className="text-[11px] text-[#6b5a48] line-clamp-1">{c.note || c.vibe}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="flex flex-col bg-[#f4ece0]" style={{ height: "100dvh", fontFamily: "'Gowun Batang', serif" }}>
      <header className="h-14 shrink-0 bg-[#2b2018] text-[#f4ece0] flex items-center justify-between px-4 z-[1500]">
        <div className="flex items-baseline gap-2">
          <span className="text-[#d4a574] text-[9px] tracking-[0.2em] uppercase hidden sm:inline">Neighborhood Coffee</span>
          <h1 className="text-lg font-bold">동네 커피 노트</h1>
        </div>
        <div className="flex gap-2">
          <a href="/owner" className="bg-[#9c6b3f] rounded-full px-3 py-1.5 text-xs">내 카페 분석</a>
          <a href="/cafe/register" className="bg-[#3d2f22] rounded-full px-3 py-1.5 text-xs">사장님 등록</a>
        </div>
      </header>

      <div className="flex-1 relative md:flex overflow-hidden">
        <div className="absolute inset-0 md:relative md:flex-1 md:p-5">
          <div ref={mapRef} className="w-full h-full md:rounded-2xl overflow-hidden bg-[#e8e0d3] z-0" />
        </div>
        <aside className="hidden md:block md:w-[380px] md:h-full bg-[#fdfaf4] border-l border-[#ece0cd] overflow-y-auto p-6 relative z-10">{Controls}</aside>
        <div className="md:hidden absolute left-0 right-0 bottom-0 bg-[#fdfaf4] rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.18)] z-[1200] flex flex-col"
          style={{ height: "78dvh", transform: sheetOpen ? "translateY(0)" : "translateY(calc(78dvh - 76px))", transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)", willChange: "transform" }}>
          <button onClick={() => setSheetOpen(!sheetOpen)} className="shrink-0 w-full pt-3 pb-3 flex flex-col items-center">
            <div className="w-10 h-1.5 bg-[#cbb89f] rounded-full mb-2" />
            <div className="text-sm font-bold text-[#2b2018]">{sheetOpen ? "지도 보기 ▾" : `${filtered.length}곳 · 지역·취향 ▴`}</div>
          </button>
          <div className="flex-1 overflow-y-auto px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>{Controls}</div>
        </div>
      </div>

      {selected && <CafePanel cafe={selected} onClose={() => setSelected(null)} />}
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </div>
  );
}

function CafePanel({ cafe, onClose }: { cafe: Cafe; onClose: () => void }) {
  const g = cafe.synth_grade ? GRADE_STYLE[cafe.synth_grade] : null;
  const [reviews, setReviews] = useState<EvidenceReview[]>([]);
  const [loadingRev, setLoadingRev] = useState(true);
  useEffect(() => {
    let live = true; setLoadingRev(true);
    fetch(`/api/cafe-detail?id=${cafe.id}`).then((r) => r.json()).then((d) => { if (live) { setReviews(d.reviews ?? []); setLoadingRev(false); } }).catch(() => { if (live) setLoadingRev(false); });
    return () => { live = false; };
  }, [cafe.id]);

  const chars = topChars(cafe, 4);

  return (
    <div className="fixed inset-0 z-[3000]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside className="absolute top-0 right-0 w-full md:max-w-md bg-[#fdfaf4] shadow-2xl overflow-y-auto" style={{ height: "100dvh" }}>
        {cafe.photo_url ? <div className="h-40 w-full"><img src={cafe.photo_url} alt={cafe.name} className="w-full h-full object-cover" /></div>
          : <div className="h-28 w-full" style={{ background: "linear-gradient(135deg,#c8893f,#8a5a24)" }} />}
        <div className="p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-[#2b2018]">{cafe.name}</h3>
              {g && <span className="text-[10px] text-white px-2 py-0.5 rounded-full" style={{ background: g.bg }}>{g.label}</span>}
            </div>
            <button onClick={onClose} className="text-3xl text-[#9c6b3f] leading-none px-2">×</button>
          </div>
          <div className="text-[#9c6b3f] text-sm mb-3">{cafe.area} · {cafe.vibe}</div>
          {cafe.note && <p className="text-[15px] text-[#3d2f22] font-medium leading-relaxed mb-4">“{cafe.note}”</p>}

          {/* 이 카페가 자주 언급되는 결 (맛 바 대체) */}
          {chars.length > 0 && (
            <div className="bg-[#efe9dd] rounded-lg px-4 py-3 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-2">이 카페가 자주 언급되는 결</div>
              <div className="flex flex-wrap gap-1.5">
                {chars.map((ch) => (
                  <span key={ch.label} className="text-[12px] bg-white text-[#52402e] px-2.5 py-1 rounded-full border border-[#e0d4c0]">
                    {ch.emoji} {ch.label} <span className="text-[#a8927a]">{ch.score}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {cafe.synth_identity && (
            <div className="bg-[#efe9dd] rounded-lg px-4 py-3 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-1">리뷰 {cafe.synth_count}건 종합 분석</div>
              <div className="text-[14px] text-[#52402e] leading-snug">{cafe.synth_identity}</div>
            </div>
          )}
          {cafe.signature && <div className="text-sm text-[#6b5a48] mb-4"><span className="text-[#9c6b3f]">추천 </span>{cafe.signature}</div>}
          {loadingRev && <div className="text-[11px] text-[#a8927a] mb-4">근거 후기 불러오는 중...</div>}
          {!loadingRev && reviews.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] text-[#a8927a] mb-2">이 분석의 근거가 된 실제 후기 (네이버 공개 글)</div>
              <div className="space-y-3">
                {reviews.map((rv, i) => (
                  <div key={i} className="border-b border-[#f0e6d4] pb-3 last:border-0">
                    <div className="text-[13px] text-[#3d2f22] leading-relaxed">“{rv.quote}”</div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#a8927a]">
                      <span>{rv.source}</span>{rv.date && <span>· {rv.date}</span>}
                      {rv.link && <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#9c6b3f] underline ml-auto">원문 →</a>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <a href={`https://map.kakao.com/?q=${encodeURIComponent(cafe.name + " " + cafe.area)}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-lg py-3 text-sm font-medium">지도·길찾기</a>
            {cafe.phone && <a href={`tel:${cafe.phone}`} className="px-4 text-center border border-[#cbb89f] text-[#524434] rounded-lg py-3 text-sm font-medium flex items-center">전화</a>}
          </div>
        </div>
      </aside>
    </div>
  );
}
