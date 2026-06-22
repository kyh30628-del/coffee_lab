"use client";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import InfoDot from "./InfoDot";
import ShowcaseBanner, { SHOWCASE_CSS } from "./ShowcaseBanner";
import OwnerSignupModal from "./OwnerSignupModal";
import VisitorReviews from "./VisitorReviews";
import KakaoShare from "./KakaoShare";
import { buildAxisDist, cafeProfile, type AxisDist } from "@/lib/cafeProfile";

type EvidenceReview = { quote: string; link?: string; source?: string; date?: string; trust?: "verified" | "reference" | "rejected"; score?: number; why?: string[] };
type QualityStats = { raw: number; verified: number; reference: number; rejected: number; duplicates?: number; rejectReasons?: Record<string, number> };
type Cafe = {
  id: number; name: string; area: string; dong?: string | null; lat: number; lng: number;
  hours: string; phone: string; roasts_own: boolean; signature: string; uses: string;
  vibe: string; note: string; tone: string; photo_url: string | null;
  acidity: number; body: number; sweet: number;
  synth_grade: string | null; synth_identity: string | null;
  synth_count: number | null; synth_reviews?: EvidenceReview[] | null;
  char_scores?: Record<string, number> | null;
  featured?: boolean;
};
type DCafe = { id: number; name: string; area: string; lat: number; lng: number; grade: string | null; count: number | null; identity: string | null; note: string | null; beanNote: string[]; reason?: string };
type Discover = { headlineA: DCafe | null; headlineB: DCafe | null; top3: DCafe[]; fresh: DCafe[]; specialty: DCafe[]; featured?: DCafe[]; scopeCount: number };
type SearchResult = { id: number; name: string; area: string; grade: string | null; count: number | null; identity: string | null; score: number; reasons: string[] };
type SearchRes = { ok: boolean; region: string; q: string; concepts: string[]; count: number; results: SearchResult[] };
const SEARCH_EXAMPLES = ["비 오는 날 혼자 조용히", "감성 사진 데이트", "노트북 작업하기 좋은", "산미 또렷한 커피", "빵 맛있는 집"];
// 쇼케이스 1차 성과 집계(노출·클릭·재생)
const trackPromo = (cafeId: number, type: "view" | "click" | "play") => { fetch("/api/promo-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, type }) }).catch(() => {}); };

const REGIONS: Record<string, string[]> = {
  서울: ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"],
  경기: ["수원시","성남시","고양시","용인시","부천시","안산시","안양시","남양주시","화성시","평택시","의정부시","시흥시","파주시","김포시","광명시","광주시","군포시","하남시","오산시","양주시","구리시","안성시","포천시","의왕시","여주시","동두천시","과천시","이천시","양평군","가평군","연천군"],
  인천: ["중구","동구","미추홀구","연수구","남동구","부평구","계양구","서구","강화군","옹진군"],
};
const SIDO_CENTER: Record<string, [number, number, number]> = { 서울: [37.5665, 126.978, 11], 경기: [37.37, 127.105, 9], 인천: [37.4563, 126.7052, 11] };
// area별 결과 캐시 — area 종류는 ~64개뿐이라, 1만건을 매번 64개 순회(64만 연산)하던 걸 O(1)로.
const _guCache = new Map<string, { sido: string; sigungu: string }>();
function toGu(area: string): { sido: string; sigungu: string } {
  const a = (area ?? "").trim();
  const hit = _guCache.get(a); if (hit) return hit;
  let res: { sido: string; sigungu: string } = { sido: "", sigungu: "" };
  if (a.includes("인천")) { res = { sido: "인천", sigungu: "" }; for (const gu of REGIONS["인천"]) { if (a.includes(gu)) { res = { sido: "인천", sigungu: gu }; break; } } }
  else { outer: for (const [sido, list] of Object.entries(REGIONS)) { for (const gu of list) { if (a.includes(gu)) { res = { sido, sigungu: gu }; break outer; } } }
    if (!res.sigungu) { if (a.includes("구리")) res = { sido: "경기", sigungu: "구리시" }; else if (a.includes("하남")) res = { sido: "경기", sigungu: "하남시" }; } }
  _guCache.set(a, res);
  return res;
}

const CONSENT_VERSION = "v1";

// 두 좌표 간 거리(미터) — 구독 카페 500m 반경 판정용
function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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
const GRADE_STYLE: Record<string, { bg: string; label: string }> = { 검증: { bg: "#5f7355", label: "검증" }, 참고: { bg: "#9c6b3f", label: "참고" }, 후보: { bg: "#a8927a", label: "후보" } };
const TONES = ["#6f4e37", "#5f7355", "#9c6b3f", "#3a2e28", "#8a5a24"];

// 홈 잡지 카드 — 모듈 스코프(컴포넌트 내부 정의 금지). 내부에 두면 렌더마다 재마운트되어 뒤로가기/탭전환이 느려짐.
const HeadlineCard = memo(function HeadlineCard({ c, kicker, tone, onOpen }: { c: DCafe; kicker: string; tone: number; onOpen: (id: number) => void }) {
  return (
    <button onClick={() => onOpen(c.id)} className="w-full text-left rounded-2xl overflow-hidden shadow-md mb-4" style={{ background: TONES[tone] }}>
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
});
const Row = memo(function Row({ title, items, sub, info, onOpen }: { title: string; items: DCafe[]; sub?: string; info?: React.ReactNode; onOpen: (id: number) => void }) {
  if (!items?.length) return null;
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-1 pb-1 border-b-2 border-[#2b2018]">
        <div className="text-base font-bold text-[#2b2018] flex items-center gap-1.5">{title}{info && <InfoDot title={title.replace(/^[^가-힣A-Za-z]+/, "")}>{info}</InfoDot>}</div>
        {sub && <div className="text-[10px] text-[#9c6b3f] shrink-0">↕ {sub}</div>}
      </div>
      {/* 바깥은 가로 스크롤, 위쪽 패딩 안에 말풍선이 들어가 잘리지 않음 */}
      <div className="flex gap-3 overflow-x-auto pt-2 pb-2 dcn-hscroll" style={{ WebkitOverflowScrolling: "touch" }}>
        {items.map((c) => (
          <div key={c.id} className="shrink-0 w-48">
            <button onClick={() => onOpen(c.id)} className="w-full text-left bg-white rounded-xl p-3.5 border border-[#ece0cd] hover:border-[#9c6b3f] hover:shadow-md transition-all h-full flex flex-col">
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
        ))}
      </div>
    </div>
  );
});

// 지역 집계 원형마커(전체/시도/시군구 레벨) — 개수와 크기로 밀집도 표현. 좌표 중심에 배치(translate -50%,-50%).
function makeRegionPinHtml(label: string, cnt: number, maxCnt: number): string {
  // sqrt 스케일 — 한 지역이 압도적이어도 작은 지역끼리 크기 차이가 보이게(선형은 다 최소크기로 뭉침).
  const t = Math.sqrt(Math.min(1, cnt / Math.max(1, maxCnt)));
  const size = Math.round(26 + t * 28); // 26~54px (작게 — 겹침 최소화)
  // 농도 색: 적을수록 밝은 카라멜 → 많을수록 진한 에스프레소. 색만 봐도 어디가 많은지 한눈에.
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = lerp(206, 92), g = lerp(160, 56), b = lerp(110, 33);
  const main = `rgb(${r},${g},${b})`, dark = `rgb(${Math.round(r * 0.68)},${Math.round(g * 0.68)},${Math.round(b * 0.68)})`;
  const esc = (label || "").replace(/</g, "&lt;");
  return `<div class="dcn-region-pin" style="transform:translate(-50%,-50%);text-align:center;cursor:pointer;">
    <div style="width:${size}px;height:${size}px;border-radius:50%;
      background:radial-gradient(circle at 33% 27%, ${main} 0%, ${dark} 80%);
      border:2px solid rgba(253,250,244,0.97);
      box-shadow:0 0 0 ${1 + Math.round(t * 3)}px rgba(124,82,48,0.13), 0 4px 11px rgba(50,33,20,0.42);
      display:flex;align-items:center;justify-content:center;margin:0 auto;">
      <span style="color:#fdf3e6;font-weight:800;font-size:${Math.round(11 + t * 5)}px;letter-spacing:-0.4px;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${cnt}</span></div>
    <div style="margin-top:3px;background:rgba(43,32,24,0.9);color:#f3e6d2;font-weight:600;padding:1.5px 7px;border-radius:9px;font-size:10px;white-space:nowrap;display:inline-block;box-shadow:0 2px 5px rgba(0,0,0,0.22);">${esc}</div>
  </div>`;
}

// 카페 클러스터 뱃지 — 가까운 카페 여러 개를 한 뭉치로(픽셀 그리드). 개수 표시, 클릭하면 줌인되어 쪼개짐.
//   집계 원형(makeRegionPinHtml=행정구역)과 달리 화면상 근접도 기준. 취향매칭 카페 포함 시 앰버 강조.
function makeClusterHtml(cnt: number, hasMatch: boolean): string {
  const size = cnt >= 100 ? 46 : cnt >= 30 ? 42 : cnt >= 10 ? 37 : 33;
  const bg = hasMatch ? "linear-gradient(135deg,#d49a4e 0%,#a85f1c 85%)" : "linear-gradient(135deg,#7c5230 0%,#4a3220 85%)";
  return `<div style="transform:translate(-50%,-50%);cursor:pointer;">
    <div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};
      border:2.5px solid rgba(253,250,244,0.96);box-shadow:0 0 0 3px rgba(124,82,48,0.12),0 3px 9px rgba(50,33,20,0.42);
      display:flex;align-items:center;justify-content:center;">
      <span style="color:#fff;font-weight:800;font-size:${cnt >= 100 ? 12 : 13}px;letter-spacing:-0.3px;line-height:1;text-shadow:0 1px 2px rgba(0,0,0,0.3);">${cnt}</span>
    </div></div>`;
}

// 위치 가늠용 지하철역 마커(개별 카페 레벨에서만). 카페 핀과 구분되게 파란 점 + 역명.
function makeStationHtml(name: string, colors: string[], refs: string[]): string {
  // 지하철역 — 호선별 색 번호 뱃지(환승역=여러 개) + 역명. 버스정류장(베이스맵 아이콘)과 명확히 구분.
  const cols = colors && colors.length ? colors : ["#2f6fb0"];
  const badge = (c: string, r: string) => {
    const m = (r || "").match(/^(\d+)호선/);
    const lbl = m ? m[1] : (r || "").replace(/호선|선/g, "").slice(0, 3) || "·";
    return `<span style="background:${c};color:#fff;font-size:13px;font-weight:900;line-height:1;min-width:22px;height:23px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;padding:0 5px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.45);">${lbl}</span>`;
  };
  const badges = cols.map((c, i) => badge(c, refs && refs[i])).join("");
  return `<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:5px;white-space:nowrap;">
    <span style="display:flex;gap:3px;">${badges}</span>
    <span style="font-size:15px;font-weight:800;color:#1f2d3d;background:#fff;border:1px solid #d4dce3;padding:3px 9px;border-radius:9px;box-shadow:0 1px 3px rgba(0,0,0,0.32);">${(name || "").replace(/</g, "&lt;")}역</span>
  </div>`;
}
// 지하철 출구 마커 — 서울메트로식 파란 번호 사각(↗). 연결선 없이도 눈에 확 띄게 크고 진하게. 비클릭.
function makeExitHtml(num: string): string {
  const n = (num || "").replace(/</g, "").slice(0, 3);
  return `<div style="transform:translate(-50%,-50%);position:relative;width:24px;height:24px;">
    <span style="position:absolute;inset:0;background:#0a57b8;color:#fff;font-size:13px;font-weight:900;display:flex;align-items:center;justify-content:center;border-radius:6px;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(10,55,120,0.55);">${n || "·"}</span>
    <span style="position:absolute;top:-6px;right:-6px;font-size:10px;font-weight:900;color:#0a57b8;background:#fff;border-radius:50%;width:13px;height:13px;line-height:13px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.4);">↗</span>
  </div>`;
}
function makeLandmarkHtml(name: string, icon: string): string {
  // 대형 랜드마크 — 유형 아이콘 + 옅은 크림 라벨. 커피 톤과 조화, 차분하게.
  return `<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:3px;white-space:nowrap;">
    <span style="font-size:14px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.3));flex:none;">${icon}</span>
    <span style="font-size:10.5px;font-weight:700;color:#6b4310;background:rgba(255,250,240,0.95);border:1px solid #e3c79a;padding:0.5px 5px;border-radius:6px;box-shadow:0 1px 2px rgba(0,0,0,0.14);">${(name || "").replace(/</g, "&lt;")}</span>
  </div>`;
}
function makeIslandHtml(name: string): string {
  // 영토 표현 — 독도/울릉도. 태극 느낌 + 라벨.
  return `<div style="transform:translate(-50%,-50%);display:flex;align-items:center;gap:3px;white-space:nowrap;">
    <span style="font-size:13px;line-height:1;">🇰🇷</span>
    <span style="font-size:11px;font-weight:800;color:#1c3d6e;background:#fff;border:1.5px solid #2f6fb0;padding:1px 5px;border-radius:7px;box-shadow:0 1px 3px rgba(0,0,0,0.35);">${name}</span>
  </div>`;
}
// 길이름(transportation_name)·버스정류장 토글 — 벡터 레이어 visibility/filter 제어
const _origPoiFilter: Record<string, any> = {}; // poi_r* 원본 필터 보존(토글 복원용)
// '상세' OFF에도 지도에 남길 주요 시설 클래스(공원·학교 등). 나머지 잡POI(식당·상점·편의점…)는 숨김.
const MAJOR_POI = ["park", "garden", "school", "college", "university", "kindergarten", "hospital", "clinic", "stadium", "museum", "library", "zoo", "attraction", "theme_park", "aquarium", "cemetery", "townhall", "town_hall"];
function applyTogglesToMap(ml: any, showStreets: boolean, showBus: boolean): void {
  if (!ml) return;
  let style: any;
  try { if (!(ml.isStyleLoaded && ml.isStyleLoaded())) return; style = ml.getStyle(); } catch { return; }
  for (const ly of (style.layers || [])) {
    const sl = (ly as any)["source-layer"] || "";
    if (ly.type === "symbol" && (sl === "transportation_name" || /road_label|highway[-_]?name|road[-_]?name|street/i.test(ly.id))) {
      try { ml.setLayoutProperty(ly.id, "visibility", showStreets ? "visible" : "none"); } catch {}
    }
    // 건물 타일: 길이름 토글과 함께 숨김(사장님 요청 — 길이름 OFF면 건물 폴리곤도 OFF로 깔끔).
    if (/building/i.test(ly.id) && (ly.type === "fill" || ly.type === "fill-extrusion" || ly.type === "line")) {
      try { ml.setLayoutProperty(ly.id, "visibility", showStreets ? "visible" : "none"); } catch {}
    }
    // 버스: poi_transit(버스+철도+공항 아이콘) 전체 + 일반 POI(poi_r*)에 섞인 버스(class=bus)까지 제외해야 '버스 전체' 숨김.
    if (/poi_transit/i.test(ly.id)) {
      try { ml.setLayoutProperty(ly.id, "visibility", showBus ? "visible" : "none"); } catch {}
    }
    if (/^poi_/i.test(ly.id) && !/transit/i.test(ly.id)) {
      try {
        if (_origPoiFilter[ly.id] === undefined) _origPoiFilter[ly.id] = ml.getFilter(ly.id) ?? null;
        const orig = _origPoiFilter[ly.id];
        const conds: any[] = [];
        if (orig) conds.push(orig);
        // 버스 OFF → 버스·철도 교통 아이콘 제외(내 호선 색뱃지만 남김)
        if (!showBus) conds.push(["match", ["get", "class"], ["bus", "rail", "railway"], false, true]);
        // 상세 OFF → 주요 시설(공원·학교·대학·병원 등)만 남기고 잡POI(식당·상점·편의점…) 숨김
        if (!showStreets) conds.push(["match", ["get", "class"], MAJOR_POI, true, false]);
        ml.setFilter(ly.id, conds.length === 0 ? null : conds.length === 1 ? conds[0] : ["all", ...conds]);
      } catch {}
    }
  }
}
function makeMyLocHtml(): string {
  // 내 현재 위치 — 파란 점(펄스 느낌의 후광)
  return `<div style="transform:translate(-50%,-50%);"><span style="display:block;width:18px;height:18px;border-radius:50%;background:#2f6fb0;border:3px solid #fff;box-shadow:0 0 0 5px rgba(47,111,176,0.28),0 1px 5px rgba(0,0,0,0.45);"></span></div>`;
}
function makePinHtml(c: Cafe, isMatch: boolean, isFocus = false, isMine = false): string {
  const grade = c.synth_grade ?? "후보";
  const feat = !!c.featured && !isFocus; // ✨ 우선 노출 — 골드 핀 강조(포커스 핀이 우선)
  // 내 카페(MY PIN) — 핑크/레드 하트 핀으로 최우선 강조
  const color = isMine ? "#d6336c" : isFocus ? "#b5703c" : feat ? "#e0a32e" : isMatch ? "#5f7355" : (GRADE_STYLE[grade]?.bg ?? "#9c6b3f");
  const size = isMine ? 46 : isFocus ? 48 : feat ? 42 : isMatch ? 40 : 33;
  // 부드럽게 번지는 링(rgba) + 깊이감 있는 드롭섀도 — 색은 의미 유지, 스타일만 세련되게
  const halo = isMine ? `0 0 0 5px rgba(214,51,108,0.3)` : isFocus ? `0 0 0 6px rgba(181,112,60,0.32)` : feat ? `0 0 0 5px rgba(224,163,46,0.34)` : isMatch ? `0 0 0 5px rgba(95,115,85,0.3)` : `0 0 0 3px rgba(156,107,63,0.3)`;
  const ring = `box-shadow:${halo}, 0 5px 14px rgba(50,33,20,0.5);`;
  const labelStyle = isMine ? "background:#d6336c;color:#fff;font-weight:700;"
    : isFocus ? "background:#b5703c;color:#fff;font-weight:700;"
    : feat ? "background:#e0a32e;color:#2b2018;font-weight:700;" : "background:rgba(253,250,244,0.96);color:#2b2018;font-weight:600;";
  const glyph = isMine ? "❤" : isFocus ? "📍" : feat ? "⭐" : "☕";
  return `<div style="transform:translate(-50%,-100%);text-align:center;">
    <div style="width:${size}px;height:${size}px;background:${color};background-image:radial-gradient(circle at 34% 28%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%);border:2px solid #fdfaf4;border-radius:50% 50% 50% 0;transform:rotate(-45deg);${ring}display:flex;align-items:center;justify-content:center;margin:0 auto;">
      <span style="transform:rotate(45deg);font-size:${isFocus ? 20 : isMatch || feat ? 16 : 14}px;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25));">${glyph}</span></div>
    <div style="margin-top:3px;${labelStyle}padding:2px 7px;border-radius:8px;font-size:${isFocus || isMine ? 11 : 10}px;white-space:nowrap;display:inline-block;box-shadow:0 2px 6px rgba(0,0,0,0.28);">${c.name}${isMine ? " ❤" : isFocus ? "" : feat ? " ⭐" : isMatch ? " ✓" : ""}</div>
  </div>`;
}
// 다른 사람들의 집계 핀 — 등록 인원수 표시, 인기 많을수록 크게(원형, 카페핀과 구분).
function makeCountPinHtml(p: { name: string; cnt: number }, maxCnt: number): string {
  const t = Math.min(1, p.cnt / Math.max(1, maxCnt));
  const size = Math.round(28 + t * 26);
  const esc = (p.name || "").replace(/</g, "&lt;");
  return `<div style="transform:translate(-50%,-100%);text-align:center;">
    <div style="width:${size}px;height:${size}px;background:#5f7355;border:2px solid #fdfaf4;border-radius:50%;box-shadow:0 0 0 ${3 + Math.round(t * 4)}px rgba(95,115,85,0.25),0 2px 8px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;margin:0 auto;">
      <span style="color:#fff;font-weight:800;font-size:${Math.round(12 + t * 6)}px;">${p.cnt}</span></div>
    <div style="margin-top:2px;background:#5f7355;color:#fff;font-weight:700;padding:1px 5px;border-radius:7px;font-size:9px;white-space:nowrap;display:inline-block;">${esc} · ${p.cnt}명</div>
  </div>`;
}

// 병합 핀 — 내가 저장한 카페를 다른 사람도 저장한 경우. 핑크 하트(내 추억) + 초록 인원 배지(다른 사람)로 한 핀에 표현.
function makeMinePinHtml(c: Cafe, othersCnt: number): string {
  const badge = othersCnt > 0
    ? `<div style="position:absolute;top:-7px;right:-12px;background:#5f7355;color:#fff;border:2px solid #fdfaf4;border-radius:11px;min-width:22px;height:22px;line-height:18px;padding:0 5px;font-size:11px;font-weight:800;box-shadow:0 1px 4px rgba(0,0,0,0.35);">${othersCnt}</div>`
    : "";
  return `<div style="transform:translate(-50%,-100%);text-align:center;">
    <div style="position:relative;width:42px;height:42px;margin:0 auto;">
      <div style="width:42px;height:42px;background:#d6336c;border:2px solid #fdfaf4;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 0 0 5px rgba(214,51,108,0.4),0 3px 10px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:13px;">❤</span></div>
      ${badge}
    </div>
    <div style="margin-top:2px;background:#d6336c;color:#fff;font-weight:700;padding:1px 6px;border-radius:7px;font-size:10px;white-space:nowrap;display:inline-block;">${c.name} ❤${othersCnt > 0 ? ` · ${othersCnt}명` : ""}</div>
  </div>`;
}
function topChars(c: Cafe, n = 4) {
  const cs = c.char_scores ?? {};
  return Object.entries(cs).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ ...(CHAR_LABELS[k] ?? { label: k, emoji: "" }), score: v }));
}

