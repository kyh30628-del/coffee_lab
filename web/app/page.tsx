"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type EvidenceReview = { quote: string; link?: string; source?: string; date?: string; trust?: "verified" | "reference" | "rejected"; score?: number; why?: string[] };
type QualityStats = { raw: number; verified: number; reference: number; rejected: number; rejectReasons?: Record<string, number> };
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
type SearchResult = { id: number; name: string; area: string; grade: string | null; count: number | null; identity: string | null; score: number; reasons: string[] };
type SearchRes = { ok: boolean; region: string; q: string; concepts: string[]; count: number; results: SearchResult[] };
const SEARCH_EXAMPLES = ["비 오는 날 혼자 조용히", "감성 사진 데이트", "노트북 작업하기 좋은", "산미 또렷한 커피", "빵 맛있는 집"];

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

const CONSENT_VERSION = "v1";

// 외부 지오코딩 없이, 보유 카페 좌표로 사용자의 '가장 가까운 동네'를 역산.
// 가까운 7곳의 다수결 시·군·구를 채택. 30km 밖이면 수도권 밖으로 보고 null.
function nearestRegion(cafes: Cafe[], lat: number, lng: number): { sido: string; sigungu: string; distKm: number } | null {
  const pts = cafes.filter((c) => c.lat && c.lng);
  if (!pts.length) return null;
  const KM_LAT = 111, KM_LNG = 88; // 위도 37.5° 근사
  const withD = pts.map((c) => {
    const dx = (c.lat - lat) * KM_LAT, dy = (c.lng - lng) * KM_LNG;
    return { c, d: Math.sqrt(dx * dx + dy * dy) };
  }).sort((a, b) => a.d - b.d);
  if (withD[0].d > 30) return null;
  const tally: Record<string, { sido: string; sigungu: string; n: number }> = {};
  for (const { c } of withD.slice(0, 7)) {
    const g = toGu(c.area);
    if (!g.sigungu) continue;
    const key = `${g.sido}|${g.sigungu}`;
    tally[key] = tally[key] ?? { sido: g.sido, sigungu: g.sigungu, n: 0 };
    tally[key].n++;
  }
  const best = Object.values(tally).sort((a, b) => b.n - a.n)[0];
  return best ? { sido: best.sido, sigungu: best.sigungu, distKm: Math.round(withD[0].d * 10) / 10 } : null;
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

function makePinHtml(c: Cafe, isMatch: boolean, isFocus = false): string {
  const grade = c.synth_grade ?? "발굴";
  const color = isFocus ? "#b5703c" : isMatch ? "#5f7355" : (GRADE_STYLE[grade]?.bg ?? "#9c6b3f");
  const size = isFocus ? 44 : isMatch ? 36 : 28;
  const ring = isFocus
    ? "box-shadow:0 0 0 6px rgba(181,112,60,0.4),0 3px 10px rgba(0,0,0,0.4);"
    : isMatch ? "box-shadow:0 0 0 4px rgba(95,115,85,0.3),0 2px 6px rgba(0,0,0,0.3);" : "box-shadow:0 1px 4px rgba(0,0,0,0.3);";
  const labelStyle = isFocus ? "background:#b5703c;color:#fff;font-weight:700;" : "background:rgba(253,250,244,0.95);color:#2b2018;font-weight:600;";
  return `<div style="transform:translate(-50%,-100%);text-align:center;">
    <div style="width:${size}px;height:${size}px;background:${color};border:2px solid #fdfaf4;border-radius:50% 50% 50% 0;transform:rotate(-45deg);${ring}display:flex;align-items:center;justify-content:center;margin:0 auto;">
      <span style="transform:rotate(45deg);font-size:${isFocus ? 18 : isMatch ? 14 : 11}px;">${isFocus ? "📍" : "☕"}</span></div>
    <div style="margin-top:2px;${labelStyle}padding:1px 5px;border-radius:7px;font-size:${isFocus ? 10 : 9}px;white-space:nowrap;display:inline-block;">${c.name}${isFocus ? "" : isMatch ? " ✓" : ""}</div>
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
  const [sheetOpen, setSheetOpen] = useState(true); // 모바일 바텀시트 펼침/접힘
  const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number } | null>(null); // 지도에서 위치 보기
  const [focusId, setFocusId] = useState<number | null>(null); // 핀 고정 강조할 카페
  // 자연어 검색
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<SearchRes | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  // 위치/동의 상태
  const [consent, setConsent] = useState<"unknown" | "agreed" | "declined">("unknown");
  const [showConsent, setShowConsent] = useState(false);
  const [autoGu, setAutoGu] = useState("");   // 위치로 자동 설정된 동네 표시
  const [geoMsg, setGeoMsg] = useState("");
  const anonRef = useRef("");
  const detectedRef = useRef(false);
  // 지도용 상태
  const [tasteKey, setTasteKey] = useState<string | null>(null);
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  useEffect(() => { fetch("/api/cafes").then((r) => r.json()).then((d) => setCafes(d.cafes ?? [])).catch(() => {}); }, []);

  // 익명 식별자 준비 + 저장된 동의 상태 로드
  useEffect(() => {
    try {
      let a = localStorage.getItem("dcn_anon");
      if (!a) { a = (crypto?.randomUUID?.() ?? `a${Date.now()}${Math.floor(Math.random() * 1e6)}`); localStorage.setItem("dcn_anon", a); }
      anonRef.current = a;
      fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonId: a }) }).catch(() => {});
      const c = localStorage.getItem("dcn_consent");
      if (c === "agreed") setConsent("agreed");
      else if (c === "declined") setConsent("declined");
      else { setConsent("unknown"); setShowConsent(true); } // 첫 방문 → 동의 안내
    } catch { setConsent("declined"); }
  }, []);

  const postConsent = (agreed: boolean, extra?: { region?: string; lat?: number; lng?: number }) => {
    if (!anonRef.current) return;
    fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonId: anonRef.current, agreed, version: CONSENT_VERSION, ...extra }) }).catch(() => {});
  };

  const detectLocation = () => {
    if (!navigator.geolocation) { setGeoMsg("이 브라우저는 위치를 지원하지 않아요"); return; }
    setGeoMsg("위치 확인 중…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const r = nearestRegion(cafes, latitude, longitude);
        if (!r) { setGeoMsg("수도권 밖이거나 가까운 카페가 없어 전체를 보여드려요"); postConsent(true, { lat: latitude, lng: longitude }); return; }
        setHomeSido(r.sido); setHomeGu(r.sigungu);
        setSido(r.sido); setSigungu(r.sigungu);
        setAutoGu(r.sigungu); setGeoMsg("");
        postConsent(true, { region: `${r.sido} ${r.sigungu}`, lat: latitude, lng: longitude });
      },
      (err) => setGeoMsg(err.code === 1 ? "위치 권한이 거부됐어요 (브라우저 설정에서 허용 가능)" : "위치를 가져오지 못했어요"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  };

  // 동의 완료 + 카페 로드되면 1회 자동 감지
  useEffect(() => {
    if (consent === "agreed" && cafes.length > 0 && !detectedRef.current) { detectedRef.current = true; detectLocation(); }
  }, [consent, cafes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAgree = () => { try { localStorage.setItem("dcn_consent", "agreed"); } catch {} setShowConsent(false); setConsent("agreed"); postConsent(true); };
  const onDecline = () => { try { localStorage.setItem("dcn_consent", "declined"); } catch {} setShowConsent(false); setConsent("declined"); postConsent(false); };
  const openLocation = () => { if (consent === "agreed") { detectedRef.current = false; detectLocation(); } else setShowConsent(true); };
  const clearAuto = () => { setHomeSido(""); setHomeGu(""); setAutoGu(""); setSido(""); setSigungu(""); setGeoMsg(""); };
  useEffect(() => { const u = homeGu ? `/api/discover?region=${encodeURIComponent(homeGu)}` : "/api/discover"; setDiscover(null); fetch(u).then((r) => r.json()).then((d) => { if (d.ok) setDiscover(d); }).catch(() => {}); }, [homeGu]);

  const openById = (id: number) => { const c = cafes.find((x) => x.id === id); if (c) setSelected(c); };

  const runSearch = async (query: string) => {
    const qq = query.trim();
    if (!qq) return;
    setSearchQ(qq); setSearchLoading(true); setSearchRes(null);
    try {
      const u = `/api/search?q=${encodeURIComponent(qq)}${homeGu ? `&region=${encodeURIComponent(homeGu)}` : ""}`;
      const d = await (await fetch(u)).json();
      if (d.ok) setSearchRes(d);
    } catch {}
    setSearchLoading(false);
  };

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

  // '지도에서 위치 보기' — 지도 비동기 초기화가 끝날 때까지 재시도 후 해당 좌표로 이동
  useEffect(() => {
    if (tab !== "map" || !focusTarget) return;
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (mapObj.current && LRef.current) {
        mapObj.current.invalidateSize();
        mapObj.current.setView([focusTarget.lat, focusTarget.lng], 16, { animate: true });
        setFocusTarget(null);
        clearInterval(iv);
      } else if (tries > 50) clearInterval(iv);
    }, 120);
    return () => clearInterval(iv);
  }, [tab, focusTarget]);

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
      const isFocus = c.id === focusId;
      const isMatch = matchSet.has(c.id);
      const icon = L.divIcon({ className: "", html: makePinHtml(c, isMatch, isFocus), iconSize: [0, 0] });
      const m = L.marker([c.lat, c.lng], { icon, zIndexOffset: isFocus ? 3000 : isMatch ? 1000 : 0 }).addTo(layerRef.current).on("click", () => setSelected(c));
      if (isFocus) { m.bindPopup(`<b>${c.name}</b><br>${c.area}`); m.openPopup(); }
    });
    // 핀 고정 중이면 그 카페로 이동(아래 focus 효과)에 맡기고 fitBounds 생략
    if (focusId) {
      /* focus effect가 setView 처리 */
    } else if (filtered.length > 0 && (sido || sigungu)) {
      const lats = filtered.map((c) => c.lat), lngs = filtered.map((c) => c.lng);
      mapObj.current.fitBounds(L.latLngBounds([[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]), { padding: [50, 50], maxZoom: 15 });
    } else if (sido && SIDO_CENTER[sido]) { const [la, ln, z] = SIDO_CENTER[sido]; mapObj.current.setView([la, ln], z); }
  }, [filtered, matchSet, sido, sigungu, tab, focusId]);

  const onSido = (v: string) => { setSido(v); setSigungu(""); setFocusId(null); };

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
                {t === "home" ? "홈" : "지도"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <a href="/owner" className="bg-[#9c6b3f] rounded-full px-3 py-1.5 text-xs whitespace-nowrap">🔒 내 카페 분석</a>
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
                <button onClick={() => { setSearchRes(null); setSearchQ(""); setShowSearch(true); }} aria-label="느낌으로 검색" className="border border-[#cbb89f] rounded-lg px-3 py-2 bg-white text-[#2b2018] hover:bg-[#f0e6d4]">🔍</button>
              </div>
              <div className="mt-2.5 flex flex-col items-center gap-1">
                {autoGu ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#5f7355] bg-[#eef3ea] border border-[#cfe0c2] rounded-full px-2.5 py-1">📍 내 위치 기준 <b>{autoGu}</b></span>
                    <button onClick={clearAuto} className="text-[11px] text-[#9c6b3f] underline">전체보기</button>
                  </div>
                ) : (
                  <button onClick={openLocation} className="text-[12px] text-[#fff] bg-[#5f7355] rounded-full px-3.5 py-1.5 font-medium">📍 내 위치로 우리 동네 보기</button>
                )}
                {geoMsg && <span className="text-[10px] text-[#a8927a]">{geoMsg}</span>}
                {homeGu && !autoGu && <button onClick={clearAuto} className="text-[11px] text-[#9c6b3f] underline">수도권 전체 보기</button>}
              </div>
            </div>
            {!discover ? <p className="text-center text-[#a8927a] py-10">불러오는 중...</p> : (
              <>
                {discover.headlineA && <HeadlineCard c={discover.headlineA} kicker="이번 주 가장 많이 이야기된 곳" tone={0} />}
                {discover.headlineB && <HeadlineCard c={discover.headlineB} kicker="🔥 커피에 진심인 집 — 스페셜티 스포트라이트" tone={1} />}
                <Row title="🏆 리뷰 많은 Top 3" items={discover.top3} />
                <Row title="🔥 스페셜티 픽" items={discover.specialty} />
                <Row title="✨ 새로 발견된 카페" items={discover.fresh} />
                <button onClick={() => { if (homeSido) { setSido(homeSido); setSigungu(homeGu); } setFocusId(null); setSheetOpen(true); setTab("map"); }} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-medium mt-2">🗺 {homeGu ? `${homeGu} 지도로 보기` : "지도에서 전체 둘러보기"} →</button>
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
            <MapControls {...{ sido, sigungu, onSido, setSigungu, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto }} />
          </aside>
          <div className="md:hidden absolute left-0 right-0 bottom-0 bg-[#fdfaf4] rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.18)] z-[1200] flex flex-col transition-transform duration-300 ease-out will-change-transform" style={{ height: "72dvh", transform: sheetOpen ? "translateY(0)" : "translateY(calc(72dvh - 60px))" }}>
            <button onClick={() => setSheetOpen((o) => !o)} className="shrink-0 w-full pt-3 pb-2.5 flex flex-col items-center gap-1.5" aria-expanded={sheetOpen}>
              <div className="w-10 h-1.5 bg-[#cbb89f] rounded-full" />
              <span className="text-[11px] font-bold text-[#9c6b3f]">{sheetOpen ? "지도 보기 ▾" : `지역·필터 펼치기 ▴ (${filtered.length})`}</span>
            </button>
            <div className="flex-1 overflow-y-auto px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
              <MapControls {...{ sido, sigungu, onSido, setSigungu, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto }} />
            </div>
          </div>
        </div>
      )}

      {selected && <CafePanel cafe={selected} onClose={() => setSelected(null)} onMap={() => {
        if (selected.lat && selected.lng) {
          const g = toGu(selected.area);
          if (g.sido) { setSido(g.sido); setSigungu(g.sigungu); }
          setFocusTarget({ lat: selected.lat, lng: selected.lng });
          setFocusId(selected.id);
        }
        setSheetOpen(false); setSelected(null); setTab("map");
      }} />}

      {/* 느낌으로 검색 (시맨틱 + exact, 선택 동네 범위) */}
      {showSearch && (
        <div className="fixed inset-0 z-[4000] flex items-start justify-center sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSearch(false)} />
          <div className="relative bg-[#fdfaf4] w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[85vh] sm:rounded-2xl flex flex-col shadow-2xl" style={{ height: "100dvh" }}>
            <div className="shrink-0 p-4 border-b border-[#ece0cd]">
              <div className="flex items-center gap-2">
                <input autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch(searchQ)}
                  placeholder={`${homeGu || "수도권"}에서 느낌으로 찾기`} className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white text-[#2b2018]" />
                <button onClick={() => runSearch(searchQ)} className="bg-[#2b2018] text-[#f4ece0] rounded-lg px-4 py-2.5 text-sm font-medium shrink-0">검색</button>
                <button onClick={() => setShowSearch(false)} className="text-2xl text-[#9c6b3f] leading-none px-1 shrink-0">×</button>
              </div>
              <div className="text-[11px] text-[#a8927a] mt-2">{homeGu ? `📍 ${homeGu} 안에서` : "수도권 전체에서"} · 떠오르는 느낌을 자유롭게 적어보세요</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SEARCH_EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => runSearch(ex)} className="text-[11px] text-[#6b5a48] bg-[#f0e6d4] rounded-full px-2.5 py-1">{ex}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {searchLoading ? <p className="text-center text-[#a8927a] py-10">찾는 중…</p>
                : !searchRes ? <p className="text-center text-[#a8927a] py-10 text-sm leading-relaxed">"비 오는 날 혼자 조용히", "감성 사진 데이트"처럼<br />구체적이지 않아도 떠오르는 느낌으로 찾아드려요.</p>
                : (
                  <>
                    {searchRes.concepts.length > 0 && <div className="text-[11px] text-[#5f7355] mb-3">감지된 느낌: <b>{searchRes.concepts.join(" · ")}</b></div>}
                    {searchRes.results.length === 0 ? (
                      <p className="text-center text-[#a8927a] py-10 text-sm">결과가 없어요. 다른 표현이나 더 넓은 동네로 시도해 보세요.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[11px] text-[#a8927a] mb-1">{searchRes.region} · {searchRes.count}곳 중 가까운 순</div>
                        {searchRes.results.map((r) => (
                          <button key={r.id} onClick={() => { openById(r.id); setShowSearch(false); }} className="w-full text-left bg-white rounded-xl p-3.5 border border-[#ece0cd] hover:border-[#9c6b3f]">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-bold text-sm text-[#2b2018]">{r.name}</span>
                              {r.grade && GRADE_STYLE[r.grade] && <span className="text-[8px] text-white px-1 py-0.5 rounded-full" style={{ background: GRADE_STYLE[r.grade].bg }}>{r.grade}</span>}
                              <span className="text-[10px] text-[#a8927a] ml-auto">{r.area} · 리뷰 {r.count ?? 0}</span>
                            </div>
                            {r.identity && <p className="text-[11px] text-[#6b5a48] line-clamp-1 mb-1">{r.identity}</p>}
                            {r.reasons.length > 0 && <div className="text-[10px] text-[#b08440]">🔎 {r.reasons.join(" · ")}</div>}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
            </div>
          </div>
        </div>
      )}

      {/* 위치이용 동의 안내 */}
      {showConsent && (
        <div className="fixed inset-0 z-[4000] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={onDecline} />
          <div className="relative bg-[#fdfaf4] w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl">
            <div className="text-2xl mb-1">📍</div>
            <h3 className="text-lg font-bold text-[#2b2018] mb-2">내 동네 카페 먼저 보기</h3>
            <p className="text-[13px] text-[#52402e] leading-relaxed mb-2">
              동네 커피 가이드라서, 위치를 알면 <b>가장 가까운 동네(시·군·구)의 검증된 카페</b>를 바로 보여드릴 수 있어요.
            </p>
            <p className="text-[12px] text-[#6b5a48] leading-relaxed mb-3">
              정확한 좌표가 아니라 <b>대략적 지역만</b> 쓰고(저장도 ≈500m로 뭉뚱그려요), 이름·연락처 같은 <b>개인정보는 받지 않아요</b>. 동의는 <b>선택</b>이고 언제든 끌 수 있어요. 동의하시면 브라우저가 위치 권한을 한 번 더 물어봅니다.
            </p>
            <details className="mb-4">
              <summary className="text-[12px] text-[#9c6b3f] cursor-pointer">수집·이용 동의 내용 자세히 보기</summary>
              <div className="text-[11px] text-[#6b5a48] leading-relaxed mt-2 bg-[#f4ece0] rounded-lg p-3 space-y-1">
                <div>· <b>수집 항목</b>: 대략적 위치(시·군·구 수준), 브라우저 익명 식별자</div>
                <div>· <b>이용 목적</b>: 내 동네 카페 자동 추천·필터, 지역별 수요 통계</div>
                <div>· <b>보관·파기</b>: 동의 철회 또는 브라우저 데이터 삭제 시까지, 이후 파기</div>
                <div>· <b>제3자 제공·판매</b>: 일절 없음</div>
                <div>· <b>개인정보</b>: 이름·연락처·정밀 위치는 수집·저장하지 않습니다</div>
                <div>· <b>거부 권리</b>: 거부해도 전체 카페를 그대로 이용할 수 있어요</div>
                <div>· <b>철회 방법</b>: 위 '전체보기'로 끄거나 브라우저 사이트 데이터 삭제</div>
              </div>
            </details>
            <div className="flex flex-col gap-2">
              <button onClick={onAgree} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-medium">동의하고 내 동네 보기</button>
              <button onClick={onDecline} className="w-full text-[#9c6b3f] rounded-xl py-2 text-sm">아니요, 전체 볼게요</button>
            </div>
          </div>
        </div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </div>
  );
}

function MapControls({ sido, sigungu, onSido, setSigungu, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto }: any) {
  const listCafes: Cafe[] = tasteKey ? filtered.filter((c: Cafe) => matchSet.has(c.id)) : filtered;
  return (
    <>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-sm font-bold text-[#52402e]">📍 지역</div>
          {autoGu
            ? <span className="text-[11px] text-[#5f7355] bg-[#eef3ea] border border-[#cfe0c2] rounded-full px-2 py-0.5">내 위치 <b>{autoGu}</b></span>
            : <button onClick={openLocation} className="text-[11px] text-white bg-[#5f7355] rounded-full px-2.5 py-1 font-medium">📍 내 위치로</button>}
        </div>
        <div className="flex gap-2">
          <select value={sido} onChange={(e) => onSido(e.target.value)} className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white text-[#2b2018]">
            <option value="">시·도</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sigungu} onChange={(e) => setSigungu(e.target.value)} disabled={!sido} className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white text-[#2b2018] disabled:opacity-50">
            <option value="">시·군·구</option>{sido && REGIONS[sido].map((g: string) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {geoMsg && <div className="text-[10px] text-[#a8927a] mt-1.5">{geoMsg}</div>}
        {(sido || sigungu) && <button onClick={() => { if (clearAuto) clearAuto(); else { onSido(""); setSigungu(""); } }} className="text-xs text-[#9c6b3f] underline mt-2">전체</button>}
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
        {tasteKey && <p className="text-xs text-[#9c6b3f] mt-2">'{TASTE_CHOICES.find((t) => t.key === tasteKey)?.label}' 결이 자주 언급되는 {matchSet.size}곳만 보는 중</p>}
      </div>
      <div>
        <div className="text-sm font-bold text-[#52402e] mb-2.5">목록 ({listCafes.length}{tasteKey ? ` · ${TASTE_CHOICES.find((t) => t.key === tasteKey)?.label}` : ""})</div>
        {listCafes.length === 0 ? <p className="text-xs text-[#a8927a] bg-[#f4ece0] rounded-lg p-4">{tasteKey ? "이 카테고리에 해당하는 카페가 이 지역엔 없어요. 다른 결을 골라보세요." : "지역을 선택하면 목록이 나와요."}</p> : (
          <div className="space-y-2">
            {listCafes.slice(0, 50).map((c: Cafe) => (
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
  const [quality, setQuality] = useState<QualityStats | null>(null);
  const [loadingRev, setLoadingRev] = useState(true);
  useEffect(() => {
    let live = true; setLoadingRev(true);
    fetch(`/api/cafe-detail?id=${cafe.id}`).then((r) => r.json()).then((d) => { if (live) { setReviews(d.reviews ?? []); setQuality(d.quality ?? null); setLoadingRev(false); } }).catch(() => { if (live) setLoadingRev(false); });
    return () => { live = false; };
  }, [cafe.id]);
  const kept = quality ? quality.verified + quality.reference : 0;
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
          {!loadingRev && quality && quality.raw > 0 && (
            <div className="bg-[#eef3ea] border border-[#cfe0c2] rounded-lg px-4 py-2.5 mb-4">
              <div className="text-[11px] text-[#4f6a43] leading-relaxed">
                🔍 네이버 공개 글 <b>{quality.raw}건</b>을 검증해, 다른 가게·모음글·동명 카페 등 <b>노이즈 {quality.rejected}건</b>을 걸러내고
                <b> 옥석 {kept}건</b>만 분석에 썼어요.
              </div>
            </div>
          )}
          {!loadingRev && reviews.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] text-[#a8927a] mb-2">이 분석의 근거가 된 실제 후기 (네이버 공개 글)</div>
              <div className="space-y-3">
                {reviews.map((rv, i) => (
                  <div key={i} className="border-b border-[#f0e6d4] pb-3 last:border-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      {rv.trust === "verified"
                        ? <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#5f7355" }}>검증 ✓</span>
                        : rv.trust === "reference"
                        ? <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#9c6b3f" }}>참고</span>
                        : null}
                      {rv.why?.[0] && <span className="text-[10px] text-[#8a7458]">{rv.why[0]}</span>}
                    </div>
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
