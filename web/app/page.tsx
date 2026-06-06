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
type DCafe = { id: number; name: string; area: string; lat: number; lng: number; grade: string | null; count: number | null; identity: string | null; note: string | null; beanNote: string[]; reason?: string };
type Discover = { headlineA: DCafe | null; headlineB: DCafe | null; top3: DCafe[]; fresh: DCafe[]; specialty: DCafe[]; scopeCount: number };

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
const TASTE_CHOICES = [
  { key: "roast", label: "직접 로스팅", emoji: "🔥", desc: "커피에 진심인 집" },
  { key: "work", label: "작업·공부", emoji: "💻", desc: "오래 머물기 좋은" },
  { key: "quiet", label: "조용·혼자", emoji: "🤍", desc: "차분한 시간" },
  { key: "dessert", label: "디저트", emoji: "🍰", desc: "달콤한 게 강한" },
];
const CHAR_LABELS: Record<string, { label: string; emoji: string }> = {
  roast: { label: "직접로스팅", emoji: "🔥" }, work: { label: "작업하기 좋은", emoji: "💻" },
  quiet: { label: "조용한", emoji: "🤍" }, dessert: { label: "디저트", emoji: "🍰" },
  mood: { label: "분위기", emoji: "📸" }, space: { label: "넓은공간", emoji: "🪑" },
};
const GRADE_STYLE: Record<string, { bg: string; label: string }> = { 검증: { bg: "#5f7355", label: "검증" }, 참고: { bg: "#9c6b3f", label: "참고" }, 발굴: { bg: "#a8927a", label: "발굴" } };
const TONES = ["#6f4e37", "#5f7355", "#9c6b3f", "#3a2e28", "#8a5a24"];

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
function topChars(c: Cafe, n = 4) {
  const cs = c.char_scores ?? {};
  return Object.entries(cs).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ ...(CHAR_LABELS[k] ?? { label: k, emoji: "" }), score: v }));
}

