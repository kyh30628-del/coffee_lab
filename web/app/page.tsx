"use client";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import NoticeModal from "./NoticeModal";
import { SIDO_GU, SIDO_CENTER } from "@/lib/regionList";
import InfoDot from "./InfoDot";
import { trackOutbound } from "./trackOutboundClient";
import ShowcaseBanner, { SHOWCASE_CSS } from "./ShowcaseBanner";
import OwnerSignupModal from "./OwnerSignupModal";
import VisitorReviews from "./VisitorReviews";
import KakaoShare from "./KakaoShare";
import { trackShare } from "./trackShareClient";
import MyCafeRegModal from "./MyCafeRegModal";
import { buildAxisDist, cafeProfile, tasteVector, tasteSimilarity, GRADE_RANK, type AxisDist } from "@/lib/cafeProfile";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";
import { shareHookText } from "@/lib/shareCopy";
import { decodeCafeScores } from "@/lib/mapCafes";

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
type DCafe = { id: number; name: string; area: string; lat: number; lng: number; grade: string | null; count: number | null; identity: string | null; note: string | null; beanNote: string[]; reason?: string; isNew?: boolean };
type Discover = { headlineA: DCafe | null; headlineB: DCafe | null; headlineAList?: DCafe[]; headlineBList?: DCafe[]; themeB?: { emoji: string; label: string } | null; top3: DCafe[]; fresh: DCafe[]; specialty: DCafe[]; featured?: DCafe[]; scopeCount: number };
type SearchResult = { id: number; name: string; area: string; grade: string | null; count: number | null; identity: string | null; score: number; reasons: string[] };
type SearchRes = { ok: boolean; region: string; q: string; concepts: string[]; count: number; results: SearchResult[]; coverageNote?: string; franchiseNote?: string };
const SEARCH_EXAMPLES = ["비 오는 날 혼자 조용히", "감성 사진 데이트", "노트북 작업하기 좋은", "산미 또렷한 커피", "빵 맛있는 집"];
// 쇼케이스 1차 성과 집계(노출·클릭·재생)
const trackPromo = (cafeId: number, type: "view" | "click" | "play") => { fetch("/api/promo-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, type }) }).catch(() => {}); };

// 🗺️ 지역 목록은 lib/regionList.ts 단일 출처를 쓴다 — 여기 복제해 두면 한쪽만 갱신되어
//   "DB엔 있는데 화면에서 못 고른다"가 반복된다(인천 개편 134곳·강원 확장, 둘 다 실제로 겪음).
//   ⚠️ 짧은 이름이 긴 이름의 부분문자열인 경우(예: "동구"⊂"남동구") 배열 순서에 기대는 매칭이
//   오분류를 냈던 전례가 있어, 아래 REGIONS_LONGEST로 **긴 이름부터** 검사한다.
const REGIONS = SIDO_GU;

// 🧳🏠 방문객 성격 배지 — /api/cafes가 붙는 곳만 vb("T"/"L"/"TL")로 보낸다(페이로드 최소).
//   "관광지 카페"가 아니라 **근거**를 말한다: 누군가에겐 관광지여도 사는 사람에겐 동네라서.
const VB_LABEL: Record<string, { emoji: string; label: string }> = {
  T: { emoji: "🧳", label: "여행 후기 많음" },
  L: { emoji: "🏠", label: "동네 단골 후기" },
};
function VisitorBadges({ vb, dark }: { vb?: string; dark?: boolean }) {
  if (!vb) return null;
  return (
    <>
      {vb.split("").map((k) => VB_LABEL[k] && (
        <span key={k} title={VB_LABEL[k].label}
          className={dark ? "text-[11px] bg-[#f4ece0]/20 px-1.5 py-0.5 rounded-full shrink-0"
                          : "text-[11px] leading-none text-[#4a5a4e] bg-[#e6efe8] border border-[#c9dbcf] px-1.5 py-1 rounded-full shrink-0"}>
          {VB_LABEL[k].emoji}
        </span>
      ))}
    </>
  );
}

// area별 결과 캐시 — area 종류는 ~64개뿐이라, 1만건을 매번 64개 순회(64만 연산)하던 걸 O(1)로.
const _guCache = new Map<string, { sido: string; sigungu: string }>();
const _longestFirst = (list: string[]) => [...list].sort((a, b) => b.length - a.length);
const REGIONS_LONGEST: Record<string, string[]> = Object.fromEntries(Object.entries(REGIONS).map(([sido, list]) => [sido, _longestFirst(list)]));
function toGu(area: string): { sido: string; sigungu: string } {
  const a = (area ?? "").trim();
  const hit = _guCache.get(a); if (hit) return hit;
  let res: { sido: string; sigungu: string } = { sido: "", sigungu: "" };
  if (a.includes("인천")) { res = { sido: "인천", sigungu: "" }; for (const gu of REGIONS_LONGEST["인천"]) { if (a.includes(gu)) { res = { sido: "인천", sigungu: gu }; break; } } }
  else { outer: for (const [sido, list] of Object.entries(REGIONS_LONGEST)) { for (const gu of list) { if (a.includes(gu)) { res = { sido, sigungu: gu }; break outer; } } }
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
// 🎨 2026-07-25: 초록(#5f7355)이 섞여 브라운 카드들과 안 어울려 "조잡하다"는 피드백 → 전부 사이트 브랜드
//   톤(에스프레소·로스팅 브라운·카라멜, 명도만 다르게)으로 통일. 진한→연한 순.
const TONES = ["#2b2018", "#4a3220", "#6f4e37", "#8a5a24", "#9c6b3f"];
// 🎨 2026-07-26 v3: "너무 심하다, 아주 약하게만" — v2의 크림 하이라이트+4단 대비가 과했다는
// 피드백으로 되돌림. 각 톤에서 살짝만 밝은 색으로 두 단계만 은은하게(밝기 변화 위주, 색 점프 없음).
const TONE_GRADIENTS = [
  "linear-gradient(135deg, #362518 0%, #2b2018 100%)",
  "linear-gradient(135deg, #573a26 0%, #4a3220 100%)",
  "linear-gradient(135deg, #7d5940 0%, #6f4e37 100%)",
  "linear-gradient(135deg, #98652c 0%, #8a5a24 100%)",
  "linear-gradient(135deg, #a97849 0%, #9c6b3f 100%)",
];

// 홈 잡지 카드 — 모듈 스코프(컴포넌트 내부 정의 금지). 내부에 두면 렌더마다 재마운트되어 뒤로가기/탭전환이 느려짐.
// 2026-07-25: 높이 압축 피드백 — 패딩·폰트·여백 축소, identity 2줄→1줄.
const HeadlineCard = memo(function HeadlineCard({ c, kicker, tone, onOpen }: { c: DCafe; kicker: string; tone: number; onOpen: (id: number) => void }) {
  return (
    <button onClick={() => onOpen(c.id)} className="w-full text-left rounded-2xl overflow-hidden shadow-md mb-4" style={{ backgroundImage: TONE_GRADIENTS[tone] }}>
      <div className="p-3.5 text-[#f4ece0]">
        <div className="text-[9px] tracking-[0.2em] uppercase text-[#e8d4b0] mb-1.5">{kicker}</div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-bold leading-tight">{c.name}</h2>
          {c.grade && <span className="text-[10px] bg-[#f4ece0]/20 px-2 py-0.5 rounded-full">{c.grade}</span>}
          {c.isNew && <span className="text-[10px] bg-[#ffd9a0]/90 text-[#3a2a12] font-bold px-2 py-0.5 rounded-full">NEW</span>}
          <VisitorBadges vb={(c as any).vb} dark />
        </div>
        <div className="text-[11px] text-[#e8d4b0] mb-1.5">{c.area} · 리뷰 {c.count ?? 0}건</div>
        {c.identity && <p className="text-[12px] text-[#f0e6d4] leading-snug mb-2 line-clamp-1">{c.identity}</p>}
        {c.beanNote.length > 0 && <div className="flex flex-wrap gap-1.5">{c.beanNote.map((b) => <span key={b} className="text-[10px] bg-[#f4ece0]/15 px-2 py-0.5 rounded-full">{b}</span>)}</div>}
      </div>
    </button>
  );
});
// 🎬 자동 스포트라이트(넷플릭스식) 본체 — 큰 카드 1개가 몇 초마다 자동 전환 + 점(dot)으로 위치 표시.
//   HeadlineCard를 그대로 재사용해 상단 💎숨은보석·🎯오늘의테마와 톤·배지·태그가 통일된다(추가 코드 최소화).
//   터치/클릭하면 5초간 멈췄다가 재개(읽는 도중 안 넘어감). 좌우 스와이프로 수동 이동도 가능.
//   제목 표시줄이 없는 '코어'만 — Spotlight(단일기준)·RankSpotlight(탭전환)가 공유해서 쓴다.
const SpotlightCore = memo(function SpotlightCore({ items, onOpen, toneOffset = 0, intervalMs = 4000 }: { items: DCafe[]; onOpen: (id: number) => void; toneOffset?: number; intervalMs?: number }) {
  const [idx, setIdx] = useState(0);
  const [prevIdx, setPrevIdx] = useState<number | null>(null); // 진짜 크로스페이드용 — 이전 카드가 사라지는 동안만 유지
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchX = useRef<number | null>(null);
  // 인덱스 전환 단일 진입점 — 이전 카드를 잠깐 남겨 CSS가 겹쳐서 페이드아웃, 새 카드는 동시에 페이드인(진짜 크로스페이드).
  //   기존엔 key교체로 이전 카드가 순간 사라지고 새 카드만 나타나는 '컷 전환'이라 뚝뚝 끊겨 보였음.
  const goTo = useCallback((updater: number | ((cur: number) => number)) => {
    setIdx((cur) => {
      const next = typeof updater === "function" ? (updater as (c: number) => number)(cur) : updater;
      if (next === cur) return cur;
      setPrevIdx(cur);
      if (prevClearTimer.current) clearTimeout(prevClearTimer.current);
      prevClearTimer.current = setTimeout(() => setPrevIdx(null), 650); // CSS 애니메이션(0.6s)보다 살짝 길게
      return next;
    });
  }, []);
  useEffect(() => { setIdx(0); setPrevIdx(null); }, [items]);
  useEffect(() => {
    if (paused || items.length <= 1) return;
    // 행마다 시작을 살짝 어긋나게(스태거) — 안 그러면 모든 행 타이머가 페이지 로드 시 거의 동시에 시작돼
    // 화면 전체가 4초마다 한꺼번에 깜빡이는 느낌이 남(각 행은 여전히 4초 주기, 위상만 다름).
    let interval: ReturnType<typeof setInterval> | undefined;
    const stagger = setTimeout(() => {
      interval = setInterval(() => goTo((i) => (i + 1) % items.length), intervalMs);
    }, (toneOffset % 5) * 650);
    return () => { clearTimeout(stagger); if (interval) clearInterval(interval); };
  }, [paused, items.length, intervalMs, toneOffset, goTo]);
  const pauseThenResume = () => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 5000);
  };
  useEffect(() => () => {
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    if (prevClearTimer.current) clearTimeout(prevClearTimer.current);
  }, []);
  if (!items?.length) return null;
  const c = items[idx];
  return (
    <>
      <div
        className="relative"
        onPointerDown={pauseThenResume}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; pauseThenResume(); }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) goTo((i) => (dx < 0 ? (i + 1) % items.length : (i - 1 + items.length) % items.length));
          touchX.current = null;
        }}
      >
        <div key={`cur-${c.id}`} className={prevIdx !== null ? "dcn-spotlight-in" : undefined}>
          <HeadlineCard c={c} kicker={`${idx + 1} / ${items.length}`} tone={(toneOffset + idx) % TONES.length} onOpen={onOpen} />
        </div>
        {prevIdx !== null && items[prevIdx] && (
          <div key={`prev-${items[prevIdx].id}`} className="absolute inset-0 dcn-spotlight-out">
            <HeadlineCard c={items[prevIdx]} kicker={`${prevIdx + 1} / ${items.length}`} tone={(toneOffset + prevIdx) % TONES.length} onOpen={onOpen} />
          </div>
        )}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-1">
          {items.map((_, i) => (
            <button key={i} onClick={() => { goTo(i); pauseThenResume(); }} aria-label={`${i + 1}번째`}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-5 bg-[#9c6b3f]" : "w-1.5 bg-[#d9c6a5]"}`} />
          ))}
        </div>
      )}
    </>
  );
});

// 제목표시줄+SpotlightCore — 단일 기준 섹션(추천·신규발견)용 얇은 래퍼.
const Spotlight = memo(function Spotlight({ title, items, sub, info, onOpen, toneOffset = 0, intervalMs = 4000 }: { title: string; items: DCafe[]; sub?: string; info?: React.ReactNode; onOpen: (id: number) => void; toneOffset?: number; intervalMs?: number }) {
  if (!items?.length) return null;
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-1 pb-1 border-b-2 border-[#2b2018]">
        <div className="text-base font-bold text-[#2b2018] flex items-center gap-1.5">{title}{info && <InfoDot title={title.replace(/^[^가-힣A-Za-z]+/, "")}>{info}</InfoDot>}</div>
        {sub && <div className="text-[10px] text-[#7a5122] shrink-0">↕ {sub}</div>}
      </div>
      <SpotlightCore items={items} onOpen={onOpen} toneOffset={toneOffset} intervalMs={intervalMs} />
    </div>
  );
});