// 즐겨찾기(★ 북마크) 모달 — 카페 상세에서 북마크한 카페 목록(내 카페 등록과 별개). 탭하면 상세로.
function FavoritesModal({ items, onClose, onOpen, onRemove }: { items: Cafe[]; onClose: () => void; onOpen: (c: Cafe) => void; onRemove: (id: number) => void }) {
  return (
    <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={onClose}>
      <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl max-h-[80dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
          <div className="font-bold text-[#2b2018] text-[15px]"><span style={{ color: "#f0a832" }}>★</span> 즐겨찾기 <span className="text-[#a8927a] text-[12px] font-normal">{items.length}곳</span></div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#7a6452] text-lg">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-2 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          {items.length === 0 ? (
            <div className="text-center text-[#a8927a] text-[13px] py-12 leading-relaxed">
              아직 즐겨찾기한 카페가 없어요.<br />카페 상세에서 <span style={{ color: "#f0a832" }}>★</span>를 누르면 여기에 모여요.
            </div>
          ) : items.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-[#ece0cd] p-3 flex gap-2 items-center">
              <button onClick={() => onOpen(c)} className="flex-1 min-w-0 text-left flex items-center gap-2 active:opacity-70">
                <div className="w-10 h-10 rounded-lg bg-[#f3ede1] flex items-center justify-center text-[16px] shrink-0">☕</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#2b2018] text-[14px] truncate">{c.name}</span>
                    {c.synth_grade && GRADE_STYLE[c.synth_grade] && <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full shrink-0" style={{ background: GRADE_STYLE[c.synth_grade].bg }}>{c.synth_grade}</span>}
                  </div>
                  <div className="text-[11px] text-[#9c6b3f]">{c.area}{c.synth_count ? ` · 리뷰 ${c.synth_count}` : ""}</div>
                </div>
              </button>
              <button onClick={() => onRemove(c.id)} aria-label="즐겨찾기 해제" className="shrink-0 text-[#f0a832] text-[20px] px-1.5 active:scale-90">★</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [stations, setStations] = useState<{ n: string; lat: number; lng: number; c: string[]; r: string[] }[]>([]); // 지하철역(이름,좌표,호선색,호선명)
  const [landmarks, setLandmarks] = useState<[string, number, number, string, number][]>([]); // 랜드마크(이름,위도,경도,아이콘,우선순위)
  const [exits, setExits] = useState<{ lat: number; lng: number; n: string }[]>([]); // 지하철 출구(좌표, 번호)
  const [lines, setLines] = useState<{ ref: string; color: string; segs: [number, number][][] }[]>([]); // 호선 노선(역 순서 폴리라인, 끊긴 구간 분리)
  useEffect(() => {
    fetch("/data/stations.json").then((r) => r.json()).then((d) => Array.isArray(d) && setStations(d)).catch(() => {});
    fetch("/data/exits.json").then((r) => r.json()).then((d) => Array.isArray(d) && setExits(d)).catch(() => {});
    fetch("/data/lines.json").then((r) => r.json()).then((d) => Array.isArray(d) && setLines(d)).catch(() => {});
    fetch("/data/landmarks.json").then((r) => r.json()).then((d) => Array.isArray(d) && setLandmarks(d)).catch(() => {});
  }, []);
  const [selected, setSelected] = useState<Cafe | null>(null);
  const [tab, setTab] = useState<"home" | "map" | "memory">("home");
  const [discover, setDiscover] = useState<Discover | null>(null);
  const [momentum, setMomentum] = useState<{ rising: DCafe[] } | null>(null);
  const [homeSido, setHomeSido] = useState("");
  const [homeGu, setHomeGu] = useState("");
  const [homeDong, setHomeDong] = useState(""); // 우리 동네(동/면)
  const [sheetOpen, setSheetOpen] = useState(true); // 모바일 바텀시트 펼침/접힘
  const [focusTarget, setFocusTarget] = useState<{ lat: number; lng: number } | null>(null); // 지도에서 위치 보기
  const [focusId, setFocusId] = useState<number | null>(null); // 핀 고정 강조할 카페
  // 내 카페(MY PIN) — 익명 기기기반
  const [deviceId, setDeviceId] = useState("");
  const [myCafeIds, setMyCafeIds] = useState<Set<number>>(new Set());
  const [myVisits, setMyVisits] = useState<any[]>([]);
  const [myPinMode, setMyPinMode] = useState(false);
  const [showMyCafeReg, setShowMyCafeReg] = useState(false);
  const [editCafeId, setEditCafeId] = useState<number | null>(null); // 추억 수정모드: 클릭한 카페 id
  const [showFavs, setShowFavs] = useState(false); // 즐겨찾기(★ 카페) 모달
  const [othersMode, setOthersMode] = useState(false); // 다른 사람은 — 집계 핀
  const [explain, setExplain] = useState<null | "mine" | "others">(null); // 내카페/다른사람 설명 모달
  const explainSuppressed = (t: "mine" | "others") => { try { return Number(localStorage.getItem(`dcn-explain-${t}`) || 0) > Date.now(); } catch { return false; } };
  const suppressExplain = (t: "mine" | "others") => { try { localStorage.setItem(`dcn-explain-${t}`, String(Date.now() + 7 * 864e5)); } catch {} };
  const revealMode = (t: "mine" | "others") => { if (t === "mine") setMyPinMode(true); else setOthersMode(true); };
  const [othersPins, setOthersPins] = useState<{ id: number; name: string; area: string; lat: number; lng: number; cnt: number }[]>([]);
  const [nearMe, setNearMe] = useState<{ lat: number; lng: number } | null>(null); // '내 주변 500m' 현재 위치(누를 때마다 갱신)
  const [nearMsg, setNearMsg] = useState("");
  const mlRef = useRef<any>(null); // maplibre 벡터 맵(레이어 토글용)
  const [showStreets, setShowStreets] = useState(false); // '상세'(길이름·건물·잡POI) — 기본 OFF로 깔끔
  const [showBus, setShowBus] = useState(false); // 버스/교통 아이콘 — 기본 OFF
  const showStreetsRef = useRef(true); showStreetsRef.current = showStreets;
  const showBusRef = useRef(true); showBusRef.current = showBus;
  const [myLocked, setMyLocked] = useState(false); // 공용 PC 잠금 상태
  const [sessionPin, setSessionPin] = useState(""); // 이번 세션에 입력한 PIN(해제용)
  const [bookmarkIds, setBookmarkIds] = useState<Set<number>>(new Set()); // 카페 북마크(내 카페 등록과 별개)
  const reloadMyCafes = (dev: string, pin = "") => fetch(`/api/my-cafe?device=${dev}${pin ? `&pin=${encodeURIComponent(pin)}` : ""}`).then((r) => r.json()).then((d) => {
    if (d.ok) {
      setMyLocked(!!d.locked);
      setMyVisits(d.cafes ?? []);
      setMyCafeIds(new Set((d.cafes ?? []).map((c: any) => c.id)));
      if (d.locked) setMyPinMode(false);
    }
  }).catch(() => {});
  const reloadBookmarks = (dev: string) => fetch(`/api/bookmark?device=${dev}`).then((r) => r.json()).then((d) => { if (d.ok) setBookmarkIds(new Set(d.ids ?? [])); }).catch(() => {});
  const toggleBookmark = async (cafeId: number) => {
    const cur = bookmarkIds.has(cafeId);
    setBookmarkIds((prev) => { const n = new Set(prev); if (cur) n.delete(cafeId); else n.add(cafeId); return n; }); // 낙관적 업데이트
    try { await fetch("/api/bookmark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: deviceId, cafeId, action: "toggle" }) }); }
    catch { reloadBookmarks(deviceId); }
  };
  useEffect(() => {
    let dev = ""; try { dev = localStorage.getItem("dcn_device") || ""; if (!dev) { dev = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); localStorage.setItem("dcn_device", dev); } } catch {}
    let pin = ""; try { pin = sessionStorage.getItem("dcn_pin") || ""; } catch {}
    setDeviceId(dev); setSessionPin(pin); if (dev) { reloadMyCafes(dev, pin); reloadBookmarks(dev); }
  }, []);
  // 자연어 검색
  const [showSearch, setShowSearch] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<SearchRes | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  // 위치/동의 상태 (세션 캐시 안 함 — '내 위치' 누를 때만 새로 수집)
  const [consent, setConsent] = useState<"unknown" | "agreed" | "declined">("unknown");
  const [showConsent, setShowConsent] = useState(false);
  const [autoGu, setAutoGu] = useState("");   // 위치로 설정된 동네 표시(세션 한정)
  const [geoMsg, setGeoMsg] = useState("");
  const anonRef = useRef("");
  // 랜딩/역할 분리 + 사장님 인증 + 뒤로가기 안내
  const [role, setRole] = useState<"consumer" | "owner" | null>(null);
  const [ownerPwModal, setOwnerPwModal] = useState(false);
  const [ownerPw, setOwnerPw] = useState("");
  const [ownerErr, setOwnerErr] = useState("");
  const [ownerPin, setOwnerPin] = useState("");        // 사장님 키(PIN) 로그인
  const [ownerPinErr, setOwnerPinErr] = useState("");
  const [ownerAdminMode, setOwnerAdminMode] = useState(false); // 모달 내 '관리자 로그인' 토글
  const [showSignup, setShowSignup] = useState(false); // 7일 체험 신청 모달
  const [backToast, setBackToast] = useState(false);
  // 지도용 상태
  const [tasteKey, setTasteKey] = useState<string | null>(null);
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [dong, setDong] = useState(""); // 동/면 단위 — 선택 시 개별 카페, 미선택 시 집계
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false); // 지도 초기화 완료 신호(마커 재렌더용)

  useEffect(() => { fetch("/api/cafes").then((r) => r.json()).then((d) => setCafes(d.cafes ?? [])).catch(() => {}); }, []);
  // 자동 업데이트: 앱 복귀/포커스/로드 시 서버 배포버전과 비교 → 다르면 새로고침(PWA·PC·모바일 항상 최신). 같은 버전엔 1회만 시도(루프 방지).
  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!mine) return;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/version", { cache: "no-store" }).then((r) => r.json()).then((d) => {
        if (d?.v && d.v !== mine) {
          let last = ""; try { last = sessionStorage.getItem("dcn_rv") || ""; } catch {}
          if (last !== d.v) { try { sessionStorage.setItem("dcn_rv", d.v); } catch {} location.reload(); }
        }
      }).catch(() => {});
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    check();
    return () => { document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, []);
  // 공유 링크(/?cafe=id)로 도착하면 해당 카페 상세를 자동으로 연다(1회)
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !cafes.length || typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("cafe");
    if (id) { const c = cafes.find((x) => String(x.id) === id); if (c) { setSelected(c); deepLinked.current = true; } }
  }, [cafes]);
  // 취향 공유 링크(/?taste=key)로 도착하면 해당 결을 자동 선택
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("taste");
    if (t && TASTE_CHOICES.some((x) => x.key === t)) setTasteKey(t);
    // SEO 동네 페이지(/area/…)에서 '카페 더 보기'로 진입 → 랜딩 건너뛰고 소비자 화면 + 해당 지역 추천
    const region = sp.get("region");
    if (region) {
      try { sessionStorage.setItem("dcn_role", "consumer"); } catch {}
      setRole("consumer"); setHomeGu(region); setTab("home");
    }
    // 카카오 공유 링크(/?cafe=id)로 도착 → 랜딩 건너뛰고 소비자 화면 + 해당 카페 지역 로드.
    //   (지역 cafes가 로드되면 위 [cafes] 핸들러가 해당 카페 상세를 자동으로 연다)
    const cafeId = Number(sp.get("cafe"));
    if (cafeId) {
      try { sessionStorage.setItem("dcn_role", "consumer"); } catch {}
      setRole("consumer"); setTab("home");
      fetch(`/api/cafe-detail?id=${cafeId}`).then((r) => r.json()).then((d) => { if (d?.area) setHomeGu(d.area); }).catch(() => {});
    }
  }, []);

  // 익명 식별자 준비 + 역할(세션 단위) 복원. 위치 동의는 캐시하지 않음(매 세션 새로).
  useEffect(() => {
    try {
      let a = localStorage.getItem("dcn_anon");
      if (!a) { a = (crypto?.randomUUID?.() ?? `a${Date.now()}${Math.floor(Math.random() * 1e6)}`); localStorage.setItem("dcn_anon", a); }
      anonRef.current = a;
      fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonId: a }) }).catch(() => {});
      const r = sessionStorage.getItem("dcn_role"); // 새 세션이면 null → 랜딩부터
      if (r === "consumer" || r === "owner") setRole(r);
    } catch {}
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
        // 🎀 구독(featured) 카페가 500m 이내면 — 카페별 '하루 1회' 상세 모달 자동 노출(다음날 또 지나가면 다시)
        try {
          const KEY = "dcn_geo_promo";
          const today = new Date().toLocaleDateString();
          const seen: Record<string, string> = JSON.parse(localStorage.getItem(KEY) || "{}");
          const near = cafes
            .filter((c) => c.featured && c.lat && c.lng && seen[c.id] !== today)
            .map((c) => ({ c, d: distM(latitude, longitude, c.lat, c.lng) }))
            .filter((x) => x.d <= 500)
            .sort((a, b) => a.d - b.d);
          if (near.length) {
            setTimeout(() => setSelected(near[0].c), 600); // 위치 반영 후 살짝 뒤에
            seen[near[0].c.id] = today;
            localStorage.setItem(KEY, JSON.stringify(seen));
          }
        } catch {}
      },
      (err) => setGeoMsg(err.code === 1 ? "위치 권한이 거부됐어요 (브라우저 설정에서 허용 가능)" : "위치를 가져오지 못했어요"),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }, // 매번 현재 위치 새로 수집
    );
  };

  // 자동 감지 없음 — 사용자가 '내 위치' 버튼을 눌렀을 때만 동의→수집.
  const onAgree = () => { setShowConsent(false); setConsent("agreed"); postConsent(true); detectLocation(); };
  const onDecline = () => { setShowConsent(false); setConsent("declined"); postConsent(false); };
  const openLocation = () => { if (consent === "agreed") detectLocation(); else setShowConsent(true); };
  // 📍 '내 주변 500m' — 누를 때마다 현재 위치를 새로 받아 그 지점 반경 500m 카페만 렌더(서버 전송 없음, 클라이언트 전용).
  const showNearMe = () => {
    if (!navigator.geolocation) { setNearMsg("이 브라우저는 위치를 지원하지 않아요"); return; }
    setNearMsg("내 위치 확인 중…");
    setMyPinMode(false); setOthersMode(false); // 모드 상호배타
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setNearMe({ lat: latitude, lng: longitude });
        setNearMsg("");
        const map = mapObj.current;
        if (map) map.setView([latitude, longitude], 16); // 500m 반경이 화면에 들어오는 줌
      },
      (err) => setNearMsg(err.code === 1 ? "위치 권한이 거부됐어요 (브라우저 설정에서 허용 가능)" : "위치를 가져오지 못했어요"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }, // 누를 때마다 현재 위치 새로
    );
  };
  const clearNearMe = () => { setNearMe(null); setNearMsg(""); };
  const clearAuto = () => { setHomeSido(""); setHomeGu(""); setHomeDong(""); setAutoGu(""); setSido(""); setSigungu(""); setDong(""); setGeoMsg(""); };
  useEffect(() => { const u = homeGu ? `/api/discover?region=${encodeURIComponent(homeGu)}` : "/api/discover"; setDiscover(null); fetch(u).then((r) => r.json()).then((d) => { if (d.ok) setDiscover(d); }).catch(() => {}); }, [homeGu]);
  useEffect(() => { const u = homeGu ? `/api/momentum?region=${encodeURIComponent(homeGu)}` : "/api/momentum"; setMomentum(null); fetch(u).then((r) => r.json()).then((d) => { if (d.ok) setMomentum({ rising: d.rising ?? [] }); }).catch(() => {}); }, [homeGu]);

  const openById = useCallback((id: number) => { const c = cafes.find((x) => x.id === id); if (c) setSelected(c); }, [cafes]);

  // 뒤로가기 가드: 현재 UI 레이어를 ref로 추적(리스너에서 최신값 참조)
  const uiRef = useRef<{ selected: boolean; showSearch: boolean; showConsent: boolean; tab: string; role: string | null; ownerPwModal: boolean; showSignup: boolean; sido: string; sigungu: string; dong: string; nearMe: boolean }>({ selected: false, showSearch: false, showConsent: false, tab: "home", role: null, ownerPwModal: false, showSignup: false, sido: "", sigungu: "", dong: "", nearMe: false });
  uiRef.current = { selected: !!selected, showSearch, showConsent, tab, role, ownerPwModal, showSignup, sido, sigungu, dong, nearMe: !!nearMe };
  // 위에서 연 레이어를 우선순위대로 즉시 닫는다(공통). allowMapBack=false면 지도→홈은 건너뜀(지도 패닝과 충돌 방지).
  const closeTopLayer = (allowMapBack = true) => {
    const u = uiRef.current;
    if (u.showSignup) { setShowSignup(false); return true; }
    if (u.ownerPwModal) { setOwnerPwModal(false); return true; }
    if (u.showSearch) { setShowSearch(false); return true; }
    if (u.selected) { setSelected(null); return true; }
    if (u.showConsent) { setShowConsent(false); return true; }
    if (u.tab === "memory") { setTab("home"); return true; } // 추억 → 홈
    // 지도: 뒤로가기로 지역 계층을 올라감 (동→구/시→수도권 최상위(서울·인천·경기)→홈)
    if (u.tab === "map") {
      if (u.nearMe) { setNearMe(null); setNearMsg(""); return true; }               // 📍 내 주변 → 해제(일반 지도)
      if (u.dong) { setDong(""); return true; }                                    // 동/면 → 구/시(동 마커)
      if (u.sigungu) { setSido(""); setSigungu(""); setDong(""); return true; }     // 구/시 → 최상위(서울·인천·경기)
      // 최상위 지역선택 레벨(시도 구마커 또는 전체 서울/경기/인천) → 바로 홈. (중간 '전체' 거치는 한 단계 제거)
      if (u.sido) { setSido(""); setSigungu(""); setDong(""); setTab("home"); return true; } // 시도(구 마커) → 홈
      if (allowMapBack) { setTab("home"); return true; }                            // 전체(서울/경기/인천) → 홈
      return false;
    }
    if (u.tab === "home" && u.role !== null) { try { sessionStorage.removeItem("dcn_role"); } catch {} setRole(null); return true; } // 홈 → 랜딩
    return false;
  };
  // 뒤로가기 처리
  useEffect(() => {
    let last = 0;
    const doClose = (allowMap = true) => { if (Date.now() - last < 350) return false; const ok = closeTopLayer(allowMap); if (ok) last = Date.now(); return ok; };

    // history 기반(툴바·하드웨어 뒤로가기). 모든 플랫폼 유지 — 사이트를 벗어나지 않고 레이어를 닫음.
    history.pushState(null, "", location.href);
    let lastBack = 0;
    const rearm = () => history.pushState(null, "", location.href);
    const onPop = () => {
      if (doClose(true)) { rearm(); return; }
      if (Date.now() - lastBack < 2000) { window.removeEventListener("popstate", onPop); history.back(); return; }
      lastBack = Date.now(); setBackToast(true); setTimeout(() => setBackToast(false), 2000); rearm();
    };
    window.addEventListener("popstate", onPop);

    // iOS(PWA·Safari 공통): 좌측 엣지에서 우측으로 끄는 '뒤로가기 스와이프'의 느린 네이티브 슬라이드 애니메이션을
    // touchmove preventDefault로 차단하고, 직접 감지해 즉시 닫는다. (세로 스크롤·왼쪽 스와이프·탭은 그대로)
    let cleanupTouch = () => {};
    const isIOS = typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)));
    if (isIOS) {
      let sx = 0, sy = 0, edge = false, decided = false, block = false;
      const onStart = (e: TouchEvent) => {
        const t = e.touches[0]; edge = !!(t && t.clientX <= 26); decided = false; block = false;
        if (edge) { sx = t.clientX; sy = t.clientY; if (uiRef.current.tab === "map") { try { mapObj.current?.dragging?.disable(); } catch {} } } // 지도 패닝 잠시 끔(엣지 뒤로가기 우선)
      };
      const onMove = (e: TouchEvent) => {
        if (!edge) return;
        const t = e.touches[0]; if (!t) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (!decided) {
          if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
            decided = true;
            block = dx > 0 && Math.abs(dx) >= Math.abs(dy); // 오른쪽 수평 = 뒤로가기 → 차단. 세로/왼쪽 = 스크롤 허용
            if (!block) { edge = false; return; }
          } else { if (e.cancelable) e.preventDefault(); return; } // 방향 미정: 작은 움직임도 막아 네이티브 제스처 시작 억제
        }
        if (block && e.cancelable) e.preventDefault(); // 네이티브 느린 뒤로가기 슬라이드 차단(첫 움직임부터)
      };
      const onEnd = (e: TouchEvent) => {
        if (edge && block) { const t = e.changedTouches[0]; if (t && t.clientX - sx > 40 && Math.abs(t.clientY - sy) < 70) doClose(true); } // 모든 화면 동일: 오버레이/추억→홈/지도→홈/홈→랜딩
        if (edge && uiRef.current.tab === "map") { try { mapObj.current?.dragging?.enable(); } catch {} } // 지도 패닝 복구
        edge = false; decided = false; block = false;
      };
      document.addEventListener("touchstart", onStart, { passive: true });
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("touchend", onEnd, { passive: true });
      cleanupTouch = () => { document.removeEventListener("touchstart", onStart); document.removeEventListener("touchmove", onMove); document.removeEventListener("touchend", onEnd); };
    }

    return () => { window.removeEventListener("popstate", onPop); cleanupTouch(); };
  }, []);

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

  // 지도: 처음 '지도' 탭을 열 때(컨테이너가 실제로 보일 때) 1회 초기화하고 이후 계속 유지.
  // 탭 전환 시 파괴/재생성하지 않음 → 전환 즉각. 단 랜딩(role===null) 복귀 시엔 div가 사라지므로 파괴.
  useEffect(() => {
    if (role === null) { // 랜딩으로 이탈 → 분리된 DOM에 남지 않게 파괴(재진입 시 새로 초기화)
      if (mapObj.current) { try { mapObj.current.remove(); } catch {} mapObj.current = null; layerRef.current = null; setMapReady(false); }
      return;
    }
    if (tab !== "map" || mapObj.current) return; // 지도 탭을 실제로 열 때 1회 초기화(숨김 상태 초기화 금지)
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !mapRef.current || mapObj.current) return;
      LRef.current = L;
      mapObj.current = L.map(mapRef.current, { zoomControl: true, attributionControl: true }).setView([37.5, 127.05], 10);
      mapObj.current.attributionControl.setPrefix("");
      // ⚠️ 래스터 OSM은 항상 깔면 안 됨 — Leaflet z-index 상 벡터 캔버스를 덮어 녹지가 그대로 보였음(검증 완료).
      //    그래서 벡터 '초기화 실패 시에만' 폴백으로 깐다.
      // 🗺️ 벡터 OSM(OSM Liberty) — 녹지·토지구획·산·지형래스터를 꺼 도로·시설·역·카페가 또렷. 한글 라벨 유지.
      try {
        const maplibregl = (await import("maplibre-gl")).default;
        await import("maplibre-gl/dist/maplibre-gl.css");
        await import("@maplibre/maplibre-gl-leaflet");
        (window as any).maplibregl = maplibregl;
        const gl = (L as any).maplibreGL({ style: "https://tiles.openfreemap.org/styles/liberty", attribution: "&copy; OpenStreetMap" });
        gl.addTo(mapObj.current);
        // 커피 테마와 조화 — 벡터 위에 아주 옅은 크림 톤(tilePane=벡터 캔버스). 라벨 가독성 유지되는 약한 강도.
        const tp = mapObj.current.getPane("tilePane");
        if (tp) tp.style.filter = "sepia(0.1) saturate(0.96) brightness(1.01)";
        const ml = gl.getMaplibreMap();
        (window as any).__ml = ml; // 디버그 핸들
        mlRef.current = ml; // 레이어 토글용
        // 전 세계 한글 표기 — name:ko 우선(없으면 현지명→로마자). ko가 없는 한국 지명은 name이 한글이라 안전.
        const KO_LABEL: any = ["coalesce", ["get", "name:ko"], ["get", "name"], ["get", "name:latin"]];
        // 녹지숨김·크림·한글 적용 — 1회만. 레이스(스타일이 리스너보다 먼저 로드) 방지: 즉시+load+styledata 모두에서 시도하되,
        // 스타일이 완전히 로드된 뒤 단 한 번 적용(setX가 다시 styledata를 유발 → applied 플래그로 무한루프 차단).
        let applied = false;
        const applyVectorStyle = () => {
          if (applied) return;
          let style: any;
          try { if (!(ml.isStyleLoaded && ml.isStyleLoaded())) return; style = ml.getStyle(); } catch { return; }
          if (!style || !style.layers) return;
          applied = true;
          try { ml.setPaintProperty("background", "background-color", "#f3ecdb"); } catch {}
          for (const ly of style.layers) {
            const sl = (ly as any)["source-layer"] || "";
            // 지형 음영 래스터(natural_earth/ne2) → 숨김. 저해상도가 확대돼 큰 녹색 덩어리로 보이던 원인.
            if (ly.type === "raster") { try { ml.setLayoutProperty(ly.id, "visibility", "none"); } catch {} continue; }
            // 토지구획(지적도) 파셀만 숨김 — landuse_residential/pitch/track/school 등
            if (sl === "landuse" || (/landuse/i.test(ly.id) && ly.type === "fill")) {
              try { ml.setLayoutProperty(ly.id, "visibility", "none"); } catch {}
              continue;
            }
            // 산·녹지(공원/숲/잔디): '색+이름'만 — 옅고 차분한 녹색으로 보이게(빽빽한 텍스처 없이). 이름 라벨은 심볼이라 유지됨.
            if ((sl === "landcover" || sl === "park") && (ly.type === "fill" || ly.type === "fill-extrusion")) {
              try { ml.setPaintProperty(ly.id, "fill-color", "#d7e4c2"); ml.setPaintProperty(ly.id, "fill-opacity", 0.5); ml.setLayoutProperty(ly.id, "visibility", "visible"); } catch {}
              continue;
            }
            if (ly.type === "fill" && /building/i.test(ly.id)) { try { ml.setPaintProperty(ly.id, "fill-color", "#ece2cf"); ml.setPaintProperty(ly.id, "fill-outline-color", "#dccfb4"); } catch {} continue; }
            // 주요 도로 강조색(웜 앰버) — 큰길이 한눈에. 물길/철도는 기본 유지.
            if (ly.type === "line" && /(motorway|trunk|primary)/i.test(ly.id) && !/casing|bridge|tunnel/i.test(ly.id)) {
              try { ml.setPaintProperty(ly.id, "line-color", "#e6a23c"); } catch {}
            }
            if (ly.type === "symbol") {
              const tf = (ly as any).layout && (ly as any).layout["text-field"];
              if (tf && JSON.stringify(tf).includes("name")) {
                try { ml.setLayoutProperty(ly.id, "text-field", KO_LABEL); } catch {}
              }
              // 🏪 POI(상호·상가)를 풍성하게 — 더 일찍 보이게(줌 2단계↓) + 가독성 헤일로 + 강조색(교통=파랑, 그 외=커피브라운)
              if (/poi/i.test(ly.id)) {
                try { if (typeof (ly as any).minzoom === "number") ml.setLayerZoomRange(ly.id, Math.max(11, (ly as any).minzoom - 3), (ly as any).maxzoom ?? 24); } catch {}
                try { ml.setPaintProperty(ly.id, "text-color", /transit/i.test(ly.id) ? "#235a86" : "#4a3526"); } catch {}
                try { ml.setPaintProperty(ly.id, "text-halo-color", "#fdf7ec"); ml.setPaintProperty(ly.id, "text-halo-width", 1.4); } catch {}
                try { ml.setLayoutProperty(ly.id, "icon-size", 1.15); } catch {}
                // 최대 줌인 시 교회·음식점·상가까지 '다 보이게' — 고줌(z16 아이콘 / z17 글자)에서 겹침 허용(그 아래는 정갈하게 충돌처리)
                try { ml.setLayoutProperty(ly.id, "icon-allow-overlap", ["step", ["zoom"], false, 16, true]); } catch {}
                try { ml.setLayoutProperty(ly.id, "text-allow-overlap", ["step", ["zoom"], false, 17, true]); } catch {}
                try { ml.setLayoutProperty(ly.id, "text-optional", true); } catch {}
              }
            }
          }
          // 초기 토글 상태(길이름/버스정류장) 반영
          try { applyTogglesToMap(ml, showStreetsRef.current, showBusRef.current); } catch {}
        };
        ml.on("load", applyVectorStyle);
        ml.on("styledata", applyVectorStyle); // 스타일 로드/변경 시마다 시도(레이스 방지의 핵심, applied로 1회 보장)
        applyVectorStyle(); // 이미 로드됐으면 즉시
        ml.on("error", () => {}); // 벡터 타일 일시 오류는 무시
      } catch {
        // 벡터 초기화 실패(예: WebGL 미지원) → 래스터 OSM 폴백(이 경우에만)
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapObj.current);
      }
      layerRef.current = L.layerGroup().addTo(mapObj.current);
      // 🇰🇷 독도·울릉도 — 항상 표시(영토 표현). layerRef가 아니라 맵에 직접 붙여 drawMarkers 갱신에도 유지.
      L.marker([37.2429, 131.8665], { icon: L.divIcon({ className: "", html: makeIslandHtml("독도"), iconSize: [0, 0] }), interactive: false, zIndexOffset: 500 }).addTo(mapObj.current);
      L.marker([37.4845, 130.9057], { icon: L.divIcon({ className: "", html: makeIslandHtml("울릉도"), iconSize: [0, 0] }), interactive: false, zIndexOffset: 500 }).addTo(mapObj.current);
      setTimeout(() => mapObj.current?.invalidateSize(), 60);
      setMapReady(true); // 초기화 완료 → 마커 effect 재실행 트리거
    })();
    return () => { cancelled = true; };
  }, [tab, role]);
  // 지도 탭 재진입 시 사이즈 보정(숨김→표시 전환 대응). 여러 타이밍에 호출해 확실히 렌더.
  useEffect(() => {
    if (tab === "map" && mapObj.current) {
      const ts = [50, 200, 450].map((d) => setTimeout(() => mapObj.current?.invalidateSize(), d));
      return () => ts.forEach(clearTimeout);
    }
  }, [tab]);

  // '지도에서 위치 보기' — 지도 준비되면 해당 좌표로 이동(핀은 아래 마커 effect가 그림)
  useEffect(() => {
    if (tab !== "map" || !focusTarget || !mapReady || !mapObj.current) return;
    mapObj.current.invalidateSize();
    mapObj.current.setView([focusTarget.lat, focusTarget.lng], 16, { animate: true });
    setFocusTarget(null);
  }, [tab, focusTarget, mapReady]);

  const filtered = useMemo(() => cafes.filter((c) => {
    if (!c.lat || !c.lng) return false;
    const g = toGu(c.area);
    if (sido && g.sido !== sido) return false;
    if (sigungu && g.sigungu !== sigungu) return false;
    if (dong && (c.dong || "기타") !== dong) return false;
    return true;
  }), [cafes, sido, sigungu, dong]);
  const matchSet = useMemo(() => {
    if (!tasteKey) return new Set<number>();
    return new Set(filtered.filter((c) => ((c.char_scores ?? {})[tasteKey] ?? 0) > 0).map((c) => c.id));
  }, [filtered, tasteKey]);
  // 전체 카페 대비 '결' 상대분포 — 카페 강점/아쉬운점 산출용(한 번 계산해 상세패널에 전달).
  const axisDist = useMemo<AxisDist>(() => buildAxisDist(cafes), [cafes]);

  // 현재 지도 화면(bounds)+줌에 맞춰 마커를 그린다 — 줌인하면 그 영역 핀이 동적으로 드러나고, 줌아웃이면 화면 안 인기순 상위만.
  const drawMarkers = useCallback(() => {
    const L = LRef.current; const map = mapObj.current;
    if (!L || !map || !layerRef.current) return;
    layerRef.current.clearLayers();

    // 🚇 호선 노선 라인 — 가장 아래 깔아 '역들이 호선으로 연결된' 느낌. z≥11부터.
    //   실선(호선색) + 얇은 흰 케이싱 → 전철 노선도 룩. 비클릭. 화면 안 노선만.
    {
      const lz = map.getZoom();
      if (lines.length && lz >= 11) {
        const lb = map.getBounds().pad(0.35);
        const w = lz >= 16 ? 4 : lz >= 14 ? 3.2 : lz >= 12 ? 2.4 : 1.8;
        const cas: any[] = [], col: any[] = []; // 케이싱 전부 먼저(아래) → 색선(위): 교차역 흰테 안 겹침
        for (const ln of lines) for (const seg of ln.segs) {
          if (!seg.some(([la, lo]) => lb.contains([la, lo] as [number, number]))) continue;
          cas.push(L.polyline(seg, { color: "#ffffff", weight: w + 2.5, opacity: 0.7, interactive: false, lineJoin: "round", lineCap: "round" }));
          col.push(L.polyline(seg, { color: ln.color, weight: w, opacity: lz >= 13 ? 0.9 : 0.7, interactive: false, lineJoin: "round", lineCap: "round" }));
        }
        if (cas.length) layerRef.current.addLayer(L.layerGroup([...cas, ...col]));
      }
    }

    // ===== 📍 내 주변 500m: 현재 위치 + 반경 원 + 500m 이내 카페만 =====
    if (nearMe) {
      const R = 500;
      layerRef.current.addLayer(L.circle([nearMe.lat, nearMe.lng], { radius: R, color: "#2f6fb0", weight: 1.5, fillColor: "#2f6fb0", fillOpacity: 0.08, interactive: false }));
      layerRef.current.addLayer(L.marker([nearMe.lat, nearMe.lng], { icon: L.divIcon({ className: "", html: makeMyLocHtml(), iconSize: [0, 0] }), zIndexOffset: 6000, interactive: false }));
      const near = cafes.filter((c) => c.lat && c.lng && distM(nearMe.lat, nearMe.lng, c.lat, c.lng) <= R);
      const markers = near.map((c) => L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html: makePinHtml(c, matchSet.has(c.id), c.id === focusId, myCafeIds.has(c.id)), iconSize: [0, 0] }), zIndexOffset: c.id === focusId ? 3000 : c.featured ? 2000 : 100 }).on("click", () => setSelected(c)));
      layerRef.current.addLayer(L.layerGroup(markers));
      return;
    }

    // ===== 내 카페(MY PIN) / 다른 사람 모드: 개별 표시(집계 안 함) =====
    if (myPinMode || othersMode) {
      const inScope = (p: { area: string }) => {
        if (!sido && !sigungu) return true;
        const g = toGu(p.area);
        if (sido && g.sido !== sido) return false;
        if (sigungu && g.sigungu !== sigungu) return false;
        return true;
      };
      const op = othersMode ? othersPins.filter(inScope) : [];
      const othersCntById = new Map(op.map((p) => [p.id, p.cnt] as [number, number]));
      const maxCnt = op.reduce((m, p) => Math.max(m, p.cnt), 1);
      const base = myPinMode ? filtered.filter((c) => myCafeIds.has(c.id)) : [];
      const markers = base.map((c) => {
        const isMine = myCafeIds.has(c.id);
        const cnt = othersCntById.get(c.id) ?? 0;
        const html = isMine && cnt > 0 ? makeMinePinHtml(c, cnt) : makePinHtml(c, matchSet.has(c.id), c.id === focusId, isMine);
        return L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html, iconSize: [0, 0] }), zIndexOffset: 4000 }).on("click", () => setSelected(c));
      });
      if (othersMode && op.length) for (const p of op) {
        if (myPinMode && myCafeIds.has(p.id)) continue;
        markers.push(L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html: makeCountPinHtml(p, maxCnt), iconSize: [0, 0] }), zIndexOffset: 500 + p.cnt }).on("click", () => { const cf = cafes.find((c) => c.id === p.id); if (cf) setSelected(cf); }));
      }
      layerRef.current.addLayer(L.layerGroup(markers));
      return;
    }

    // ===== 줌 기반 계층(자유 줌·이동도 자연스럽게). 화면이 곧 상태: 시도→구→동 집계, z≥15/동선택=개별 카페 실시간 =====
    const z = map.getZoom();
    const b = map.getBounds().pad(0.2);
    // z≥13(구·동네 줌)부터 카페 — 단, 개별 핀이 아니라 '클러스터'로 묶어 깔끔하게(아래). 광역만 행정 집계.
    const level = (dong || focusId || z >= 13) ? "cafe"
      : sigungu ? "dong"
      : (sido || z >= 11) ? "gu"
      : "sido";
    if (level !== "cafe") {
      const keyFn = level === "sido" ? (c: Cafe) => toGu(c.area).sido
        : level === "gu" ? (c: Cafe) => toGu(c.area).sigungu
        : (c: Cafe) => c.dong || "기타";
      // 시도(전역 개요)는 전체 카페로 고정중심 집계, 구·동은 '화면 안' 카페만 집계 → 이동/줌 시 실시간으로 드러남.
      const gsrc = level === "sido" ? filtered : filtered.filter((c) => b.contains([c.lat, c.lng] as [number, number]));
      const groups = new Map<string, { lat: number; lng: number; n: number }>();
      for (const c of gsrc) {
        const k = keyFn(c); if (!k) continue;
        const g = groups.get(k) ?? { lat: 0, lng: 0, n: 0 };
        g.lat += c.lat; g.lng += c.lng; g.n++; groups.set(k, g);
      }
      // 시도 레벨은 고정 중심(경기는 서울을 둘러싸 centroid가 서울 위에 겹침). 구·동은 데이터 centroid.
      const arr = [...groups.entries()].map(([k, g]) => {
        const fixed = level === "sido" ? SIDO_CENTER[k] : undefined;
        return { key: k, lat: fixed ? fixed[0] : g.lat / g.n, lng: fixed ? fixed[1] : g.lng / g.n, n: g.n };
      });
      const maxN = arr.reduce((m, g) => Math.max(m, g.n), 1);
      const markers = arr.map((g) => L.marker([g.lat, g.lng], { icon: L.divIcon({ className: "", html: makeRegionPinHtml(g.key, g.n, maxN), iconSize: [0, 0] }), zIndexOffset: g.n })
        .on("click", () => {
          if (level === "sido") { setSido(g.key); setSigungu(""); setDong(""); }
          else if (level === "gu") { setSigungu(g.key); setDong(""); }
          else setDong(g.key);
        }));
      layerRef.current.addLayer(L.layerGroup(markers));
      return;
    }

    // z≥13 카페 레벨: 픽셀 그리드 클러스터링 — 가까운 카페는 ●N 뭉치, 단독은 핀. 줌인하면 셀이 작아져 자동 분리.
    //   마커 수가 화면 셀 수(~수십개)로 한정 → 카페가 몇천이든 항상 깔끔. 이동/줌 시 뷰포트 재클러스터.
    // ★ 항상 전체 카페에서 '현재 화면(viewport)'만 거른다. 지역 선택(시/구/동)은 지도를 그쪽으로 옮길 뿐,
    //   카페 집합을 고정하지 않는다 → 이동하면 그 화면 카페로 계속 바뀜(선택 지역에 고정 안 됨).
    const src = cafes.filter((c) => c.lat && c.lng);
    const inView = src.filter((c) => b.contains([c.lat, c.lng] as [number, number]));
    const CELL = 64; // 화면상 셀 크기(px) — 이 안의 카페끼리 한 뭉치. 줌인하면 px 간격 벌어져 쪼개짐.
    const cells = new Map<string, Cafe[]>();
    for (const c of inView) {
      const p = map.project([c.lat, c.lng], z);
      const k = Math.floor(p.x / CELL) + ":" + Math.floor(p.y / CELL);
      const arr = cells.get(k); if (arr) arr.push(c); else cells.set(k, [c]);
    }
    const markers: any[] = [];
    let focusM: any = null;
    const addPin = (c: Cafe, forceFocus = false) => {
      const isFocus = forceFocus || c.id === focusId, isMatch = matchSet.has(c.id), isMine = myCafeIds.has(c.id);
      const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html: makePinHtml(c, isMatch, isFocus, isMine), iconSize: [0, 0] }), zIndexOffset: isFocus ? 3000 : c.featured ? 2000 : isMatch ? 1000 : 0 }).on("click", () => setSelected(c));
      if (isFocus) { m.bindPopup(`<b>${c.name}</b><br>${c.area}`); focusM = m; }
      markers.push(m);
    };
    for (const items of cells.values()) {
      const fIdx = focusId ? items.findIndex((c) => c.id === focusId) : -1; // 포커스 카페는 뭉치지 말고 단독 핀
      let pts = items;
      if (fIdx >= 0) { addPin(items[fIdx], true); pts = items.filter((_, i) => i !== fIdx); }
      if (pts.length === 0) continue;
      if (pts.length === 1) { addPin(pts[0]); continue; }
      const cx = pts.reduce((s, c) => s + c.lat, 0) / pts.length; // 2개+ → 클러스터 뱃지(centroid), 클릭 시 줌인
      const cy = pts.reduce((s, c) => s + c.lng, 0) / pts.length;
      const hasMatch = pts.some((c) => matchSet.has(c.id));
      markers.push(L.marker([cx, cy], { icon: L.divIcon({ className: "", html: makeClusterHtml(pts.length, hasMatch), iconSize: [0, 0] }), zIndexOffset: 100 }).on("click", () => map.setView([cx, cy], Math.min(z + 2, 18), { animate: true })));
    }
    // 🚇🏬 지하철역·대형 랜드마크 — 개별 카페(동) 레벨에서만, 화면 안만. 카페보다 아래·비클릭.
    if (z >= 13) {
      if (landmarks.length) {
        // 큰 랜드마크(우선순위≥3: 몰·백화점·대학·경기장·타워·공항·궁·테마파크)만, 화면당 최대 8개 — 군더더기 제거
        const lms = landmarks
          .filter(([, la, lo, , pr]) => pr >= 3 && b.contains([la, lo] as [number, number]))
          .sort((a, c) => c[4] - a[4])
          .slice(0, 8);
        const lmLayer = lms.map(([nm, la, lo, ic]) => L.marker([la, lo], { icon: L.divIcon({ className: "", html: makeLandmarkHtml(nm, ic), iconSize: [0, 0] }), interactive: false, zIndexOffset: -800 }));
        if (lmLayer.length) layerRef.current.addLayer(L.layerGroup(lmLayer));
      }
      if (stations.length) {
        const stns = stations.filter((s) => b.contains([s.lat, s.lng] as [number, number])).slice(0, 20);
        const stnLayer = stns.map((s) => L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html: makeStationHtml(s.n, s.c, s.r), iconSize: [0, 0] }), interactive: false, zIndexOffset: -300 }));
        if (stnLayer.length) layerRef.current.addLayer(L.layerGroup(stnLayer));
      }
      // 지하철 출구 — z≥15에서, 화면 안 최대 26개. 연결선 없이 출구 마커만 도드라지게(역 근처에 모여 보임).
      if (z >= 15 && exits.length) {
        const exs = exits.filter((e) => b.contains([e.lat, e.lng] as [number, number])).slice(0, 26);
        const exLayer = exs.map((e) => L.marker([e.lat, e.lng], { icon: L.divIcon({ className: "", html: makeExitHtml(e.n), iconSize: [0, 0] }), interactive: false, zIndexOffset: 200 }));
        if (exLayer.length) layerRef.current.addLayer(L.layerGroup(exLayer));
      }
    }
    layerRef.current.addLayer(L.layerGroup(markers));
    if (focusM) (focusM as any).openPopup();
  }, [filtered, matchSet, sido, sigungu, dong, focusId, myPinMode, myCafeIds, othersMode, othersPins, cafes, stations, exits, lines, landmarks, nearMe]);

  // 데이터/지역/모드 변경 시: 화면을 맞춘 뒤 마커를 그린다(맞춘 화면 기준으로 그려짐).
  useEffect(() => {
    const L = LRef.current; const map = mapObj.current;
    if (!L || !map || !layerRef.current) return;
    if (nearMe) { drawMarkers(); return; } // 📍 내 주변 모드: showNearMe가 이미 setView함 → flyTo 충돌 방지, 그리기만
    if (focusId) {
      /* focus effect가 setView 처리 */
    } else if (myPinMode || othersMode) {
      const src = myPinMode ? filtered.filter((c) => myCafeIds.has(c.id)) : othersPins;
      const pts = src.map((c: any) => [c.lat, c.lng] as [number, number]).filter((p) => p[0] && p[1]);
      if (pts.length) map.flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: pts.length === 1 ? 14 : 15, duration: 0.45 });
      else if (sido && SIDO_CENTER[sido]) { const [la, ln, z] = SIDO_CENTER[sido]; map.flyTo([la, ln], z, { duration: 0.45 }); }
    } else if (filtered.length > 0 && (sido || sigungu)) {
      // 선택 지역으로 부드럽게 '줌인' → 하위(구/동) 집계 마커 표시. 이상치(엉뚱한 좌표) 4%는 무시해야 경계가 안 부풀고 제대로 줌인됨.
      const la = filtered.map((c) => c.lat).sort((a, b) => a - b);
      const ln = filtered.map((c) => c.lng).sort((a, b) => a - b);
      const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))];
      // 2%만 클리핑(엉뚱 좌표 제거) — 너무 자르면 경기 외곽시(포천·평택 등)가 빠지므로 지역이 화면에 꽉 차게.
      const bounds = L.latLngBounds([[q(la, 0.02), q(ln, 0.02)], [q(la, 0.98), q(ln, 0.98)]]);
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15, duration: 0.45 });
    } else if (sido && SIDO_CENTER[sido]) { const [la, ln, z] = SIDO_CENTER[sido]; map.flyTo([la, ln], z, { duration: 0.45 }); }
    else { map.flyTo([37.5, 127.05], 9, { duration: 0.45 }); } // 전체(시도 미선택) → 수도권 전역으로 부드럽게 줌아웃해 시도 집계 원형 표시
    drawMarkers();
    // 주의: 의존성에 tab을 넣지 말 것(탭 전환마다 재렌더되어 느려짐). 데이터/필터 변경 시에만.
  }, [filtered, matchSet, sido, sigungu, focusId, mapReady, myPinMode, myCafeIds, othersMode, othersPins, drawMarkers, nearMe]);

  // 이동 중 실시간 재클러스터(드래그·관성 throttle) + 멈춤 시 최종. 클러스터라 마커 수가 적어(~수십개) 이동마다 갱신해도 가볍고 깔끔.
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !mapReady) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const live = () => { if (timer) return; timer = setTimeout(() => { timer = null; drawMarkers(); }, 120); }; // 유저 드래그 중 ~120ms마다 재클러스터(반응)
    const final = () => { if (timer) { clearTimeout(timer); timer = null; } drawMarkers(); }; // 멈춤·줌끝·날아가기 끝 → 최종 1회
    map.on("drag", live);   // ★ 유저 손가락 팬에만 라이브 → flyTo(뒤로가기 줌아웃)·줌 중엔 안 걸려 전환이 매끄러움(끝나서 한 번만 재그림)
    map.on("moveend", final);
    return () => { map.off("drag", live); map.off("moveend", final); if (timer) clearTimeout(timer); };
  }, [drawMarkers, mapReady, dong, focusId, myPinMode, othersMode]);

  // 길이름·버스정류장 토글 → 벡터 레이어 visibility 적용(스타일 로드 후엔 styledata로도 한 번 더 보장)
  useEffect(() => {
    if (!mapReady) return;
    applyTogglesToMap(mlRef.current, showStreets, showBus);
    const ml = mlRef.current;
    if (ml) { const h = () => applyTogglesToMap(ml, showStreetsRef.current, showBusRef.current); ml.once && ml.once("idle", h); }
  }, [showStreets, showBus, mapReady]);

  // 다른 사람은 — 토글 켜면 집계 핀 로드(한 번)
  useEffect(() => {
    if (!othersMode || othersPins.length) return;
    fetch(`/api/my-cafe/popular?device=${deviceId}`).then((r) => r.json()).then((d) => { if (d.ok) setOthersPins(d.pins ?? []); }).catch(() => {});
  }, [othersMode, deviceId]);

  const onSido = (v: string) => { setSido(v); setSigungu(""); setDong(""); setFocusId(null); };
  const onSigungu = (v: string) => { setSigungu(v); setDong(""); setFocusId(null); };
  // 현재 시군구의 동/면 목록(카페 보유 동만) — 계층 셀렉트·집계용
  const dongOptions = useMemo(() => sigungu ? [...new Set(cafes.filter((c) => toGu(c.area).sigungu === sigungu && c.dong).map((c) => c.dong as string))].sort() : [], [cafes, sigungu]);
  const homeDongOptions = useMemo(() => homeGu ? [...new Set(cafes.filter((c) => toGu(c.area).sigungu === homeGu && c.dong).map((c) => c.dong as string))].sort() : [], [cafes, homeGu]);

  // ===== 잡지 카드 컴포넌트 =====
  const chooseConsumer = () => { try { sessionStorage.setItem("dcn_role", "consumer"); } catch {} setRole("consumer"); };
  const submitOwner = async () => {
    setOwnerErr("");
    try {
      const r = await fetch("/api/admin/stats", { headers: { "x-admin-password": ownerPw } });
      if (r.status === 401) { setOwnerErr("비밀번호가 올바르지 않아요"); return; }
      if (!r.ok) { setOwnerErr("확인에 실패했어요. 잠시 후 다시"); return; }
      try { sessionStorage.setItem("dcn_role", "owner"); sessionStorage.setItem("dcn_owner_pw", ownerPw); } catch {}
      setOwnerPwModal(false); setRole("owner");
    } catch { setOwnerErr("네트워크 오류"); }
  };
  // 사장님 키(PIN) 로그인 — 발급받은 키로 본인 카페 분석 화면(/owner)으로 바로 진입.
  const submitOwnerPin = async () => {
    setOwnerPinErr("");
    const pin = ownerPin.trim().toUpperCase();
    if (pin.length < 6) { setOwnerPinErr("키(PIN)를 입력하세요"); return; }
    try {
      const r = await fetch("/api/owner-auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const d = await r.json();
      if (!d.ok) { setOwnerPinErr(d.error ?? "유효하지 않은 키예요"); return; }
      try {
        sessionStorage.setItem("dcn_owner_pin", pin);
        sessionStorage.setItem("dcn_owner_cafe", JSON.stringify({ id: d.cafeId, name: d.cafeName }));
      } catch {}
      window.location.href = "/owner"; // 내 카페 분석으로 바로
    } catch { setOwnerPinErr("네트워크 오류"); }
  };

  // ── 랜딩(초기화면): 소비자 / 사장님 분리 ──
  if (role === null) {
    return (
      <div className="flex flex-col items-center justify-center px-6 overflow-y-auto" style={{ position: "fixed", inset: 0, paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", background: "#2b2018", color: "#f4ece0", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }}>
        <style>{`
          @keyframes dcnRise { from { opacity:0; transform: translateY(22px); } to { opacity:1; transform: translateY(0); } }
          /* 홀로그램: 무지갯빛이 가로로 천천히 흐르며 미세하게 색조가 도는 은은한 효과(평평·베벨 없음) */
          @keyframes dcnHolo { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
          .dcn-rise { animation: dcnRise .4s cubic-bezier(.2,.7,.2,1) both; }
          .dcn-title {
            display:inline-block;
            background: linear-gradient(100deg,#efe2cd 0%,#f3d7a8 28%,#e8b87a 50%,#f3d7a8 72%,#efe2cd 100%);
            background-size: 220% auto; -webkit-background-clip:text; background-clip:text;
            -webkit-text-fill-color:transparent; color:transparent;
            animation: dcnRise .45s cubic-bezier(.2,.7,.2,1) both, dcnHolo 9s ease-in-out .45s infinite;
          }
          @keyframes dcnSteam {
            0%   { opacity:0; transform: translateY(2px) translateX(0) scaleX(.8); }
            22%  { opacity:.5; }
            55%  { transform: translateY(-18px) translateX(5px) scaleX(1.25); }
            100% { opacity:0; transform: translateY(-38px) translateX(-4px) scaleX(1.5); }
          }
          .dcn-cup { position:relative; display:inline-block; }
          .dcn-steam { position:absolute; top:-22px; width:9px; height:28px; border-radius:50%;
            background: linear-gradient(to top, rgba(244,236,224,0), rgba(244,236,224,.5)); filter: blur(5px); opacity:0; pointer-events:none; }
          .dcn-s1 { left:39%; animation: dcnSteam 4.4s ease-in-out 1.4s infinite; }
          .dcn-s2 { left:50%; animation: dcnSteam 5.0s ease-in-out 2.2s infinite; }
          .dcn-s3 { left:61%; animation: dcnSteam 4.7s ease-in-out 3.0s infinite; }
          /* 진입 심볼: 은은히 둥실 + 홀로그램 색조가 미세하게 도는 효과 */
          @keyframes dcnFade { from { opacity:0; } to { opacity:1; } }
          @keyframes dcnFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
          @keyframes dcnSymHolo { 0%,100% { filter: hue-rotate(0deg) saturate(1); } 50% { filter: hue-rotate(-13deg) saturate(1.12); } }
          .dcn-symbol { display:block; margin:0 auto 12px; animation: dcnFade .9s ease both, dcnFloat 6s ease-in-out .9s infinite, dcnSymHolo 9s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) { .dcn-rise,.dcn-title { animation: dcnRise .01s both; } .dcn-title{ -webkit-text-fill-color:#f4ece0; color:#f4ece0; } .dcn-steam{ display:none; } .dcn-symbol{ animation: dcnFade .01s both; } }
        `}</style>
        <div className="dcn-cup mb-5">
          <h1 className="dcn-title text-[2.9rem] sm:text-[3.3rem] leading-[1.12] font-bold tracking-tight">동네 커피 노트</h1>
        </div>
        <p className="dcn-rise text-[17px] text-[#f4ece0] mb-1.5 text-center leading-snug font-bold" style={{ animationDelay: ".05s" }}>별점도 광고도 아닌, <span className="text-[#e8b87a]">진짜 후기</span>.</p>
        <p className="dcn-rise text-[15px] text-[#f4ece0] mb-2 text-center leading-relaxed font-bold" style={{ animationDelay: ".1s" }}>우리 동네 카페, <span className="text-[#e8b87a]">진짜 후기만 가려</span> 골라드려요.</p>
        <p className="dcn-rise text-[13px] text-[#cbb89f] mb-5 text-center leading-relaxed" style={{ animationDelay: ".14s" }}>마음에 든 곳은 <span style={{ color: "#d6336c" }}>❤</span>로 <b className="text-[#f4ece0]">나만의 동네 지도</b>에.</p>
        <div className="dcn-rise flex flex-wrap justify-center gap-1.5 mb-8 max-w-xs" style={{ animationDelay: ".16s" }}>
          {["별점, 이제 그만 믿어요", "리뷰 옥석만 남겼어요"].map((t) => (
            <span key={t} className="text-[12px] text-[#e8b87a] border border-[#5b4636] rounded-full px-3 py-1 whitespace-nowrap">{t}</span>
          ))}
        </div>
        <div className="dcn-rise w-full max-w-sm space-y-3" style={{ animationDelay: ".18s" }}>
          <button onClick={chooseConsumer} className="w-full bg-[#f4ece0] text-[#2b2018] rounded-2xl py-5 px-5 text-left shadow-lg active:scale-[0.99] transition">
            <div className="text-lg font-bold">☕ 우리 동네 카페 보러가기</div>
            <div className="text-[12px] text-[#7c6a55] mt-0.5">진짜 후기로 검증 · 내 취향에 딱 맞게</div>
          </button>
          <button onClick={() => { setOwnerPw(""); setOwnerErr(""); setOwnerPin(""); setOwnerPinErr(""); setOwnerAdminMode(false); setOwnerPwModal(true); }} className="w-full border border-[#9c6b3f] text-[#f4ece0] rounded-2xl py-5 px-5 text-left active:scale-[0.99] transition">
            <div className="text-lg font-bold">🏪 사장님, 우리 카페 보러가기</div>
            <div className="text-[12px] text-[#cbb89f] mt-0.5">검증된 후기로 내 카페 경쟁력 진단 · <b className="text-[#e8b87a]">7일 무료 체험</b></div>
          </button>
        </div>
        <p className="text-[10px] text-[#8a7458] mt-10 text-center leading-relaxed">네이버·구글·유튜브 공개 후기 교차검증 + AI 맥락 판정<br />광고·협찬·무관 글은 자동 제외</p>
        <div className="mt-3 text-[10px] text-[#8a7458] flex gap-3">
          <a href="/area" className="underline">동네별 카페</a>
          <a href="/privacy" className="underline">개인정보처리방침</a>
          <a href="/terms" className="underline">이용약관</a>
        </div>

        {ownerPwModal && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOwnerPwModal(false)} />
            <div className="relative bg-[#fdfaf4] text-[#2b2018] w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              {/* 우측 상단: 7일 무료 체험 */}
              <button onClick={() => setShowSignup(true)} className="absolute top-4 right-4 text-[11px] font-bold bg-[#e8b87a] text-[#2b2018] px-3 py-1.5 rounded-full shadow active:scale-95">✨ 7일 무료 체험</button>
              {ownerAdminMode ? (
                <>
                  <h3 className="text-lg font-bold mb-1">🔒 관리자 로그인</h3>
                  <p className="text-[13px] text-[#6b5a48] mb-3">관리자 비밀번호를 입력하세요.</p>
                  <input autoFocus type="password" value={ownerPw} onChange={(e) => setOwnerPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitOwner()}
                    placeholder="관리자 비밀번호" className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white mb-2" />
                  {ownerErr && <p className="text-[12px] text-[#c0392b] mb-2">{ownerErr}</p>}
                  <div className="flex gap-2">
                    <button onClick={submitOwner} className="flex-1 bg-[#2b2018] text-[#f4ece0] rounded-xl py-2.5 font-medium">확인</button>
                    <button onClick={() => setOwnerPwModal(false)} className="px-4 text-[#9c6b3f]">취소</button>
                  </div>
                  <button onClick={() => { setOwnerAdminMode(false); setOwnerErr(""); }} className="block w-full text-center text-[12px] text-[#9c6b3f] underline mt-3">← 사장님 키 로그인</button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold mb-1 pr-24">🏪 사장님 로그인</h3>
                  <p className="text-[13px] text-[#6b5a48] mb-3">이메일로 받은 <b>키(PIN)</b>를 입력하면 내 카페 분석으로 바로 들어갑니다.</p>
                  <input autoFocus value={ownerPin} onChange={(e) => setOwnerPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitOwnerPin()}
                    placeholder="발급받은 키(PIN)" className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white mb-2 tracking-widest font-mono uppercase" />
                  {ownerPinErr && <p className="text-[12px] text-[#c0392b] mb-2">{ownerPinErr}</p>}
                  <div className="flex gap-2">
                    <button onClick={submitOwnerPin} className="flex-1 bg-[#2b2018] text-[#f4ece0] rounded-xl py-2.5 font-bold">내 카페 들어가기</button>
                    <button onClick={() => setOwnerPwModal(false)} className="px-4 text-[#9c6b3f]">취소</button>
                  </div>
                  <p className="text-[12px] text-[#6b5a48] text-center mt-3">키가 없으세요? <button onClick={() => setShowSignup(true)} className="text-[#9c6b3f] font-bold underline">7일 무료 체험 신청</button></p>
                  <button onClick={() => { setOwnerAdminMode(true); setOwnerPinErr(""); }} className="block w-full text-center text-[11px] text-[#bcae98] underline mt-2">관리자세요? 관리자 로그인</button>
                </>
              )}
            </div>
          </div>
        )}
        <OwnerSignupModal open={showSignup} onClose={() => setShowSignup(false)} trial />
        {backToast && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[6000] bg-[#f4ece0] text-[#2b2018] text-sm px-5 py-3 rounded-full shadow-xl">
            한 번 더 누르면 나가요
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-[#f4ece0]" style={{ position: "fixed", inset: 0, fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }}>
      <header className="shrink-0 bg-[#2b2018] text-[#f4ece0] z-[1500] flex items-center justify-between px-4 gap-3" style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => { try { sessionStorage.removeItem("dcn_role"); } catch {} setRole(null); }} className="text-lg font-bold shrink-0 dcn-shimmer" aria-label="랜딩으로">동네 커피 노트</button>
          {/* 홈/지도/추억 토글 */}
          <div className="flex bg-[#3d2f22] rounded-full p-0.5">
            {(["home", "map", "memory"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 sm:px-3 py-1.5 text-xs font-bold rounded-full transition-colors whitespace-nowrap ${tab === t ? "bg-[#f4ece0] text-[#2b2018]" : "text-[#cbb89f]"}`}>
                {t === "home" ? "홈" : t === "map" ? "지도" : "추억"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0 items-center">
          {role === "owner" ? (
            <>
              <a href="/owner" className="bg-[#9c6b3f] rounded-full px-3 py-1.5 text-xs whitespace-nowrap">내 카페 분석</a>
              <a href="/cafe/register" className="bg-[#3d2f22] rounded-full px-3 py-1.5 text-xs whitespace-nowrap hidden sm:inline-block">사장님 등록</a>
            </>
          ) : (
            <button onClick={() => { try { sessionStorage.removeItem("dcn_role"); } catch {} setRole(null); }} className="text-[11px] text-[#cbb89f] underline whitespace-nowrap">사장님이세요?</button>
          )}
        </div>
      </header>

      {/* 홈 = 잡지 1면 */}
      {tab === "home" && (
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "3.25rem" }}>
          <div className="max-w-2xl mx-auto px-5 py-6">
            <div className="text-center mb-6">
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#9c6b3f]">데이터로 큐레이션하는</div>
              <div className="text-xl font-bold border-y-2 border-[#2b2018] py-2 mt-1 dcn-shimmer-dark">{homeGu ? `${homeGu}의 오늘의 커피` : "오늘의 동네 커피"}</div>
              {/* 시·도 → 시·군·구 → 동·면 계층 선택(우리 동네). 검색 돋보기 제거. */}
              <div className="flex gap-1.5 justify-center mt-3 flex-wrap">
                <select value={homeSido} onChange={(e) => { setHomeSido(e.target.value); setHomeGu(""); setHomeDong(""); }} className="border border-[#cbb89f] rounded-lg px-2.5 py-2 text-sm bg-white text-[#2b2018]">
                  <option value="">시·도</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={homeGu} onChange={(e) => { setHomeGu(e.target.value); setHomeDong(""); }} disabled={!homeSido} className="border border-[#cbb89f] rounded-lg px-2.5 py-2 text-sm bg-white text-[#2b2018] disabled:opacity-40">
                  <option value="">시·군·구</option>{homeSido && REGIONS[homeSido].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={homeDong} onChange={(e) => { const d = e.target.value; setHomeDong(d); if (d) { setSido(homeSido); setSigungu(homeGu); setDong(d); setFocusId(null); setSheetOpen(false); setTab("map"); } }} disabled={!homeGu || !homeDongOptions.length} className="border border-[#cbb89f] rounded-lg px-2.5 py-2 text-sm bg-white text-[#2b2018] disabled:opacity-40">
                  <option value="">{homeGu && !homeDongOptions.length ? "우리 동네 (수집중)" : "우리 동네"}</option>{homeDongOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
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
                {discover.headlineA && <HeadlineCard c={discover.headlineA} kicker="이번 주 가장 많이 이야기된 곳" tone={0} onOpen={openById} />}
                {discover.headlineB && <HeadlineCard c={discover.headlineB} kicker="🔥 커피에 진심인 집 — 스페셜티 스포트라이트" tone={1} onOpen={openById} />}
                {discover.featured && discover.featured.length > 0 && <Row title="✨ 추천 카페" items={discover.featured} onOpen={openById} sub="쇼케이스" info={<>사장님이 직접 <b>홍보 중인 쇼케이스 카페</b>예요(우선 노출). 후기·등급은 다른 카페와 똑같이 검증된 값이에요.</>} />}
                {momentum && momentum.rising.length > 0 && <Row title="📈 요즘 뜨는 카페" items={momentum.rising.slice(0, 5)} onOpen={openById} sub="최근 입소문 순" info={<>별점 대신 <b>검증된 진짜 후기가 요즘 얼마나 빨리 느는지</b>로 뽑은 '뜨는 카페'예요. 최근 3개월 검증 후기가 많을수록 상위로 올라가요.</>} />}
                <Row title="🏆 리뷰 많은 Top 3" items={discover.top3} onOpen={openById} sub="검증 리뷰 많은 순" info={<>이 동네에서 <b>검증·참고 후기(옥석)가 가장 많은</b> 카페 순서예요. 광고·가짜·무관 글은 제외한 '진짜 후기 수' 기준입니다.</>} />
                <Row title="🔥 스페셜티 픽" items={discover.specialty} onOpen={openById} sub="로스팅 언급 순" info={<>검증된 카페 중 <b>직접 로스팅·스페셜티가 후기에 자주 언급된</b> 곳이에요. 커피에 진심인 집 위주로 보여줘요.</>} />
                <button onClick={() => { setSido(homeSido); setSigungu(homeGu); setDong(homeDong); setFocusId(null); setSheetOpen(false); setTab("map"); }} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-medium mt-2">🗺 {homeDong ? `${homeDong} 지도로 보기` : homeGu ? `${homeGu} 지도로 보기` : "지도에서 전체 둘러보기"} →</button>
              </>
            )}
            <p className="text-[10px] text-[#a8927a] mt-6 text-center leading-relaxed">모든 큐레이션은 네이버 공개 후기를 교차검증한 데이터 기반입니다.</p>
          </div>

        </div>
      )}

      {/* 지도 탭 */}
      {/* 지도 블록은 항상 마운트하고 비활성 탭에선 숨김 → 탭 전환 시 지도 파괴/재생성 없음(빠른 전환) */}
      <div className="flex-1 relative md:flex overflow-hidden" style={{ display: tab === "map" ? undefined : "none" }}>
          <div className="absolute inset-0 md:relative md:flex-1 md:p-5">
            <div ref={mapRef} className="w-full h-full md:rounded-2xl overflow-hidden bg-[#e8e0d3] z-0" />
            {/* 내 카페(MY PIN) / 다른 사람은 — 지도 상단 */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100] flex gap-2 max-w-[calc(100vw-1.5rem)]">
              <button onClick={showNearMe} aria-label="내 주변 500m"
                className={`inline-flex items-center gap-1 h-9 px-3.5 rounded-full text-[12px] font-bold shadow-lg whitespace-nowrap transition-colors ${nearMe ? "text-white" : "bg-white text-[#2f6fb0] border border-[#bcd4ea]"}`}
                style={nearMe ? { background: "#2f6fb0" } : {}}>
                <span className="text-[14px] leading-none">📍</span>
                <span>내 주변{nearMe ? " ↻" : ""}</span>
              </button>
              <button onClick={() => { setNearMe(null); if (myLocked) { setTab("memory"); return; } if (myPinMode) { setMyPinMode(false); return; } explainSuppressed("mine") ? setMyPinMode(true) : setExplain("mine"); }}
                className={`inline-flex items-center gap-1 h-9 px-3.5 rounded-full text-[12px] font-bold shadow-lg whitespace-nowrap transition-colors ${myPinMode ? "text-white" : "bg-white text-[#d6336c] border border-[#f0c4d4]"}`}
                style={myPinMode ? { background: "#d6336c" } : {}}>
                <span className="text-[14px] leading-none">{myLocked ? "🔒" : "❤"}</span>
                <span>내 카페{!myLocked && myCafeIds.size ? ` ${myCafeIds.size}` : ""}</span>
              </button>
              <button onClick={() => { setNearMe(null); if (othersMode) { setOthersMode(false); return; } explainSuppressed("others") ? setOthersMode(true) : setExplain("others"); }} aria-label="다른 사람은"
                className={`inline-flex items-center gap-1 h-9 px-3.5 rounded-full text-[12px] font-bold shadow-lg whitespace-nowrap transition-colors ${othersMode ? "text-white" : "bg-white text-[#5f7355] border border-[#cfe0c2]"}`}
                style={othersMode ? { background: "#5f7355" } : {}}>
                <span className="text-[14px] leading-none">👥</span>
                <span>다른 사람은{othersMode && othersPins.length ? ` ${othersPins.length}` : ""}</span>
              </button>
            </div>
            {/* 🗺️ 지도 표시 토글 — 우측(상단 컨트롤과 겹치지 않게 한 줄 아래로) */}
            <div className="absolute top-14 right-3 z-[1100] flex flex-col gap-1.5 items-end">
              <button onClick={() => setShowStreets((v) => !v)}
                className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors ${showStreets ? "bg-[#5b4636] text-white" : "bg-white/95 text-[#8a7458] border border-[#e0d3bd]"}`}>
                <span className="text-[12px] leading-none">🏷️</span><span>상세 {showStreets ? "ON" : "OFF"}</span>
              </button>
              <button onClick={() => setShowBus((v) => !v)}
                className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors ${showBus ? "bg-[#235a86] text-white" : "bg-white/95 text-[#8a7458] border border-[#bcd0e0]"}`}>
                <span className="text-[12px] leading-none">🚌</span><span>버스 {showBus ? "ON" : "OFF"}</span>
              </button>
            </div>
            {/* 📍 내 주변 안내/해제 — 활성 또는 안내 메시지 있을 때 */}
            {(nearMe || nearMsg) && (
              <div className="absolute top-[3.25rem] left-1/2 -translate-x-1/2 z-[1100] bg-white/95 backdrop-blur rounded-full shadow-lg px-3 py-1.5 text-[11px] text-[#23527c] flex items-center gap-2 whitespace-nowrap">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#2f6fb0" }} />
                {nearMsg ? <span>{nearMsg}</span> : <><span>내 위치 반경 <b>500m</b> 카페</span><button onClick={clearNearMe} className="text-[#8a7458] font-bold ml-0.5">✕ 해제</button></>}
              </div>
            )}
            {/* 범례 — 두 핀의 의미 안내(켜졌을 때만). 같은 카페면 핀이 하나로 병합됨 */}
            {(myPinMode || othersMode) && (
              <div className="absolute top-3 left-3 z-[1100] bg-white/95 backdrop-blur rounded-xl shadow-lg px-3 py-2 text-[11px] text-[#4a3a2a] leading-snug max-w-[150px]">
                {myPinMode && <div className="flex items-center gap-1.5 mb-0.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#d6336c" }} />❤ 내가 저장한 카페</div>}
                {othersMode && <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#5f7355" }} />숫자 = 저장한 사람 수</div>}
                {myPinMode && othersMode && <div className="mt-1 pt-1 border-t border-[#eee2d2] text-[10px] text-[#8a7458]">같은 카페면 ❤에 인원 배지로 합쳐져요</div>}
              </div>
            )}
          </div>
          {/* MapControls(지역/결/목록)는 무겁다(전체 정렬). 지도 탭일 때만 마운트 → 다른 화면 상태변경 시 재조정/정렬 안 함. 지도 div는 위에서 항상 유지. */}
          {tab === "map" && (<>
          <aside className="hidden md:block md:w-[380px] md:h-full bg-[#fdfaf4] border-l border-[#ece0cd] overflow-y-auto p-6 relative z-10">
            <MapControls {...{ sido, sigungu, dong, onSido, onSigungu, setDong, dongOptions, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto, closeSheet: () => { setFocusId(null); setSheetOpen(false); } }} />
          </aside>
          <div className="md:hidden absolute left-0 right-0 bg-[#fdfaf4] rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.18)] z-[1200] flex flex-col transition-transform duration-300 ease-out will-change-transform" style={{ bottom: "3.25rem", height: "72dvh", transform: sheetOpen ? "translateY(0)" : "translateY(calc(72dvh - 2.75rem))" }}>
            {/* 접힘 시 정확히 이 핸들(2.75rem)까지만 보이게 — 아래 목록이 삐져나오지 않음 */}
            <button onClick={() => setSheetOpen((o) => !o)} className="shrink-0 w-full flex flex-col items-center justify-center gap-1" style={{ height: "2.75rem" }} aria-expanded={sheetOpen}>
              <div className="w-9 h-1 bg-[#cbb89f] rounded-full" />
              <span className="text-[11px] font-bold text-[#9c6b3f] leading-none">{sheetOpen ? "지도 보기 ▾" : `지역·필터 펼치기 ▴ (${filtered.length})`}</span>
            </button>
            <div className="flex-1 overflow-y-auto px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
              <MapControls {...{ sido, sigungu, dong, onSido, onSigungu, setDong, dongOptions, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto, closeSheet: () => { setFocusId(null); setSheetOpen(false); } }} />
            </div>
          </div>
          </>)}
        </div>

      {tab === "memory" && <MemoryTab device={deviceId} visits={myVisits} locked={myLocked} sessionPin={sessionPin}
        onRegister={() => { setEditCafeId(null); setShowMyCafeReg(true); }}
        onEdit={(id: number) => { setEditCafeId(id); setShowMyCafeReg(true); }}
        onUnlock={(p: string) => { try { sessionStorage.setItem("dcn_pin", p); } catch {} setSessionPin(p); setMyLocked(false); reloadMyCafes(deviceId, p); }}
        onLock={() => { try { sessionStorage.removeItem("dcn_pin"); } catch {} setSessionPin(""); reloadMyCafes(deviceId, ""); }}
        onRestore={(dev: string) => { try { localStorage.setItem("dcn_device", dev); } catch {} setDeviceId(dev); reloadMyCafes(dev, ""); }} />}

      {/* 하단 빠른 액션 바 — 모바일 전용. 뷰포트 바닥에 직접 고정 + 안전영역(홈인디케이터)까지 바 색으로 채움(네이버 방식) */}
      <nav className="md:hidden flex items-stretch" style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: "3.25rem", zIndex: 1300, background: tab === "map" ? "#fdfaf4" : "#f4ece0", boxShadow: "0 -1px 0 rgba(0,0,0,0.06)" }}>
        {[
          { k: "home", label: "홈", icon: <path d="M3 11.2 12 4l9 7.2M5.5 9.7V20h13V9.7" />, fill: false },
          { k: "fav", label: "즐겨찾기", icon: <path d="M12 4.5l2.3 4.7 5.2.8-3.75 3.65.9 5.15L12 16.9l-4.65 2.45.9-5.15L4.5 10l5.2-.8z" />, fill: true },
          { k: "search", label: "검색", icon: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>, fill: false },
          { k: "loc", label: "내 위치", icon: <><path d="M12 21c4.2-4 7-7.2 7-10.5A7 7 0 0 0 5 10.5C5 13.8 7.8 17 12 21Z" /><circle cx="12" cy="10.5" r="2.4" /></>, fill: false },
        ].map((a) => (
          <button key={a.k} onClick={() => {
            if (a.k === "home") setTab("home");
            else if (a.k === "fav") setShowFavs(true);
            else if (a.k === "search") { setSearchRes(null); setSearchQ(""); setShowSearch(true); }
            else openLocation();
          }} className="flex-1 flex flex-col items-center justify-center gap-0.5 active:bg-[#f0e6d4]" aria-label={a.label}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill={a.fill ? "#d6336c" : "none"} stroke={a.fill ? "#d6336c" : "#8a7458"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{a.icon}</svg>
            <span className="text-[10px] font-bold leading-none whitespace-nowrap" style={{ color: a.fill ? "#d6336c" : "#8a7458" }}>{a.label}</span>
          </button>
        ))}
      </nav>
      {showFavs && <FavoritesModal items={cafes.filter((c) => bookmarkIds.has(c.id))} onClose={() => setShowFavs(false)}
        onOpen={(c: Cafe) => { setShowFavs(false); setSelected(c); }}
        onRemove={(id: number) => toggleBookmark(id)} />}
      {showMyCafeReg && <MyCafeRegModal cafes={cafes} device={deviceId} visits={myVisits} pin={sessionPin} initialCafeId={editCafeId} onClose={() => { setShowMyCafeReg(false); setEditCafeId(null); }} onDone={() => { reloadMyCafes(deviceId, sessionPin); }} />}

      {selected && <CafePanel cafe={selected} dist={axisDist} bookmarked={bookmarkIds.has(selected.id)} onToggleBookmark={() => toggleBookmark(selected.id)} onClose={() => setSelected(null)} onMap={() => {
        if (selected.lat && selected.lng) {
          const g = toGu(selected.area);
          if (g.sido) { setSido(g.sido); setSigungu(g.sigungu); }
          setFocusTarget({ lat: selected.lat, lng: selected.lng });
          setFocusId(selected.id);
        }
        setSheetOpen(false); setSelected(null); setTab("map");
      }} />}

      {/* 내 카페 / 다른 사람 — 처음 켤 때 설명 모달(닫기=표시, 일주일 안보기) */}
      {explain && (
        <div className="fixed inset-0 z-[4500] flex items-center justify-center p-5">
          <div className="absolute inset-0 bg-black/45" onClick={() => { const t = explain; setExplain(null); revealMode(t); }} />
          <div className="relative bg-[#fdfaf4] w-full max-w-sm rounded-2xl shadow-2xl p-5">
            {explain === "mine" ? (
              <>
                <div className="text-[16px] font-bold text-[#d6336c] mb-2">❤ 내 카페</div>
                <p className="text-[13.5px] text-[#3d2f22] leading-relaxed">내가 머문 카페, 그날의 커피와 순간을 <b>❤로 기록한 추억</b>들이에요. 지도 위에 하나둘 모아 <b>나만의 추억 지도</b>를 그려가요. <span className="text-[#a8927a]">(이 기기에만 소중히 담겨요.)</span></p>
              </>
            ) : (
              <>
                <div className="text-[16px] font-bold text-[#5f7355] mb-2">👥 다른 사람은</div>
                <p className="text-[13.5px] text-[#3d2f22] leading-relaxed">다른 사람들이 <b>마음에 담아둔 카페</b>들이에요. 추억이 많이 쌓인 곳일수록 크게 피어나, <b>동네에서 사랑받는 카페</b>가 한눈에 보여요.</p>
              </>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => { const t = explain; setExplain(null); revealMode(t); }} className="flex-1 bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-sm font-bold">닫기</button>
              <button onClick={() => { const t = explain; suppressExplain(t); setExplain(null); revealMode(t); }} className="flex-1 bg-white border border-[#cbb89f] text-[#6b5a48] rounded-lg py-2.5 text-[13px]">일주일 동안 보지 않기</button>
            </div>
          </div>
        </div>
      )}

      {/* 느낌으로 검색 (시맨틱 + exact, 선택 동네 범위) */}
      {showSearch && (
        <div className="fixed inset-0 z-[4000] flex items-start justify-center sm:p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSearch(false)} />
          <div className="relative bg-[#fdfaf4] w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[85vh] sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden" style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }}>
            <div className="shrink-0 p-4 border-b border-[#ece0cd]">
              <div className="flex items-center gap-2">
                <input autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch(searchQ)}
                  placeholder={`느낌 또는 ☕카페 이름으로 찾기`} className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white text-[#2b2018]" />
                <button onClick={() => runSearch(searchQ)} className="bg-[#2b2018] text-[#f4ece0] rounded-lg px-4 py-2.5 text-sm font-medium shrink-0">검색</button>
                <button onClick={() => setShowSearch(false)} className="text-2xl text-[#9c6b3f] leading-none px-1 shrink-0">×</button>
              </div>
              <div className="text-[11px] text-[#5f7355] mt-2 font-medium">💡 “비 오는 날 조용히” 같은 <b>느낌</b>은 물론, <b>카페 이름</b>을 바로 적어도 찾아드려요.</div>
              <div className="text-[11px] text-[#a8927a] mt-1">{homeGu ? `📍 ${homeGu} 안에서` : "수도권 전체에서"} 검색</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SEARCH_EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => runSearch(ex)} className="text-[11px] text-[#6b5a48] bg-[#f0e6d4] rounded-full px-2.5 py-1">{ex}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
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
      {backToast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[5000] bg-[#2b2018] text-[#f4ece0] text-sm px-5 py-3 rounded-full shadow-xl border border-[#9c6b3f]">
          한 번 더 누르면 나가요
        </div>
      )}
    </div>
  );
}

function MapControls({ sido, sigungu, dong, onSido, onSigungu, setDong, dongOptions, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto, closeSheet }: any) {
  // 정렬: 카테고리(결) 선택 시 그 결이 강한 순, 아니면 검증 리뷰 많은 순. 검색범주 안에서도 동일 기준.
  const sortLabel = tasteKey ? `'${TASTE_CHOICES.find((t: any) => t.key === tasteKey)?.label}' 결 강한 순` : "검증 리뷰 많은 순";
  // 전체 정렬은 무거우므로 메모이즈 — 모달 열고닫기 등으로 재렌더돼도 filtered/tasteKey/matchSet가 그대로면 재정렬 안 함.
  const listCafes: Cafe[] = useMemo(() => [...(tasteKey ? filtered.filter((c: Cafe) => matchSet.has(c.id)) : filtered)].sort((a: Cafe, b: Cafe) => {
    if (tasteKey) { const d = ((b.char_scores ?? {})[tasteKey] ?? 0) - ((a.char_scores ?? {})[tasteKey] ?? 0); if (d) return d; }
    return (b.synth_count ?? 0) - (a.synth_count ?? 0);
  }), [filtered, tasteKey, matchSet]);
  return (
    <>
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="text-sm font-bold text-[#52402e]">📍 지역</div>
          {autoGu
            ? <span className="text-[11px] text-[#5f7355] bg-[#eef3ea] border border-[#cfe0c2] rounded-full px-2 py-0.5">내 위치 <b>{autoGu}</b></span>
            : <button onClick={openLocation} className="text-[11px] text-white bg-[#5f7355] rounded-full px-2.5 py-1 font-medium">📍 내 위치로</button>}
        </div>
        <div className="flex gap-1.5">
          <select value={sido} onChange={(e) => onSido(e.target.value)} className="flex-1 min-w-0 border border-[#cbb89f] rounded-lg px-2.5 py-2.5 text-[15px] bg-white text-[#2b2018]">
            <option value="">시·도</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sigungu} onChange={(e) => onSigungu(e.target.value)} disabled={!sido} className="flex-1 min-w-0 border border-[#cbb89f] rounded-lg px-2.5 py-2.5 text-[15px] bg-white text-[#2b2018] disabled:opacity-50">
            <option value="">시·군·구</option>{sido && REGIONS[sido].map((g: string) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={dong} onChange={(e) => { const d = e.target.value; setDong(d); if (d && closeSheet) closeSheet(); }} disabled={!sigungu || !(dongOptions?.length)} className="flex-1 min-w-0 border border-[#cbb89f] rounded-lg px-2.5 py-2.5 text-[15px] bg-white text-[#2b2018] disabled:opacity-50">
            <option value="">{sigungu && !(dongOptions?.length) ? "우리 동네(수집중)" : "우리 동네"}</option>{(dongOptions ?? []).map((d: string) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {geoMsg && <div className="text-[10px] text-[#a8927a] mt-1.5">{geoMsg}</div>}
        {(sido || sigungu || dong) && <button onClick={() => { if (clearAuto) clearAuto(); else { onSido(""); } }} className="text-xs text-[#9c6b3f] underline mt-2">전체</button>}
      </div>
      <div className="mb-5">
        <div className="text-sm font-bold text-[#52402e] mb-2.5 flex items-center gap-1.5">☕ 어떤 카페 찾으세요?<InfoDot title="'결'로 거르기"><b>결</b>은 후기에서 자주 언급되는 카페의 성격이에요(조용·작업·디저트·로스팅 등). 고르면 그 결이 강한 카페만 핀·목록에 뜨고, <b>그 결이 많이 언급된 순</b>으로 정렬돼요. 측정값이 아니라 '리뷰에서 자주 나온 정도'입니다.</InfoDot></div>
        <div className="grid grid-cols-2 gap-2.5">
          {TASTE_CHOICES.map((t) => (
            <button key={t.key} onClick={() => setTasteKey(tasteKey === t.key ? null : t.key)} className={`rounded-xl p-3 text-left border transition-colors ${tasteKey === t.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#2b2018] border-[#cbb89f]"}`}>
              <div className="text-xl mb-0.5">{t.emoji}</div><div className="text-xs font-bold">{t.label}</div>
              <div className={`text-[10px] mt-0.5 ${tasteKey === t.key ? "text-[#d4a574]" : "text-[#a8927a]"}`}>{t.desc}</div>
            </button>
          ))}
        </div>
        {tasteKey && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-[#9c6b3f]">'{TASTE_CHOICES.find((t) => t.key === tasteKey)?.label}' 결이 자주 언급되는 {matchSet.size}곳만 보는 중</p>
            <a href={`/taste/${tasteKey}`} className="text-[11px] font-bold text-[#9c6b3f] border border-[#d9c9b0] rounded-full px-2.5 py-1 shrink-0 whitespace-nowrap">🔗 내 취향 공유</a>
          </div>
        )}
      </div>
      <div>
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="text-sm font-bold text-[#52402e]">목록 ({listCafes.length}{tasteKey ? ` · ${TASTE_CHOICES.find((t: any) => t.key === tasteKey)?.label}` : ""})</div>
          <div className="text-[10px] text-[#9c6b3f] shrink-0">↕ {sortLabel}</div>
        </div>
        {listCafes.length === 0 ? <p className="text-xs text-[#a8927a] bg-[#f4ece0] rounded-lg p-4">{tasteKey ? "이 카테고리에 해당하는 카페가 이 지역엔 없어요. 다른 결을 골라보세요." : "지역을 선택하면 목록이 나와요."}</p> : (
          <div className="space-y-2">
            {listCafes.slice(0, 50).map((c: Cafe) => (
              <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left bg-[#f4ece0] rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-[#2b2018]">{c.name}</span>
                  {c.synth_grade && GRADE_STYLE[c.synth_grade] && <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: GRADE_STYLE[c.synth_grade].bg }}>{GRADE_STYLE[c.synth_grade].label}</span>}
                  {tasteKey && matchSet.has(c.id) && <span className="text-[10px] text-[#5f7355]">✓</span>}
                  <span className="text-[10px] text-[#a8927a] ml-auto">{c.area} · 리뷰 {c.synth_count ?? 0}</span>
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

// 후기 인용문에서 소비자가 한눈에 파악하도록 핵심어를 형광펜 강조.
// 길이 내림차순(긴 표현 우선 매칭). 메뉴·맛표현·공간/분위기·추천신호.
const HL_TERMS = [
  // 메뉴 (긴 것 우선)
  "아메리카노","에스프레소","카푸치노","플랫화이트","핸드드립","콜드브루","디카페인","싱글오리진","아인슈페너","바닐라라떼","말차라떼","크로플","휘낭시에","마들렌","티라미수","크루아상","브런치","베이글","스콘","쿠키","케이크","디저트","라떼","드립","원두","로스팅","빵",
  // 맛 표현
  "부드러운","부드럽","고소한","고소","산미","진하고","진한","달콤","달달","쌉싸름","풍미","향긋","깔끔","담백","구수",
  // 공간/분위기
  "분위기","인테리어","아늑","감성","조용","루프탑","테라스","통창","채광","햇살","빈티지","모던","넓은","넓고","아담","좌석","자리","콘센트","작업하기","공부하기","뷰가","뷰",
  // 서비스/추천 신호
  "친절","사장님","인생","최고","강추","추천","재방문","또 가고","만족","예쁜","예쁘","아기자기","분좋카",
];
const HL_RE = new RegExp("(" + HL_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
const HL_SET = new Set(HL_TERMS);
function hlQuote(text?: string) {
  if (!text) return text ?? "";
  return text.split(HL_RE).map((p, i) =>
    HL_SET.has(p)
      ? <b key={i} style={{ fontWeight: 600, color: "#2b2018", background: "linear-gradient(transparent 58%, #f6dca6 58%)", borderRadius: "1px", padding: "0 1px" }}>{p}</b>
      : <span key={i}>{p}</span>
  );
}

function CafePanel({ cafe, dist, onClose, onMap, bookmarked = false, onToggleBookmark }: { cafe: Cafe; dist: AxisDist; onClose: () => void; onMap: () => void; bookmarked?: boolean; onToggleBookmark?: () => void }) {
  const g = cafe.synth_grade ? GRADE_STYLE[cafe.synth_grade] : null;
  const [reviews, setReviews] = useState<EvidenceReview[]>([]);
  const [quality, setQuality] = useState<QualityStats | null>(null);
  const [llmJudged, setLlmJudged] = useState(false);
  const [loadingRev, setLoadingRev] = useState(true);
  const [promo, setPromo] = useState<any>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<"all" | "verified" | "reference" | "ai" | "youtube">("all");
  const [userReviews, setUserReviews] = useState<{ memory: string; photos: string[]; favorite: boolean; date: string }[]>([]); // 공개 방문자 후기
  useEffect(() => {
    let live = true; setLoadingRev(true); setPromo(null); setUserReviews([]);
    fetch(`/api/cafe-detail?id=${cafe.id}`).then((r) => r.json()).then((d) => { if (live) { setReviews(d.reviews ?? []); setQuality(d.quality ?? null); setLlmJudged(!!d.llmJudged); setLoadingRev(false); } }).catch(() => { if (live) setLoadingRev(false); });
    fetch(`/api/owner-promo?cafeId=${cafe.id}`).then((r) => r.json()).then((d) => { if (live && d.promo && (d.promo.ai_headline || d.promo.video_url)) { setPromo(d.promo); trackPromo(cafe.id, "view"); } }).catch(() => {});
    fetch(`/api/cafe-reviews?cafeId=${cafe.id}`).then((r) => r.json()).then((d) => { if (live && d.ok) setUserReviews(d.reviews ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [cafe.id]);
  const kept = quality ? quality.verified + quality.reference : 0;
  const chars = topChars(cafe, 4);
  const profile = useMemo(() => cafeProfile(cafe, dist), [cafe, dist]); // 전체 대비 강점/아쉬운점
  const [shared, setShared] = useState(false);
  // 부드러운 슬라이드인 등장 — 마운트 직후 한 프레임 뒤 transition을 트리거(오른쪽에서 미끄러져 들어옴).
  const [shown, setShown] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  const shareCafe = async () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : "https://dongnecoffeenote.com"}/c/${cafe.id}`;
    const title = `${cafe.name} (${cafe.area}) — 동네 커피 노트`;
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) await (navigator as any).share({ title, text: title, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 1800); }
    } catch { /* 사용자 취소 */ }
  };
  return (
    <div className="fixed inset-0 z-[3000] overflow-hidden" style={{ fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }}>
      <div onClick={onClose} className={`absolute inset-0 bg-black/30 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute top-0 right-0 w-full md:max-w-md bg-[#fdfaf4] shadow-2xl overflow-y-auto transition-transform duration-300 ease-out motion-reduce:transition-none ${shown ? "translate-x-0" : "translate-x-full"}`} style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }}>
        {/* 사장님 쇼케이스 — 영상(style 0) 또는 10종 템플릿 */}
        {promo && (
          <>
            <style dangerouslySetInnerHTML={{ __html: SHOWCASE_CSS }} />
            {promo.style === 0 && promo.video_url ? (
              // 🖼 액자형 — 따뜻한 매트 + 패딩 + 테두리·그림자
              <div className="w-full px-4 pt-4 pb-3" style={{ background: "linear-gradient(135deg,#f4ece0,#e8dcc8)" }}>
                <div className="relative rounded-xl overflow-hidden shadow-lg ring-1 ring-[#cbb89f] bg-black">
                  <video src={promo.video_url} controls playsInline preload="metadata" onPlay={() => trackPromo(cafe.id, "play")} className="w-full block bg-black" style={{ maxHeight: "22rem" }} />
                  <span className="absolute top-2.5 left-2.5 z-10 text-[9px] font-bold text-[#2b2018] bg-[#e8b87a] px-2.5 py-1 rounded-full shadow-md pointer-events-none">🎀 사장님 쇼케이스</span>
                </div>
                <div className="text-center text-[10px] text-[#9c6b3f] mt-2 tracking-wide">사장님이 직접 올린 우리 가게 영상</div>
              </div>
            ) : (
              <div onClick={() => trackPromo(cafe.id, "click")}>
                <ShowcaseBanner style={promo.style || 1} headline={promo.ai_headline} tagline={promo.ai_tagline} points={Array.isArray(promo.ai_points) ? promo.ai_points : []} photo={promo.photos?.[0] || null} height="16rem" />
              </div>
            )}
            {/* 🎟 방문 혜택(쿠폰) */}
            {promo.coupon && (
              <div className="flex items-center gap-2 bg-[#fff4e0] border-y border-[#e8d3a8] px-4 py-2.5">
                <span className="text-[15px]">🎟</span>
                <span className="text-[13px] text-[#7a4f1a] font-medium leading-snug flex-1">{promo.coupon}</span>
                <span className="text-[9px] text-[#b08a4a] shrink-0">사장님 제공</span>
              </div>
            )}
          </>
        )}
        {/* 상단 테마 배너 — 5종 랜덤, 액자 느낌 */}
        {!promo && (
          <div style={{ background: "#2b2018", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} className="w-full px-5 pt-5 pb-4">
            <style>{`
              @keyframes dcnHoloB { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
              .dcn-title-b {
                display: inline-block;
                background: linear-gradient(100deg,#efe2cd 0%,#f3d7a8 28%,#e8b87a 50%,#f3d7a8 72%,#efe2cd 100%);
                background-size: 220% auto; -webkit-background-clip: text; background-clip: text;
                -webkit-text-fill-color: transparent; color: transparent;
                animation: dcnHoloB 9s ease-in-out infinite;
              }
            `}</style>
            <div className="dcn-title-b text-[1.15rem] font-bold tracking-tight leading-snug mb-1">동네 커피 노트</div>
            <p className="text-[11px] leading-relaxed" style={{ color: "#cbb89f" }}>
              별점 말고, <span style={{ color: "#e8b87a", fontWeight: 700 }}>검증된 후기</span>로 고르세요.
            </p>
          </div>
        )}
        <div className="p-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0"><h3 className="text-xl font-bold text-[#2b2018] truncate">{cafe.name}</h3>{g && <span className="text-[10px] text-white px-2 py-0.5 rounded-full shrink-0" style={{ background: g.bg }}>{g.label}</span>}</div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={onToggleBookmark} aria-label="즐겨찾기" className="flex items-center gap-1 border rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors" style={bookmarked ? { color: "#fff", background: "#f0a832", borderColor: "#f0a832" } : { color: "#9c6b3f", borderColor: "#e0d2bd" }}>{bookmarked ? "★ 즐겨찾기" : "☆ 즐겨찾기"}</button>
              <KakaoShare
                title={`${cafe.name} (${cafe.area})`}
                description={((cafe as any).identity || cafe.signature || "진짜 후기로 검증한 우리 동네 카페")}
                imageUrl={`https://dongnecoffeenote.com/c/${cafe.id}/opengraph-image`}
                link={`https://dongnecoffeenote.com/c/${cafe.id}`}
                className="flex items-center gap-1 bg-[#FEE500] text-[#3c1e1e] rounded-full pl-2 pr-2.5 py-1 text-[12px] font-bold"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#3c1e1e"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.6.1 1.3.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>
                공유
              </KakaoShare>
              <button onClick={onClose} className="text-3xl text-[#9c6b3f] leading-none px-1">×</button>
            </div>
          </div>
          <div className="text-[#9c6b3f] text-sm mb-3">{cafe.area} · {cafe.vibe}</div>
          {cafe.note && <p className="text-[15px] text-[#3d2f22] font-medium leading-relaxed mb-4">"{cafe.note}"</p>}
          {/* ⭐ 한눈에 판단 — 전체 카페 대비 강점/아쉬운점(리뷰 옥석 보기 전 직관 판단의 핵심) */}
          {profile.ok ? (
            <div className="bg-[#efe9dd] rounded-xl px-4 py-3.5 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-2.5">한눈에 보기 <span className="lowercase tracking-normal">· 전체 카페 대비</span></div>
              {profile.strong.length > 0 && (
                <div className={profile.weak.length > 0 ? "mb-3" : ""}>
                  <div className="text-[11px] font-bold text-[#3f7a4f] mb-1.5">👍 이런 점이 강해요</div>
                  <div className="flex flex-col gap-1.5">
                    {profile.strong.map((s) => (
                      <div key={s.key} className="flex items-center gap-2 text-[13.5px] text-[#3d2f22]">
                        <span className="text-[15px]">{s.emoji}</span><span className="font-semibold">{s.text}</span>
                        <span className="ml-auto text-[10.5px] font-bold text-[#3f7a4f] bg-[#e3f0e6] px-2 py-[3px] rounded-full whitespace-nowrap">상위 {s.topPct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.weak.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-[#9c6b3f] mb-1.5">🔎 참고하세요</div>
                  <div className="flex flex-col gap-1">
                    {profile.weak.map((w) => (
                      <div key={w.key} className="flex items-center gap-2 text-[12.5px] text-[#8a7458]"><span className="text-[14px] opacity-70">{w.emoji}</span><span>{w.text}</span></div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-[#a8927a] mt-2.5 leading-relaxed">검증된 후기에서 자주 언급된 정도를 전체 카페와 비교한 <b>상대 위치</b>예요. 절대 평가가 아닙니다.</p>
            </div>
          ) : chars.length > 0 && (
            <div className="bg-[#efe9dd] rounded-lg px-4 py-3 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-2">이 카페가 자주 언급되는 결</div>
              <div className="flex flex-wrap gap-1.5">{chars.map((ch) => <span key={ch.label} className="text-[12px] bg-white text-[#52402e] px-2.5 py-1 rounded-full border border-[#e0d4c0]">{ch.emoji} {ch.label}</span>)}</div>
            </div>
          )}
          {cafe.synth_identity && (
            <div className="bg-[#efe9dd] rounded-lg px-4 py-3 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] text-[#8a7458] uppercase tracking-wider mb-1">리뷰 {cafe.synth_count}건 종합 분석</div>
              <div className="text-[14px] text-[#52402e] leading-snug">{cafe.synth_identity}</div>
            </div>
          )}
          {cafe.signature && <div className="text-sm text-[#6b5a48] mb-4"><span className="text-[#9c6b3f]">추천 </span>{cafe.signature}</div>}
          {/* 방문자 후기 — 길찾기 버튼 바로 위에 배치(목록 → 상세 모달). 공개 방문기록 있을 때만. */}
          {userReviews.length > 0 && <div className="mb-4"><VisitorReviews reviews={userReviews} /></div>}
          {/* ===== 버튼 3개 — 리뷰 위에 배치, 눈에 잘 띄게 ===== */}
          <div className="flex gap-2 mb-4">
            <a href={`https://map.kakao.com/?q=${encodeURIComponent(cafe.name + " " + cafe.area)}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-xl py-2.5 text-[12px] font-semibold hover:bg-[#3d2f22] transition-colors flex items-center justify-center">길찾기</a>
            <a href={`/api/naver-place-redirect?id=${cafe.id}`} target="_blank" rel="noopener noreferrer" className="flex-1 text-center border-2 rounded-xl py-2.5 text-[12px] font-semibold bg-white hover:bg-[#f0fef8] transition-colors flex items-center justify-center gap-1" style={{ borderColor: "#03c75a", color: "#03c75a" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#03c75a"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/></svg>
              메뉴·시간
            </a>
          </div>

          {loadingRev && <div className="text-[11px] text-[#a8927a] mb-4">근거 후기 불러오는 중...</div>}
          {!loadingRev && quality && quality.raw > 0 && (
            <div className="bg-[#eef3ea] border border-[#cfe0c2] rounded-lg px-4 py-2.5 mb-4">
              <div className="text-[11px] text-[#4f6a43] leading-relaxed flex items-start gap-1">
                <span className="flex-1">🔍 네이버·유튜브 공개 글 <b>{quality.raw}건</b>{quality.duplicates ? <>(중복 {quality.duplicates}건 별도 제거)</> : null}을 검증해, 다른 가게·모음글·동명 카페 등 <b>노이즈 {quality.rejected}건</b>을 걸러내고<b> 옥석 {kept}건</b>만 분석에 썼어요.</span>
                <InfoDot title="옥석 검증이 뭐예요?"><b>이 서비스의 핵심</b>이에요. 수천 개 공개 후기에서 ① 광고·협찬, ② 카페명만 스친 글, ③ '맛집 N곳' 나열식, ④ 다른 지역·다른 지점의 <b>동명(同名)</b> 카페 글을 규칙으로 걸러내고, <b>Claude AI</b>가 내용·맥락까지 읽어 <b>진짜 방문 후기만</b> 남겨요. 모든 판정엔 근거가 붙습니다.</InfoDot>
              </div>
              {llmJudged && (
                <div className="mt-2 pt-2 border-t border-[#cfe0c2] text-[11px] text-[#5a3a82] font-medium flex items-center gap-1">
                  ✨ <span>Claude AI가 후기 내용·맥락까지 한 건씩 읽어 <b>최종 검증</b>했어요</span>
                </div>
              )}
            </div>
          )}
          {!loadingRev && reviews.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] text-[#a8927a]">이 분석의 근거가 된 실제 후기 (네이버 공개 글)</div>
                <button onClick={() => setShowAllReviews(true)} className="text-[11px] text-[#9c6b3f] font-medium underline">{"전체 "}{reviews.length}{"건 보기 →"}</button>
              </div>
              <div className="space-y-3">
                {reviews.slice(0, 6).map((rv, i) => (
                  <div key={i} className="border-b border-[#f0e6d4] pb-3 last:border-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {rv.trust === "verified"
                        ? <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#5f7355" }}>검증 ✓</span>
                        : rv.trust === "reference"
                        ? <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#9c6b3f" }}>참고</span>
                        : null}
                      {rv.why?.some((w) => w.includes("AI 검증"))
                        ? <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#7c5cbf" }}>✨ AI 검증</span>
                        : rv.why?.[0] && <span className="text-[10px] text-[#8a7458]">{rv.why[0]}</span>}
                    </div>
                    {rv.link
                      ? <a href={rv.link} target="_blank" rel="noopener noreferrer" className="block text-[13.5px] text-[#3d2f22] leading-[1.75] hover:text-[#9c6b3f] transition-colors">"{hlQuote(rv.quote)}"</a>
                      : <div className="text-[13.5px] text-[#3d2f22] leading-[1.75]">"{hlQuote(rv.quote)}"</div>}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#a8927a]">
                      {rv.link && /youtu\.?be/.test(rv.link) && <span className="text-white rounded-[3px] px-1 py-0.5" style={{ background: "#c4302b", fontSize: "8px" }}>▶ YouTube</span>}
                      <span>{rv.source}</span>{rv.date && <span>· {rv.date}</span>}
                      {rv.link && (/youtu\.?be/.test(rv.link)
                        ? <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#c4302b] font-medium ml-auto">영상 보기 →</a>
                        : <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#9c6b3f] underline ml-auto">원문 →</a>)}
                    </div>
                  </div>
                ))}
              </div>
              {reviews.length > 6 && (
                <button onClick={() => setShowAllReviews(true)} className="w-full mt-2 py-2 text-[12px] text-[#9c6b3f] border border-[#e6d9c8] rounded-lg">
                  + {reviews.length - 6}건 더 보기
                </button>
              )}
            </div>
          )}

        </div>

        {/* ===== 전체 리뷰 모달 — aside 안에 두되 fixed로 overlay ===== */}
        {showAllReviews && (
          <div className="fixed inset-0 z-[3100] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowAllReviews(false)}>
            <div className="w-full max-w-lg bg-[#fdf8f2] rounded-t-2xl max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
                <div>
                  <div className="font-bold text-[#2b2018] text-[15px]">{cafe.name}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#a8927a]">
                    <span>검증 <b className="text-[#5f7355]">{reviews.filter(r => r.trust === "verified").length}</b></span>
                    <span>· 참고 <b className="text-[#9c6b3f]">{reviews.filter(r => r.trust === "reference").length}</b></span>
                    <span>· 총 <b className="text-[#2b2018]">{reviews.length}</b>건</span>
                    {quality && quality.rejected > 0 && <span className="text-[#c0a08a]">/ 제외 {quality.rejected}</span>}
                  </div>
                </div>
                <button onClick={() => setShowAllReviews(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f0e6d4] text-[#7a6452] text-lg leading-none">×</button>
              </div>
              {/* 필터 — wrap으로 잘림 방지 */}
              <div className="px-4 py-2.5 border-b border-[#f0e6d4]">
                <div className="flex flex-wrap gap-1.5">
                  {(["all","verified","reference","ai","youtube"] as const).map((v) => {
                    const isYt = (r: EvidenceReview) => /youtu\.?be/i.test(r.link ?? "");
                    const filtered = v === "all" ? reviews
                      : v === "verified" ? reviews.filter(r => r.trust === "verified" && !r.why?.some(w => w.includes("AI 검증")))
                      : v === "reference" ? reviews.filter(r => r.trust === "reference")
                      : v === "ai" ? reviews.filter(r => r.why?.some(w => w.includes("AI 검증")))
                      : reviews.filter(isYt);
                    const label = v === "all" ? "전체" : v === "verified" ? "검증 ✓" : v === "reference" ? "참고" : v === "ai" ? "AI 검증" : "YouTube";
                    const active = reviewFilter === v;
                    const ytColor = v === "youtube";
                    return (
                      <button key={v} onClick={() => setReviewFilter(v as any)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                          active
                            ? ytColor ? "text-white" : "bg-[#2b2018] text-[#f4ece0]"
                            : "bg-white border border-[#e6d9c8] text-[#7a6452]"
                        }`}
                        style={active && ytColor ? { background: "#c4302b" } : {}}>
                        {label}
                        {filtered.length > 0 && <span className={`ml-1 ${active ? "opacity-75" : "opacity-50"}`}>({filtered.length})</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* 리뷰 목록 */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
                {reviews.filter(rv => {
                  const isYt = /youtu\.?be/i.test(rv.link ?? "");
                  if (reviewFilter === "all") return true;
                  if (reviewFilter === "verified") return rv.trust === "verified" && !rv.why?.some(w => w.includes("AI 검증"));
                  if (reviewFilter === "reference") return rv.trust === "reference";
                  if (reviewFilter === "ai") return rv.why?.some(w => w.includes("AI 검증"));
                  if (reviewFilter === "youtube") return isYt;
                  return true;
                }).map((rv, i) => (
                  <div key={i} className="border-b border-[#f0e6d4] pb-3 last:border-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {rv.trust === "verified"
                        ? <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#5f7355" }}>검증 ✓</span>
                        : rv.trust === "reference"
                        ? <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#9c6b3f" }}>참고</span>
                        : null}
                      {rv.why?.some((w) => w.includes("AI 검증"))
                        ? <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: "#7c5cbf" }}>✨ AI 검증</span>
                        : rv.why?.[0] && <span className="text-[10px] text-[#8a7458]">{rv.why[0]}</span>}
                    </div>
                    {rv.link
                      ? <a href={rv.link} target="_blank" rel="noopener noreferrer" className="block text-[13.5px] text-[#3d2f22] leading-[1.75] hover:text-[#9c6b3f] transition-colors">"{hlQuote(rv.quote)}"</a>
                      : <div className="text-[13.5px] text-[#3d2f22] leading-[1.75]">"{hlQuote(rv.quote)}"</div>}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#a8927a]">
                      {rv.link && /youtu\.?be/.test(rv.link) && <span className="text-white rounded-[3px] px-1 py-0.5" style={{ background: "#c4302b", fontSize: "8px" }}>▶ YouTube</span>}
                      <span>{rv.source}</span>{rv.date && <span>· {rv.date}</span>}
                      {rv.link && (/youtu\.?be/.test(rv.link)
                        ? <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#c4302b] font-medium ml-auto">영상 보기 →</a>
                        : <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#9c6b3f] underline ml-auto">원문 →</a>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

// 내 카페 등록 모달 — 검색→선택→사진→확인(30m 위치인증)→저장
function MyCafeRegModal({ cafes, device, visits, pin = "", initialCafeId = null, onClose, onDone }: { cafes: Cafe[]; device: string; visits: any[]; pin?: string; initialCafeId?: number | null; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Cafe | null>(null);
  const [photos, setPhotos] = useState<string[]>([]); // 방문 사진 최대 5장(기존 URL + 새 base64 혼재 가능)
  const [memory, setMemory] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [isPublic, setIsPublic] = useState(false); // 공개 선택 시 카페 상세에 '방문자 후기'로 노출(기본 비공개)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [staged, setStaged] = useState(false); // 1단계: 위치인증 임시저장 완료 → 추억 기록 팝업
  const [done, setDone] = useState<string | null>(null); // 2단계: 최종 기록 성공 멘트(카페명)

  const results = useMemo(() => {
    const k = q.replace(/\s/g, "").toLowerCase();
    if (k.length < 1) return [];
    return cafes.filter((c) => (c.name + c.area).replace(/\s/g, "").toLowerCase().includes(k)).slice(0, 20);
  }, [q, cafes]);

  // 카페 선택 시 기존 기록(기억·즐겨찾기·사진) 불러오기 — 수정모드면 기존 사진도 그대로 보여줌
  const pick = (c: Cafe) => {
    setPicked(c); setMsg("");
    const prev = visits.find((v) => v.id === c.id);
    setMemory(prev?.memory ?? "");
    setFavorite(!!prev?.favorite);
    setIsPublic(!!prev?.is_public);
    const existing = Array.isArray(prev?.photos) ? prev.photos : (prev?.photo_url ? [prev.photo_url] : []);
    setPhotos(existing.slice(0, 5));
  };
  // 수정모드: 추억 항목 클릭으로 들어오면 해당 카페를 자동 선택 + 기존 내용 프리필
  useEffect(() => {
    if (initialCafeId == null) return;
    const c = cafes.find((x) => x.id === initialCafeId);
    if (c) pick(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCafeId]);

  // 사진 선택(여러 장) → 각각 캔버스로 1000px 리사이즈. 갤러리/카메라 모두 허용(capture 미지정). 최대 5장.
  const onPhoto = (e: any) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    const room = Math.max(0, 5 - photos.length);
    files.slice(0, room).forEach((f) => {
      const img = new Image();
      img.onload = () => {
        const max = 1000, scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL("image/jpeg", 0.82);
        setPhotos((prev) => prev.length >= 5 ? prev : [...prev, url]);
      };
      img.src = URL.createObjectURL(f);
    });
    e.target.value = ""; // 같은 파일 다시 고를 수 있게 초기화
  };
  const removePhoto = (i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i));

  // 1단계: 위치 인증 → 임시저장(그 카페에서의 경험임을 보증)
  const stage = () => {
    if (!picked) { setMsg("카페를 선택해주세요"); return; }
    if (!navigator.geolocation) { setMsg("이 브라우저는 위치를 지원하지 않아요"); return; }
    setBusy(true); setMsg("현재 위치 확인 중...");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await fetch("/api/my-cafe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stage", cafeId: picked.id, device, pin, userLat: pos.coords.latitude, userLng: pos.coords.longitude, photosBase64: photos, memory, favorite, isPublic }),
        });
        const d = await r.json();
        if (d.ok) { setStaged(true); setMsg(""); setBusy(false); } // 위치인증 통과 → 추억 기록 팝업
        else { setMsg(d.error || "임시저장 실패"); setBusy(false); }
      } catch { setMsg("네트워크 오류"); setBusy(false); }
    }, () => { setMsg("위치 권한을 허용해주세요 (카페 30m 인증 필요)"); setBusy(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // 2단계: 추억을 기록합니다 — 위치 비교 없이 최종 DB 기록
  const commit = async (sendPhotos = false) => {
    if (!picked) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/my-cafe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", cafeId: picked.id, device, pin, memory, favorite, isPublic, ...(sendPhotos ? { photosBase64: photos } : {}) }),
      });
      const d = await r.json();
      if (d.ok) { setDone(picked.name); onDone(); }
      else { setMsg(d.error || "기록 실패"); setBusy(false); setStaged(false); }
    } catch { setMsg("네트워크 오류"); setBusy(false); }
  };

  // 1단계 완료 → "추억을 기록합니다" 확인 팝업 (위치 비교 없이 최종 기록)
  if (staged && !done) {
    return (
      <div className="fixed inset-0 z-[5000] flex items-center justify-center px-6" style={{ background: "rgba(43,32,24,0.6)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={() => !busy && setStaged(false)}>
        <div className="bg-[#fdfaf4] rounded-2xl px-7 py-8 text-center max-w-xs shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-[34px] mb-2">📖</div>
          <div className="text-[17px] font-bold text-[#2b2018] mb-1.5">추억을 기록합니다</div>
          <div className="text-[13px] text-[#7a6452] leading-relaxed">
            <b className="text-[#d6336c]">{picked?.name}</b> 위치 인증이 끝났어요.<br />
            이 경험을 내 지도에 영구 기록할까요?
          </div>
          <div className="text-[11px] text-[#a8927a] mt-2 leading-relaxed">위치 인증으로 <b>진짜 그 카페에서의 경험</b>임이 확인됐어요.</div>
          {msg && <p className="text-[12px] text-[#c0392b] mt-2">{msg}</p>}
          <button onClick={() => commit(false)} disabled={busy} className="mt-5 w-full bg-[#d6336c] text-white rounded-xl py-3 font-bold text-[14px] disabled:opacity-60">{busy ? "기록 중..." : "추억을 기록합니다"}</button>
          <button onClick={() => setStaged(false)} disabled={busy} className="mt-2 w-full text-[#9c6b3f] text-[13px] py-1">다시 확인할게요</button>
        </div>
      </div>
    );
  }

  // 저장 성공 — 예쁜 멘트
  if (done) {
    return (
      <div className="fixed inset-0 z-[5000] flex items-center justify-center px-6" style={{ background: "rgba(43,32,24,0.6)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={onClose}>
        <div className="bg-[#fdfaf4] rounded-2xl px-7 py-8 text-center max-w-xs shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-[40px] mb-2">❤</div>
          <div className="text-[16px] font-bold text-[#2b2018] mb-1.5">기억이 저장됐어요</div>
          <div className="text-[13px] text-[#7a6452] leading-relaxed"><b className="text-[#d6336c]">{done}</b>에서의 소중한 기억이<br />지도에 ❤로 노출돼요.</div>
          <button onClick={onClose} className="mt-5 w-full bg-[#d6336c] text-white rounded-xl py-2.5 font-bold text-[14px]">확인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={onClose}>
      <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 — 즐겨찾기 별 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
          <div className="flex items-center gap-2">
            <button onClick={() => setFavorite((v) => !v)} aria-label="즐겨찾기" className="text-[22px] leading-none" style={{ color: favorite ? "#f0a832" : "#d8cab4" }}>{favorite ? "★" : "☆"}</button>
            <div className="font-bold text-[#2b2018] text-[15px]">내 카페 등록</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#7a6452] text-lg">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          {!picked ? (
            <>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="카페 이름 검색"
                className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base text-[#2b2018] bg-white" />
              <div className="space-y-1">
                {results.map((c) => (
                  <button key={c.id} onClick={() => pick(c)} className="w-full text-left px-3 py-2.5 rounded-lg bg-white border border-[#e6d9c8] hover:bg-[#fdf6ee] flex items-center justify-between">
                    <div><div className="text-[14px] font-medium text-[#2b2018]">{c.name}</div><div className="text-[11px] text-[#9c6b3f]">{c.area}</div></div>
                    {visits.some((v) => v.id === c.id) && <span className="text-[10px] text-[#d6336c] font-bold">❤ 기록있음</span>}
                  </button>
                ))}
                {q.length >= 1 && results.length === 0 && <p className="text-[12px] text-[#a8927a] px-1">검색 결과가 없어요</p>}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between bg-white border border-[#e6d9c8] rounded-lg px-3 py-2.5">
                <div><div className="text-[14px] font-bold text-[#2b2018]">{picked.name}</div><div className="text-[11px] text-[#9c6b3f]">{picked.area}</div></div>
                <button onClick={() => { setPicked(null); setPhotos([]); }} className="text-[11px] text-[#9c6b3f] underline">변경</button>
              </div>
              <div>
                <div className="text-[12px] text-[#7a6452] mb-1.5 font-medium">방문 사진 (최대 5장 · 선택)</div>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={p} alt="" className="w-full h-full rounded-lg border border-[#e6d9c8] object-cover" />
                      <button type="button" onClick={() => removePhoto(i)} aria-label="삭제"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#2b2018] text-white text-[11px] leading-none shadow">×</button>
                    </div>
                  ))}
                  {photos.length < 5 && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-[#cbb89f] bg-white flex flex-col items-center justify-center text-[#9c6b3f] cursor-pointer">
                      <span className="text-[20px] leading-none">＋</span>
                      <span className="text-[10px] mt-0.5">사진 추가</span>
                      <span className="text-[9px] text-[#bcae9b]">{photos.length}/5</span>
                      <input type="file" accept="image/*" multiple onChange={onPhoto} className="hidden" />
                    </label>
                  )}
                </div>
                <p className="text-[10px] text-[#a8927a] mt-1">갤러리에서 여러 장 선택하거나 카메라로 촬영할 수 있어요.</p>
              </div>
              {/* 기억 — 카페에서의 나의 경험 */}
              <div>
                <div className="text-[12px] text-[#7a6452] mb-1.5 font-medium">기억 — 이 카페에서의 나의 경험</div>
                <textarea value={memory} onChange={(e) => setMemory(e.target.value)} rows={4} maxLength={2000}
                  placeholder="오늘의 커피, 분위기, 함께한 사람… 소중한 순간을 적어보세요."
                  className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[14px] text-[#2b2018] bg-white resize-none leading-relaxed" />
                <div className="text-right text-[10px] text-[#a8927a]">{memory.length}/2000</div>
              </div>
              {/* 공개 설정 — 공개 시 카페 상세에 익명 방문자 후기로 노출(리뷰 재활용) */}
              <div>
                <div className="text-[12px] text-[#7a6452] mb-1.5 font-medium">공개 설정</div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setIsPublic(false)} className={`rounded-lg border px-3 py-2.5 text-left transition ${!isPublic ? "border-[#d6336c] bg-[#fdf0f4]" : "border-[#e6d9c8] bg-white"}`}>
                    <div className="text-[13px] font-bold text-[#2b2018]">🔒 비공개</div>
                    <div className="text-[10px] text-[#9c6b3f] mt-0.5">나만 보는 추억</div>
                  </button>
                  <button type="button" onClick={() => setIsPublic(true)} className={`rounded-lg border px-3 py-2.5 text-left transition ${isPublic ? "border-[#d6336c] bg-[#fdf0f4]" : "border-[#e6d9c8] bg-white"}`}>
                    <div className="text-[13px] font-bold text-[#2b2018]">🌐 공개</div>
                    <div className="text-[10px] text-[#9c6b3f] mt-0.5">카페 상세에 익명 후기로</div>
                  </button>
                </div>
                {isPublic && <p className="text-[10px] text-[#a8927a] mt-1.5">공개하면 다른 사람이 이 카페를 볼 때 <b>익명</b>으로 사진·기억이 보여요. 타인 얼굴·개인정보가 담긴 사진은 올리지 마세요.</p>}
              </div>
              {visits.some((v) => v.id === picked.id) ? (
                <>
                  <p className="text-[11px] text-[#a8927a] leading-relaxed">※ 이미 기록한 추억이에요. 사진(갤러리에서 추가 가능)·기억을 고치고 저장하세요. <b>이미 인증된 방문</b>이라 위치 확인은 다시 안 해도 돼요.</p>
                  {msg && <p className="text-[12px] text-[#c0392b]">{msg}</p>}
                  <button onClick={() => commit(true)} disabled={busy} className="w-full bg-[#d6336c] text-white rounded-xl py-3 font-bold text-[14px] disabled:opacity-60">
                    {busy ? "저장 중..." : "수정 저장"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-[#a8927a] leading-relaxed">※ 타인의 얼굴·개인정보가 담긴 사진은 올리지 마세요. <b>카페 30m 이내</b>에서 위치 인증을 해야 "진짜 그 카페 경험"으로 임시저장돼요. 그다음 <b>추억 기록</b> 확인을 거쳐 영구 저장됩니다.</p>
                  {msg && <p className="text-[12px] text-[#c0392b]">{msg}</p>}
                  <button onClick={stage} disabled={busy} className="w-full bg-[#d6336c] text-white rounded-xl py-3 font-bold text-[14px] disabled:opacity-60">
                    {busy ? "위치 확인 중..." : "이 카페에서 위치 인증 (임시저장)"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 내 기억 관리 — 백업코드 발급/복원 + PDF·JSON 내보내기 (개인정보 0)
// 추억 보관소 탭 — 등록 + 내 카페 목록 + 설정버튼. 잠금 시 PIN 입력 화면.
function MemoryTab({ device, visits, locked = false, sessionPin = "", onRegister, onEdit, onUnlock, onLock, onRestore }: { device: string; visits: any[]; locked?: boolean; sessionPin?: string; onRegister: () => void; onEdit?: (cafeId: number) => void; onUnlock?: (pin: string) => void; onLock?: () => void; onRestore: (dev: string) => void }) {
  const [showSettings, setShowSettings] = useState(false);
  const [viewVisit, setViewVisit] = useState<any>(null); // 추억 보기 모달(클릭 시 먼저 내용 표시 → 수정 버튼)
  const [hasPin, setHasPin] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch(`/api/my-cafe/pin?device=${device}`).then((r) => r.json()).then((d) => { if (d.ok) setHasPin(!!d.hasPin); }).catch(() => {}); }, [device]);

  const doUnlock = async () => {
    if (!unlockPin) { setMsg("PIN을 입력해주세요"); return; }
    setBusy(true); setMsg("");
    const d = await fetch("/api/my-cafe/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device, action: "verify", pin: unlockPin }) }).then((r) => r.json()).catch(() => ({ ok: false }));
    setBusy(false);
    if (d.ok && d.valid) { onUnlock?.(unlockPin); setUnlockPin(""); } else setMsg("PIN이 올바르지 않아요");
  };
  const fmtDate = (s?: string) => { if (!s) return ""; const d = new Date(s); return isNaN(d.getTime()) ? "" : d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); };

  if (locked) {
    return (
      <div className="flex-1 overflow-y-auto flex items-start justify-center px-6 pt-16" style={{ fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }}>
        <div className="bg-white rounded-2xl px-7 py-8 text-center max-w-xs w-full shadow-sm border border-[#ece0cd]">
          <div className="text-[34px] mb-2">🔒</div>
          <div className="text-[16px] font-bold text-[#2b2018] mb-1">잠긴 추억 보관소</div>
          <div className="text-[12px] text-[#7a6452] leading-relaxed mb-4">공용 PC 보호를 위해 PIN으로 잠겨 있어요.<br />내 PIN을 입력하면 내 기록만 보여요.</div>
          <input value={unlockPin} onChange={(e) => setUnlockPin(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} onKeyDown={(e) => e.key === "Enter" && doUnlock()} autoFocus placeholder="PIN (숫자)" className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[18px] text-center tracking-[0.4em] bg-white mb-2" />
          {msg && <p className="text-[12px] text-[#c0392b] mb-2">{msg}</p>}
          <button onClick={doUnlock} disabled={busy} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-2.5 font-bold text-[14px] disabled:opacity-60">{busy ? "확인 중..." : "잠금 해제"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }}>
      <div className="max-w-lg mx-auto px-4 py-5 pb-[3.5rem]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-[17px] font-bold text-[#2b2018]">🗃 추억 보관소</div>
            <div className="text-[11px] text-[#a8927a]">이 기기의 내 추억 {visits.length}곳 · 다른 사람 기록은 안 보여요</div>
          </div>
          <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1 h-9 px-3 rounded-full text-[12px] font-bold bg-white text-[#7a6452] border border-[#e6d9c8] shrink-0">⚙ 설정</button>
        </div>
        <button onClick={onRegister} className="w-full inline-flex items-center justify-center gap-1.5 bg-[#d6336c] text-white rounded-xl py-3.5 text-[14px] font-bold shadow-sm mb-4">
          <span className="text-[16px] leading-none">➕</span> 새 카페 추억 등록하기
        </button>
        {visits.length === 0 ? (
          <div className="text-center text-[#a8927a] text-[13px] py-14 bg-white rounded-2xl border border-[#ece0cd] leading-relaxed">아직 등록한 추억이 없어요.<br />카페에서 위치 인증하고 첫 추억을 남겨보세요.</div>
        ) : (
          <div className="space-y-2.5">
            {visits.map((v) => {
              const photoCount = Array.isArray(v.photos) ? v.photos.length : (v.photo_url ? 1 : 0);
              return (
              <button key={v.id} type="button" onClick={() => setViewVisit(v)} className="w-full text-left bg-white rounded-2xl border border-[#ece0cd] p-3.5 flex gap-3 hover:border-[#d6b9c4] active:scale-[0.995] transition">
                <div className="relative w-16 h-16 shrink-0">
                  {v.photo_url ? <img src={v.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover" /> : <div className="w-16 h-16 rounded-xl bg-[#f3ede1] flex items-center justify-center text-[22px]">{v.favorite ? "★" : "☕"}</div>}
                  {photoCount > 1 && <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[9px] px-1 rounded">📷{photoCount}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {v.favorite && <span className="text-[#f0a832] text-[13px]">★</span>}
                    <span className="font-bold text-[#2b2018] text-[14px] truncate">{v.name}</span>
                    <span className="text-[10px] text-[#9c6b3f] shrink-0">{v.area}</span>
                    <span className="ml-auto text-[10px] text-[#bcae9b] shrink-0">보기 ›</span>
                  </div>
                  {v.memory ? <p className="text-[12px] text-[#52402e] leading-relaxed mt-0.5 line-clamp-2">{v.memory}</p> : <p className="text-[12px] text-[#bcae9b] mt-0.5">기억 메모 없음</p>}
                  <div className="text-[10px] text-[#a8927a] mt-1">{fmtDate(v.created_at)}</div>
                </div>
              </button>
              );
            })}
          </div>
        )}
      </div>
      {showSettings && <MemorySettingsModal device={device} visits={visits} hasPin={hasPin} onPinChange={setHasPin} onClose={() => setShowSettings(false)} onRestore={onRestore} onUnlock={onUnlock} onLock={onLock} />}
      {viewVisit && (() => {
        const vphotos: string[] = Array.isArray(viewVisit.photos) && viewVisit.photos.length ? viewVisit.photos : (viewVisit.photo_url ? [viewVisit.photo_url] : []);
        return (
          <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={() => setViewVisit(null)}>
            <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
                <div className="flex items-center gap-2 min-w-0">
                  {viewVisit.favorite && <span className="text-[#f0a832] text-[18px] leading-none">★</span>}
                  <div className="font-bold text-[#2b2018] text-[15px] truncate">{viewVisit.name}</div>
                  <span className="text-[11px] text-[#9c6b3f] shrink-0">{viewVisit.area}</span>
                </div>
                <button onClick={() => setViewVisit(null)} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#7a6452] text-lg shrink-0">×</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-3">
                {vphotos.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                    {vphotos.map((p, i) => <img key={i} src={p} alt="" className="h-44 rounded-lg border border-[#e6d9c8] object-cover shrink-0" />)}
                  </div>
                )}
                <div>
                  <div className="text-[12px] text-[#7a6452] mb-1 font-medium">기억</div>
                  {viewVisit.memory ? <p className="text-[14px] text-[#2b2018] leading-relaxed whitespace-pre-wrap">{viewVisit.memory}</p> : <p className="text-[13px] text-[#bcae9b]">기억 메모 없음</p>}
                </div>
                <div className="text-[11px] text-[#a8927a]">{fmtDate(viewVisit.created_at)}{viewVisit.favorite ? " · ★ 즐겨찾기" : ""}</div>
              </div>
              <div className="p-4 border-t border-[#f0e6d4] pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
                <button onClick={() => { const id = viewVisit.id; setViewVisit(null); onEdit?.(id); }} className="w-full bg-[#d6336c] text-white rounded-xl py-3 font-bold text-[14px]">✎ 수정하기</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// 추억 보관소 설정 모달 — ①백업코드 ②복원 ③내보내기 ④PIN
function MemorySettingsModal({ device, visits, hasPin, onPinChange, onClose, onRestore, onUnlock, onLock }: { device: string; visits: any[]; hasPin: boolean; onPinChange: (v: boolean) => void; onClose: () => void; onRestore: (dev: string) => void; onUnlock?: (pin: string) => void; onLock?: () => void }) {
  const [code, setCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pinMode, setPinMode] = useState<"" | "set" | "change" | "remove">("");
  const [pinA, setPinA] = useState("");
  const [pinB, setPinB] = useState("");
  const setHasPin = onPinChange;

  const pinApi = (body: any) => fetch("/api/my-cafe/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device, ...body }) }).then((r) => r.json());

  const doSetPin = async () => {
    setBusy(true); setMsg("");
    const d = await pinApi({ action: "set", pin: pinA }).catch(() => ({ ok: false }));
    setBusy(false);
    if (d.ok) { setHasPin(true); setPinMode(""); onUnlock?.(pinA); setPinA(""); setMsg("PIN이 설정됐어요. 이제 이 기기는 PIN 없이는 기록이 안 보여요."); }
    else setMsg(d.error || "설정 실패");
  };
  const doChangePin = async () => {
    setBusy(true); setMsg("");
    const d = await pinApi({ action: "change", pin: pinA, newPin: pinB }).catch(() => ({ ok: false }));
    setBusy(false);
    if (d.ok) { setPinMode(""); onUnlock?.(pinB); setPinA(""); setPinB(""); setMsg("PIN을 변경했어요."); }
    else setMsg(d.error || "변경 실패");
  };
  const doRemovePin = async () => {
    setBusy(true); setMsg("");
    const d = await pinApi({ action: "remove", pin: pinA }).catch(() => ({ ok: false }));
    setBusy(false);
    if (d.ok) { setHasPin(false); setPinMode(""); setPinA(""); setMsg("PIN을 해제했어요."); }
    else setMsg(d.error || "해제 실패");
  };

  const issueCode = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/my-cafe/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device }) });
      const d = await r.json();
      if (d.ok) setCode(d.code); else setMsg(d.error || "발급 실패");
    } catch { setMsg("네트워크 오류"); }
    setBusy(false);
  };

  const restore = async () => {
    const c = inputCode.trim().toUpperCase();
    if (!c) { setMsg("코드를 입력해주세요"); return; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/my-cafe/backup?code=${encodeURIComponent(c)}`);
      const d = await r.json();
      if (d.ok) { onRestore(d.device); onClose(); }
      else { setMsg(d.error || "복원 실패"); }
    } catch { setMsg("네트워크 오류"); }
    setBusy(false);
  };

  const exportJSON = () => {
    const data = { service: "동네 커피 노트 — 내 기억", exportedAt: new Date().toISOString(), count: visits.length,
      records: visits.map((v) => ({ cafe: v.name, area: v.area, favorite: !!v.favorite, memory: v.memory ?? "", photo: v.photo_url ?? null, date: v.created_at })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `내커피기억_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };

  const exportPDF = () => {
    const rows = visits.map((v) => `
      <div style="border:1px solid #e6d9c8;border-radius:12px;padding:14px;margin-bottom:12px;page-break-inside:avoid;">
        <div style="font-weight:700;font-size:15px;color:#2b2018;">${v.favorite ? "★ " : ""}${(v.name || "").replace(/</g, "&lt;")} <span style="font-weight:400;font-size:11px;color:#9c6b3f;">${(v.area || "")}</span></div>
        ${v.photo_url ? `<img src="${v.photo_url}" style="max-width:100%;max-height:240px;border-radius:8px;margin:8px 0;object-fit:cover;" />` : ""}
        ${v.memory ? `<div style="font-size:13px;color:#52402e;line-height:1.7;white-space:pre-wrap;margin-top:6px;">${(v.memory).replace(/</g, "&lt;")}</div>` : ""}
        <div style="font-size:10px;color:#a8927a;margin-top:8px;">${new Date(v.created_at).toLocaleString("ko-KR")}</div>
      </div>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>내 커피 기억</title>
      <style>body{font-family:'Gowun Batang',serif;background:#fdfaf4;color:#2b2018;padding:24px;max-width:600px;margin:0 auto;}h1{font-size:22px;}</style></head>
      <body><h1>☕ 동네 커피 노트 — 내 기억</h1><p style="color:#7a6452;font-size:12px;">총 ${visits.length}곳 · 내보낸 날짜 ${new Date().toLocaleDateString("ko-KR")}</p>${rows}
      <script>window.onload=function(){setTimeout(function(){window.print();},400);}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); } else setMsg("팝업이 차단됐어요. 팝업을 허용해주세요.");
  };

  return (
    <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={onClose}>
      <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl max-h-[88dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
          <div className="font-bold text-[#2b2018] text-[15px]">⚙ 설정</div>
          <div className="flex items-center gap-2">
            {hasPin && <button onClick={() => { onLock?.(); onClose(); }} className="text-[11px] font-bold text-[#9c6b3f] border border-[#e6d9c8] rounded-full px-2.5 py-1">🔒 지금 잠그기</button>}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#7a6452] text-lg">×</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-5 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          <p className="text-[12px] text-[#7a6452] leading-relaxed bg-[#f3ede1] rounded-lg px-3 py-2.5">
            가입·개인정보 없이 — <b>백업 코드</b>로 다른 기기에서 불러오거나 <b>파일로 내려받아</b> 영구 보관, 공용 PC는 <b>PIN</b>으로 잠글 수 있어요.
          </p>

          {/* 백업 코드 */}
          <div>
            <div className="text-[13px] font-bold text-[#2b2018] mb-1.5">① 백업 코드 (다른 기기에서 불러오기)</div>
            {code ? (
              <div className="bg-white border-2 border-[#d6336c] rounded-xl p-3 text-center">
                <div className="text-[20px] font-bold tracking-widest text-[#d6336c]">{code}</div>
                <div className="text-[11px] text-[#a8927a] mt-1">이 코드를 메모해두세요. 잃어버리면 복구할 수 없어요(= 우리도 누구 건지 몰라요).</div>
              </div>
            ) : (
              <button onClick={issueCode} disabled={busy} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-60">{busy ? "발급 중..." : "백업 코드 발급"}</button>
            )}
          </div>

          {/* 복원 */}
          <div>
            <div className="text-[13px] font-bold text-[#2b2018] mb-1.5">② 코드로 복원 (기기 바꿨을 때)</div>
            <div className="flex gap-2">
              <input value={inputCode} onChange={(e) => setInputCode(e.target.value)} placeholder="COFFEE-XXXXXX"
                className="flex-1 border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[14px] bg-white uppercase" />
              <button onClick={restore} disabled={busy} className="px-4 bg-[#9c6b3f] text-white rounded-lg text-[13px] font-bold disabled:opacity-60">불러오기</button>
            </div>
          </div>

          {/* 내보내기 */}
          <div>
            <div className="text-[13px] font-bold text-[#2b2018] mb-1.5">③ 내 기기에 영구 보관 (다운로드)</div>
            <div className="flex gap-2">
              <button onClick={exportPDF} disabled={!visits.length} className="flex-1 border-2 border-[#cbb89f] text-[#524434] rounded-lg py-2.5 text-[13px] font-bold bg-white disabled:opacity-50">PDF로 저장</button>
              <button onClick={exportJSON} disabled={!visits.length} className="flex-1 border-2 border-[#cbb89f] text-[#524434] rounded-lg py-2.5 text-[13px] font-bold bg-white disabled:opacity-50">JSON으로 저장</button>
            </div>
            <p className="text-[10px] text-[#a8927a] mt-1.5">PDF는 보기 좋게, JSON은 백업·재가져오기용. 파일은 본인 기기에만 저장돼요.</p>
          </div>

          {/* ④ 공용 PC 잠금 (PIN) */}
          <div className="border-t border-[#f0e6d4] pt-4">
            <div className="text-[13px] font-bold text-[#2b2018] mb-1.5">④ 공용 PC 잠금 (PIN)</div>
            {!hasPin ? (
              pinMode === "set" ? (
                <div className="space-y-2">
                  <input value={pinA} onChange={(e) => setPinA(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} placeholder="새 PIN (숫자 4~8자리)"
                    className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[15px] tracking-[0.3em] bg-white" />
                  <div className="flex gap-2">
                    <button onClick={doSetPin} disabled={busy || pinA.length < 4} className="flex-1 bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-50">설정</button>
                    <button onClick={() => { setPinMode(""); setPinA(""); }} className="px-4 text-[#9c6b3f] text-[13px]">취소</button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => { setPinMode("set"); setMsg(""); }} className="w-full border-2 border-[#cbb89f] text-[#524434] rounded-lg py-2.5 text-[13px] font-bold bg-white">PIN 설정하기</button>
                  <p className="text-[10px] text-[#a8927a] mt-1.5">PIN을 걸면 이 기기에서 <b>PIN을 입력해야만</b> 내 추억이 보여요. 카페·도서관 등 공용 PC에서 추천해요.</p>
                </>
              )
            ) : pinMode === "change" ? (
              <div className="space-y-2">
                <input value={pinA} onChange={(e) => setPinA(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} placeholder="현재 PIN"
                  className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[15px] tracking-[0.3em] bg-white" />
                <input value={pinB} onChange={(e) => setPinB(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} placeholder="새 PIN (4~8자리)"
                  className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[15px] tracking-[0.3em] bg-white" />
                <div className="flex gap-2">
                  <button onClick={doChangePin} disabled={busy || pinB.length < 4} className="flex-1 bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-50">변경</button>
                  <button onClick={() => { setPinMode(""); setPinA(""); setPinB(""); }} className="px-4 text-[#9c6b3f] text-[13px]">취소</button>
                </div>
              </div>
            ) : pinMode === "remove" ? (
              <div className="space-y-2">
                <input value={pinA} onChange={(e) => setPinA(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} placeholder="현재 PIN (해제 확인)"
                  className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[15px] tracking-[0.3em] bg-white" />
                <div className="flex gap-2">
                  <button onClick={doRemovePin} disabled={busy} className="flex-1 bg-[#c0392b] text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-50">PIN 해제</button>
                  <button onClick={() => { setPinMode(""); setPinA(""); }} className="px-4 text-[#9c6b3f] text-[13px]">취소</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => { setPinMode("change"); setMsg(""); }} className="flex-1 border-2 border-[#cbb89f] text-[#524434] rounded-lg py-2.5 text-[13px] font-bold bg-white">PIN 변경</button>
                <button onClick={() => { setPinMode("remove"); setMsg(""); }} className="flex-1 border-2 border-[#e3b8b0] text-[#c0392b] rounded-lg py-2.5 text-[13px] font-bold bg-white">PIN 해제</button>
              </div>
            )}
          </div>

          {msg && <p className="text-[12px] text-[#c0392b]">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