export default function Home() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [selected, setSelected] = useState<Cafe | null>(null);
  const [tab, setTab] = useState<"home" | "map">("home");
  const [discover, setDiscover] = useState<Discover | null>(null);
  const [homeSido, setHomeSido] = useState("");
  const [homeGu, setHomeGu] = useState("");
  // 지도용 상태
  const [tasteKey, setTasteKey] = useState<string | null>(null);
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  useEffect(() => { fetch("/api/cafes").then((r) => r.json()).then((d) => setCafes(d.cafes ?? [])).catch(() => {}); }, []);
  useEffect(() => { const u = homeGu ? `/api/discover?region=${encodeURIComponent(homeGu)}` : "/api/discover"; setDiscover(null); fetch(u).then((r) => r.json()).then((d) => { if (d.ok) setDiscover(d); }).catch(() => {}); }, [homeGu]);

  const openById = (id: number) => { const c = cafes.find((x) => x.id === id); if (c) setSelected(c); };

  // 지도 탭 진입 시 지도 초기화
  useEffect(() => {
    if (tab !== "map") return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapRef.current || mapObj.current) return;
      LRef.current = L;
      mapObj.current = L.map(mapRef.current, { zoomControl: true, attributionControl: false }).setView([37.5, 127.05], 10);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 20 }).addTo(mapObj.current);
      layerRef.current = L.layerGroup().addTo(mapObj.current);
      setTimeout(() => mapObj.current?.invalidateSize(), 200);
    })();
    return () => { cancelled = true; };
  }, [tab]);
  useEffect(() => { if (tab === "map") setTimeout(() => mapObj.current?.invalidateSize(), 200); }, [tab]);

  const filtered = useMemo(() => cafes.filter((c) => {
    if (!c.lat || !c.lng) return false;
    const g = toGu(c.area);
    if (sido && g.sido !== sido) return false;
    if (sigungu && g.sigungu !== sigungu) return false;
    return true;
  }), [cafes, sido, sigungu]);
  const matchSet = useMemo(() => {
    if (!tasteKey) return new Set<number>();
    return new Set(filtered.filter((c) => ((c.char_scores ?? {})[tasteKey] ?? 0) > 0).map((c) => c.id));
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
  }, [filtered, matchSet, sido, sigungu, tab]);

  const onSido = (v: string) => { setSido(v); setSigungu(""); };

  // ===== 잡지 카드 컴포넌트 =====
  const HeadlineCard = ({ c, kicker, tone }: { c: DCafe; kicker: string; tone: number }) => (
    <button onClick={() => openById(c.id)} className="w-full text-left rounded-2xl overflow-hidden shadow-md mb-4" style={{ background: TONES[tone] }}>
      <div className="p-5 text-[#f4ece0]">
        <div className="text-[10px] tracking-[0.25em] uppercase text-[#e8d4b0] mb-2">{kicker}</div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-2xl font-bold leading-tight">{c.name}</h2>
          {c.grade && <span className="text-[10px] bg-[#f4ece0]/20 px-2 py-0.5 rounded-full">{c.grade}</span>}
        </div>
        <div className="text-[12px] text-[#e8d4b0] mb-2">{c.area} · 리뷰 {c.count ?? 0}건</div>
        {c.identity && <p className="text-[13px] text-[#f0e6d4] leading-relaxed mb-3 line-clamp-2">{c.identity}</p>}
        {c.beanNote.length > 0 && <div className="flex flex-wrap gap-1.5">{c.beanNote.map((b) => <span key={b} className="text-[10px] bg-[#f4ece0]/15 px-2 py-0.5 rounded-full">{b}</span>)}</div>}
      </div>
    </button>
  );
  const Row = ({ title, items }: { title: string; items: DCafe[] }) => {
    if (!items?.length) return null;
    return (
      <div className="mb-7">
        <div className="text-base font-bold text-[#2b2018] mb-1 pb-1 border-b-2 border-[#2b2018]">{title}</div>
        {/* 바깥은 가로 스크롤, 위쪽 패딩 안에 말풍선이 들어가 잘리지 않음 */}
        <div className="flex gap-3 overflow-x-auto pt-2 pb-2" style={{ WebkitOverflowScrolling: "touch" }}>
          {items.map((c) => {
            return (
              <div key={c.id} className="shrink-0 w-48">
                <button onClick={() => openById(c.id)} className="w-full text-left bg-white rounded-xl p-3.5 border border-[#ece0cd] hover:border-[#9c6b3f] hover:shadow-md transition-all h-full flex flex-col">
                  <div className="flex items-center gap-1 mb-1">
                    <span className="font-bold text-sm text-[#2b2018] truncate">{c.name}</span>
                    {c.grade && GRADE_STYLE[c.grade] && <span className="text-[8px] text-white px-1 py-0.5 rounded-full shrink-0" style={{ background: GRADE_STYLE[c.grade].bg }}>{c.grade}</span>}
                  </div>
                  <div className="text-[10px] text-[#a8927a] mb-1.5">{c.area} · 리뷰 {c.count ?? 0}</div>
                  {c.beanNote.length > 0 && <div className="flex flex-wrap gap-1 mb-2">{c.beanNote.map((b) => <span key={b} className="text-[9px] bg-[#f0e6d4] text-[#8a6d3f] px-1.5 py-0.5 rounded-full">{b}</span>)}</div>}
                  {c.reason && (
                    <div className="mt-auto pt-2 border-t border-[#f0e6d4]">
                      <div className="text-[8px] tracking-wider uppercase text-[#b08440] mb-0.5">📰 선정 이유</div>
                      <p className="text-[10.5px] text-[#5a4a38] leading-relaxed">{c.reason}</p>
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col bg-[#f4ece0]" style={{ height: "100dvh", fontFamily: "'Gowun Batang', serif" }}>
      <header className="shrink-0 bg-[#2b2018] text-[#f4ece0] z-[1500] h-14 flex items-center justify-between px-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-lg font-bold shrink-0">동네 커피 노트</h1>
          {/* 홈/지도 토글 */}
          <div className="flex bg-[#3d2f22] rounded-full p-0.5">
            {(["home", "map"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${tab === t ? "bg-[#f4ece0] text-[#2b2018]" : "text-[#cbb89f]"}`}>
                {t === "home" ? "🗞 홈" : "🗺 지도"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <a href="/owner" className="bg-[#9c6b3f] rounded-full px-3 py-1.5 text-xs whitespace-nowrap">내 카페 분석</a>
          <a href="/cafe/register" className="bg-[#3d2f22] rounded-full px-3 py-1.5 text-xs whitespace-nowrap hidden sm:inline-block">사장님 등록</a>
        </div>
      </header>

      {/* 홈 = 잡지 1면 */}
      {tab === "home" && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-6">
            <div className="text-center mb-6">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#9c6b3f]">데이터로 큐레이션하는</div>
              <div className="text-xl font-bold text-[#2b2018] border-y-2 border-[#2b2018] py-2 mt-1">{homeGu ? `${homeGu}의 오늘의 커피` : "오늘의 동네 커피"}</div>
              <div className="flex gap-2 justify-center mt-3">
                <select value={homeSido} onChange={(e) => { setHomeSido(e.target.value); setHomeGu(""); }} className="border border-[#cbb89f] rounded-lg px-3 py-2 text-sm bg-white text-[#2b2018]">
                  <option value="">시·도 전체</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={homeGu} onChange={(e) => setHomeGu(e.target.value)} disabled={!homeSido} className="border border-[#cbb89f] rounded-lg px-3 py-2 text-sm bg-white text-[#2b2018] disabled:opacity-50">
                  <option value="">우리 동네 선택</option>{homeSido && REGIONS[homeSido].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              {homeGu && <button onClick={() => { setHomeSido(""); setHomeGu(""); }} className="text-[11px] text-[#9c6b3f] underline mt-2">수도권 전체 보기</button>}
            </div>
            {!discover ? <p className="text-center text-[#a8927a] py-10">불러오는 중...</p> : (
              <>
                {discover.headlineA && <HeadlineCard c={discover.headlineA} kicker="이번 주 가장 많이 이야기된 곳" tone={0} />}
                {discover.headlineB && <HeadlineCard c={discover.headlineB} kicker="🔥 커피에 진심인 집 — 스페셜티 스포트라이트" tone={1} />}
                <Row title="🏆 리뷰 많은 Top 3" items={discover.top3} />
                <Row title="🔥 스페셜티 픽" items={discover.specialty} />
                <Row title="✨ 새로 발견된 카페" items={discover.fresh} />
                <button onClick={() => setTab("map")} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-medium mt-2">🗺 지도에서 전체 둘러보기 →</button>
              </>
            )}
            <p className="text-[10px] text-[#a8927a] mt-6 text-center leading-relaxed">모든 큐레이션은 네이버 공개 후기를 교차검증한 데이터 기반입니다.</p>
          </div>

        </div>
      )}

      {/* 지도 탭 */}
      {tab === "map" && (
        <div className="flex-1 relative md:flex overflow-hidden">
          <div className="absolute inset-0 md:relative md:flex-1 md:p-5">
            <div ref={mapRef} className="w-full h-full md:rounded-2xl overflow-hidden bg-[#e8e0d3] z-0" />
          </div>
          <aside className="hidden md:block md:w-[380px] md:h-full bg-[#fdfaf4] border-l border-[#ece0cd] overflow-y-auto p-6 relative z-10">
            <MapControls {...{ sido, sigungu, onSido, setSigungu, tasteKey, setTasteKey, filtered, matchSet, setSelected }} />
          </aside>
          <div className="md:hidden absolute left-0 right-0 bottom-0 bg-[#fdfaf4] rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.18)] z-[1200] flex flex-col" style={{ height: "70dvh" }}>
            <div className="shrink-0 w-full pt-3 pb-2 flex justify-center"><div className="w-10 h-1.5 bg-[#cbb89f] rounded-full" /></div>
            <div className="flex-1 overflow-y-auto px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
              <MapControls {...{ sido, sigungu, onSido, setSigungu, tasteKey, setTasteKey, filtered, matchSet, setSelected }} />
            </div>
          </div>
        </div>
      )}

      {selected && <CafePanel cafe={selected} onClose={() => setSelected(null)} onMap={() => { setTab("map"); setTimeout(() => { if (mapObj.current && selected.lat) mapObj.current.setView([selected.lat, selected.lng], 16); }, 300); }} />}
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </div>
  );
}

function MapControls({ sido, sigungu, onSido, setSigungu, tasteKey, setTasteKey, filtered, matchSet, setSelected }: any) {
  return (
    <>
      <div className="mb-5">
        <div className="text-sm font-bold text-[#52402e] mb-2.5">📍 지역</div>
        <div className="flex gap-2">
          <select value={sido} onChange={(e) => onSido(e.target.value)} className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white text-[#2b2018]">
            <option value="">시·도</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sigungu} onChange={(e) => setSigungu(e.target.value)} disabled={!sido} className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white text-[#2b2018] disabled:opacity-50">
            <option value="">시·군·구</option>{sido && REGIONS[sido].map((g: string) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {(sido || sigungu) && <button onClick={() => { onSido(""); setSigungu(""); }} className="text-xs text-[#9c6b3f] underline mt-2">전체</button>}
      </div>
      <div className="mb-5">
        <div className="text-sm font-bold text-[#52402e] mb-2.5">☕ 어떤 카페 찾으세요?</div>
        <div className="grid grid-cols-2 gap-2.5">
          {TASTE_CHOICES.map((t) => (
            <button key={t.key} onClick={() => setTasteKey(tasteKey === t.key ? null : t.key)} className={`rounded-xl p-3 text-left border transition-colors ${tasteKey === t.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#2b2018] border-[#cbb89f]"}`}>
              <div className="text-xl mb-0.5">{t.emoji}</div><div className="text-xs font-bold">{t.label}</div>
              <div className={`text-[10px] mt-0.5 ${tasteKey === t.key ? "text-[#d4a574]" : "text-[#a8927a]"}`}>{t.desc}</div>
            </button>
          ))}
        </div>
        {tasteKey && <p className="text-xs text-[#9c6b3f] mt-2">이 결이 자주 언급되는 {matchSet.size}곳을 ✓로 강조</p>}
      </div>
      <div>
        <div className="text-sm font-bold text-[#52402e] mb-2.5">목록 ({filtered.length})</div>
        {filtered.length === 0 ? <p className="text-xs text-[#a8927a] bg-[#f4ece0] rounded-lg p-4">지역을 선택하면 목록이 나와요.</p> : (
          <div className="space-y-2">
            {filtered.slice(0, 50).map((c: Cafe) => (
              <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left bg-[#f4ece0] rounded-xl p-3">
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
}

function CafePanel({ cafe, onClose, onMap }: { cafe: Cafe; onClose: () => void; onMap: () => void }) {
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
        {cafe.photo_url ? <div className="h-40 w-full"><img src={cafe.photo_url} alt={cafe.name} className="w-full h-full object-cover" /></div> : <div className="h-28 w-full" style={{ background: "linear-gradient(135deg,#c8893f,#8a5a24)" }} />}
        <div className="p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2"><h3 className="text-xl font-bold text-[#2b2018]">{cafe.name}</h3>{g && <span className="text-[10px] text-white px-2 py-0.5 rounded-full" style={{ background: g.bg }}>{g.label}</span>}</div>
            <button onClick={onClose} className="text-3xl text-[#9c6b3f] leading-none px-2">×</button>
          </div>
          <div className="text-[#9c6b3f] text-sm mb-3">{cafe.area} · {cafe.vibe}</div>
          {cafe.note && <p className="text-[15px] text-[#3d2f22] font-medium leading-relaxed mb-4">“{cafe.note}”</p>}
          {chars.length > 0 && (
            <div className="bg-[#efe9dd] rounded-lg px-4 py-3 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-2">이 카페가 자주 언급되는 결</div>
              <div className="flex flex-wrap gap-1.5">{chars.map((ch) => <span key={ch.label} className="text-[12px] bg-white text-[#52402e] px-2.5 py-1 rounded-full border border-[#e0d4c0]">{ch.emoji} {ch.label} <span className="text-[#a8927a]">{ch.score}</span></span>)}</div>
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
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#a8927a]"><span>{rv.source}</span>{rv.date && <span>· {rv.date}</span>}{rv.link && <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#9c6b3f] underline ml-auto">원문 →</a>}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-2">
            <button onClick={onMap} className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-lg py-3 text-sm font-medium">지도에서 위치 보기</button>
            <a href={`https://map.kakao.com/?q=${encodeURIComponent(cafe.name + " " + cafe.area)}`} target="_blank" rel="noopener noreferrer" className="px-4 text-center border border-[#cbb89f] text-[#524434] rounded-lg py-3 text-sm font-medium flex items-center">길찾기</a>
          </div>
        </div>
      </aside>
    </div>
  );
}