// 🔍 카페 둘러보기 — 리뷰순·입소문순·로스팅순·신규순 4가지 기준을 탭으로 전환하는 통합 섹션.
//   기존 '📈요즘뜨는·🏆Top3·🔥스페셜티·🆕신규발견' 4개 섹션을 하나로 합쳐 홈 섹션 수를 줄임
//   (CEO "카페가 너무 많아 조잡하다" → "🏆인기 카페"에 신규발견도 탭으로 편입 + 이름 변경).
const RANK_TABS: { key: "top3" | "momentum" | "specialty" | "fresh"; label: string }[] = [
  { key: "top3", label: "리뷰순" },
  { key: "momentum", label: "입소문순" },
  { key: "specialty", label: "로스팅순" },
  { key: "fresh", label: "신규순" },
];
const RankSpotlight = memo(function RankSpotlight({ top3, momentum, specialty, fresh, onOpen }: { top3: DCafe[]; momentum: DCafe[]; specialty: DCafe[]; fresh: DCafe[]; onOpen: (id: number) => void }) {
  const [tabIdx, setTabIdx] = useState(0);
  const dataByKey: Record<string, DCafe[]> = { top3, momentum, specialty, fresh };
  const infoByKey: Record<string, React.ReactNode> = {
    top3: <>이 동네에서 <b>검증·참고 후기(옥석)가 가장 많은</b> 카페 순서예요. 광고·가짜·무관 글은 제외한 '진짜 후기 수' 기준입니다. <b>서울·경기·인천·강원을 번갈아</b> 보여드려요 — 후기 수만으로 줄 세우면 늦게 합류한 지역이 영영 안 보이거든요.</>,
    momentum: <>별점 대신 <b>검증된 진짜 후기가 요즘 얼마나 빨리 느는지</b>로 뽑은 '뜨는 카페'예요. 최근 3개월 검증 후기가 많을수록 상위로 올라가요.</>,
    specialty: <>검증된 카페 중 <b>직접 로스팅·스페셜티가 후기에 자주 언급된</b> 곳이에요. 커피에 진심인 집 위주로 보여줘요.</>,
    fresh: <>우리 지도에 <b>새로 등록·검증된 카페</b>예요. 신선한 발견, 이미 검증된 곳만 올라와요.</>,
  };
  const availableTabs = RANK_TABS.filter((t) => (dataByKey[t.key] || []).length > 0);
  if (availableTabs.length === 0) return null;
  // 선택 탭에 데이터가 없으면(지역필터 등 엣지케이스) 첫 available 탭으로 안전 폴백.
  const safeIdx = (dataByKey[RANK_TABS[tabIdx].key]?.length ?? 0) > 0 ? tabIdx : RANK_TABS.findIndex((t) => t.key === availableTabs[0].key);
  const safeKey = RANK_TABS[safeIdx].key;
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-1 pb-1 border-b-2 border-[#2b2018]">
        <div className="text-base font-bold text-[#2b2018] flex items-center gap-1.5">🔍 카페 둘러보기<InfoDot title="카페 둘러보기">{infoByKey[safeKey]}</InfoDot></div>
      </div>
      <div className="flex gap-1.5 mb-2 mt-1.5 flex-wrap">
        {RANK_TABS.map((t, i) => (dataByKey[t.key] || []).length > 0 && (
          <button key={t.key} onClick={() => setTabIdx(i)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${i === safeIdx ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#7a5122] border-[#e3d3b8] hover:border-[#9c6b3f]"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <SpotlightCore items={dataByKey[safeKey]} onOpen={onOpen} toneOffset={safeIdx} />
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
    <div${feat ? ' class="dcn-pin-feat"' : isFocus ? ' class="dcn-pin-focus"' : ""} style="width:${size}px;height:${size}px;background:${color};background-image:radial-gradient(circle at 34% 28%, rgba(255,255,255,0.42), rgba(255,255,255,0) 58%);border:2px solid #fdfaf4;border-radius:50% 50% 50% 0;transform:rotate(-45deg);${ring}display:flex;align-items:center;justify-content:center;margin:0 auto;">
      <span style="transform:rotate(45deg);font-size:${isFocus ? 20 : isMatch || feat ? 16 : 14}px;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.25));">${glyph}</span></div>
    <div style="margin-top:3px;${labelStyle}padding:2px 7px;border-radius:8px;font-size:${isFocus || isMine ? 11 : 10}px;white-space:nowrap;display:inline-block;box-shadow:0 2px 6px rgba(0,0,0,0.28);">${c.name}${isMine ? " ❤" : isFocus ? "" : feat ? " ⭐" : isMatch ? " ✓" : ""}</div>
  </div>`;
}
// ☕ 커피 드립 로딩 — 스피너 대신 우리 정체성(잔에 방울·김). label은 로딩 문구.
function CoffeeLoader({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-9 gap-2.5">
      <div className="dcn-cload" aria-hidden="true">
        <span className="stm s1" /><span className="stm s2" />
        <span className="drip" />
        <div className="cup"><span className="ear" /></div>
      </div>
      {label && <div className="text-[12px] text-[#8a7150]">{label}</div>}
    </div>
  );
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
// 🧭 2026-08-22: 찜 목록은 "가려고 마음먹은 곳"이다 → 여기가 '내 카페 기록'의 가장 자연스러운 입구다.
//   실측 배경: 내 카페 기록은 누적 6건·발급 PIN 0건으로 사실상 미사용인데, 원인은 GPS 30m 인증을
//   요구하면서 정작 진입점이 어디에도 안 붙어 있었기 때문이다. 찜한 곳에 "다녀왔어요"를 달아
//   기억이 살아있는 순간에 기록으로 잇는다(강요 아님 — 작은 보조 버튼).
function FavoritesModal({ items, onClose, onOpen, onRemove, onRecord }: { items: Cafe[]; onClose: () => void; onOpen: (c: Cafe) => void; onRemove: (id: number) => void; onRecord: (c: Cafe) => void }) {
  return (
    <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={onClose}>
      <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl max-h-[80dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
          <div className="font-bold text-[#2b2018] text-[15px]"><span style={{ color: "#f0a832" }}>★</span> 즐겨찾기 <span className="text-[#665036] text-[12px] font-normal">{items.length}곳</span></div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#594839] text-lg">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-3 space-y-2 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          {items.length === 0 ? (
            <div className="text-center text-[#665036] text-[13px] py-12 leading-relaxed">
              아직 찜한 카페가 없어요.<br />카페 상세에서 <span style={{ color: "#d6336c" }}>❤</span> <b>찜하기</b>를 누르면 여기에 모여요.<br />
              <span className="text-[11.5px] text-[#8a7355]">가입도 위치확인도 필요 없어요 · 탭 한 번</span>
            </div>
          ) : items.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-[#ece0cd] p-3 flex gap-2 items-center">
              <button onClick={() => onOpen(c)} className="flex-1 min-w-0 text-left flex items-center gap-2 active:opacity-70">
                <div className="w-10 h-10 rounded-lg bg-[#f3ede1] flex items-center justify-center text-[16px] shrink-0">☕</div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#2b2018] text-[14px] truncate">{c.name}</span>
                    {c.synth_grade && GRADE_STYLE[c.synth_grade] && <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full shrink-0" style={{ background: GRADE_STYLE[c.synth_grade].bg }}>{c.synth_grade}</span>}
                    <VisitorBadges vb={(c as any).vb} />
                  </div>
                  <div className="text-[11px] text-[#7a5122]">{c.area}{c.synth_count ? ` · 리뷰 ${c.synth_count}` : ""}</div>
                </div>
              </button>
              <button onClick={() => onRecord(c)} className="shrink-0 text-[11px] font-bold text-[#b23a5f] border border-[#f0b8cc] rounded-full px-2 py-1 active:scale-95">다녀왔어요</button>
              <button onClick={() => onRemove(c.id)} aria-label="찜 해제" className="shrink-0 text-[#d6336c] text-[18px] px-1 active:scale-90">❤</button>
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
  const [nearHome, setNearHome] = useState<{ lat: number; lng: number } | null>(null); // 홈 '내 주변 옥석 카페' 현재 위치(500m 리스트)
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
    if (!cur) { try { window.dispatchEvent(new Event("dcn:install-hint")); } catch {} } // 즐겨찾기 추가 = 재방문 의도 → PWA 설치 배너 트리거
    try { await fetch("/api/bookmark", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: deviceId, cafeId, action: "toggle", anonId: (() => { try { return localStorage.getItem("dcn_anon") || null; } catch { return null; } })() }) }); }
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
  useLockBodyScroll(explain !== null || showSearch || showConsent || showFavs || showMyCafeReg || !!selected);
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
  const [inViewCount, setInViewCount] = useState<number | null>(null); // 🗺️ 현재 화면(viewport) 안 공개 카페 수(전문성 인디케이터)

  // ⚡ 속도 개선(2026-07-26): /api/cafes는 전 공개카페(13,391곳·char_scores 등 포함, 실측 5.1MB·1.8s)라
  //   지도·지역선택·상세패널에만 필요한데 예전엔 홈 첫 렌더와 동시에(마운트 즉시) 무조건 받아왔다 — 홈
  //   화면이 실제로 필요한 /api/discover(10KB)와 네트워크·메인스레드(JSON.parse+buildAxisDist)를 두고
  //   경쟁해 홈이 뜨는 그 순간을 오히려 늦추고 있었다. 첫 페인트가 끝난 유휴 시간으로 미뤄도 사용자가
  //   카드를 탭하거나 지역을 고르기 전에 이미 도착해 있어 기능은 그대로다.
  useEffect(() => {
    // 📉 2026-08-06: /api/cafes가 char_scores 6축을 고정순서 배열 `cs`로 보낸다(전송량 절감).
    //   받는 즉시 원래 모양으로 되돌리므로 아래 소비 코드(취향 필터·정렬·유사도)는 전부 그대로다.
    const load = () => fetch("/api/cafes").then((r) => r.json()).then((d) => setCafes(decodeCafeScores(d.cafes ?? []))).catch(() => {});
    const ric = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
    if (ric) { const id = ric(load, { timeout: 2000 }); return () => (window as any).cancelIdleCallback?.(id); }
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, []);
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
  const regionCtr = useRef<[number, number, number] | null>(null); // 관제 지역카드 딥링크(?clat&clng&cz) → 지도 센터링(필터 무변경)
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
    // ❤ 2026-08-21: /?favs=1 로 도착하면 '찜한 곳' 모달을 바로 연다.
    //   찜 기능은 있었는데 **찜한 뒤 돌아올 길이 없어** 리텐션 고리가 끊겨 있었다
    //   (상세에서 찜 → 그다음 아무 동선 없음). 저장은 다시 꺼내볼 수 있어야 저장이다.
    if (sp.get("favs") === "1") setShowFavs(true);
    // 📣 공지 모달 '둘러보기' 등에서 시·도 단위로 바로 진입(/?sido=강원&tab=map).
    //   지역이 새로 열렸다고 알려놓고 랜딩으로 떨구면 사용자가 직접 찾아가야 한다 — 알린 곳으로 데려간다.
    const psido = sp.get("sido");
    if (psido && REGIONS[psido]) {
      try { sessionStorage.setItem("dcn_role", "consumer"); } catch {}
      setRole("consumer");
      setHomeSido(psido); setSido(psido);
      if (sp.get("tab") === "map") setTab("map");
    }
    // SEO 동네 페이지(/area/…)에서 '카페 더 보기'로 진입 → 랜딩 건너뛰고 소비자 화면 + 해당 지역 추천
    const region = sp.get("region");
    if (region) {
      try { sessionStorage.setItem("dcn_role", "consumer"); } catch {}
      setRole("consumer");
      // "인천 동구"·"중구" 등 → sido+gu로 분리(안 그러면 동 옵션·지도 필터가 'sigungu==="인천 동구"'로 깨짐)
      const g = toGu(region);
      if (g.sido && g.sigungu) { setHomeSido(g.sido); setHomeGu(g.sigungu); }
      else setHomeGu(region);
      // 관제 지역카드 딥링크(?clat&clng&cz): 좌표 있으면 필터 안 걸고 그 지점으로 지도만 센터링(동/구 정밀). 없으면 홈.
      const clat = Number(sp.get("clat")), clng = Number(sp.get("clng")), cz = Number(sp.get("cz"));
      if (clat && clng) { regionCtr.current = [clat, clng, cz || 14]; setTab("map"); }
      else setTab("home");
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
        setNearHome({ lat: latitude, lng: longitude }); // 📍 내 주변 500m 옥석 리스트도 함께 켬(위치버튼 통일)
        const r = nearestRegion(cafes, latitude, longitude);
        if (!r) { setGeoMsg("서비스 지역 밖이거나 가까운 카페가 없어 전체를 보여드려요"); postConsent(true, { lat: latitude, lng: longitude }); return; }
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
  // 📍 홈 '내 주변 옥석 카페 바로 찾기' — detectLocation이 위치 받아 동네(구) + 500m 옥석 리스트를 함께 켬(위치버튼 통일).
  const clearNearHome = () => { setNearHome(null); };
  const clearAuto = () => { setHomeSido(""); setHomeGu(""); setHomeDong(""); setAutoGu(""); setSido(""); setSigungu(""); setDong(""); setGeoMsg(""); setNearHome(null); };
  // 인천 동명 구(중구·동구) 구분: 인천이면 "인천 OO"로 넘겨야 백엔드가 서울과 안 헷갈림
  const homeRegion = homeGu ? (homeSido === "인천" ? `인천 ${homeGu}` : homeGu) : "";
  useEffect(() => { const u = homeRegion ? `/api/discover?region=${encodeURIComponent(homeRegion)}` : "/api/discover"; setDiscover(null); fetch(u).then((r) => r.json()).then((d) => { if (d.ok) setDiscover(d); }).catch(() => {}); }, [homeRegion]);
  useEffect(() => { const u = homeRegion ? `/api/momentum?region=${encodeURIComponent(homeRegion)}` : "/api/momentum"; setMomentum(null); fetch(u).then((r) => r.json()).then((d) => { if (d.ok) setMomentum({ rising: d.rising ?? [] }); }).catch(() => {}); }, [homeRegion]);

  const openById = useCallback((id: number) => { const c = cafes.find((x) => x.id === id); if (c) setSelected(c); }, [cafes]);

  // 홈 '내 주변 옥석 카페' — 현재 위치 반경 500m의 옥석(검증·참고 등급만, 후보 제외) 카페를 가까운 순으로.
  const nearHomeCafes = useMemo(() => {
    if (!nearHome) return [] as { c: Cafe; d: number }[];
    const R = 500;
    return cafes
      .filter((c) => c.lat && c.lng && (c.synth_grade === "검증" || c.synth_grade === "참고"))
      .map((c) => ({ c, d: distM(nearHome.lat, nearHome.lng, c.lat, c.lng) }))
      .filter((x) => x.d <= R)
      .sort((a, b) => a.d - b.d);
  }, [nearHome, cafes]);
  // 📲 내 주변 옥석 찾기 사용 = 고의도 순간 → PWA 설치 배너 트리거(PwaInstall이 수신, 최근 거절 시 무시)
  useEffect(() => { if (nearHome) { try { window.dispatchEvent(new Event("dcn:install-hint")); } catch {} } }, [nearHome]);

  // 📊 카페 상세 조회 추적 — SPA라 URL이 안 바뀌므로(상태로만 염) 명시적 이벤트로 기록.
  //   인기 카페·전환 퍼널·여러 카페 탐색 패턴 집계의 근거(관제탑 유입 분석). 익명 anon_id만, 개인정보 0.
  const lastTracked = useRef<number | null>(null);
  useEffect(() => {
    if (!selected || lastTracked.current === selected.id) return;
    lastTracked.current = selected.id;
    try {
      const a = localStorage.getItem("dcn_anon");
      if (!a) return;
      fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonId: a, path: `/c/${selected.id}` }), keepalive: true }).catch(() => {});
    } catch {}
  }, [selected]);

  // 뒤로가기 가드: 현재 UI 레이어를 ref로 추적(리스너에서 최신값 참조)
  const uiRef = useRef<{ selected: boolean; showSearch: boolean; showConsent: boolean; tab: string; role: string | null; ownerPwModal: boolean; showSignup: boolean; sido: string; sigungu: string; dong: string; nearMe: boolean; nearHome: boolean }>({ selected: false, showSearch: false, showConsent: false, tab: "home", role: null, ownerPwModal: false, showSignup: false, sido: "", sigungu: "", dong: "", nearMe: false, nearHome: false });
  uiRef.current = { selected: !!selected, showSearch, showConsent, tab, role, ownerPwModal, showSignup, sido, sigungu, dong, nearMe: !!nearMe, nearHome: !!nearHome };
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
    if (u.tab === "home" && u.nearHome) { setNearHome(null); return true; } // 📍 홈 내 주변 500m → 해제(일반 홈)
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
      const u = `/api/search?q=${encodeURIComponent(qq)}${homeRegion ? `&region=${encodeURIComponent(homeRegion)}` : ""}`;
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
      // 📏 축척(전문성) — 미터법만, 좌하단. 스타일은 전역 CSS(.leaflet-control-scale-line)에서 커피 톤으로.
      try { L.control.scale({ imperial: false, position: "bottomleft", maxWidth: 116 }).addTo(mapObj.current); } catch {}
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
      // 🔴 2026-08-24 버그 수리: 예전엔 `filtered`(현재 지역·동·취향 필터가 걸린 목록)에서 골랐다.
      //   그래서 **지도가 다른 구를 보고 있으면 내 추억 핀이 통째로 사라졌다** —
      //   성북구에 저장한 기록이 강동구를 보는 동안 안 보이는 식(실사례: 바이모베이글).
      //   '내 카페'는 내가 어디를 보든 **항상 내 것 전부**가 보여야 한다 → 지역 필터를 태우지 않는다.
      const base = myPinMode ? cafes.filter((c) => myCafeIds.has(c.id) && c.lat && c.lng) : [];
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
    // 🗺️ 현재 화면(실제 viewport, 패딩 없음) 안 공개 카페 수 — 이동/줌마다 실시간 갱신(전문성 인디케이터)
    try { const vb = map.getBounds(); setInViewCount(cafes.reduce((n, c) => (c.lat && c.lng && vb.contains([c.lat, c.lng] as [number, number]) ? n + 1 : n), 0)); } catch {}
    // z≥13(구·동네 줌)부터 카페 — 단, 개별 핀이 아니라 '클러스터'로 묶어 깔끔하게(아래). 광역만 행정 집계.
    const level = (dong || focusId || z >= 13) ? "cafe"
      : sigungu ? "dong"
      : (sido || z >= 11) ? "gu"
      : "sido";
    if (level !== "cafe") {
      // 🔴 2026-08-24: 줌아웃(지역 뭉치) 상태에서도 **내 추억 ❤ 핀은 항상 그린다.**
      //   예전엔 z<13이면 카페 핀 자체를 안 그려서, 지도를 조금만 줌아웃해도 내 기록이 사라졌다.
      //   내 것은 개수가 적고(수~수십) 지도가 어지러워지지 않는다 — 못 찾는 게 훨씬 큰 손해다.
      const myPins = cafes.filter((c) => myCafeIds.has(c.id) && c.lat && c.lng);
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
      // 내 추억 ❤는 지역 뭉치 위에 항상 얹는다(줌아웃해도 안 사라지게).
      for (const c of myPins) {
        markers.push(L.marker([c.lat, c.lng], {
          icon: L.divIcon({ className: "", html: makePinHtml(c, false, false, true), iconSize: [0, 0] }),
          zIndexOffset: 5000,
        }).on("click", () => setSelected(c)));
      }
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
      // 🔴 2026-08-24 버그 수리: **내 카페(❤)가 클러스터에 먹혀 사라졌다.**
      //   포커스 핀만 뭉치기에서 빼주고 내 카페는 빠져 있어, 주변에 카페가 한 곳만 더 있어도
      //   ●N 숫자 뭉치로 흡수돼 화면에서 없어졌다(성북구처럼 밀집 지역은 거의 항상).
      //   내 추억은 '이 지도에서 가장 중요한 핀'이므로 절대 뭉치지 않는다.
      const mineInCell = pts.filter((c) => myCafeIds.has(c.id));
      if (mineInCell.length) {
        for (const mc of mineInCell) addPin(mc);
        pts = pts.filter((c) => !myCafeIds.has(c.id));
      }
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
    // 관제 지역카드 딥링크: 카페 로드되면 지정 좌표로 1회 센터링 후 소진(이후 정상 동작). regionCtr 없으면 무영향(일반 사용).
    if (regionCtr.current && filtered.length > 0) { const [la, ln, z] = regionCtr.current; regionCtr.current = null; map.setView([la, ln], z, { animate: false }); drawMarkers(); return; }
    if (nearMe) { drawMarkers(); return; } // 📍 내 주변 모드: showNearMe가 이미 setView함 → flyTo 충돌 방지, 그리기만
    if (focusId) {
      /* focus effect가 setView 처리 */
    } else if (myPinMode || othersMode) {
      const src = myPinMode ? cafes.filter((c) => myCafeIds.has(c.id) && c.lat && c.lng) : othersPins; // 위와 같은 이유로 지역 필터 제외(2026-08-24)
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
    else { map.flyTo([37.55, 127.55], 8, { duration: 0.45 }); } // 전체(시도 미선택) → 서울~강원 동해안이 한 화면에 들어오게(2026-08-25 강원 편입). 줌9·경도127.05면 강원 집계 원형이 화면 밖으로 밀렸다.
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
  const dongOptions = useMemo(() => sigungu ? [...new Set(cafes.filter((c) => { const g = toGu(c.area); return g.sigungu === sigungu && (!sido || g.sido === sido) && c.dong; }).map((c) => c.dong as string))].sort() : [], [cafes, sigungu, sido]);
  const homeDongOptions = useMemo(() => homeGu ? [...new Set(cafes.filter((c) => { const g = toGu(c.area); return g.sigungu === homeGu && (!homeSido || g.sido === homeSido) && c.dong; }).map((c) => c.dong as string))].sort() : [], [cafes, homeGu, homeSido]);

  // ===== 잡지 카드 컴포넌트 =====
  const chooseConsumer = () => { try { sessionStorage.setItem("dcn_role", "consumer"); } catch {} setRole("consumer"); };
  // 📊 #513 신청 퍼널 계측 — 랜딩 "사장님, 우리 카페 보러가기" CTA 클릭. 읽기전용, 실패해도 무해.
  const trackOwnerCta = () => {
    try {
      const anonId = localStorage.getItem("dcn_anon") || "";
      fetch("/api/owner-funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonId, event: "cta_click", source: "home", path: "/" }), keepalive: true }).catch(() => {});
    } catch {}
  };
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
    // ⚠️ 정상흐름(min-h-screen) 필수 — position:fixed;inset:0로 두면 문서에 흐름 콘텐츠가 0이 돼
    //   인스타 안드로이드 인앱 WebView가 페이지 폭을 못 구하고 좁은 뷰포트로 폴백→화면 확대(초기화면만 깨지던 원인, 2026-07-10).
    //   /area 등 min-h-screen 페이지는 정상이던 것과 동일 패턴으로 맞춤. 세로 가운데정렬은 유지.
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center px-6" style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)", background: "radial-gradient(125% 85% at 50% -5%, #4a3526 0%, #3a2a1d 30%, #2b2018 60%, #241510 100%)", color: "#f4ece0", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }}>
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
        <p className="dcn-rise text-[13px] text-[#8f7a58] mb-5 text-center leading-relaxed" style={{ animationDelay: ".14s" }}>마음에 든 곳은 <span style={{ color: "#d6336c" }}>❤</span>로 <b className="text-[#f4ece0]">나만의 동네 지도</b>에.</p>
        <div className="dcn-rise flex flex-wrap justify-center gap-1.5 mb-8 max-w-xs" style={{ animationDelay: ".16s" }}>
          {["별점, 이제 그만 믿어요", "리뷰 옥석만 남겼어요"].map((t) => (
            <span key={t} className="text-[12px] text-[#e8b87a] border border-[#5b4636] rounded-full px-3 py-1 whitespace-nowrap">{t}</span>
          ))}
        </div>
        <div className="dcn-rise w-full max-w-sm space-y-3" style={{ animationDelay: ".18s" }}>
          <button onClick={chooseConsumer} className="w-full bg-[#e6d3b2] text-[#2b2018] rounded-2xl py-5 px-5 text-left shadow-lg active:scale-[0.99] transition">
            <div className="text-lg font-bold">☕ 우리 동네 카페 보러가기</div>
            <div className="text-[12px] text-[#7c6a55] mt-0.5">진짜 후기로 검증 · 내 취향에 딱 맞게</div>
          </button>
          <button onClick={() => { trackOwnerCta(); setShowSignup(true); }} className="w-full rounded-2xl py-5 px-5 text-left shadow-lg active:scale-[0.99] transition" style={{ background: "#2b2018", border: "1px solid #6b5334" }}>
            <div className="text-lg font-bold text-[#f4ece0]">🏪 사장님, 우리 카페 보러가기</div>
            <div className="text-[12px] text-[#c7ab82] mt-0.5">검증된 후기로 내 카페 경쟁력 진단 · <b className="text-[#e8b87a]">7일 무료 체험 신청</b></div>
          </button>
          <button onClick={() => { setOwnerPw(""); setOwnerErr(""); setOwnerPin(""); setOwnerPinErr(""); setOwnerAdminMode(false); setOwnerPwModal(true); }} className="block w-full text-center text-[12px] text-[#8f7a58] underline">
            이미 키가 있어요 · 로그인
          </button>
        </div>
        <p className="text-[10px] text-[#665036] mt-10 text-center leading-relaxed">네이버·구글·유튜브 공개 후기 교차검증 + AI 맥락 판정<br />광고·협찬·무관 글은 자동 제외</p>
        <div className="mt-3 text-[10px] text-[#665036] flex gap-3">
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
                  <p className="text-[13px] text-[#524234] mb-3">관리자 비밀번호를 입력하세요.</p>
                  <input autoFocus type="password" value={ownerPw} onChange={(e) => setOwnerPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitOwner()}
                    placeholder="관리자 비밀번호" className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white mb-2" />
                  {ownerErr && <p className="text-[12px] text-[#c0392b] mb-2">{ownerErr}</p>}
                  <div className="flex gap-2">
                    <button onClick={submitOwner} className="flex-1 bg-[#2b2018] text-[#f4ece0] rounded-xl py-2.5 font-medium">확인</button>
                    <button onClick={() => setOwnerPwModal(false)} className="px-4 text-[#7a5122]">취소</button>
                  </div>
                  <button onClick={() => { setOwnerAdminMode(false); setOwnerErr(""); }} className="block w-full text-center text-[12px] text-[#7a5122] underline mt-3">← 사장님 키 로그인</button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold mb-1 pr-24">🏪 사장님 로그인</h3>
                  <p className="text-[13px] text-[#524234] mb-3">이메일로 받은 <b>키(PIN)</b>를 입력하면 내 카페 분석으로 바로 들어갑니다.</p>
                  <input autoFocus value={ownerPin} onChange={(e) => setOwnerPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitOwnerPin()}
                    placeholder="발급받은 키(PIN)" className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base bg-white mb-2 tracking-widest font-mono uppercase" />
                  {ownerPinErr && <p className="text-[12px] text-[#c0392b] mb-2">{ownerPinErr}</p>}
                  <div className="flex gap-2">
                    <button onClick={submitOwnerPin} className="flex-1 bg-[#2b2018] text-[#f4ece0] rounded-xl py-2.5 font-bold">내 카페 들어가기</button>
                    <button onClick={() => setOwnerPwModal(false)} className="px-4 text-[#7a5122]">취소</button>
                  </div>
                  <p className="text-[12px] text-[#524234] text-center mt-3">키가 없으세요? <button onClick={() => setShowSignup(true)} className="text-[#7a5122] font-bold underline">7일 무료 체험 신청</button></p>
                  <button onClick={() => { setOwnerAdminMode(true); setOwnerPinErr(""); }} className="block w-full text-center text-[11px] text-[#665036] underline mt-2">관리자세요? 관리자 로그인</button>
                </>
              )}
            </div>
          </div>
        )}
        <OwnerSignupModal open={showSignup} onClose={() => setShowSignup(false)} trial source="home" />
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
      {/* 📣 접속 시 안내 공지 — 데이터는 /api/discover 응답에 얹혀 온다(전용 요청 0, 비용 증가 0) */}
      <NoticeModal source={(discover as any)?.notice ?? null} />
      {/* ✨ 동적 연출(2026-07-30) — CSS 전용·가볍게·reduced-motion 존중. 우리 정체성을 '느끼게': ①골드핀 맥동 ②커피드립 로딩 ③저장 손맛 ④옥석 가리기 */}
      <style>{`
        /* 📥 홈 피드 등장 — 진입하는 순간 카드들이 차례로 떠오름(항상 보이는 화면이라 확실히 느껴짐) */
        @keyframes dcnEnter { 0% { opacity:0; transform:translateY(18px); } 100% { opacity:1; transform:translateY(0); } }
        .dcn-enter { animation: dcnEnter .55s cubic-bezier(.2,.75,.25,1) both; }
        /* ① 골드(우선노출) 핀 — 퍼지는 크레마 링 2겹(시선 유도 + B2B 가치 강조) */
        @keyframes dcnHalo { 0% { box-shadow:0 0 0 0 rgba(224,163,46,0.7); opacity:1; } 100% { box-shadow:0 0 0 16px rgba(224,163,46,0); opacity:0; } }
        .dcn-pin-feat, .dcn-pin-focus { position:relative; }
        .dcn-pin-feat::after, .dcn-pin-focus::after { content:""; position:absolute; inset:-5px; border-radius:50%; pointer-events:none; animation: dcnHalo 1.5s ease-out infinite; }
        .dcn-pin-focus::after { animation-name: dcnHaloF; }
        @keyframes dcnHaloF { 0% { box-shadow:0 0 0 0 rgba(181,112,60,0.7); opacity:1; } 100% { box-shadow:0 0 0 16px rgba(181,112,60,0); opacity:0; } }
        /* ② 커피 드립 로딩 — 스피너 대신 잔에 방울이 떨어지고 김이 오르는 연출 */
        @keyframes dcnDrip { 0% { transform:translate(-50%,-2px) scaleY(.6); opacity:0; } 25% { opacity:1; } 70% { transform:translate(-50%,15px) scaleY(1); opacity:1; } 100% { transform:translate(-50%,15px) scaleY(.2); opacity:0; } }
        @keyframes dcnFill { 0%,100% { transform:scaleY(.72); } 50% { transform:scaleY(.9); } }
        @keyframes dcnSteamRise { 0% { transform:translateY(3px) scaleX(.8); opacity:0; } 30% { opacity:.5; } 100% { transform:translateY(-9px) scaleX(1.3); opacity:0; } }
        .dcn-cload { position:relative; width:34px; height:34px; margin:0 auto; }
        .dcn-cload .cup { position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:24px; height:18px; border:2px solid #6b4f35; border-top:none; border-radius:0 0 9px 9px; background:#fff; overflow:hidden; }
        .dcn-cload .cup::before { content:""; position:absolute; left:0; right:0; bottom:0; height:100%; background:linear-gradient(#a9743e,#7c4f27); transform-origin:bottom; transform:scaleY(.72); animation: dcnFill 1.6s ease-in-out infinite; }
        .dcn-cload .ear { position:absolute; bottom:3px; right:2px; width:7px; height:8px; border:2px solid #6b4f35; border-left:none; border-radius:0 6px 6px 0; }
        .dcn-cload .drip { position:absolute; top:2px; left:50%; width:4px; height:7px; border-radius:0 0 50% 50%; background:#7c4f27; animation: dcnDrip 1.15s ease-in infinite; }
        .dcn-cload .stm { position:absolute; top:-5px; width:3px; height:8px; border-radius:50%; background:linear-gradient(to top, rgba(160,120,70,0), rgba(160,120,70,.5)); filter:blur(1px); }
        .dcn-cload .s1 { left:11px; animation: dcnSteamRise 2.1s ease-in-out infinite; } .dcn-cload .s2 { left:20px; animation: dcnSteamRise 2.4s ease-in-out .7s infinite; }
        /* ③ 저장 손맛 — 별 버튼 팝 + 날아오르는 하트 */
        @keyframes dcnPop { 0% { transform:scale(1); } 35% { transform:scale(1.32); } 60% { transform:scale(.92); } 100% { transform:scale(1); } }
        .dcn-pop { animation: dcnPop .42s cubic-bezier(.3,1.4,.5,1) 1; }
        @keyframes dcnFly { 0% { transform:translate(-50%,0) scale(.7); opacity:0; } 20% { opacity:1; } 100% { transform:translate(-50%,-38px) scale(1.25); opacity:0; } }
        .dcn-fly { position:absolute; left:50%; top:-2px; font-size:16px; pointer-events:none; animation: dcnFly .75s ease-out 1; }
        @media (prefers-reduced-motion: reduce) {
          .dcn-enter, .dcn-pin-feat::after, .dcn-pin-focus::after, .dcn-cload .cup::before, .dcn-cload .drip, .dcn-cload .stm, .dcn-pop, .dcn-fly { animation: none !important; }
          .dcn-enter { opacity:1 !important; transform:none !important; }
        }
        /* 🗺️ 지도 기본 컨트롤을 커피 톤으로(전문성) — 톤은 유지, 밋밋한 라이브러리 기본값만 다듬음 */
        .leaflet-control-zoom { border:none !important; border-radius:12px !important; overflow:hidden; box-shadow:0 3px 12px rgba(50,33,20,.22) !important; }
        .leaflet-control-zoom a { background:#fffdf9 !important; color:#6b4f35 !important; border:none !important; width:34px !important; height:34px !important; line-height:34px !important; font-size:19px !important; font-weight:700 !important; transition:background .15s, color .15s; }
        .leaflet-control-zoom a:hover { background:#f4ece0 !important; color:#2b2018 !important; }
        .leaflet-control-zoom a.leaflet-control-zoom-in { border-bottom:1px solid #ece0cc !important; }
        .leaflet-control-zoom a.leaflet-disabled { background:#f6f0e6 !important; color:#cbbca4 !important; }
        .leaflet-control-scale { margin-bottom:88px !important; margin-left:12px !important; } /* 하단 시트 핸들 바 위로 띄움(가림 방지) */
        .leaflet-control-scale-line { background:rgba(255,253,249,.86) !important; border:1.5px solid #b79a6f !important; border-top:none !important; color:#6b4f35 !important; font:600 10px/1.4 'Gowun Batang',serif !important; padding:1px 6px !important; border-radius:0 0 5px 5px !important; box-shadow:0 1px 5px rgba(50,33,20,.14); }
        .leaflet-control-attribution { background:rgba(255,253,249,.72) !important; color:#9c8569 !important; font-size:9px !important; padding:1px 6px !important; border-radius:6px 0 0 0 !important; }
        .leaflet-control-attribution a { color:#8a6d3b !important; }
      `}</style>
      <header className="shrink-0 bg-[#2b2018] text-[#f4ece0] z-[1500] flex items-center justify-between px-4 gap-3" style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => { try { sessionStorage.removeItem("dcn_role"); } catch {} setRole(null); }} className="text-lg font-bold shrink-0 dcn-shimmer" aria-label="랜딩으로">동네 커피 노트</button>
          {/* 홈/지도/추억 토글 */}
          <div className="flex bg-[#3d2f22] rounded-full p-0.5">
            {(["home", "map", "memory"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 sm:px-3 py-1.5 text-[13px] font-bold rounded-full transition-colors whitespace-nowrap ${tab === t ? "bg-[#f4ece0] text-[#2b2018]" : "text-[#e8d4b0]"}`}>
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
            <button onClick={() => { try { sessionStorage.removeItem("dcn_role"); } catch {} setRole(null); }} className="text-[11px] text-[#8f7a58] underline whitespace-nowrap">사장님이세요?</button>
          )}
        </div>
      </header>

      {/* 홈 = 잡지 1면 */}
      {tab === "home" && (
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "3.25rem", position: "relative" }}>
          {/* 원두 실루엣 장식 제거(2026-07-31 CEO 지시) */}
          <div className="max-w-2xl mx-auto px-5 pt-4 pb-6" style={{
            // 📓 "커피 노트" 정체성 — 콘텐츠 폭에만 딱 맞춘 줄노트 텍스처(전체 화면폭이 아니라 실제
            // 카드가 놓이는 영역에만 스코프해 넓은 화면에서 배경이 따로 노는 것 방지).
            backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(43,32,24,0.06) 27px, rgba(43,32,24,0.06) 28px)",
            backgroundPosition: "0 6px",
            position: "relative", zIndex: 1,
          }}>
            <div className="text-center mb-6" style={{ position: "relative" }}>
              {/* ☕ 커피잔 링 자국 재추가(2026-07-26 v6) — 비네트(어두운 배경 그라데이션)는 "코너가
                  안 보인다"는 피드백으로 뺐지만, 은은한 링 자국만 다시 — 어둡게 깔지 않고 옅은
                  링 두 겹만 그려 텍스트 가독성에 영향 없음. */}
              <div aria-hidden style={{
                position: "absolute", top: -8, right: -4, width: 70, height: 70, pointerEvents: "none", zIndex: 0,
                backgroundImage:
                  "radial-gradient(circle at 80% 25%, transparent 22px, rgba(120,80,40,0.16) 24px, rgba(120,80,40,0.16) 27px, transparent 29px), " +
                  "radial-gradient(circle at 80% 25%, transparent 12px, rgba(120,80,40,0.11) 14px, rgba(120,80,40,0.11) 16px, transparent 18px)",
              }} />
              <div className="text-[10px] tracking-[0.3em] uppercase text-[#7a5122]" style={{ position: "relative" }}>데이터로 큐레이션하는</div>
              <div className="text-xl font-bold border-y-2 border-[#2b2018] py-2 mt-1 dcn-shimmer-dark">{homeGu ? `${homeGu}의 오늘의 커피` : "오늘의 동네 커피"}</div>
              {/* 시·도 → 시·군·구 → 동·면 계층 선택(우리 동네). 검색 돋보기 제거. */}
              <div className="flex gap-1.5 justify-center mt-3 flex-wrap">
                <select value={homeSido} onChange={(e) => { setHomeSido(e.target.value); setHomeGu(""); setHomeDong(""); }} className="border border-[#cbb89f] rounded-lg px-2.5 py-2 text-sm font-bold bg-white text-[#2b2018]">
                  <option value="">시·도</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={homeGu} onChange={(e) => { setHomeGu(e.target.value); setHomeDong(""); }} disabled={!homeSido} className="border border-[#cbb89f] rounded-lg px-2.5 py-2 text-sm font-bold bg-white text-[#2b2018] disabled:opacity-40">
                  <option value="">시·군·구</option>{homeSido && REGIONS[homeSido].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={homeDong} onChange={(e) => { const d = e.target.value; setHomeDong(d); if (d) { setSido(homeSido); setSigungu(homeGu); setDong(d); setFocusId(null); setSheetOpen(false); setTab("map"); } }} disabled={!homeGu || !homeDongOptions.length} className="border border-[#cbb89f] rounded-lg px-2.5 py-2 text-sm font-bold bg-white text-[#2b2018] disabled:opacity-40">
                  <option value="">{homeGu && !homeDongOptions.length ? "우리 동네 (수집중)" : "우리 동네"}</option>{homeDongOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {/* 📍 내 주변 옥석 카페 바로 찾기 — 아이콘만, 하단 내비 '내 위치' 핀과 같은 외곽선 아이콘으로 통일(발광 없음, 주변 select와 같은 톤) */}
                <button onClick={() => (nearHome ? clearNearHome() : openLocation())}
                  aria-label={nearHome ? "내 주변 500m 해제" : "내 주변 옥석 카페 바로 찾기"}
                  className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-lg border transition-colors ${nearHome ? "border-[#7a5122] bg-[#f0e6d4]" : "border-[#cbb89f] bg-white"}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={nearHome ? "#7a5122" : "#8a7458"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21c4.2-4 7-7.2 7-10.5A7 7 0 0 0 5 10.5C5 13.8 7.8 17 12 21Z" /><circle cx="12" cy="10.5" r="2.4" />
                  </svg>
                </button>
              </div>
              <div className="mt-2.5 flex flex-col items-center gap-1">
                {autoGu && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#5f7355] bg-[#eef3ea] border border-[#cfe0c2] rounded-full px-2.5 py-1">📍 내 위치 기준 <b>{autoGu}</b></span>
                    <button onClick={clearAuto} className="text-[11px] text-[#7a5122] underline">전체보기</button>
                  </div>
                )}
                {geoMsg && <span className="text-[10px] text-[#665036]">{geoMsg}</span>}
                {homeGu && !autoGu && <button onClick={clearAuto} className="text-[11px] text-[#7a5122] underline">전체 지역 보기</button>}
              </div>
            </div>
            {nearHome ? (
              <div>
                <div className="flex items-baseline justify-between mb-2 pb-1 border-b-2 border-[#2b2018]">
                  <div className="text-base font-bold text-[#2b2018]">📍 내 주변 500m 옥석 카페</div>
                  <div className="text-[11px] text-[#2f6fb0] shrink-0 font-medium">{nearHomeCafes.length}곳</div>
                </div>
                {nearHomeCafes.length === 0 ? (
                  <div className="text-center text-[#665036] text-[13px] py-12 leading-relaxed">500m 내에 추천할 카페가 없습니다</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {nearHomeCafes.map(({ c, d }) => (
                      <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left bg-white rounded-xl p-3.5 border border-[#ece0cd] hover:border-[#9c6b3f] hover:shadow-md transition-all flex flex-col">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-bold text-sm text-[#2b2018] truncate">{c.name}</span>
                          {c.synth_grade && GRADE_STYLE[c.synth_grade] && <span className="text-[8px] text-white px-1.5 py-0.5 rounded-full shrink-0" style={{ background: GRADE_STYLE[c.synth_grade].bg }}>{c.synth_grade}</span>}
                            <VisitorBadges vb={(c as any).vb} />
                        </div>
                        <div className="text-[11px] text-[#665036]">{c.area}{c.dong ? ` ${c.dong}` : ""} · {Math.round(d)}m · 리뷰 {c.synth_count ?? 0}</div>
                        {c.synth_identity && <p className="text-[12px] text-[#5a4a38] leading-relaxed mt-1.5 line-clamp-2">{c.synth_identity}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : !discover ? <CoffeeLoader label="우리 동네 카페 내리는 중…" /> : (
              <>
                {discover.headlineAList && discover.headlineAList.length > 0 && (
                  <div className="dcn-enter" style={{ animationDelay: "0s" }}>
                    <Spotlight title="💎 오늘의 숨은 보석" items={discover.headlineAList} onOpen={openById} sub="검증됐지만 덜 알려진" toneOffset={0}
                      info={<>검증 등급인데 아직 <b>리뷰가 적어 덜 알려진</b> 카페예요. 매일 다른 곳이 스포트라이트에 올라와요.</>} />
                  </div>
                )}
                {discover.headlineBList && discover.headlineBList.length > 0 && (
                  <div className="dcn-enter" style={{ animationDelay: ".1s" }}>
                    <Spotlight title={discover.themeB ? `${discover.themeB.emoji} 오늘의 테마 · ${discover.themeB.label}` : "🔥 커피에 진심인 집"} items={discover.headlineBList} onOpen={openById} sub="테마 매칭 순" toneOffset={1}
                      info={<>커피 성격(로스팅·작업·조용함·디저트·분위기·공간) 중 하나를 <b>매일 돌아가며</b> 소개해요.</>} />
                  </div>
                )}
                {discover.featured && discover.featured.length > 0 && <div className="dcn-enter" style={{ animationDelay: ".2s" }}><Spotlight title="✨ 추천 카페" items={discover.featured} onOpen={openById} sub="쇼케이스" toneOffset={2} info={<>사장님이 직접 <b>홍보 중인 쇼케이스 카페</b>예요(우선 노출). 후기·등급은 다른 카페와 똑같이 검증된 값이에요.</>} /></div>}
                <div className="dcn-enter" style={{ animationDelay: ".3s" }}><RankSpotlight top3={discover.top3} momentum={momentum?.rising.slice(0, 5) ?? []} specialty={discover.specialty} fresh={discover.fresh} onOpen={openById} /></div>
                <button onClick={() => { setSido(homeSido); setSigungu(homeGu); setDong(homeDong); setFocusId(null); setSheetOpen(false); setTab("map"); }} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-medium mt-2">🗺 {homeDong ? `${homeDong} 지도로 보기` : homeGu ? `${homeGu} 지도로 보기` : "지도에서 전체 둘러보기"} →</button>
              </>
            )}
            <p className="text-[10px] text-[#665036] mt-6 text-center leading-relaxed">모든 큐레이션은 네이버 공개 후기를 교차검증한 데이터 기반입니다.</p>
          </div>

        </div>
      )}

      {/* 지도 탭 */}
      {/* 지도 블록은 항상 마운트하고 비활성 탭에선 숨김 → 탭 전환 시 지도 파괴/재생성 없음(빠른 전환) */}
      <div className="flex-1 relative md:flex overflow-hidden" style={{ display: tab === "map" ? undefined : "none" }}>
          <div className="absolute inset-0 md:relative md:flex-1 md:p-5">
            <div ref={mapRef} className="w-full h-full md:rounded-2xl overflow-hidden bg-[#e8e0d3] z-0" />
            {/* 🗺️ 현재 화면 카페 수 — 좌상단 줌버튼 아래(전문성). 커버리지를 숫자로. 이동/줌마다 실시간 갱신 */}
            {inViewCount != null && (
              <div className="absolute top-[5.5rem] left-3 z-[1100] pointer-events-none">
                <div className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3 py-1.5 text-[11px] font-bold shadow-lg" style={{ background: "rgba(43,32,24,0.86)", color: "#f4ece0", backdropFilter: "blur(3px)" }}>
                  <span className="text-[#e8b87a] text-[12px] leading-none">☕</span>
                  <span>이 화면 <b className="text-[#e8b87a]">{inViewCount.toLocaleString()}</b>곳</span>
                </div>
              </div>
            )}
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
                className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors ${showStreets ? "bg-[#5b4636] text-white" : "bg-white/95 text-[#665036] border border-[#e0d3bd]"}`}>
                <span className="text-[12px] leading-none">🏷️</span><span>상세 {showStreets ? "ON" : "OFF"}</span>
              </button>
              <button onClick={() => setShowBus((v) => !v)}
                className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors ${showBus ? "bg-[#235a86] text-white" : "bg-white/95 text-[#665036] border border-[#bcd0e0]"}`}>
                <span className="text-[12px] leading-none">🚌</span><span>버스 {showBus ? "ON" : "OFF"}</span>
              </button>
            </div>
            {/* 📍 내 주변 안내/해제 — 활성 또는 안내 메시지 있을 때 */}
            {(nearMe || nearMsg) && (
              <div className="absolute top-[3.25rem] left-1/2 -translate-x-1/2 z-[1100] bg-white/95 backdrop-blur rounded-full shadow-lg px-3 py-1.5 text-[11px] text-[#23527c] flex items-center gap-2 whitespace-nowrap">
                <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#2f6fb0" }} />
                {nearMsg ? <span>{nearMsg}</span> : <><span>내 위치 반경 <b>500m</b> 카페</span><button onClick={clearNearMe} className="text-[#665036] font-bold ml-0.5">✕ 해제</button></>}
              </div>
            )}
            {/* 범례 — 두 핀의 의미 안내(켜졌을 때만). 같은 카페면 핀이 하나로 병합됨 */}
            {(myPinMode || othersMode) && (
              <div className="absolute top-3 left-3 z-[1100] bg-white/95 backdrop-blur rounded-xl shadow-lg px-3 py-2 text-[11px] text-[#4a3a2a] leading-snug max-w-[150px]">
                {myPinMode && <div className="flex items-center gap-1.5 mb-0.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#d6336c" }} />❤ 내가 저장한 카페</div>}
                {othersMode && <div className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#5f7355" }} />숫자 = 저장한 사람 수</div>}
                {myPinMode && othersMode && <div className="mt-1 pt-1 border-t border-[#eee2d2] text-[10px] text-[#665036]">같은 카페면 ❤에 인원 배지로 합쳐져요</div>}
              </div>
            )}
          </div>
          {/* MapControls(지역/결/목록)는 무겁다(전체 정렬). 지도 탭일 때만 마운트 → 다른 화면 상태변경 시 재조정/정렬 안 함. 지도 div는 위에서 항상 유지. */}
          {tab === "map" && (<>
          <aside className="hidden md:block md:w-[380px] md:h-full bg-[#fdfaf4] border-l border-[#ece0cd] overflow-y-auto p-6 relative z-10">
            <MapControls {...{ sido, sigungu, dong, onSido, onSigungu, setDong, dongOptions, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto, setShowFavs, favCount: cafes.filter((c) => bookmarkIds.has(c.id)).length, closeSheet: () => { setFocusId(null); setSheetOpen(false); } }} />
          </aside>
          <div className="md:hidden absolute left-0 right-0 bg-[#fdfaf4] rounded-t-3xl shadow-[0_-4px_24px_rgba(0,0,0,0.18)] z-[1200] flex flex-col transition-transform duration-300 ease-out will-change-transform" style={{ bottom: "3.25rem", height: "72dvh", transform: sheetOpen ? "translateY(0)" : "translateY(calc(72dvh - 2.75rem))" }}>
            {/* 접힘 시 정확히 이 핸들(2.75rem)까지만 보이게 — 아래 목록이 삐져나오지 않음 */}
            <button onClick={() => setSheetOpen((o) => !o)} className="shrink-0 w-full flex flex-col items-center justify-center gap-1" style={{ height: "2.75rem" }} aria-expanded={sheetOpen}>
              <div className="w-9 h-1 bg-[#cbb89f] rounded-full" />
              <span className="text-[11px] font-bold text-[#7a5122] leading-none">{sheetOpen ? "지도 보기 ▾" : `지역·필터 펼치기 ▴ (${filtered.length})`}</span>
            </button>
            <div className="flex-1 overflow-y-auto px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
              <MapControls {...{ sido, sigungu, dong, onSido, onSigungu, setDong, dongOptions, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto, setShowFavs, favCount: cafes.filter((c) => bookmarkIds.has(c.id)).length, closeSheet: () => { setFocusId(null); setSheetOpen(false); } }} />
            </div>
          </div>
          </>)}
        </div>

      {tab === "memory" && <MemoryTab device={deviceId} visits={myVisits} locked={myLocked} sessionPin={sessionPin}
        onReload={() => reloadMyCafes(deviceId, sessionPin)}
        onRegister={() => { setEditCafeId(null); setShowMyCafeReg(true); }}
        onEdit={(id: number) => { setEditCafeId(id); setShowMyCafeReg(true); }}
        onUnlock={(p: string) => { try { sessionStorage.setItem("dcn_pin", p); } catch {} setSessionPin(p); setMyLocked(false); reloadMyCafes(deviceId, p); }}
        onLock={() => { try { sessionStorage.removeItem("dcn_pin"); } catch {} setSessionPin(""); reloadMyCafes(deviceId, ""); }}
        onRestore={(dev: string) => { try { localStorage.setItem("dcn_device", dev); } catch {} setDeviceId(dev); reloadMyCafes(dev, ""); }} />}

      {/* 하단 빠른 액션 바 — 모바일 전용. 뷰포트 바닥에 직접 고정 + 안전영역(홈인디케이터)까지 바 색으로 채움(네이버 방식) */}
      <nav className="md:hidden flex items-stretch" style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: "3.25rem", zIndex: 1300, background: tab === "map" ? "#fdfaf4" : "#f4ece0", boxShadow: "0 -1px 0 rgba(0,0,0,0.06)" }}>
        {[
          { k: "home", label: "홈", icon: <path d="M3 11.2 12 4l9 7.2M5.5 9.7V20h13V9.7" />, solid: false, active: tab === "home" && !showFavs && !showSearch },
          { k: "fav", label: "즐겨찾기", icon: <path d="M12 4.5l2.3 4.7 5.2.8-3.75 3.65.9 5.15L12 16.9l-4.65 2.45.9-5.15L4.5 10l5.2-.8z" />, solid: true, active: showFavs },
          { k: "search", label: "검색", icon: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>, solid: false, active: showSearch },
          { k: "loc", label: "내 위치", icon: <><path d="M12 21c4.2-4 7-7.2 7-10.5A7 7 0 0 0 5 10.5C5 13.8 7.8 17 12 21Z" /><circle cx="12" cy="10.5" r="2.4" /></>, solid: false, active: !!nearHome },
        ].map((a) => {
          const color = a.active ? "#9c6b3f" : "#8a7458";
          return (
          <button key={a.k} onClick={() => {
            // 📊 2026-08-24: 지도앱 내부 행동은 계측이 없어 "즐겨찾기를 본 사람이 있나"조차 답할 수 없었다.
            //   기존 outbound_clicks에 함께 담아 유입~저장~재방문을 한 잣대로 본다(새 테이블·API 0).
            trackOutbound({ target: a.k === "fav" ? "fav_open" : a.k === "search" ? "map_cta" : "map_cta", source: `지도앱탭:${a.k}` });
            if (a.k === "home") setTab("home");
            else if (a.k === "fav") setShowFavs(true);
            else if (a.k === "search") { setSearchRes(null); setSearchQ(""); setShowSearch(true); }
            else openLocation();
          }} className="flex-1 flex flex-col items-center justify-center active:bg-[#ece0cd]" aria-label={a.label} aria-current={a.active ? "page" : undefined}>
            <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl px-4 py-1 transition-colors" style={{ background: a.active ? "#f0e6d4" : "transparent" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill={a.solid && a.active ? color : "none"} stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{a.icon}</svg>
              <span className="text-[10px] font-bold leading-none whitespace-nowrap" style={{ color }}>{a.label}</span>
            </div>
          </button>
          );
        })}
      </nav>
      {showFavs && <FavoritesModal items={cafes.filter((c) => bookmarkIds.has(c.id))} onClose={() => setShowFavs(false)}
        onOpen={(c: Cafe) => { setShowFavs(false); setSelected(c); }}
        onRemove={(id: number) => toggleBookmark(id)}
        // 찜 목록 → 그 카페가 선택된 채로 기록 모달을 연다(기억이 살아있는 순간에 잇기).
        onRecord={(c: Cafe) => { trackOutbound({ target: "record", cafeId: c.id, source: "찜목록" }); setShowFavs(false); setEditCafeId(c.id); setShowMyCafeReg(true); }} />}
      {showMyCafeReg && <MyCafeRegModal cafes={cafes} device={deviceId} visits={myVisits} pin={sessionPin} initialCafeId={editCafeId} onClose={() => { setShowMyCafeReg(false); setEditCafeId(null); }} onDone={() => { reloadMyCafes(deviceId, sessionPin); }} />}

      {selected && <CafePanel cafe={selected} dist={axisDist} allCafes={cafes} onOpenCafe={openById} bookmarked={bookmarkIds.has(selected.id)} onToggleBookmark={() => toggleBookmark(selected.id)} onSaveMemory={() => { setEditCafeId(selected.id); setShowMyCafeReg(true); }} onClose={() => setSelected(null)} onMap={() => {
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
                <p className="text-[13.5px] text-[#3d2f22] leading-relaxed">내가 머문 카페, 그날의 커피와 순간을 <b>❤로 기록한 추억</b>들이에요. 지도 위에 하나둘 모아 <b>나만의 추억 지도</b>를 그려가요. <span className="text-[#665036]">(이 기기에만 소중히 담겨요.)</span></p>
              </>
            ) : (
              <>
                <div className="text-[16px] font-bold text-[#5f7355] mb-2">👥 다른 사람은</div>
                <p className="text-[13.5px] text-[#3d2f22] leading-relaxed">다른 사람들이 <b>마음에 담아둔 카페</b>들이에요. 추억이 많이 쌓인 곳일수록 크게 피어나, <b>동네에서 사랑받는 카페</b>가 한눈에 보여요.</p>
              </>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => { const t = explain; setExplain(null); revealMode(t); }} className="flex-1 bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-sm font-bold">닫기</button>
              <button onClick={() => { const t = explain; suppressExplain(t); setExplain(null); revealMode(t); }} className="flex-1 bg-white border border-[#cbb89f] text-[#524234] rounded-lg py-2.5 text-[13px]">일주일 동안 보지 않기</button>
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
                <button onClick={() => setShowSearch(false)} className="text-2xl text-[#7a5122] leading-none px-1 shrink-0">×</button>
              </div>
              <div className="text-[11px] text-[#5f7355] mt-2 font-medium">💡 “비 오는 날 조용히” 같은 <b>느낌</b>은 물론, <b>카페 이름</b>을 바로 적어도 찾아드려요.</div>
              <div className="text-[11px] text-[#665036] mt-1">{homeGu ? `📍 ${homeGu} 안에서` : "전체 지역에서"} 검색</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SEARCH_EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => runSearch(ex)} className="text-[11px] text-[#524234] bg-[#f0e6d4] rounded-full px-2.5 py-1">{ex}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
              {searchLoading ? <CoffeeLoader label="취향 맞는 카페 찾는 중…" />
                : !searchRes ? <p className="text-center text-[#665036] py-10 text-sm leading-relaxed">"비 오는 날 혼자 조용히", "감성 사진 데이트"처럼<br />구체적이지 않아도 떠오르는 느낌으로 찾아드려요.</p>
                : (
                  <>
                    {searchRes.coverageNote && (
                      <div className="mb-3 rounded-xl border border-[#e3c79a] bg-[#fff8ec] px-3.5 py-3 text-[12px] text-[#7a5a1e] leading-relaxed">
                        ⚠️ {searchRes.coverageNote}
                      </div>
                    )}
                    {searchRes.franchiseNote && (
                      <div className="mb-3 rounded-xl border border-[#d8c8ad] bg-[#faf5ea] px-3.5 py-3 text-[12px] text-[#6b5640] leading-relaxed">
                        ☕ {searchRes.franchiseNote}
                      </div>
                    )}
                    {searchRes.concepts.length > 0 && <div className="text-[11px] text-[#5f7355] mb-3">감지된 느낌: <b>{searchRes.concepts.join(" · ")}</b></div>}
                    {searchRes.results.length === 0 ? (
                      <p className="text-center text-[#665036] py-10 text-sm">결과가 없어요. 다른 표현이나 더 넓은 동네로 시도해 보세요.</p>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[11px] text-[#665036] mb-1">{searchRes.region} · {searchRes.count}곳 중 가까운 순</div>
                        {searchRes.results.map((r) => (
                          <button key={r.id} onClick={() => { openById(r.id); setShowSearch(false); }} className="w-full text-left bg-white rounded-xl p-3.5 border border-[#ece0cd] hover:border-[#9c6b3f]">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-bold text-sm text-[#2b2018]">{r.name}</span>
                              {r.grade && GRADE_STYLE[r.grade] && <span className="text-[8px] text-white px-1 py-0.5 rounded-full" style={{ background: GRADE_STYLE[r.grade].bg }}>{r.grade}</span>}
                                <VisitorBadges vb={(r as any).vb} />
                              <span className="text-[10px] text-[#665036] ml-auto">{r.area} · 리뷰 {r.count ?? 0}</span>
                            </div>
                            {r.identity && <p className="text-[11px] text-[#524234] line-clamp-1 mb-1">{r.identity}</p>}
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
            <h3 className="text-lg font-bold text-[#2b2018] mb-2">내 주변 옥석 카페 바로 찾기</h3>
            <p className="text-[13px] text-[#52402e] leading-relaxed mb-2.5">
              위치를 켜면 지금 <b>걸어갈 만한 거리의 검증된 옥석 카페</b>만 골라서 바로 보여드려요. 옆동네까지 헤맬 필요 없이, <b>내 동네부터</b>.
            </p>
            <div className="flex flex-col gap-1 mb-3 bg-[#f1f5ee] border border-[#d6e3ca] rounded-xl px-3.5 py-2.5">
              <div className="text-[12.5px] text-[#3f5a37] font-medium">🚶 <b>내 주변 500m</b> 걸어갈 카페만 딱</div>
              <div className="text-[12.5px] text-[#3f5a37] font-medium">🎯 내 동네 검증 후기 카페 <b>자동 정렬·추천</b></div>
              <div className="text-[12.5px] text-[#3f5a37] font-medium">☕ 광고·옆가게 없이 <b>진짜 후기로 가린 옥석</b>만</div>
            </div>
            <p className="text-[11.5px] text-[#524234] leading-relaxed mb-3">
              🔒 정확한 좌표가 아니라 <b>대략적 지역(≈500m)만</b> 쓰고, 이름·연락처 같은 <b>개인정보는 일절 안 받아요</b>. 동의는 <b>선택</b>이고 언제든 끌 수 있어요. 동의하시면 브라우저가 위치 권한을 한 번 더 물어봅니다.
            </p>
            <details className="mb-4">
              <summary className="text-[12px] text-[#7a5122] cursor-pointer">수집·이용 동의 내용 자세히 보기</summary>
              <div className="text-[11px] text-[#524234] leading-relaxed mt-2 bg-[#f4ece0] rounded-lg p-3 space-y-1">
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
              <button onClick={onAgree} className="w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 font-bold">📍 내 주변 옥석 카페 보기</button>
              <button onClick={onDecline} className="w-full text-[#7a5122] rounded-xl py-2 text-sm">아니요, 전체 볼게요</button>
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

function MapControls({ sido, sigungu, dong, onSido, onSigungu, setDong, dongOptions, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto, setShowFavs, favCount, closeSheet }: any) {
  // 🧳🏠 방문객 성격 필터 — 배지가 전체의 7%뿐이라 목록을 훑어서는 못 찾는다(CEO 지적).
  //   "동네 단골 후기 있는 곳만 보기"는 우리 정체성 그 자체라 필터로서도 값이 크다.
  const [vbFilter, setVbFilter] = useState<"" | "L" | "T">("");
  // 정렬: 카테고리(결) 선택 시 그 결이 강한 순, 아니면 검증 리뷰 많은 순. 검색범주 안에서도 동일 기준.
  const sortLabel = tasteKey ? `'${TASTE_CHOICES.find((t: any) => t.key === tasteKey)?.label}' 결 강한 순` : "검증 리뷰 많은 순";
  // 전체 정렬은 무거우므로 메모이즈 — 모달 열고닫기 등으로 재렌더돼도 filtered/tasteKey/matchSet가 그대로면 재정렬 안 함.
  const listCafes: Cafe[] = useMemo(() => {
    let base = tasteKey ? filtered.filter((c: Cafe) => matchSet.has(c.id)) : filtered;
    if (vbFilter) base = base.filter((c: Cafe) => ((c as any).vb ?? "").includes(vbFilter));
    return [...base].sort((a: Cafe, b: Cafe) => {
      if (tasteKey) { const d = ((b.char_scores ?? {})[tasteKey] ?? 0) - ((a.char_scores ?? {})[tasteKey] ?? 0); if (d) return d; }
      return (b.synth_count ?? 0) - (a.synth_count ?? 0);
    });
  }, [filtered, tasteKey, matchSet, vbFilter]);
  // 필터 칩에 곳수를 미리 보여준다 — 눌러봤더니 0곳이면 기능이 고장난 걸로 오해한다.
  const vbCounts = useMemo(() => {
    const base = tasteKey ? filtered.filter((c: Cafe) => matchSet.has(c.id)) : filtered;
    return { L: base.filter((c: any) => (c.vb ?? "").includes("L")).length, T: base.filter((c: any) => (c.vb ?? "").includes("T")).length };
  }, [filtered, tasteKey, matchSet]);
  return (
    <>
      {/* 즐겨찾기 진입 — 데스크톱 전용(모바일은 하단 네비에 이미 있음). 하단 네비는 md:hidden이라 데스크톱엔 진입로가 없었음 */}
      {setShowFavs && (
        <button onClick={() => { trackOutbound({ target: "fav_open", source: "지도앱" }); setShowFavs(true); }} className="hidden md:flex items-center justify-center gap-1.5 w-full mb-4 rounded-xl border border-[#e8b4c4] bg-[#fdf0f4] text-[#d6336c] font-bold text-sm py-2.5 active:bg-[#fbe4ec]" aria-label={`즐겨찾기${favCount ? ` ${favCount}곳` : ""}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#d6336c" stroke="#d6336c" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 4.5l2.3 4.7 5.2.8-3.75 3.65.9 5.15L12 16.9l-4.65 2.45.9-5.15L4.5 10l5.2-.8z" /></svg>
          즐겨찾기{favCount ? ` (${favCount})` : ""}
        </button>
      )}
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
        {geoMsg && <div className="text-[10px] text-[#665036] mt-1.5">{geoMsg}</div>}
        {(sido || sigungu || dong) && <button onClick={() => { if (clearAuto) clearAuto(); else { onSido(""); } }} className="text-xs text-[#7a5122] underline mt-2">전체</button>}
      </div>
      <div className="mb-5">
        <div className="text-sm font-bold text-[#52402e] mb-2.5 flex items-center gap-1.5">☕ 어떤 카페 찾으세요?<InfoDot title="'결'로 거르기"><b>결</b>은 후기에서 자주 언급되는 카페의 성격이에요(조용·작업·디저트·로스팅 등). 고르면 그 결이 강한 카페만 핀·목록에 뜨고, <b>그 결이 많이 언급된 순</b>으로 정렬돼요. 측정값이 아니라 '리뷰에서 자주 나온 정도'입니다.</InfoDot></div>
        <div className="grid grid-cols-2 gap-2.5">
          {TASTE_CHOICES.map((t) => (
            <button key={t.key} onClick={() => setTasteKey(tasteKey === t.key ? null : t.key)} className={`rounded-xl p-3 text-left border transition-colors ${tasteKey === t.key ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#2b2018] border-[#cbb89f]"}`}>
              <div className="text-xl mb-0.5">{t.emoji}</div><div className="text-xs font-bold">{t.label}</div>
              <div className={`text-[10px] mt-0.5 ${tasteKey === t.key ? "text-[#d4a574]" : "text-[#665036]"}`}>{t.desc}</div>
            </button>
          ))}
        </div>
        {tasteKey && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-[#7a5122]">'{TASTE_CHOICES.find((t) => t.key === tasteKey)?.label}' 결이 자주 언급되는 {matchSet.size}곳만 보는 중</p>
            <a href={`/taste/${tasteKey}`} className="text-[11px] font-bold text-[#7a5122] border border-[#d9c9b0] rounded-full px-2.5 py-1 shrink-0 whitespace-nowrap">🔗 내 취향 공유</a>
          </div>
        )}
      </div>
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-bold text-[#52402e]">목록 ({listCafes.length}{tasteKey ? ` · ${TASTE_CHOICES.find((t: any) => t.key === tasteKey)?.label}` : ""})</div>
          <div className="text-[10px] text-[#7a5122] shrink-0">↕ {sortLabel}</div>
        </div>
        {/* 🧳🏠 방문객 성격 필터 — 배지가 소수라 목록을 훑어선 못 찾는다. 곳수를 함께 보여줘 헛클릭을 막는다. */}
        {(vbCounts.L > 0 || vbCounts.T > 0) && (
          <div className="flex gap-1.5 mb-2.5 flex-wrap">
            {([["L", "🏠", "동네 단골 후기", vbCounts.L], ["T", "🧳", "여행 후기 많음", vbCounts.T]] as const).map(([k, emoji, label, n]) => n > 0 && (
              <button key={k} onClick={() => setVbFilter(vbFilter === k ? "" : (k as "L" | "T"))}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${vbFilter === k ? "bg-[#4a5a4e] text-white border-[#4a5a4e]" : "bg-white text-[#4a5a4e] border-[#c9dbcf]"}`}>
                {emoji} {label} {n}
              </button>
            ))}
            {vbFilter && <button onClick={() => setVbFilter("")} className="text-[11px] text-[#7a5122] underline px-1">전체</button>}
          </div>
        )}
        {listCafes.length === 0 ? <p className="text-xs text-[#665036] bg-[#f4ece0] rounded-lg p-4">{tasteKey ? "이 카테고리에 해당하는 카페가 이 지역엔 없어요. 다른 결을 골라보세요." : "지역을 선택하면 목록이 나와요."}</p> : (
          <div className="space-y-2">
            {listCafes.slice(0, 50).map((c: Cafe) => (
              <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left bg-[#f4ece0] rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-[#2b2018]">{c.name}</span>
                  {c.synth_grade && GRADE_STYLE[c.synth_grade] && <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full" style={{ background: GRADE_STYLE[c.synth_grade].bg }}>{GRADE_STYLE[c.synth_grade].label}</span>}
                    <VisitorBadges vb={(c as any).vb} />
                  {tasteKey && matchSet.has(c.id) && <span className="text-[10px] text-[#5f7355]">✓</span>}
                  <span className="text-[10px] text-[#665036] ml-auto">{c.area} · 리뷰 {c.synth_count ?? 0}</span>
                </div>
                <div className="text-[11px] text-[#524234] line-clamp-1">{c.note || c.vibe}</div>
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

function CafePanel({ cafe, dist, allCafes, onOpenCafe, onClose, onMap, bookmarked = false, onToggleBookmark, onSaveMemory }: { cafe: Cafe; dist: AxisDist; allCafes?: Cafe[]; onOpenCafe?: (id: number) => void; onClose: () => void; onMap: () => void; bookmarked?: boolean; onToggleBookmark?: () => void; onSaveMemory?: () => void }) {
  const g = cafe.synth_grade ? GRADE_STYLE[cafe.synth_grade] : null;
  const [saveFx, setSaveFx] = useState(false); // ③ 저장 손맛 — 담는 순간에만 팝+하트 연출
  const onBookmark = () => { const willSave = !bookmarked; onToggleBookmark?.(); if (willSave) { setSaveFx(true); setTimeout(() => setSaveFx(false), 800); } };
  const [reviews, setReviews] = useState<EvidenceReview[]>([]);
  const [quality, setQuality] = useState<QualityStats | null>(null);
  const [llmJudged, setLlmJudged] = useState(false);
  const [loadingRev, setLoadingRev] = useState(true);
  const [promo, setPromo] = useState<any>(null);
  const [showAllReviews, setShowAllReviews] = useState(false);
  useLockBodyScroll(showAllReviews);
  const [reviewFilter, setReviewFilter] = useState<"all" | "verified" | "reference" | "ai" | "youtube">("all");
  const [userReviews, setUserReviews] = useState<{ memory: string; photos: string[]; favorite: boolean; date: string }[]>([]); // 공개 방문자 후기
  const [highlights, setHighlights] = useState<{ label: string; emoji: string; count: number }[]>([]); // 옥석 리뷰 데이터 핵심
  const [reputationNote, setReputationNote] = useState<string | null>(null);
  useEffect(() => {
    let live = true; setLoadingRev(true); setPromo(null); setUserReviews([]); setHighlights([]); setReputationNote(null);
    fetch(`/api/cafe-detail?id=${cafe.id}`).then((r) => r.json()).then((d) => { if (live) { setReviews(d.reviews ?? []); setQuality(d.quality ?? null); setLlmJudged(!!d.llmJudged); setHighlights(d.highlights ?? []); setReputationNote(d.reputationNote ?? null); setLoadingRev(false); } }).catch(() => { if (live) setLoadingRev(false); });
    fetch(`/api/owner-promo?cafeId=${cafe.id}`).then((r) => r.json()).then((d) => { if (live && d.promo && (d.promo.ai_headline || d.promo.video_url)) { setPromo(d.promo); trackPromo(cafe.id, "view"); } }).catch(() => {});
    fetch(`/api/cafe-reviews?cafeId=${cafe.id}`).then((r) => r.json()).then((d) => { if (live && d.ok) setUserReviews(d.reviews ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [cafe.id]);
  const kept = quality ? quality.verified + quality.reference : 0;
  const chars = topChars(cafe, 4);
  const profile = useMemo(() => cafeProfile(cafe, dist), [cafe, dist]); // 전체 대비 강점/아쉬운점
  // 🔁 리텐션 훅 — 지도 패널에서도 /c/[id] 상세와 동일 로직으로 '비슷한 카페 더보기'(decisions #338/#347).
  //   지도가 이미 전체 공개 카페(cafes)를 들고 있어 별도 API 호출 없이 클라이언트에서 바로 계산.
  const nearby = useMemo(() => {
    if (!allCafes || allCafes.length === 0) return [];
    const mine = tasteVector(cafe.char_scores, cafe.synth_count);
    return allCafes
      .filter((c) => c.area === cafe.area && c.id !== cafe.id)
      .map((c) => ({ ...c, sim: tasteSimilarity(mine, tasteVector(c.char_scores, c.synth_count)) }))
      .sort((a, b) =>
        (GRADE_RANK[a.synth_grade ?? ""] ?? 3) - (GRADE_RANK[b.synth_grade ?? ""] ?? 3) ||
        b.sim - a.sim ||
        (b.synth_count ?? 0) - (a.synth_count ?? 0))
      .slice(0, 6);
  }, [allCafes, cafe]);
  const [shared, setShared] = useState(false);
  // 부드러운 슬라이드인 등장 — 마운트 직후 한 프레임 뒤 transition을 트리거(오른쪽에서 미끄러져 들어옴).
  const [shown, setShown] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(r); }, []);
  const shareCafe = async () => {
    const url = `${typeof window !== "undefined" ? window.location.origin : "https://dongnecoffeenote.com"}/c/${cafe.id}`;
    const title = `${cafe.name} (${cafe.area}) — 동네 커피 노트`;
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) { await (navigator as any).share({ title, text: title, url }); trackShare({ channel: "web", source: "카페상세", cafeId: cafe.id }); }
      else { await navigator.clipboard.writeText(url); trackShare({ channel: "clipboard", source: "카페상세", cafeId: cafe.id }); setShared(true); setTimeout(() => setShared(false), 1800); }
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
                <div className="text-center text-[10px] text-[#7a5122] mt-2 tracking-wide">사장님이 직접 올린 우리 가게 영상</div>
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
              <span className="relative inline-flex">
                {saveFx && <span className="dcn-fly" aria-hidden="true">★</span>}
                <button onClick={() => { trackOutbound({ target: "fav_toggle", source: "지도앱" }); onBookmark?.(); }} aria-label="즐겨찾기" className={`flex items-center gap-1 border rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${saveFx ? "dcn-pop" : ""}`} style={bookmarked ? { color: "#fff", background: "#f0a832", borderColor: "#f0a832" } : { color: "#9c6b3f", borderColor: "#e0d2bd" }}>{bookmarked ? "★ 즐겨찾기" : "☆ 즐겨찾기"}</button>
              </span>
              <KakaoShare
                title={`${cafe.name} (${cafe.area})`}
                description={shareHookText(cafe.synth_grade, (cafe as any).identity || cafe.signature)}
                imageUrl={`https://dongnecoffeenote.com/c/${cafe.id}/opengraph-image`}
                link={`https://dongnecoffeenote.com/c/${cafe.id}`}
                source="카페상세"
                className="flex items-center gap-1 bg-[#FEE500] text-[#3c1e1e] rounded-full pl-2 pr-2.5 py-1 text-[12px] font-bold"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#3c1e1e"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.6.1 1.3.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>
                공유
              </KakaoShare>
              <button onClick={onClose} className="text-3xl text-[#7a5122] leading-none px-1">×</button>
            </div>
          </div>
          {/* ❤ MY PIN(내 카페 추억) 노출 배너 — 지도 패널에서도 눈에 띄게(#339/#347, /c/[id] 배너와 동일 톤). 2단계 저장·무가입 원칙 무변, 노출만 강화 */}
          {onSaveMemory && (
            <button type="button" onClick={onSaveMemory}
              className="w-full flex items-center justify-between gap-2 rounded-xl px-4 py-3 border border-[#f0b8cc] text-left mb-3"
              style={{ background: "linear-gradient(90deg,#fdeaf1,#f4ece0)" }}>
              <span className="flex flex-col">
                <span className="text-[12.5px] font-bold text-[#b23a5f] flex items-center gap-1">
                  <span className="text-[14px] leading-none">❤</span> 이 카페, 다녀가셨나요?
                </span>
                <span className="text-[10.5px] text-[#6f6047]">위치인증하고 나만의 추억으로 저장 — 무가입·30초</span>
              </span>
              <span className="text-[#d6336c] font-bold whitespace-nowrap">→</span>
            </button>
          )}
          <div className="text-[#7a5122] text-sm mb-3">{cafe.area} · {cafe.vibe}</div>
          {cafe.note && <p className="text-[15px] text-[#3d2f22] font-medium leading-relaxed mb-4">"{cafe.note}"</p>}
          {/* ⭐ 한눈에 판단 — 전체 카페 대비 강점/아쉬운점(리뷰 옥석 보기 전 직관 판단의 핵심) */}
          {/* 📊 리뷰 데이터 분석 — 옥석 후기 핵심(가장 먼저 눈에 띄게, 구미 당기는 hook) */}
          {(highlights.length > 0 || cafe.synth_identity) && (
            <div className="bg-gradient-to-b from-[#f4eee2] to-[#ece4d4] rounded-xl px-4 py-3.5 mb-3 border border-[#d8c8ad]">
              <div className="text-[11px] font-bold text-[#7a5f3c] uppercase tracking-wider mb-2">📊 리뷰 데이터 분석 <span className="font-normal lowercase tracking-normal text-[#7a5122]">· 검증 후기 {cafe.synth_count}건</span></div>
              {cafe.synth_identity && <div className="text-[14px] font-semibold text-[#3d2f22] leading-relaxed mb-2.5">{cafe.synth_identity}</div>}
              {highlights.length > 0 && (
                <>
                  <div className="text-[10.5px] text-[#7a5122] mb-1.5">후기에서 가장 많이 나온 것 <span className="text-[#b9a78a]">· 숫자=언급 후기 수</span></div>
                  <div className="flex flex-wrap gap-1.5">
                    {highlights.map((h, i) => (
                      <span key={h.label} className={`text-[12.5px] rounded-full pl-2.5 pr-1.5 py-1 border font-semibold inline-flex items-center gap-1.5 ${i === 0 ? "bg-[#2b2018] text-[#f4ece0] border-[#2b2018]" : "bg-white text-[#52402e] border-[#d8c8ad]"}`}>
                        {h.emoji} {h.label}
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-[1px] ${i === 0 ? "bg-[#e8b87a] text-[#2b2018]" : "bg-[#efe9dd] text-[#665036]"}`}>{h.count}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {/* 메뉴·가격은 카테고리화 한계로 잠정 비노출(추후 LLM으로 주력메뉴+실가격 정확 추출 예정). 평판은 유지. */}
          {reputationNote && (
            <div className="bg-[#fbf3ea] rounded-xl px-4 py-2.5 mb-3 border border-[#e7d3b3]">
              <div className="text-[12px] text-[#8a6a3a]">⚖️ <b>참고</b> · {reputationNote}</div>
            </div>
          )}
          {/* 👍 강점 / 🔎 아쉬운점 — 전체 카페 대비 상대 위치 + 언급수/평균 */}
          {profile.ok ? (
            <div className="bg-[#efe9dd] rounded-xl px-4 py-3.5 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] font-bold text-[#7a5f3c] uppercase tracking-wider mb-2.5">한눈에 강·약 <span className="font-normal lowercase tracking-normal text-[#7a5122]">· 전체 카페 대비</span></div>
              {profile.strong.length > 0 && (
                <div className={profile.weak.length > 0 ? "mb-2.5" : ""}>
                  <div className="text-[11px] font-bold text-[#3f7a4f] mb-1.5">👍 이런 점이 강해요</div>
                  <div className="flex flex-col gap-1.5">
                    {profile.strong.map((s) => (
                      <div key={s.key} className="flex items-center gap-2 bg-[#e8f3ea] border border-[#c6e2cc] rounded-lg px-2.5 py-1.5">
                        <span className="text-[15px]">{s.emoji}</span><span className="text-[13.5px] font-bold text-[#2f5f3c]">{s.text}</span>
                        <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
                          <span className="text-[10.5px] text-[#6f9577]">평균의 {s.mult}배</span>
                          <span className="text-[10.5px] font-bold text-white bg-[#3f7a4f] px-2 py-[3px] rounded-full">상위 {s.topPct}%</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {profile.weak.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-[#b06a2e] mb-1.5">🔎 이런 점은 참고하세요</div>
                  <div className="flex flex-col gap-1.5">
                    {profile.weak.map((w) => (
                      <div key={w.key} className="flex items-center gap-2 bg-[#f6ecdf] border border-[#e6d2b5] rounded-lg px-2.5 py-1.5">
                        <span className="text-[14px]">{w.emoji}</span><span className="text-[12.5px] font-medium text-[#8a6534]">{w.text}</span>
                        <span className="ml-auto text-[10.5px] text-[#b9935f] whitespace-nowrap">{w.mult < 0.2 ? "거의 언급 없음" : `평균의 ${w.mult}배`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-[#665036] mt-2.5 leading-relaxed">기준은 <b>후기 1건당 언급 비율</b>이에요 — 후기 수가 많고 적음을 보정한 공정한 비교입니다. '평균의 N배'·'상위/하위 %'는 전체 카페와 같은 기준으로 비교한 값. 절대 평가가 아닙니다.</p>
            </div>
          ) : chars.length > 0 && (
            <div className="bg-[#efe9dd] rounded-lg px-4 py-3 mb-4 border border-[#ddd0bb]">
              <div className="text-[11px] text-[#665036] uppercase tracking-wider mb-2">이 카페가 자주 언급되는 결</div>
              <div className="flex flex-wrap gap-1.5">{chars.map((ch) => <span key={ch.label} className="text-[12px] bg-white text-[#52402e] px-2.5 py-1 rounded-full border border-[#e0d4c0]">{ch.emoji} {ch.label}</span>)}</div>
            </div>
          )}
          {cafe.signature && <div className="text-sm text-[#524234] mb-4"><span className="text-[#7a5122]">추천 </span>{cafe.signature}</div>}
          {/* 방문자 후기 — 길찾기 버튼 바로 위에 배치(목록 → 상세 모달). 공개 방문기록 있을 때만. */}
          {userReviews.length > 0 && <div className="mb-4"><VisitorReviews reviews={userReviews} /></div>}
          {/* ===== 버튼 3개 — 리뷰 위에 배치, 눈에 잘 띄게 ===== */}
          <div className="flex gap-2 mb-4">
            <a href={`https://map.kakao.com/?q=${encodeURIComponent(cafe.name + " " + cafe.area)}`} target="_blank" rel="noopener noreferrer" onClick={() => trackOutbound({ target: "kakao_map", cafeId: cafe.id, source: "지도앱" })} className="flex-1 text-center bg-[#2b2018] text-[#f4ece0] rounded-xl py-2.5 text-[12px] font-semibold hover:bg-[#3d2f22] transition-colors flex items-center justify-center">길찾기</a>
            <a href={`/api/naver-place-redirect?id=${cafe.id}`} target="_blank" rel="noopener noreferrer" onClick={() => trackOutbound({ target: "naver_place", cafeId: cafe.id, source: "지도앱" })} className="flex-1 text-center border-2 rounded-xl py-2.5 text-[12px] font-semibold bg-white hover:bg-[#f0fef8] transition-colors flex items-center justify-center gap-1" style={{ borderColor: "#03c75a", color: "#03c75a" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#03c75a"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/></svg>
              메뉴·시간
            </a>
          </div>

          {loadingRev && <CoffeeLoader label="근거 후기 우려내는 중…" />}
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
                <div className="text-[11px] text-[#665036]">이 분석의 근거가 된 실제 후기 (네이버 공개 글)</div>
                <button onClick={() => setShowAllReviews(true)} className="text-[11px] text-[#7a5122] font-medium underline">{"전체 "}{reviews.length}{"건 보기 →"}</button>
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
                        : rv.why?.[0] && <span className="text-[10px] text-[#665036]">{rv.why[0]}</span>}
                    </div>
                    {rv.link
                      ? <a href={rv.link} target="_blank" rel="noopener noreferrer" className="block text-[13.5px] text-[#3d2f22] leading-[1.75] hover:text-[#7a5122] transition-colors">"{hlQuote(rv.quote)}"</a>
                      : <div className="text-[13.5px] text-[#3d2f22] leading-[1.75]">"{hlQuote(rv.quote)}"</div>}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#665036]">
                      {rv.link && /youtu\.?be/.test(rv.link) && <span className="text-white rounded-[3px] px-1 py-0.5" style={{ background: "#c4302b", fontSize: "8px" }}>▶ YouTube</span>}
                      <span>{rv.source}</span>{rv.date && <span>· {rv.date}</span>}
                      {rv.link && (/youtu\.?be/.test(rv.link)
                        ? <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#c4302b] font-medium ml-auto">영상 보기 →</a>
                        : <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#7a5122] underline ml-auto">원문 →</a>)}
                    </div>
                  </div>
                ))}
              </div>
              {reviews.length > 6 && (
                <button onClick={() => setShowAllReviews(true)} className="w-full mt-2 py-2 text-[12px] text-[#7a5122] border border-[#e6d9c8] rounded-lg">
                  + {reviews.length - 6}건 더 보기
                </button>
              )}
            </div>
          )}
          {/* 🔁 비슷한 카페 더보기 — 같은 동네 + 결(taste) 유사도, 검증/참고 등급 우선(리텐션, decisions #338/#347) */}
          {nearby.length > 0 && (
            <div className="mt-5">
              <div className="text-[13px] font-bold text-[#5a4632] mb-2">☕ {cafe.area} 비슷한 카페 더보기</div>
              <div className="flex flex-col gap-2">
                {nearby.map((nc) => (
                  <button key={nc.id} type="button" onClick={() => onOpenCafe?.(nc.id)}
                    className="flex items-center gap-2 bg-white border border-[#e0d3bd] rounded-xl px-3.5 py-2.5 text-left">
                    <span className="flex flex-col text-left min-w-0">
                      <span className="text-[13.5px] font-bold text-[#3d2f22] truncate">{nc.name}</span>
                      <span className="text-[10.5px] text-[#6f6047] truncate">검증후기 {nc.synth_count ?? 0}건</span>
                    </span>
                    {nc.synth_grade && <span className="ml-auto text-[10px] font-bold bg-[#2b2018] text-[#e8b87a] px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">{nc.synth_grade}</span>}
                      <VisitorBadges vb={(nc as any).vb} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
      {/* ===== 전체 리뷰 모달 — aside 밖(z-[3000] 컨테이너 직속)으로 이동. aside는 overflow-y:auto라 스크롤되며, 그 안에 있던 position:fixed 모달이 스크롤량(scrollTop)만큼 화면 밖으로 밀리고 패널 너비로 잘려 아예 안 보였음. 스크롤 안 되는 컨테이너 직속으로 빼서 항상 전체 화면(뷰포트)에 온전히 뜨게 함. ===== */}
        {showAllReviews && (
          <div className="fixed inset-0 z-[3100] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setShowAllReviews(false)}>
            <div className="w-full max-w-lg bg-[#fdf8f2] rounded-t-2xl max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* 헤더 */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
                <div>
                  <div className="font-bold text-[#2b2018] text-[15px]">{cafe.name}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#665036]">
                    <span>검증 <b className="text-[#5f7355]">{reviews.filter(r => r.trust === "verified").length}</b></span>
                    <span>· 참고 <b className="text-[#7a5122]">{reviews.filter(r => r.trust === "reference").length}</b></span>
                    <span>· 총 <b className="text-[#2b2018]">{reviews.length}</b>건</span>
                    {quality && quality.rejected > 0 && <span className="text-[#c0a08a]">/ 제외 {quality.rejected}</span>}
                  </div>
                </div>
                <button onClick={() => setShowAllReviews(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#f0e6d4] text-[#594839] text-lg leading-none">×</button>
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
                            : "bg-white border border-[#e6d9c8] text-[#594839]"
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
              <div className="overflow-y-auto overscroll-contain flex-1 px-4 py-3 space-y-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
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
                        : rv.why?.[0] && <span className="text-[10px] text-[#665036]">{rv.why[0]}</span>}
                    </div>
                    {rv.link
                      ? <a href={rv.link} target="_blank" rel="noopener noreferrer" className="block text-[13.5px] text-[#3d2f22] leading-[1.75] hover:text-[#7a5122] transition-colors">"{hlQuote(rv.quote)}"</a>
                      : <div className="text-[13.5px] text-[#3d2f22] leading-[1.75]">"{hlQuote(rv.quote)}"</div>}
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[#665036]">
                      {rv.link && /youtu\.?be/.test(rv.link) && <span className="text-white rounded-[3px] px-1 py-0.5" style={{ background: "#c4302b", fontSize: "8px" }}>▶ YouTube</span>}
                      <span>{rv.source}</span>{rv.date && <span>· {rv.date}</span>}
                      {rv.link && (/youtu\.?be/.test(rv.link)
                        ? <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#c4302b] font-medium ml-auto">영상 보기 →</a>
                        : <a href={rv.link} target="_blank" rel="noopener noreferrer" className="text-[#7a5122] underline ml-auto">원문 →</a>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

// 내 기억 관리 — 백업코드 발급/복원 + PDF·JSON 내보내기 (개인정보 0)
// 추억 보관소 탭 — 등록 + 내 카페 목록 + 설정버튼. 잠금 시 PIN 입력 화면.
function MemoryTab({ device, visits, locked = false, sessionPin = "", onReload, onRegister, onEdit, onUnlock, onLock, onRestore }: { device: string; visits: any[]; locked?: boolean; sessionPin?: string; onReload?: () => void; onRegister: () => void; onEdit?: (cafeId: number) => void; onUnlock?: (pin: string) => void; onLock?: () => void; onRestore: (dev: string) => void }) {
  const [showSettings, setShowSettings] = useState(false);
  const [viewVisit, setViewVisit] = useState<any>(null); // 추억 보기 모달(클릭 시 먼저 내용 표시 → 수정 버튼)
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null); // 사진 원본 크기 라이트박스
  useLockBodyScroll(showSettings || viewVisit !== null || zoomPhoto !== null);
  const [hasPin, setHasPin] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false); // '지금 인증하기' 진행 상태
  const [verifyMsg, setVerifyMsg] = useState("");

  // 지금 인증하기 — 미인증 추억을 GPS 30m 재확인해 인증으로 승격(위치인증은 그대로 필수)
  const verifyNow = (v: any) => {
    if (!navigator.geolocation) { setVerifyMsg("이 브라우저는 위치를 지원하지 않아요"); return; }
    setVerifyBusy(true); setVerifyMsg("현재 위치 확인 중...");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await fetch("/api/my-cafe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", cafeId: v.id, device, pin: sessionPin, userLat: pos.coords.latitude, userLng: pos.coords.longitude }),
        });
        const d = await r.json();
        setVerifyBusy(false);
        if (d.ok) { setVerifyMsg(""); setViewVisit(null); onReload?.(); }
        else setVerifyMsg(d.error || "인증 실패");
      } catch { setVerifyBusy(false); setVerifyMsg("네트워크 오류"); }
    }, () => { setVerifyBusy(false); setVerifyMsg("위치 권한을 허용해주세요 (카페 30m 인증 필요)"); }, { enableHighAccuracy: true, timeout: 10000 });
  };
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
          <div className="text-[12px] text-[#594839] leading-relaxed mb-4">공용 PC 보호를 위해 PIN으로 잠겨 있어요.<br />내 PIN을 입력하면 내 기록만 보여요.</div>
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
            <div className="text-[11px] text-[#665036]">이 기기의 내 추억 {visits.length}곳 · 다른 사람 기록은 안 보여요</div>
          </div>
          <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1 h-9 px-3 rounded-full text-[12px] font-bold bg-white text-[#594839] border border-[#e6d9c8] shrink-0">⚙ 설정</button>
        </div>
        <button onClick={onRegister} className="w-full inline-flex items-center justify-center gap-1.5 bg-[#d6336c] text-white rounded-xl py-3.5 text-[14px] font-bold shadow-sm mb-4">
          <span className="text-[16px] leading-none">➕</span> 새 카페 추억 등록하기
        </button>
        {visits.length === 0 ? (
          <div className="text-center text-[#665036] text-[13px] py-14 bg-white rounded-2xl border border-[#ece0cd] leading-relaxed">아직 등록한 추억이 없어요.<br />카페에서 위치 인증하고 첫 추억을 남겨보세요.</div>
        ) : (
          <div className="space-y-2.5">
            {visits.map((v) => {
              const photoCount = Array.isArray(v.photos) ? v.photos.length : (v.photo_url ? 1 : 0);
              return (
              <button key={v.id} type="button" onClick={() => { setVerifyMsg(""); setViewVisit(v); }} className="w-full text-left bg-white rounded-2xl border border-[#ece0cd] p-3.5 flex gap-3 hover:border-[#d6b9c4] active:scale-[0.995] transition">
                <div className="relative w-16 h-16 shrink-0">
                  {v.photo_url ? <img src={v.photo_url} alt="" className="w-16 h-16 rounded-xl object-cover" /> : <div className="w-16 h-16 rounded-xl bg-[#f3ede1] flex items-center justify-center text-[22px]">{v.favorite ? "★" : "☕"}</div>}
                  {photoCount > 1 && <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[9px] px-1 rounded">📷{photoCount}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {v.favorite && <span className="text-[#f0a832] text-[13px]">★</span>}
                    <span className="font-bold text-[#2b2018] text-[14px] truncate">{v.name}</span>
                    <span className="text-[10px] text-[#7a5122] shrink-0">{v.area}</span>
                    {v.verified === false ? (
                      <span className="text-[9px] font-bold text-[#665036] bg-[#f3ede1] rounded-full px-1.5 py-0.5 shrink-0">미인증</span>
                    ) : (
                      <span className="text-[9px] font-bold text-[#5f7355] bg-[#eef3ea] rounded-full px-1.5 py-0.5 shrink-0">인증</span>
                    )}
                    <span className="ml-auto text-[10px] text-[#665036] shrink-0">보기 ›</span>
                  </div>
                  {v.memory ? <p className="text-[12px] text-[#52402e] leading-relaxed mt-0.5 line-clamp-2">{v.memory}</p> : <p className="text-[12px] text-[#665036] mt-0.5">기억 메모 없음</p>}
                  <div className="text-[10px] text-[#665036] mt-1">{fmtDate(v.created_at)}</div>
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
                  <span className="text-[11px] text-[#7a5122] shrink-0">{viewVisit.area}</span>
                </div>
                <button onClick={() => setViewVisit(null)} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#594839] text-lg shrink-0">×</button>
              </div>
              <div className="overflow-y-auto flex-1 p-4 space-y-3">
                {vphotos.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1">
                    {vphotos.map((p, i) => (
                      <button key={i} type="button" onClick={() => setZoomPhoto(p)} className="shrink-0">
                        <img src={p} alt="" className="h-44 rounded-lg border border-[#e6d9c8] object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                <div>
                  <div className="text-[12px] text-[#594839] mb-1 font-medium">기억</div>
                  {viewVisit.memory ? <p className="text-[14px] text-[#2b2018] leading-relaxed whitespace-pre-wrap">{viewVisit.memory}</p> : <p className="text-[13px] text-[#665036]">기억 메모 없음</p>}
                </div>
                <div className="text-[11px] text-[#665036]">{fmtDate(viewVisit.created_at)}{viewVisit.favorite ? " · ★ 즐겨찾기" : ""}</div>
                {viewVisit.verified === false && (
                  <div className="rounded-xl border border-[#e6d9c8] bg-[#faf6ee] p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-[#665036] bg-[#f3ede1] rounded-full px-1.5 py-0.5">미인증</span>
                      <div className="text-[12px] font-bold text-[#594839]">미인증 추억</div>
                    </div>
                    <div className="text-[11px] text-[#665036] mt-1 leading-relaxed">위치 인증을 아직 안 했어요. <b>나에게만 보임(비공개)</b> — 지도에서 다른 사람에게는 안 보여요. <b>인증된 기록만</b> 타인에게 지도로 공개돼요. 이 카페에 다시 방문해 <b>GPS 30m 이내</b>에서 <b>지금 인증하기</b>를 누르면 <b>인증 상태로 전환</b>돼 지도에 공개될 수 있어요.</div>
                    {verifyMsg && <p className="text-[11px] text-[#c0392b] mt-1.5">{verifyMsg}</p>}
                    <button onClick={() => verifyNow(viewVisit)} disabled={verifyBusy} className="mt-2 w-full bg-[#5f7355] text-white rounded-lg py-2.5 font-bold text-[13px] disabled:opacity-60">
                      {verifyBusy ? "위치 확인 중..." : "📍 지금 인증하기 (카페 30m)"}
                    </button>
                  </div>
                )}
              </div>
              <div className="p-4 border-t border-[#f0e6d4] pb-[calc(1rem_+_env(safe-area-inset-bottom))] flex gap-2">
                <KakaoShare
                  title={`${viewVisit.name} (${viewVisit.area})`}
                  description={shareHookText(viewVisit.synth_grade, viewVisit.synth_identity)}
                  imageUrl={`https://dongnecoffeenote.com/c/${viewVisit.id}/opengraph-image`}
                  link={`https://dongnecoffeenote.com/c/${viewVisit.id}`}
                  source="MYPIN"
                  className="flex items-center gap-1 bg-[#FEE500] text-[#3c1e1e] rounded-xl px-4 py-3 text-[14px] font-bold shrink-0"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="#3c1e1e"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.8 1.9 5.3 4.7 6.7-.2.7-.7 2.6-.8 3-.1.5.2.5.4.4.2-.1 2.6-1.8 3.7-2.5.6.1 1.3.1 2 .1 5.5 0 10-3.6 10-8S17.5 3 12 3z"/></svg>
                  공유
                </KakaoShare>
                <button onClick={() => { const id = viewVisit.id; setViewVisit(null); onEdit?.(id); }} className="flex-1 bg-[#d6336c] text-white rounded-xl py-3 font-bold text-[14px]">✎ 수정하기</button>
              </div>
            </div>
          </div>
        );
      })()}
      {zoomPhoto && (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }} onClick={() => setZoomPhoto(null)}>
          <button onClick={() => setZoomPhoto(null)} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/15 text-white text-xl leading-none" aria-label="닫기">×</button>
          <img src={zoomPhoto} alt="" className="max-w-[94vw] max-h-[90dvh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
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
      records: visits.map((v) => ({ cafe: v.name, area: v.area, favorite: !!v.favorite, verified: v.verified !== false, memory: v.memory ?? "", photo: v.photo_url ?? null, date: v.created_at })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `내커피기억_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };

  const exportPDF = () => {
    const rows = visits.map((v) => `
      <div style="border:1px solid #e6d9c8;border-radius:12px;padding:14px;margin-bottom:12px;page-break-inside:avoid;">
        <div style="font-weight:700;font-size:15px;color:#2b2018;">${v.favorite ? "★ " : ""}${(v.name || "").replace(/</g, "&lt;")} <span style="font-weight:400;font-size:11px;color:#9c6b3f;">${(v.area || "")}</span>${v.verified === false ? ` <span style="font-weight:700;font-size:10px;color:#8a7458;background:#f3ede1;border-radius:8px;padding:1px 6px;">미인증</span>` : ""}</div>
        ${v.photo_url ? `<img src="${v.photo_url}" style="max-width:100%;max-height:240px;border-radius:8px;margin:8px 0;object-fit:cover;" />` : ""}
        ${v.memory ? `<div style="font-size:13px;color:#52402e;line-height:1.7;white-space:pre-wrap;margin-top:6px;">${(v.memory).replace(/</g, "&lt;")}</div>` : ""}
        <div style="font-size:10px;color:#8a7458;margin-top:8px;">${new Date(v.created_at).toLocaleString("ko-KR")}</div>
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
            {hasPin && <button onClick={() => { onLock?.(); onClose(); }} className="text-[11px] font-bold text-[#7a5122] border border-[#e6d9c8] rounded-full px-2.5 py-1">🔒 지금 잠그기</button>}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#594839] text-lg">×</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-5 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          <p className="text-[12px] text-[#594839] leading-relaxed bg-[#f3ede1] rounded-lg px-3 py-2.5">
            가입·개인정보 없이 — <b>백업 코드</b>로 다른 기기에서 불러오거나 <b>파일로 내려받아</b> 영구 보관, 공용 PC는 <b>PIN</b>으로 잠글 수 있어요.
          </p>

          {/* 백업 코드 */}
          <div>
            <div className="text-[13px] font-bold text-[#2b2018] mb-1.5">① 백업 코드 (다른 기기에서 불러오기)</div>
            {code ? (
              <div className="bg-white border-2 border-[#d6336c] rounded-xl p-3 text-center">
                <div className="text-[20px] font-bold tracking-widest text-[#d6336c]">{code}</div>
                <div className="text-[11px] text-[#665036] mt-1">이 코드를 메모해두세요. 잃어버리면 복구할 수 없어요(= 우리도 누구 건지 몰라요).</div>
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
            <p className="text-[10px] text-[#665036] mt-1.5">PDF는 보기 좋게, JSON은 백업·재가져오기용. 파일은 본인 기기에만 저장돼요.</p>
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
                    <button onClick={() => { setPinMode(""); setPinA(""); }} className="px-4 text-[#7a5122] text-[13px]">취소</button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => { setPinMode("set"); setMsg(""); }} className="w-full border-2 border-[#cbb89f] text-[#524434] rounded-lg py-2.5 text-[13px] font-bold bg-white">PIN 설정하기</button>
                  <p className="text-[10px] text-[#665036] mt-1.5">PIN을 걸면 이 기기에서 <b>PIN을 입력해야만</b> 내 추억이 보여요. 카페·도서관 등 공용 PC에서 추천해요.</p>
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
                  <button onClick={() => { setPinMode(""); setPinA(""); setPinB(""); }} className="px-4 text-[#7a5122] text-[13px]">취소</button>
                </div>
              </div>
            ) : pinMode === "remove" ? (
              <div className="space-y-2">
                <input value={pinA} onChange={(e) => setPinA(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={8} placeholder="현재 PIN (해제 확인)"
                  className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[15px] tracking-[0.3em] bg-white" />
                <div className="flex gap-2">
                  <button onClick={doRemovePin} disabled={busy} className="flex-1 bg-[#c0392b] text-white rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-50">PIN 해제</button>
                  <button onClick={() => { setPinMode(""); setPinA(""); }} className="px-4 text-[#7a5122] text-[13px]">취소</button>
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
