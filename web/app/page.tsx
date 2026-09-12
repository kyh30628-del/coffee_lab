"use client";
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { TRIAL_DAYS } from "@/lib/ownerPlan";
import NoticeModal from "./NoticeModal";
import { SIDO_GU, SIDO_CENTER, classifyArea, regionKeyFor } from "@/lib/regionList";
import InfoDot from "./InfoDot";
import { trackOutbound } from "./trackOutboundClient";
import ShowcaseBanner, { SHOWCASE_CSS } from "./ShowcaseBanner";
import OwnerSignupModal from "./OwnerSignupModal";
import OwnerFindModal from "./OwnerFindModal";
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
  om?: number; // 🏅 사장님이 직접 관리 중(구독·체험 유효) — /api/cafes가 해당 카페에만 넣어준다
  synth_grade: string | null; synth_identity: string | null;
  synth_count: number | null; synth_reviews?: EvidenceReview[] | null;
  char_scores?: Record<string, number> | null;
  featured?: boolean;
};
type DCafe = { id: number; name: string; area: string; lat: number; lng: number; grade: string | null; count: number | null; identity: string | null; note: string | null; beanNote: string[]; reason?: string; isNew?: boolean };
type Discover = { headlineA: DCafe | null; headlineB: DCafe | null; headlineAList?: DCafe[]; headlineBList?: DCafe[]; themeB?: { emoji: string; label: string } | null; top3: DCafe[]; fresh: DCafe[]; specialty: DCafe[]; featured?: DCafe[]; scopeCount: number };
type SearchResult = { id: number; name: string; area: string; grade: string | null; count: number | null; identity: string | null; score: number; reasons: string[] };
type Place = { name: string; lat: number; lng: number; kind: string; label: string; icon: string };
type SearchRes = { ok: boolean; region: string; q: string; concepts: string[]; count: number; results: SearchResult[]; coverageNote?: string; franchiseNote?: string; places?: Place[]; regionAlts?: string[]; nearPlace?: Place };
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
const VB_LABEL: Record<string, { emoji: string; label: string; short: string }> = {
  //  short = 카드에 붙는 짧은 말. 이모지만 두면 10px짜리 회색 점으로 보여 아무도 못 알아본다(CEO 지적).
  T: { emoji: "🧳", label: "여행 와서 들른 후기가 많아요", short: "여행지" },
  L: { emoji: "🏠", label: "동네 단골 후기가 있어요", short: "동네 단골" },
  // D = 동 단위 뉴스 판정(언론이 관광 맥락으로 다루는 동네) — 후기 말투(T)와 별개의 '위치 속성'.
  D: { emoji: "🗺️", label: "관광지로 알려진 동네예요 (언론 보도 기준)", short: "관광지 동네" },
};
// 🏅 「사장님이 직접 관리」 배지 — 조건·문구는 lib/ownerManaged.ts 단일출처, 화면은 om 플래그만 받아 그린다.
//   이 컴포넌트를 카페 이름이 나오는 **모든 소비자 화면**에 붙인다(예전에 8곳 중 2곳만 달아 사장님이 발견한 사고 재발 방지).
function OwnerBadge({ om, dark }: { om?: number; dark?: boolean }) {
  if (!om) return null;
  return (
    <span title="사장님이 직접 정보를 관리하는 카페예요"
      className={dark
        ? "text-[10.5px] font-bold bg-[#f4ece0]/20 text-[#f4ece0] px-2 py-0.5 rounded-full shrink-0 whitespace-nowrap"
        : "text-[9px] font-bold text-[#7a5122] bg-[#f7e9cf] border border-[#e3c79a] px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap"}>
      🏅 사장님 관리
    </span>
  );
}
function VisitorBadges({ vb, dark }: { vb?: string; dark?: boolean }) {
  if (!vb) return null;
  return (
    <>
      {vb.split("").map((k) => VB_LABEL[k] && (
        <span key={k} title={VB_LABEL[k].label}
          className={dark ? "text-[10.5px] font-bold bg-[#f4ece0]/20 px-2 py-0.5 rounded-full shrink-0"
                          : "text-[10px] font-bold leading-none text-[#4a5a4e] bg-[#e6efe8] border border-[#c9dbcf] px-2 py-1 rounded-full shrink-0"}>
          {VB_LABEL[k].emoji} {VB_LABEL[k].short}
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
  // 🧭 2026-09-06 — 로컬 복제 제거, lib/regionList.classifyArea(단일출처)로 위임.
  //   09-04 '대전 153' 사고의 재발 지점이었다: 부산 편입 때 이 로컬 PREFIXED에 부산이 빠져
  //   '부산 중구'가 또 서울로 분류될 뻔했다(경남 고성군→강원 오분류 포함). 캐시만 여기 유지.
  const a = (area ?? "").trim();
  const hit = _guCache.get(a); if (hit) return hit;
  const res = classifyArea(a);
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
const HeadlineCard = memo(function HeadlineCard({ c, kicker, tone, onOpen, featured = false }: { c: DCafe; kicker: string; tone: number; onOpen: (id: number) => void; featured?: boolean }) {
  // 📓 2026-09-12 "한 권의 노트": 카드 = 테이프로 붙인 종이. 이름은 명조, 판정 한 줄만 손글씨, 등급은 작은 도장.
  //   배치(제목 줄 → 이름·배지 → 지역·리뷰 → 판정 → 원두 노트 태그)는 그대로.
  const stamp = c.grade === "참고" ? "ref" : c.grade === "후보" ? "cand" : "";
  return (
    <button onClick={() => onOpen(c.id)} className={`w-full text-left nt-scrap mb-4 px-4 pt-4 pb-3.5 ${featured ? "featured" : ""}`} style={{ ["--rot" as any]: tone % 2 ? "0.35deg" : "-0.35deg" }}>
      <i className={`nt-tape sm ${featured ? "k tl" : tone % 3 === 0 ? "" : tone % 3 === 1 ? "tl g" : "tr"}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="nt-eyebrow mb-1">{kicker}</div>
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <h2 className="nt-title text-[18px] leading-tight">{c.name}</h2>
            {c.isNew && <span className="nt-pill" style={{ color: "#b9793b" }}>NEW</span>}
            <VisitorBadges vb={(c as any).vb} />
          </div>
          <div className="text-[11.5px] text-[#8f8071] mb-1">{c.area} · 리뷰 {c.count ?? 0}건</div>
        </div>
        {c.grade && <div className={`nt-stamp ${featured ? "sm" : "xs"} ${stamp}`} aria-label={`등급 ${c.grade}`}>{c.grade}{featured && <small>VERIFIED</small>}</div>}
      </div>
      {c.identity && <p className={`nt-hand text-[#2f3550] line-clamp-1 mb-1.5 ${featured ? "" : "sm"}`} style={{ lineHeight: featured ? "30px" : "26px" }}>{featured ? <span className="nt-hl">{c.identity}</span> : c.identity}</p>}
      {c.beanNote.length > 0 && <div className="flex flex-wrap gap-1.5">{c.beanNote.map((b) => <span key={b} className="nt-chip" style={{ height: 22, fontSize: 11.5 }}>{b}</span>)}</div>}
    </button>
  );
});
// 🎬 자동 스포트라이트(넷플릭스식) 본체 — 큰 카드 1개가 몇 초마다 자동 전환 + 점(dot)으로 위치 표시.
//   HeadlineCard를 그대로 재사용해 상단 💎숨은보석·🎯오늘의테마와 톤·배지·태그가 통일된다(추가 코드 최소화).
//   터치/클릭하면 5초간 멈췄다가 재개(읽는 도중 안 넘어감). 좌우 스와이프로 수동 이동도 가능.
//   제목 표시줄이 없는 '코어'만 — Spotlight(단일기준)·RankSpotlight(탭전환)가 공유해서 쓴다.
const SpotlightCore = memo(function SpotlightCore({ items, onOpen, toneOffset = 0, intervalMs = 4000, featured = false }: { items: DCafe[]; onOpen: (id: number) => void; toneOffset?: number; intervalMs?: number; featured?: boolean }) {
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
          <HeadlineCard c={c} kicker={`${idx + 1} / ${items.length}`} tone={(toneOffset + idx) % TONES.length} onOpen={onOpen} featured={featured} />
        </div>
        {prevIdx !== null && items[prevIdx] && (
          <div key={`prev-${items[prevIdx].id}`} className="absolute inset-0 dcn-spotlight-out">
            <HeadlineCard c={items[prevIdx]} kicker={`${prevIdx + 1} / ${items.length}`} tone={(toneOffset + prevIdx) % TONES.length} onOpen={onOpen} featured={featured} />
          </div>
        )}
      </div>
      {items.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-1">
          {items.map((_, i) => (
            <button key={i} onClick={() => { goTo(i); pauseThenResume(); }} aria-label={`${i + 1}번째`}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === idx ? "w-5 bg-[#b9793b]" : "w-1.5 bg-[#d9cdb9]"}`} />
          ))}
        </div>
      )}
    </>
  );
});

// 제목표시줄+SpotlightCore — 단일 기준 섹션(추천·신규발견)용 얇은 래퍼.
const Spotlight = memo(function Spotlight({ title, items, sub, info, onOpen, toneOffset = 0, intervalMs = 4000, featured = false }: { title: string; items: DCafe[]; sub?: string; info?: React.ReactNode; onOpen: (id: number) => void; toneOffset?: number; intervalMs?: number; featured?: boolean }) {
  if (!items?.length) return null;
  return (
    <div className="mb-7">
      <div className="flex items-baseline justify-between mb-2 nt-ruled">
        <div className={`nt-title text-[17px] flex items-center gap-1.5 ${featured ? "text-[#7a5122]" : ""}`}>{featured ? <span className="nt-hl latte">{title}</span> : title}{info && <span className="nt-free"><InfoDot title={title.replace(/^[^가-힣A-Za-z]+/, "")}>{info}</InfoDot></span>}</div>
        {sub && <div className="text-[10.5px] text-[#8f8071] shrink-0">↕ {sub}</div>}
      </div>
      <SpotlightCore items={items} onOpen={onOpen} toneOffset={toneOffset} intervalMs={intervalMs} featured={featured} />
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
      <div className="flex items-baseline justify-between mb-2 nt-ruled">
        <div className="nt-title text-[17px] flex items-center gap-1.5">🔍 카페 둘러보기<span className="nt-free"><InfoDot title="카페 둘러보기">{infoByKey[safeKey]}</InfoDot></span></div>
      </div>
      <div className="flex gap-1.5 mb-2.5 mt-1 flex-wrap">
        {RANK_TABS.map((t, i) => (dataByKey[t.key] || []).length > 0 && (
          <button key={t.key} onClick={() => setTabIdx(i)}
            className={`nt-chip transition-colors ${i === safeIdx ? "ink" : "hover:border-[#9c6b3f]"}`} style={{ fontSize: 11.5 }}>
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
  const size = Math.round(30 + t * 28); // 30~58px
  // 🟤 뭉치(클러스터)와 같은 3D 받침 — 스타일 통일. 농도는 밝기로(적을수록 밝은 카라멜, 많을수록 진한 에스프레소).
  const bright = (1.35 - t * 0.45).toFixed(2);
  const esc = (label || "").replace(/</g, "&lt;");
  return `<div class="dcn-region-pin" style="transform:translate(-50%,-50%);text-align:center;cursor:pointer;">
    <div class="dcn-cluster-body" style="width:${size}px;height:${Math.round(size * 0.97)}px;background-image:url(/pins/puck.png);filter:brightness(${bright}) drop-shadow(0 3px 5px rgba(50,33,20,.35));margin:0 auto;">
      <span class="dcn-cluster-n" style="font-size:${Math.round(11 + t * 5)}px;">${cnt}</span></div>
    <div style="margin-top:3px;background:rgba(43,32,24,0.9);color:#f3e6d2;font-weight:600;padding:1.5px 7px;border-radius:9px;font-size:10px;white-space:nowrap;display:inline-block;box-shadow:0 2px 5px rgba(0,0,0,0.22);">${esc}</div>
  </div>`;
}

// 카페 클러스터 뱃지 — 가까운 카페 여러 개를 한 뭉치로(픽셀 그리드). 개수 표시, 클릭하면 줌인되어 쪼개짐.
//   집계 원형(makeRegionPinHtml=행정구역)과 달리 화면상 근접도 기준. 취향매칭 카페 포함 시 앰버 강조.
function makeClusterHtml(cnt: number, hasMatch: boolean, _verified = 0): string {
  const size = cnt >= 100 ? 52 : cnt >= 30 ? 48 : cnt >= 10 ? 43 : cnt >= 4 ? 39 : 35;
  // 🟤 3D 렌더 받침(퍽) 위에 숫자만 — 핀과 같은 조명·재질이라 한 세트. (검증비율 게이지는 CEO 지시로 제거)
  return `<div class="dcn-cluster" style="transform:translate(-50%,-50%);cursor:pointer;">
    <div class="dcn-cluster-body" style="width:${size}px;height:${Math.round(size * 0.97)}px;background-image:url(/pins/${hasMatch ? "puck-match" : "puck"}.png);">
      <span class="dcn-cluster-n" style="font-size:${cnt >= 100 ? 12 : cnt >= 10 ? 13 : 14}px;">${cnt}</span>
    </div></div>`;
}

// 위치 가늠용 지하철역 마커(개별 카페 레벨에서만). 카페 핀과 구분되게 파란 점 + 역명.
function makeStationHtml(name: string, colors: string[], refs: string[]): string {
  // 지하철역 — 호선별 색 번호 뱃지(환승역=여러 개) + 역명. 버스정류장(베이스맵 아이콘)과 명확히 구분.
  const cols = colors && colors.length ? colors : ["#2f6fb0"];
  // 라벨: 서울 N호선은 숫자만(기존 규약), 그 외는 이름 그대로 최대 4자("수인분당"·"경의중앙"이 잘리지 않게).
  //   전국 편입(2026-09-12)으로 "부산1"·"경부선"·"GTX-A" 같은 라벨이 들어온다 — 글자 수에 따라 크기를 줄인다.
  const badge = (c: string, r: string) => {
    const m = (r || "").match(/^(\d+)호선/);
    const lbl = m ? m[1] : ((r || "").replace(/호선$/, "").replace(/([가-힣]{2,})선$/, "$1").slice(0, 4) || "·");
    const fs = lbl.length >= 4 ? 10.5 : lbl.length === 3 ? 11.5 : 13;
    return `<span style="background:${c};color:#fff;font-size:${fs}px;font-weight:900;line-height:1;min-width:22px;height:23px;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;padding:0 5px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.45);">${lbl}</span>`;
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
// 🎨 Blender Cycles 렌더 질감(2026-09-11, CEO 지시 "바다·강·호수·산 깊이별 색감을 블렌더로") — scripts/blender/render-map-textures.py → public/map/*.png
//   물 4종은 종류를 깊이로 읽어 색·너울·흐름결·바닥비침이 다르고, 지표 5종은 숲(수관)·풀·모래·습지·얼음 질감. 128px 렌더를 pixelRatio 2로 얹는다(=64 CSS px 타일).
//   로드 실패(오프라인 등)는 아래 캔버스 절차 질감이 대신한다 — 화면이 비지 않는다.
const MAP_TEXTURES: Record<string, string> = {
  "dcn-water-ocean": "/map/water-ocean.png", "dcn-water-lake": "/map/water-lake.png", "dcn-water-river": "/map/water-river.png", "dcn-water-pond": "/map/water-pond.png",
  "dcn-land-wood": "/map/land-wood.png", "dcn-land-grass": "/map/land-grass.png", "dcn-land-sand": "/map/land-sand.png", "dcn-land-wetland": "/map/land-wetland.png", "dcn-land-ice": "/map/land-ice.png",
  // 2차(2026-09-11 CEO "다 한번에"): 파사드 5종(높이대별 지붕·창) · 지표 5종(subclass별) · 도로 스트립 3종(line-pattern, 512×128) · 시설 아이콘 4종(알파) — scripts/blender/render-map-textures-2.py
  "dcn-fac-villa": "/map/fac-villa.png", "dcn-fac-brick": "/map/fac-brick.png", "dcn-fac-office": "/map/fac-office.png", "dcn-fac-curtain": "/map/fac-curtain.png", "dcn-fac-glass": "/map/fac-glass.png",
  "dcn-lc-park": "/map/lc-park.png", "dcn-lc-garden": "/map/lc-garden.png", "dcn-lc-wood": "/map/lc-wood.png", "dcn-lc-forest": "/map/lc-forest.png", "dcn-lc-meadow": "/map/lc-meadow.png",
  "dcn-rd-bridge": "/map/rd-bridge.png", "dcn-rd-major": "/map/rd-major.png", "dcn-rd-street": "/map/rd-street.png",
  "dcn-poi-subway": "/map/poi-subway.png", "dcn-poi-bus": "/map/poi-bus.png", "dcn-poi-park": "/map/poi-park.png", "dcn-poi-parking": "/map/poi-parking.png",
};
// 화면 크기 규약: 타일 질감 128px→pixelRatio 2(64 CSS px 반복) · 파사드는 4(32px 반복 = 창문 한 칸 16px, 골목 줌에서 창이 층처럼 읽힘) · 아이콘 86px→5(약 17px, 스프라이트보다 한 단계 큼).
const texRatio = (id: string) => (id.startsWith("dcn-poi-") ? 5 : id.startsWith("dcn-fac-") ? 4 : 2);
async function loadMapTextures(ml: any): Promise<number> {
  let ok = 0;
  await Promise.all(Object.entries(MAP_TEXTURES).map(async ([id, url]) => {
    try {
      const r = await ml.loadImage(url);               // MapLibre 5: Promise<{ data }>
      const img = r?.data ?? r;
      if (!img) return;
      if (ml.hasImage(id)) ml.removeImage(id);         // 캔버스 폴백이 먼저 들어갔으면 교체(updateImage는 크기가 같아야 해서 못 씀)
      ml.addImage(id, img, { pixelRatio: texRatio(id) }); ok++;
    } catch { /* 폴백 유지 */ }
  }));
  return ok;
}

// 🖼️ 지도 절차 질감 — 캔버스로 그려 MapLibre addImage. 외부 파일·요청 0. (pixelRatio 2 기준 픽셀)
//   물결: 깊은 파랑 바탕에 옅은 잔물결 2겹. 파사드 3종: 벽 색 + 창문 격자(사진처럼 보이게 창틀·유리 하이라이트).
function makeMapTextures(): Record<string, ImageData> {
  const out: Record<string, ImageData> = {};
  const mk = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d")!; draw(g); return g.getImageData(0, 0, w, h); };
  // 🌊 깊이별 물 — 타일에 실제 수심 값은 없으므로 물의 종류(class)를 깊이로 읽는다: 바다 > 호수 > 강 > 연못·수영장.
  //    깊을수록 어둡고 잔물결이 약하게(멀리서 보는 깊은 물), 얕을수록 밝고 물결이 또렷하게.
  const water = (base: string, ripple: number) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = `rgba(255,255,255,${0.3 * ripple})`; g.lineWidth = 1.6;
    for (let y = 6; y < 64; y += 16) { g.beginPath(); for (let x = 0; x <= 64; x += 4) g.lineTo(x, y + Math.sin((x / 64) * Math.PI * 2) * 2.2); g.stroke(); }
    g.strokeStyle = `rgba(40,85,130,${0.22 * ripple})`;
    for (let y = 14; y < 64; y += 16) { g.beginPath(); for (let x = 0; x <= 64; x += 4) g.lineTo(x, y + Math.cos((x / 64) * Math.PI * 2) * 2.2); g.stroke(); }
  };
  out["dcn-water-ocean"] = mk(64, 64, water("#5d92c0", 0.45)); // 바다 — 가장 깊고 차분
  out["dcn-water-lake"] = mk(64, 64, water("#7aacd4", 0.75));  // 호수
  out["dcn-water-river"] = mk(64, 64, water("#93bfe0", 1.0));  // 강
  out["dcn-water-pond"] = mk(64, 64, water("#aacfea", 1.15));  // 연못·수영장 등 얕은 물
  const facade = (wall: string, frame: string, glass: string, glassHi: string, cols: number, rows: number, wr: number, hr: number) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = wall; g.fillRect(0, 0, 32, 32);
    const cw = 32 / cols, ch = 32 / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * (1 - wr) / 2, y = r * ch + ch * (1 - hr) / 2, w = cw * wr, h = ch * hr;
      g.fillStyle = frame; g.fillRect(x, y, w, h);
      g.fillStyle = glass; g.fillRect(x + 1, y + 1, w - 2, h - 2);
      g.fillStyle = glassHi; g.fillRect(x + 1, y + 1, Math.max(1, (w - 2) * 0.45), Math.max(1, (h - 2) * 0.35));
    }
    // 층 구분선(슬래브)
    g.fillStyle = "rgba(0,0,0,0.07)"; for (let r = 1; r < rows; r++) g.fillRect(0, r * ch - 0.5, 32, 1);
  };
  out["dcn-fac-low"] = mk(32, 32, facade("#e4d6bf", "#8a7658", "#5f6b76", "#b9c6d0", 2, 2, 0.48, 0.5));   // 저층: 베이지 벽·목재 창틀
  out["dcn-fac-mid"] = mk(32, 32, facade("#d3cdc2", "#6e7076", "#55677a", "#a8bccb", 3, 3, 0.56, 0.5));   // 중층: 회백 콘크리트·알루미늄 창
  out["dcn-fac-tall"] = mk(32, 32, facade("#aab7c3", "#7c8b98", "#6d8aa5", "#d3e1ec", 4, 4, 0.7, 0.62));  // 고층: 커튼월 유리
  return out;
}
// 첫 심볼(라벨) 레이어 id — 우리가 넣는 면·선은 라벨보다 아래에 깔아야 글씨가 안 묻힌다.
function firstSymbolId(ml: any): string | undefined {
  try { for (const ly of ml.getStyle().layers || []) if (ly.type === "symbol") return ly.id; } catch {}
  return undefined;
}
// 🗺️ '실제로 보이는 가까운 화면'의 위경도 경계 — 기울인 화면의 bounds는 지평선까지 포함한 사다리꼴이라 엄청나게 넓다.
//   화면 아래쪽(가까운 곳)만 네 귀퉁이로 역투영해 상자를 만든다. 회전(bearing)도 네 점이라 자동 반영.
//   ⚠️ 이 상자는 '카메라 자세'로만 정해지고 마커 소속과 무관 → 팬 중에도 안정적이라 재그리기 생략의 근거가 된다.
function nearViewBox(mlv: any): { s: number; n: number; w: number; e: number } | null {
  try {
    const el = mlv.getContainer(); const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return null;
    const pitch = mlv.getPitch?.() ?? 0;
    const topY = pitch > 40 ? h * 0.34 : pitch > 1 ? h * 0.2 : 0; // 많이 기울일수록 먼 곳을 더 잘라낸다
    let s = 90, n = -90, we = 180, e = -180;
    for (const [x, y] of [[0, topY], [w, topY], [0, h], [w, h]] as [number, number][]) {
      const ll = mlv.unproject([x, y]);
      if (!Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return null;
      if (ll.lat < s) s = ll.lat; if (ll.lat > n) n = ll.lat;
      if (ll.lng < we) we = ll.lng; if (ll.lng > e) e = ll.lng;
    }
    if (e - we > 180) return null; // 날짜변경선 등 이상값 → 폴백
    return { s, n, w: we, e };
  } catch { return null; }
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
const _origPoiIcon: Record<string, any> = {};   // poi_* 원본 icon-image 보존(질감 재적용 시 중첩 방지)
// '상세' OFF에도 지도에 남길 주요 시설 클래스(공원·학교 등). 나머지 잡POI(식당·상점·편의점…)는 숨김.
const MAJOR_POI = ["park", "garden", "school", "college", "university", "kindergarten", "hospital", "clinic", "stadium", "museum", "library", "zoo", "attraction", "theme_park", "aquarium", "cemetery", "townhall", "town_hall"];
function applyTogglesToMap(ml: any, showStreets: boolean, showBus: boolean, show3d = true): void {
  if (!ml) return;
  let style: any;
  try { if (!(ml.isStyleLoaded && ml.isStyleLoaded())) return; style = ml.getStyle(); } catch { return; }
  for (const ly of (style.layers || [])) {
    const sl = (ly as any)["source-layer"] || "";
    if (ly.type === "symbol" && (sl === "transportation_name" || /road_label|highway[-_]?name|road[-_]?name|street/i.test(ly.id))) {
      try { ml.setLayoutProperty(ly.id, "visibility", showStreets ? "visible" : "none"); } catch {}
    }
    // 건물: 3D ON이면 돌출 건물만(평면 폴리곤은 숨김 — 겹치면 바닥이 이중으로 보임). 3D OFF면 옛 규칙(상세 토글과 함께 평면 표시).
    if (/building/i.test(ly.id) && ly.type === "fill-extrusion") {
      try { ml.setLayoutProperty(ly.id, "visibility", show3d ? "visible" : "none"); } catch {}
    } else if (/building/i.test(ly.id) && (ly.type === "fill" || ly.type === "line")) {
      try { ml.setLayoutProperty(ly.id, "visibility", !show3d && showStreets ? "visible" : "none"); } catch {}
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
// 🧳🏠 핀 라벨에 붙일 방문객 성격 표시. 지도는 메인 화면이라 여기 표시가 없으면 사실상 안 보인다(CEO 지적).
//   핀은 HTML 문자열로 그려서 React 컴포넌트를 못 쓰므로 별도 헬퍼로 둔다.
const vbGlyph = (vb?: string) => (vb ? ` ${vb.includes("T") ? "🧳" : ""}${vb.includes("L") ? "🏠" : ""}${vb.includes("D") ? "🗺️" : ""}` : "");

// 🎨 핀 글리프 — 이모지(OS마다 모양·크기 제각각) 대신 인라인 SVG. 어떤 기기에서도 같은 모양.
const PIN_SVG = {
  // 🎨 잉크가 viewBox(24×24) 정중앙에 오도록 좌표를 맞춘 채움 아이콘 — 선(stroke) 대신 면이라 작은 크기에서도 또렷하다.
  //   커피잔: 잔(3.2~15.1) + 손잡이(14.6~21.0) + 받침(2.1~21.9) → 잉크 가로 2.1~21.9(중앙 12.0), 세로 2.9~21.1(중앙 12.0)
  cup: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="#fff"><path d="M3.2 2.9h11.9v8.7a5.95 5.95 0 0 1-11.9 0z"/><path d="M14.6 4.8h2.45a3.95 3.95 0 0 1 0 7.9H14.6v-2.5h2.45a1.45 1.45 0 0 0 0-2.9H14.6z"/><rect x="2.1" y="18.7" width="19.8" height="2.4" rx="1.2"/></g></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 19.4s-7.6-4.8-7.6-10.4A4.2 4.2 0 0 1 12 6.4a4.2 4.2 0 0 1 7.6 2.6c0 5.6-7.6 10.4-7.6 10.4z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 2.6l2.9 6.1 6.7.9-4.85 4.6 1.16 6.7L12 17.66 6.09 20.9l1.16-6.7L2.4 9.6l6.7-.9z"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.6" fill="#fff"/></svg>`,
};
// 핀 시각 위계(소비자 관점): 검증=초록 큰 핀+라벨 / 참고=브라운 핀+라벨 / 후보=z<16에선 작은 점(라벨은 hover·선택 시)
//   → 밀집 지역에서 라벨끼리 겹치던 문제를 '중요한 것만 이름 표시'로 해결. 줌인(z≥16)하면 후보도 이름이 보인다.
function makePinHtml(c: Cafe, isMatch: boolean, isFocus = false, isMine = false, zoom = 16): string {
  const grade = c.synth_grade ?? "후보";
  const feat = !!c.featured && !isFocus; // ✨ 우선 노출 — 골드 핀 강조(포커스 핀이 우선)
  const mini = !isMine && !isFocus && !feat && !isMatch && grade === "후보" && zoom < 16; // 후보 소형 점
  // 내 카페(MY PIN) — 핑크/레드 하트 핀으로 최우선 강조
  const color = isMine ? "#d6336c" : isFocus ? "#b5703c" : feat ? "#e0a32e" : (GRADE_STYLE[grade]?.bg ?? "#9c6b3f");
  const esc = (c.name || "").replace(/</g, "&lt;");
  if (mini) {
    return `<div class="dcn-pin dcn-pin-mini" data-cafe="${c.id}" style="transform:translate(-50%,-50%);text-align:center;">
      <span class="dcn-pin-dot" style="background:${color};"></span>
      <div class="dcn-lbl" style="margin-top:2px;background:rgba(253,250,244,0.96);color:#4a3526;font-weight:600;padding:1px 6px;border-radius:7px;font-size:10px;white-space:nowrap;display:inline-block;box-shadow:0 2px 6px rgba(0,0,0,0.22);">${esc}</div>
    </div>`;
  }
  const size = isMine ? 34 : isFocus ? 46 : feat ? 40 : (grade === "검증" || isMatch) ? 38 : 33; // 내 카페는 작게(CEO: 너무 커) — 색·하트로 충분히 구분됨
  // 🎨 3D 렌더 핀(Blender Cycles → scripts/blender/render-pins.py → public/pins/*.png, 타이트 크롭·알파) — 유광 세라믹 핀. 글리프(SVG)는 머리 중앙(31.6%)에 겹쳐 어떤 DPI에서도 또렷.
  const sprite = isMine ? "mine" : isFocus ? "focus" : feat ? "feat" : grade === "검증" ? "verified" : grade === "참고" ? "ref" : "cand";
  const labelStyle = isMine ? "background:#d6336c;color:#fff;font-weight:700;"
    : isFocus ? "background:#b5703c;color:#fff;font-weight:700;"
    : feat ? "background:#e0a32e;color:#2b2018;font-weight:700;"
    : grade === "검증" ? "background:rgba(253,250,244,0.97);color:#2b2018;font-weight:700;border-left:3px solid #5f7355;"
    : "background:rgba(253,250,244,0.96);color:#4a3526;font-weight:600;";
  const glyph = isMine ? PIN_SVG.heart : isFocus ? PIN_SVG.pin : feat ? PIN_SVG.star : PIN_SVG.cup;
  const suffix = isMine ? " ❤" : isFocus ? "" : feat ? " ★" : isMatch ? ' <span style="color:#b5710f;">✓</span>' : "";
  // 🏅 사장님이 직접 관리하는 카페 — 핀 라벨에도 표시(지도가 메인 화면이라 여기 없으면 사실상 안 보인다)
  const ownerMark = (c as any).om ? ' <span title="사장님이 직접 관리" style="font-size:0.9em;">🏅</span>' : "";
  // 취향 일치(✓)는 머리 우상단 앰버 배지 — 색만으로는 검증(초록)과 구분이 안 됐던 문제 해결
  const matchBadge = isMatch && !isMine && !isFocus && !feat ? `<span class="dcn-pin-match" aria-hidden="true">✓</span>` : "";
  return `<div class="dcn-pin${feat ? " dcn-pin-feat" : ""}${isFocus ? " dcn-pin-focus" : ""}" data-cafe="${c.id}" style="transform:translate(-50%,-100%);text-align:center;">
    <div class="dcn-pin-body" style="width:${size}px;height:${Math.round(size * 1.396)}px;background-image:url(/pins/pin-${sprite}.png);">
      <span class="dcn-pin-shadow" aria-hidden="true"></span>
      <span class="dcn-pin-glyph">${glyph}</span>${matchBadge}</div>
    <div class="dcn-lbl" style="margin-top:2px;${labelStyle}padding:2px 7px;border-radius:8px;font-size:${isFocus || isMine ? 11 : 10}px;white-space:nowrap;display:inline-block;box-shadow:0 2px 6px rgba(0,0,0,0.26);">${esc}${ownerMark}${vbGlyph((c as any).vb)}${suffix}</div>
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
  // 내 카페(❤) + 다른 사람 인원 배지 — 일반 핀과 같은 3D 스프라이트(작게, CEO 지시)
  const size = 34;
  const badge = othersCnt > 0
    ? `<div style="position:absolute;top:-6px;right:-10px;background:#5f7355;color:#fff;border:2px solid #fdfaf4;border-radius:11px;min-width:20px;height:20px;line-height:16px;padding:0 5px;font-size:10px;font-weight:800;box-shadow:0 1px 4px rgba(0,0,0,0.35);">${othersCnt}</div>`
    : "";
  return `<div class="dcn-pin" data-cafe="${c.id}" style="transform:translate(-50%,-100%);text-align:center;">
    <div class="dcn-pin-body" style="width:${size}px;height:${Math.round(size * 1.396)}px;background-image:url(/pins/pin-mine.png);">
      <span class="dcn-pin-shadow" aria-hidden="true"></span>
      <span class="dcn-pin-glyph">${PIN_SVG.heart}</span>${badge}</div>
    <div class="dcn-lbl" style="margin-top:2px;background:#d6336c;color:#fff;font-weight:700;padding:1px 6px;border-radius:7px;font-size:10px;white-space:nowrap;display:inline-block;box-shadow:0 2px 6px rgba(0,0,0,0.26);">${(c.name || "").replace(/</g, "&lt;")} ❤${othersCnt > 0 ? ` · ${othersCnt}명` : ""}</div>
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
    <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }} onClick={onClose}>
      <div className="w-full max-w-lg nt-paper rounded-t-2xl max-h-[80dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                    <OwnerBadge om={(c as any).om} />
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

// 📓 랜딩 = 테이블 위 노트(2026-09-12 2차). 어두운 호두나무 테이블 정물(Blender) 위, **렌더된 노트 페이지에 직접** 손글씨가
//   원근을 따라 써진다(네모 메모 박스 없음). 위=어두운 나무+제목(커피 톤), 가운데=밝은 페이지(글이 채워짐), 아래=에스프레소 띠 위 CTA.
//   · 채워지는 연출은 첫 방문에만(localStorage dcn_note_written) 약 2.6초, 움직임 줄이기면 즉시 완성본.
//   · 문구는 기존 랜딩 카피 그대로. 메모 줄엔 숫자 주장 없음.
//   · 페이지 4모서리 좌표는 Blender 카메라에서 실측(render/hero7.json: TL,TR,BR,BL, 이미지 비율 0~1). 렌더를 다시 뽑으면 이 값도 다시 잰다.
const LANDING_MEMO_FALLBACK = ["오늘, 우리 동네.", "별점은 안 봤다. 다녀온 사람 글만 읽었다.", "광고·협찬 글은 걸러냈다.", "마음에 든 곳엔 도장 하나."];
// 📓 오늘의 메모 — 홈 스포트라이트(매일 바뀌는 숨은 보석·오늘의 테마)에서 발췌한 진짜 문장. 숫자는 전부 데이터 값.
function landingMemo(d: Discover | null): string[] {
  const a = d?.headlineAList?.[0]; const b = d?.headlineBList?.[0]; const th = d?.themeB?.label;
  if (!a) return LANDING_MEMO_FALLBACK;
  const now = new Date(); const day = ["일", "월", "화", "수", "목", "금", "토"][now.getDay()];
  const cut = (t: string, n: number) => { const x = (t || "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n).replace(/[\s·,]+$/, "") + "…" : x; };
  const lines = [`${now.getMonth() + 1}월 ${now.getDate()}일 ${day}요일, ${cut(a.area, 9)}.`, `${cut(a.name, 9)} — ${cut(a.identity || "", 11)}`, `검증 후기 ${a.count ?? 0}건만 읽고 적었다.`];
  if (b) lines.push(th && th.length <= 8 ? `${th}: ${cut(b.name, 9)} ✓` : `${cut(b.name, 12)}도 한 곳 ✓`);
  lines.push("마음에 든 곳엔 도장 하나.");
  return lines.slice(0, 5);
}
const HERO_W = 1400, HERO_H = 1680;
const HERO_PAGE: [number, number][] = [[0.22101, 0.29961], [0.70849, 0.30326], [0.77393, 0.82833], [0.10523, 0.82145]];
const PAGE_SW = 280, PAGE_SH = 387;            // 글을 쓰는 원본 사각형(px) — 페이지 비율 2.10:2.90
const PAGE_RULE0 = 560 / 2900 * PAGE_SH;       // 첫 줄 y(텍스처 page-right-blank.json과 동일 규격)
const PAGE_PITCH = 170 / 2900 * PAGE_SH;   // 줄 하나 = 손편지 한 줄(글리프가 줄 사이에 앉는다)       // 줄 간격
// 단위 사각형→임의 사각형 호모그래피(adjugate 법) → CSS matrix3d
function homographyMatrix3d(sw: number, sh: number, q: [number, number][]): string {
  const adj = (m: number[]) => [m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4], m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5], m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3]];
  const mul = (a: number[], b: number[]) => { const r = new Array(9).fill(0); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) r[3*i+j] += a[3*i+k]*b[3*k+j]; return r; };
  const basis = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, x4: number, y4: number) => {
    const m = [x1, x2, x3, y1, y2, y3, 1, 1, 1]; const v = adj(m); const [l, mm, t] = [v[0]*x4+v[1]*y4+v[2], v[3]*x4+v[4]*y4+v[5], v[6]*x4+v[7]*y4+v[8]];
    return [x1*l, x2*mm, x3*t, y1*l, y2*mm, y3*t, l, mm, t];
  };
  const s = basis(0, 0, sw, 0, sw, sh, 0, sh); const d = basis(q[0][0], q[0][1], q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]);
  const h = mul(d, adj(s)); const n = h[8] || 1; const H = h.map((v) => v / n);
  return `matrix3d(${H[0]},${H[3]},0,${H[6]},${H[1]},${H[4]},0,${H[7]},0,0,1,0,${H[2]},${H[5]},0,${H[8]})`;
}
function LandingNote({ onConsumer, onOwner, onLogin, discover }: { onConsumer: () => void; onOwner: () => void; onLogin: () => void; discover: Discover | null }) {
  const LANDING_MEMO = useMemo(() => landingMemo(discover), [discover]);
  const [done, setDone] = useState<boolean | null>(null); // null=판단 전(SSR), true=완성본, false=쓰는 중
  const [pos, setPos] = useState<[number, number]>([0, 0]); // [줄, 글자]
  const [mtx, setMtx] = useState<string>("");
  const heroRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const nibRef = useRef<SVGSVGElement | null>(null);
  const jitter = useMemo(() => LANDING_MEMO.map((l) => Array.from(l).map(() => [(Math.random() * 3.2 - 1.6).toFixed(2), (Math.random() * 2 - 1).toFixed(2)])), [LANDING_MEMO]);
  // 페이지 사각형을 화면 픽셀로 — 이미지는 object-fit: cover(가운데)라 스케일·오프셋을 같이 계산
  useEffect(() => {
    const el = heroRef.current; if (!el) return;
    const calc = () => {
      const cw = el.clientWidth, ch = el.clientHeight; if (!cw || !ch) return;
      const s = Math.max(cw / HERO_W, ch / HERO_H); const ox = (cw - HERO_W * s) / 2, oy = (ch - HERO_H * s) / 2;
      const q = HERO_PAGE.map(([fx, fy]) => [fx * HERO_W * s + ox, fy * HERO_H * s + oy] as [number, number]);
      setMtx(homographyMatrix3d(PAGE_SW, PAGE_SH, q));
    };
    calc(); const ro = new ResizeObserver(calc); ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // ✍ 매 방문 글씨가 써진다(약 2.6초, CEO 지시 "써지는 느낌") — 움직임 줄이기 설정만 즉시 완성본.
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDone(true); return; }
    setDone(false);
    // ⏱ 시간 기반 진행(약 2.6초) — 백그라운드 탭에서 늦춰져도 총 길이 그대로.
    const slow = typeof location !== "undefined" && /nt_slow/.test(location.search); // 검수용: ?nt_slow 로 느리게
    const CPS = slow ? 5 : 32, GAP = 0.16;
    const lens = LANDING_MEMO.map((l) => Array.from(l).length);
    const starts: number[] = []; let acc = 0.6;
    lens.forEach((n) => { starts.push(acc); acc += n / CPS + GAP; });
    const total = acc; const t0 = performance.now(); let raf = 0; let alive = true;
    const step = () => {
      if (!alive) return;
      const el = (performance.now() - t0) / 1000;
      if (el >= total) { setPos([LANDING_MEMO.length, 0]); setDone(true); if (nibRef.current) nibRef.current.style.opacity = "0"; return; }
      let li = 0; while (li + 1 < starts.length && el >= starts[li + 1]) li++;
      const prog = (el - starts[li]) * CPS;                       // 이 줄에서 몇 글자째(소수 = 획 진행률)
      const ci = Math.max(0, Math.min(lens[li], Math.floor(prog)));
      setPos((p) => (p[0] === li && p[1] === ci ? p : [li, ci]));
      // ✒ 펜촉: 지금 쓰는 글자의 왼쪽에서 오른쪽으로 획 진행률만큼 이동 + 손 떨림(위아래 1px, 기울기 ±3°). 줄 사이 쉼엔 살짝 든다.
      const nib = nibRef.current, page = pageRef.current;
      if (nib && page) {
        const lineEl = page.querySelectorAll<HTMLElement>(".nt-w")[li];
        const chars = lineEl ? lineEl.querySelectorAll<HTMLElement>(".ch") : null;
        const idx = Math.min(ci, lens[li] - 1); const ch = chars && chars[idx];
        if (lineEl && ch) {
          const frac = prog >= lens[li] ? 1 : Math.max(0, prog - Math.floor(prog));
          const lifted = prog >= lens[li];
          const x = lineEl.offsetLeft + ch.offsetLeft + ch.offsetWidth * (lifted ? 1 : frac);
          const y = lineEl.offsetTop + ch.offsetTop + ch.offsetHeight * 0.82 + Math.sin(el * 31) * 0.8;
          nib.style.opacity = "1";
          nib.style.transform = `translate(${x - 3}px, ${y - 31 - (lifted ? 6 : 0)}px) rotate(${12 + Math.sin(el * 17) * 3}deg)`;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [LANDING_MEMO]);
  const allDone = done === true;
  const lineTop = PAGE_RULE0 - 21;   // 첫 줄부터: 손편지체 19px(행간=줄 간격 22.7px) 글리프 바닥이 줄보다 2.6px 위(실측 asc .92·desc .23·글 bbox 바닥 -.117em)
  return (
    <div className="w-full max-w-md mx-auto flex flex-col" style={{ minHeight: "100dvh", background: "var(--nt-espresso)" }}>
      {/* 정물: 호두나무 테이블·펼친 노트·에스프레소·원두(Blender). 세로 5:6, 가운데 맞춤 */}
      <div ref={heroRef} className="relative w-full overflow-hidden" style={{ height: "min(76dvh, 640px)" }}>
        <img src="/note/hero.webp" alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover" />
        {/* 위: 어두운 나무 위 제목(커피 톤) · 아래: 에스프레소 띠로 녹아듦 */}
        <div className="absolute inset-x-0 top-0 h-40" style={{ background: "linear-gradient(180deg, rgba(20,12,8,.62), rgba(20,12,8,0))" }} />
        <div className="absolute inset-x-0 bottom-0 h-28" style={{ background: "linear-gradient(0deg, var(--nt-espresso), rgba(36,24,18,0))" }} />
        <div className="absolute left-6 top-6 right-6">
          <div className="nt-eyebrow" style={{ color: "#d9c7ad" }}>Dongne Coffee Note</div>
          <h1 className="nt-title text-[34px] leading-[1.15] mt-1" style={{ color: "#f6ecdf", textShadow: "0 2px 12px rgba(0,0,0,.5)" }}>별점도 광고도 아닌,<br /><span className="nt-hl">진짜 후기.</span></h1>
        </div>
        {/* 렌더된 오른쪽 페이지 위에 원근 정합으로 얹는 글 */}
        <div ref={pageRef} className="absolute left-0 top-0" style={{ width: PAGE_SW, height: PAGE_SH, transformOrigin: "0 0", transform: mtx || "translate(-9999px,0)" }}>
          <div className="absolute" style={{ left: 42, right: 10, top: lineTop }}>
            {LANDING_MEMO.map((line, li) => (
              <div key={li} className={`nt-w nt-hand ${allDone || (done === false && li < pos[0]) ? "done" : ""}`} style={{ fontSize: 19, lineHeight: `${PAGE_PITCH}px`, height: PAGE_PITCH, color: "#2f3550", whiteSpace: "nowrap", overflow: "hidden" }}>
                {done === null ? null : Array.from(line).map((ch, ci) => (
                  <span key={ci} className={`ch${ch === " " ? " sp" : ""}${!allDone && li === pos[0] && ci < pos[1] ? " on" : ""}`}
                    style={ch === " " ? undefined : { ["--r" as any]: `${jitter[li][ci][0]}deg`, ["--y" as any]: `${jitter[li][ci][1]}px` }}>{ch}</span>
                ))}
              </div>
            ))}
          </div>
          <div className={`nt-stamp absolute ${allDone ? "in" : ""}`} style={{ right: 18, bottom: 26, opacity: allDone ? undefined : 0 }} aria-hidden>검증<small>VERIFIED</small></div>
          {done === false && (
            <svg ref={nibRef} className="nt-nib" viewBox="0 0 24 24" aria-hidden style={{ width: 22, height: 22 }}><path d="M3 21l3.5-1 11-11-2.5-2.5-11 11L3 21z" fill="#1f2640" stroke="#2a1f17" strokeWidth="1" /><path d="M14.5 6.5l2.5 2.5 2-2a1.7 1.7 0 0 0 0-2.4l-.1-.1a1.7 1.7 0 0 0-2.4 0l-2 2z" fill="#e0b25a" stroke="#2a1f17" strokeWidth="1" /><path d="M3 21l1-3.2 2.2 2.2L3 21z" fill="#2a1f17" /></svg>
          )}
        </div>
      </div>
      {/* 에스프레소 띠 — CTA */}
      <div className="px-5 pb-6 -mt-2 relative z-[1]" style={{ color: "#f6ecdf" }}>
        <p className="text-[15px] font-bold text-center leading-snug">우리 동네 카페, <span style={{ color: "#e9c99a" }}>진짜 후기만 가려</span> 골라드려요.</p>
        <p className="text-[12.5px] text-center leading-relaxed mt-1" style={{ color: "#c9b391" }}>마음에 든 곳은 <span style={{ color: "#ff7fa6" }}>❤</span>로 <b style={{ color: "#f6ecdf" }}>나만의 동네 지도</b>에.</p>
        <div className="space-y-2.5 mt-5 max-w-md mx-auto">
          <button onClick={onConsumer} className="w-full rounded-lg py-4 px-5 text-left flex flex-col gap-0.5 active:scale-[0.99] transition" style={{ background: "linear-gradient(180deg, #f3e6d2, #e6d0b2)", color: "#241812", boxShadow: "0 14px 26px -14px rgba(0,0,0,.7), inset 0 1px 0 #fff8ec" }}>
            <span className="text-[17px] font-bold">☕ 우리 동네 카페 보러가기</span>
            <span className="text-[12px]" style={{ color: "#6b5340" }}>진짜 후기로 검증 · 내 취향에 딱 맞게</span>
          </button>
          <button onClick={onOwner} className="w-full rounded-lg py-4 px-5 text-left flex flex-col gap-0.5 active:scale-[0.99] transition" style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(233,214,189,.45)", color: "#f6ecdf" }}>
            <span className="text-[16px] font-bold">🏪 사장님, 우리 카페 보러가기</span>
            <span className="text-[12px]" style={{ color: "#c9b391" }}>검증된 후기로 내 카페 경쟁력 진단 · <b style={{ color: "#e9c99a" }}>가입 없이 바로 확인</b></span>
          </button>
          <button onClick={onLogin} className="block w-full text-center text-[12px] underline underline-offset-2" style={{ color: "#c9b391" }}>
            이미 키가 있어요 · 로그인
          </button>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5 mt-5">
          {["별점, 이제 그만 믿어요", "리뷰 옥석만 남겼어요"].map((t) => (
            <span key={t} className="nt-chip" style={{ background: "rgba(255,255,255,.08)", color: "#e9d6bd", borderColor: "rgba(233,214,189,.35)" }}>{t}</span>
          ))}
        </div>
        <p className="text-[10.5px] mt-6 text-center leading-relaxed" style={{ color: "#9d8a70" }}>네이버·구글·유튜브 공개 후기 교차검증 + AI 맥락 판정<br />광고·협찬·무관 글은 자동 제외</p>
        <div className="mt-3 text-[10.5px] flex gap-3 justify-center" style={{ color: "#9d8a70" }}>
          <a href="/area" className="underline">동네별 카페</a>
          <a href="/privacy" className="underline">개인정보처리방침</a>
          <a href="/terms" className="underline">이용약관</a>
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
    // ⚡ 2026-08-27: 장식 4종(합 265KB)은 z≥11에서만 쓰인다 — 첫 페인트·/api/cafes(834KB)와
    //   네트워크·파싱 경쟁하지 않게 유휴시간으로 미룬다. 지도를 열기 전에 이미 도착해 있는 건 동일.
    const loadDecor = () => {
      fetch("/data/stations.json").then((r) => r.json()).then((d) => Array.isArray(d) && setStations(d)).catch(() => {});
      fetch("/data/exits.json").then((r) => r.json()).then((d) => Array.isArray(d) && setExits(d)).catch(() => {});
      fetch("/data/lines.json").then((r) => r.json()).then((d) => Array.isArray(d) && setLines(d)).catch(() => {});
      fetch("/data/landmarks.json").then((r) => r.json()).then((d) => Array.isArray(d) && setLandmarks(d)).catch(() => {});
    };
    const ric2 = (window as any).requestIdleCallback as ((cb: () => void, opts?: { timeout: number }) => number) | undefined;
    if (ric2) ric2(loadDecor, { timeout: 4000 }); else setTimeout(loadDecor, 1200);
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
  const [show3d, setShow3d] = useState(true); // 🏢 3D 건물·기울임 — 기본 ON(동네 줌 z≥15에서 자동 기울임)
  const show3dRef = useRef(true); show3dRef.current = show3d;
  const [mapErr, setMapErr] = useState(false); // WebGL 미지원 등 지도 초기화 실패
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
  const [turnKey, setTurnKey] = useState(0); // 📖 책장 넘김 카운터(탭 전환마다 +1 → 새 종이 한 장)
  const [todayLabel, setTodayLabel] = useState(""); // ✍ 홈 제목 옆 손글씨 날짜(마운트 후 — SSR 시각 불일치 방지)
  useEffect(() => { const d = new Date(); setTodayLabel(`${d.getMonth() + 1}월 ${d.getDate()}일 ${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]}요일`); }, []);
  const prevTabRef = useRef<string>("home");
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
  const [showSignup, setShowSignup] = useState(false);
  // 🏪 사장님 홈 진입: 가입 모달이 아니라 **가게 찾기 → 무료 리포트**가 먼저다(2026-08-27).
  const [showFind, setShowFind] = useState(false); // 무료 체험 신청 모달
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
  const [inViewCount, setInViewCount] = useState<number | null>(null);
  const [legendOpen, setLegendOpen] = useState(false); // 🗺️ 핀 범례(초록=검증 …) — 데스크톱은 기본 펼침(마운트 후 결정)
  const [sheetMode, setSheetMode] = useState<"half" | "full">("half"); // 모바일 바텀시트 — 반만(지도+목록 동시) / 전체
  const markersByIdRef = useRef<Map<number, any>>(new Map()); // 카페id → 마커(선택 강조를 재그리기 없이 DOM 클래스로)
  const selectedRef = useRef<Cafe | null>(null);
  const autoPitchRef = useRef(0); // 마지막으로 자동 적용한 기울기(사용자 조작과 구분용)
  // 선택된 카페 핀만 클래스로 강조(다시 그리지 않음 — 강남 밀집 84ms 재그리기 회피)
  const applySelectedPin = (id: number | null) => {
    try {
      const root = mapRef.current; if (!root) return;
      root.querySelectorAll(".dcn-mk.dcn-sel").forEach((el) => el.classList.remove("dcn-sel"));
      if (id == null) return;
      const m = markersByIdRef.current.get(id); const el = m && m.getElement && m.getElement();
      if (el) el.classList.add("dcn-sel");
    } catch {}
  }; // 🗺️ 현재 화면(viewport) 안 공개 카페 수(전문성 인디케이터)

  // ⚡ 속도 개선(2026-07-26): /api/cafes는 전 공개카페(13,391곳·char_scores 등 포함, 실측 5.1MB·1.8s)라
  //   지도·지역선택·상세패널에만 필요한데 예전엔 홈 첫 렌더와 동시에(마운트 즉시) 무조건 받아왔다 — 홈
  //   화면이 실제로 필요한 /api/discover(10KB)와 네트워크·메인스레드(JSON.parse+buildAxisDist)를 두고
  //   경쟁해 홈이 뜨는 그 순간을 오히려 늦추고 있었다. 첫 페인트가 끝난 유휴 시간으로 미뤄도 사용자가
  //   카드를 탭하거나 지역을 고르기 전에 이미 도착해 있어 기능은 그대로다.
  useEffect(() => {
    // 📉 2026-08-06: /api/cafes가 char_scores 6축을 고정순서 배열 `cs`로 보낸다(전송량 절감).
    //   받는 즉시 원래 모양으로 되돌리므로 아래 소비 코드(취향 필터·정렬·유사도)는 전부 그대로다.
    // ⚡ 2026-08-27 SWR: 재방문이면 Cache API 사본(≤30분)을 **즉시** 그리고, 네트워크 신선본이
    //   도착하는 순간 교체한다(도착 후엔 사본이 절대 못 덮음 — fresh 플래그). 모바일에서 압축 834KB
    //   전송+파싱이 지도 첫 페인트를 수 초 붙잡던 것의 해법. 서버는 여전히 always-fresh(원칙 유지) —
    //   사본 노출은 신선본 도착까지의 몇 초 + 최대 30분 이내 사본만이라, /c/[id] ISR(6h)보다 훨씬 짧다.
    const load = async () => {
      let fresh = false;
      try {
        const at = Number(localStorage.getItem("dcn_cafes_at") || 0);
        if (Date.now() - at < 30 * 60 * 1000) {
          const hit = await (await caches.open("dcn-cafes-v1")).match("/api/cafes");
          if (hit && !fresh) {
            const d = await hit.json();
            if (!fresh) setCafes(decodeCafeScores(d.cafes ?? []));
          }
        }
      } catch {}
      try {
        const r = await fetch("/api/cafes");
        const r2 = r.clone(); // 본문 재직렬화 없이 스트림째 캐시에 저장
        const d = await r.json();
        fresh = true;
        setCafes(decodeCafeScores(d.cafes ?? []));
        try { await (await caches.open("dcn-cafes-v1")).put("/api/cafes", r2); localStorage.setItem("dcn_cafes_at", String(Date.now())); } catch {}
      } catch {}
    };
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
      setRole("consumer");
      // 🗺️ 상세의 '지도에서 보기'는 좌표를 싣고 온다(?cafe=&clat=&clng=&cz=) → 지도 탭을 열고 그 카페로 줌인·핀 강조.
      //   좌표가 없으면(옛 공유 링크·카톡) 예전처럼 목록 탭 + 해당 구 로드로 동작한다(회귀 없음).
      const cla = Number(sp.get("clat")), cln = Number(sp.get("clng")), cz2 = Number(sp.get("cz"));
      if (cla && cln) { regionCtr.current = [cla, cln, cz2 || 17]; setFocusId(cafeId); setTab("map"); }
      else setTab("home");
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
  // 대전도 인천과 같은 접두 규칙(중·동·서구 이름 충돌) — 안 붙이면 백엔드가 서울 중구로 오인.
  const homeRegion = homeGu ? regionKeyFor(homeSido, homeGu) : ""; // 🧭 09-06 단일출처(부산 접두·경남 고성군 자동)
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
  useEffect(() => { if (prevTabRef.current !== tab) { prevTabRef.current = tab; setTurnKey((k) => k + 1); } }, [tab]);
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

  // 📍 장소(역·백화점·아파트 등)나 카페 좌표로 지도를 이동시킨다 — "가려는 곳 주변에 어떤 카페가 있나"의 출발점.
  //   지도가 아직 안 떴으면 regionCtr에 실어 두면, 지도 준비 효과가 1회 센터링하고 소진한다(기존 딥링크 배선 재사용).
  const goToPlace = useCallback((lat: number, lng: number, zoom = 16) => {
    setShowSearch(false); setTab("map");
    const m = mapObj.current;
    if (m && mapReady) { try { m.setView([lat, lng], zoom, { animate: true }); return; } catch {} }
    regionCtr.current = [lat, lng, zoom];
  }, [mapReady]);

  const runSearch = async (query: string, forceRegion?: string) => {
    const qq = query.trim();
    if (!qq) return;
    setSearchQ(qq); setSearchLoading(true); setSearchRes(null);
    try {
      // 지도 중심을 같이 보낸다 — "○○주민센터"처럼 전국에 같은 이름이 많을 때 보고 있는 곳부터 보여주려고.
      let ctr = ""; try { const c = mapObj.current?.getCenter?.(); if (c) ctr = `&lat=${c.lat.toFixed(4)}&lng=${c.lng.toFixed(4)}`; } catch {}
      const reg = forceRegion ?? homeRegion;   // 동명 후보를 누르면 그 지역으로 고정해 다시 찾는다
      const u = `/api/search?q=${encodeURIComponent(qq)}${reg ? `&region=${encodeURIComponent(reg)}` : ""}${ctr}`;
      const d = await (await fetch(u)).json();
      if (d.ok) setSearchRes(d);
    } catch {}
    setSearchLoading(false);
  };

  // 지도: 처음 '지도' 탭을 열 때(컨테이너가 실제로 보일 때) 1회 초기화하고 이후 계속 유지.
  // 탭 전환 시 파괴/재생성하지 않음 → 전환 즉각. 단 랜딩(role===null) 복귀 시엔 div가 사라지므로 파괴.
  useEffect(() => {
    if (role === null) { // 랜딩으로 이탈 → 분리된 DOM에 남지 않게 파괴(재진입 시 새로 초기화)
      if (mapObj.current) { try { mapObj.current.remove(); } catch {} mapObj.current = null; layerRef.current = null; mlRef.current = null; setMapReady(false); }
      return;
    }
    if (tab !== "map" || mapObj.current) return; // 지도 탭을 실제로 열 때 1회 초기화(숨김 상태 초기화 금지)
    let cancelled = false;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      await import("maplibre-gl/dist/maplibre-gl.css");
      const { makeL, MapA } = await import("./mapAdapter");
      if (cancelled || !mapRef.current || mapObj.current) return;
      // 🗺️ MapLibre GL 단독(2026-09-07 Leaflet 제거) — 벡터 타일(OpenFreeMap Liberty, 무료)·3D 건물·기울임·회전. 줌은 어댑터가 Leaflet 규약(+1)으로 맞춘다.
      let ml: any;
      try {
        ml = new maplibregl.Map({
          container: mapRef.current, style: "https://tiles.openfreemap.org/styles/liberty",
          center: [127.05, 37.5], zoom: 9, minZoom: 5, maxZoom: 18.5, maxPitch: 62, pitch: 0, bearing: 0,
          attributionControl: false, dragRotate: true, pitchWithRotate: true, touchPitch: true, fadeDuration: 120,
        });
      } catch { setMapErr(true); return; } // WebGL 미지원 브라우저
      ml.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), "top-left");
      // 📏 축척(전문성) — 미터법만, 좌하단. 스타일은 인라인 CSS(.maplibregl-ctrl-scale)에서 커피 톤으로.
      ml.addControl(new maplibregl.ScaleControl({ maxWidth: 116, unit: "metric" }), "bottom-left");
      ml.addControl(new maplibregl.AttributionControl({ compact: false }), "bottom-right"); // 출처 문구는 스타일(OpenFreeMap·OpenMapTiles·OSM)이 제공
      const L = makeL(maplibregl);
      LRef.current = L;
      const mapA = new MapA(maplibregl, ml);
      mapObj.current = mapA;
      mlRef.current = ml; // 레이어 토글·3D용
      (window as any).__ml = ml; // 디버그 핸들
      ml.on("error", () => {}); // 벡터 타일 일시 오류는 무시
      // 전 세계 한글 표기 — name:ko 우선(없으면 현지명→로마자). ko가 없는 한국 지명은 name이 한글이라 안전.
      const KO_LABEL: any = ["coalesce", ["get", "name:ko"], ["get", "name"], ["get", "name:latin"]];
      // 🎨 커피 톤 스타일 패치 — 스타일 로드 후 1회. 레이스 방지: 즉시+load+styledata 모두에서 시도하되 applied 플래그로 1회 보장.
      let applied = false;
      //   force: 질감 로드 완료 후 재적용 통과 — isStyleLoaded()는 타일이 하나라도 내려오는 중이면 false라 이 검사로는 재적용이 영영 안 돈다(실측). 첫 통과가 끝난 뒤라 스타일은 이미 있다.
      const applyVectorStyle = (force = false) => {
        if (applied) return;
        let style: any;
        try { if (!force && !(ml.isStyleLoaded && ml.isStyleLoaded())) return; style = ml.getStyle(); } catch { return; }
        if (!style || !style.layers) return;
        applied = true;
        try { ml.setPaintProperty("background", "background-color", "#f3ecdb"); } catch {}
        // 🏔️ 지형: 무료 공개 고도 타일(AWS Terrain Tiles, terrarium, CORS 허용·키 없음) → 음영(hillshade) 항상 + 3D 지형은 3D 토글 효과에서 setTerrain.
        try {
          if (!ml.getSource("dcn-dem")) ml.addSource("dcn-dem", { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 15, attribution: "Terrain: Mapzen/AWS" });
        } catch {}
        // 🖼️ 절차 질감(캔버스 → addImage): 물결·파사드 3종. 실제 건물 사진은 타일에 없으므로 '사진 같은 창문 격자'로 형태·색감을 보완.
        try { for (const [id, img] of Object.entries(makeMapTextures())) if (!ml.hasImage(id)) ml.addImage(id, img, { pixelRatio: 2 }); } catch {}
        // 🎨 Blender 렌더 질감을 비동기로 얹고, 다 실리면 패턴 지정을 한 번 더 돌린다(멱등).
        if (!(ml as any).__dcnTexLoading) { (ml as any).__dcnTexLoading = true; void loadMapTextures(ml).then(() => { applied = false; try { applyVectorStyle(true); } catch {} }); } // applied 가드를 풀어야 패턴 지정이 실제로 다시 돈다
        // 🌤️ 3D 건물 조명 — 좌상단에서 비치는 따뜻한 빛(면마다 밝기 차 → 입체감)
        try { ml.setLight({ anchor: "viewport", color: "#fff4e0", intensity: 0.42, position: [1.15, 210, 30] }); } catch {}
        for (const ly of style.layers) {
          const sl = (ly as any)["source-layer"] || "";
          // 지형 음영 래스터(natural_earth/ne2) → 숨김. 저해상도가 확대돼 큰 녹색 덩어리로 보이던 원인.
          if (ly.type === "raster") { try { ml.setLayoutProperty(ly.id, "visibility", "none"); } catch {} continue; }
          // 토지구획(지적도) 파셀만 숨김 — landuse_residential/pitch/track/school 등
          if (sl === "landuse" || (/landuse/i.test(ly.id) && ly.type === "fill")) { try { ml.setLayoutProperty(ly.id, "visibility", "none"); } catch {} continue; }
          // 산·녹지: 숲은 짙은 녹색, 잔디·공원은 밝은 녹색 — 지형 음영과 겹쳐 산세가 살아난다.
          if ((sl === "landcover" || sl === "park") && (ly.type === "fill" || ly.type === "fill-extrusion")) {
            const wood = /wood|forest/i.test(ly.id);
            // 🌲 지표 질감(Blender): 숲=수관 돔, 풀·공원=풀결, 모래=고운 입자, 습지=풀+물웅덩이, 얼음=균열. 이미지가 없으면 색만.
            const base = /wood|forest/i.test(ly.id) ? "dcn-land-wood" : /sand/i.test(ly.id) ? "dcn-land-sand" : /wetland/i.test(ly.id) ? "dcn-land-wetland" : /ice|glacier/i.test(ly.id) ? "dcn-land-ice" : "dcn-land-grass";
            // 🌳 2차: OpenMapTiles subclass로 더 잘게 — 숲(forest, 빽빽)·잡목(wood)·공원(잔디+벤치)·정원(화단)·초지(meadow). 2차 이미지가 모두 실렸을 때만 데이터 구동 패턴, 아니면 1차 단일 패턴.
            const has = (...ids: string[]) => ids.every((i) => ml.hasImage(i));
            const pat: any = wood && has("dcn-lc-forest", "dcn-lc-wood") ? ["match", ["get", "subclass"], "forest", "dcn-lc-forest", "dcn-lc-wood"]
              : sl === "park" && has("dcn-lc-park", "dcn-land-grass") ? ["match", ["get", "class"], "park", "dcn-lc-park", "dcn-land-grass"]
              : /grass/i.test(ly.id) && has("dcn-lc-park", "dcn-lc-garden", "dcn-lc-meadow", "dcn-land-grass")
                ? ["match", ["get", "subclass"], ["park", "village_green", "recreation_ground", "golf_course"], "dcn-lc-park", ["garden", "allotments", "orchard", "vineyard", "plant_nursery"], "dcn-lc-garden", ["meadow", "grassland", "farmland", "farm", "heath"], "dcn-lc-meadow", "dcn-land-grass"]
              : ml.hasImage(base) ? base : null;
            try {
              ml.setPaintProperty(ly.id, "fill-color", wood ? "#a9c78f" : "#c4d9a6");
              if (pat) ml.setPaintProperty(ly.id, "fill-pattern", pat);
              // 숲은 광역 줌에서 옅게(고도별 색 밴드·음영이 비치게) → 동네 줌에서 또렷하게. 수관 타일은 64px 고정이라 z11 산맥에선 결만 남기는 게 맞다.
              ml.setPaintProperty(ly.id, "fill-opacity", wood ? ["interpolate", ["linear"], ["zoom"], 8, 0.5, 11, 0.62, 13, 0.9] : 0.78); ml.setLayoutProperty(ly.id, "visibility", "visible");
            } catch {}
            continue;
          }
          // 🌊 물 — 종류(class)를 깊이로 읽어 색·물결을 다르게: 바다(가장 깊음) → 호수 → 강 → 연못.
          if (sl === "water" && ly.type === "fill") {
            try {
              ml.setPaintProperty(ly.id, "fill-pattern", ["match", ["get", "class"], "ocean", "dcn-water-ocean", "lake", "dcn-water-lake", "river", "dcn-water-river", ["pond", "swimming_pool", "dock"], "dcn-water-pond", "dcn-water-lake"]);
              ml.setPaintProperty(ly.id, "fill-opacity", 1);
            } catch { try { ml.setPaintProperty(ly.id, "fill-color", ["match", ["get", "class"], "ocean", "#5d92c0", "lake", "#7aacd4", "river", "#93bfe0", "#aacfea"]); } catch {} }
            continue;
          }
          if (sl === "waterway" && ly.type === "line") { try { ml.setPaintProperty(ly.id, "line-color", "#8fb4d6"); } catch {} }
          // 🏢 건물: 평면(2D 폴백)은 크림 베이지, 3D 돌출은 벽면 그라데이션 + 높이(render_height) — 3D 토글이 표시 여부를 관리.
          if (ly.type === "fill" && /building/i.test(ly.id)) { try { ml.setPaintProperty(ly.id, "fill-color", "#ece2cf"); ml.setPaintProperty(ly.id, "fill-outline-color", "#dccfb4"); } catch {} continue; }
          if (ly.type === "fill-extrusion" && /building/i.test(ly.id)) {
            try {
              ml.setPaintProperty(ly.id, "fill-extrusion-height", ["coalesce", ["get", "render_height"], 8]);
              ml.setPaintProperty(ly.id, "fill-extrusion-base", ["coalesce", ["get", "render_min_height"], 0]);
              ml.setPaintProperty(ly.id, "fill-extrusion-opacity", 0.96);
              ml.setPaintProperty(ly.id, "fill-extrusion-vertical-gradient", true);
              ml.setLayerZoomRange(ly.id, 13, 24); // z14(Leaflet 15)부터 — 동네 골목 줌에서 입체
              // 🏢 높이별 파사드 질감(창문 격자): 저층=베이지 벽·목재창 / 중층=콘크리트·유리창 / 고층=커튼월. 실제 서울 건물 색감(회백·베이지·유리)에 맞춤.
              // 2차: Blender 파사드 5단계(빌라 <13m · 벽돌 상가 13~30 · 오피스 30~70 · 커튼월 70~120 · 유리 초고층). 다 실리기 전엔 캔버스 3단계.
              const fac5 = ["dcn-fac-villa", "dcn-fac-brick", "dcn-fac-office", "dcn-fac-curtain", "dcn-fac-glass"].every((i) => ml.hasImage(i));
              try { ml.setPaintProperty(ly.id, "fill-extrusion-pattern", fac5
                ? ["step", ["coalesce", ["get", "render_height"], 8], "dcn-fac-villa", 13, "dcn-fac-brick", 30, "dcn-fac-office", 70, "dcn-fac-curtain", 120, "dcn-fac-glass"]
                : ["step", ["coalesce", ["get", "render_height"], 8], "dcn-fac-low", 24, "dcn-fac-mid", 70, "dcn-fac-tall"]); }
              catch { ml.setPaintProperty(ly.id, "fill-extrusion-color", ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 8], 0, "#e6dccb", 30, "#d5cec2", 120, "#b9c4cc"]); }
            } catch {}
            continue;
          }
          // 주요 도로 강조색(웜 앰버) — 큰길이 한눈에. 물길/철도는 기본 유지.
          if (ly.type === "line" && /(motorway|trunk|primary)/i.test(ly.id) && !/casing|bridge|tunnel/i.test(ly.id)) { try { ml.setPaintProperty(ly.id, "line-color", "#e6a23c"); } catch {} }
          if (ly.type === "line" && /(secondary|tertiary)/i.test(ly.id) && !/casing|bridge|tunnel/i.test(ly.id)) { try { ml.setPaintProperty(ly.id, "line-color", "#f3d9a4"); } catch {} }
          if (ly.type === "symbol") {
            const tf = (ly as any).layout && (ly as any).layout["text-field"];
            if (tf && JSON.stringify(tf).includes("name")) { try { ml.setLayoutProperty(ly.id, "text-field", KO_LABEL); } catch {} }
            // 🏪 POI(상호·상가)를 풍성하게 — 더 일찍 보이게(줌 2단계↓) + 가독성 헤일로 + 강조색(교통=파랑, 그 외=커피브라운)
            if (/poi/i.test(ly.id)) {
              try { if (typeof (ly as any).minzoom === "number") ml.setLayerZoomRange(ly.id, Math.max(11, (ly as any).minzoom - 3), (ly as any).maxzoom ?? 24); } catch {}
              try { ml.setPaintProperty(ly.id, "text-color", /transit/i.test(ly.id) ? "#235a86" : "#4a3526"); } catch {}
              try { ml.setPaintProperty(ly.id, "text-halo-color", "#fdf7ec"); ml.setPaintProperty(ly.id, "text-halo-width", 1.4); } catch {}
              try { ml.setLayoutProperty(ly.id, "icon-size", 1.15); } catch {}
              // 🚇 2차: 대표 시설 아이콘을 Blender 렌더로(역·버스·공원·주차). 나머지는 스프라이트 유지. 원본 icon-image는 첫 통과 때 보존(재적용 시 중첩 방지).
              //    OpenMapTiles 역은 class=railway(subclass station/subway/…) — 출입구(subway_entrance)는 제외해 역 하나에 아이콘 하나.
              try {
                if (_origPoiIcon[ly.id] === undefined) _origPoiIcon[ly.id] = (ly as any).layout?.["icon-image"] ?? null;
                const oi = _origPoiIcon[ly.id];
                if (oi && ["dcn-poi-subway", "dcn-poi-bus", "dcn-poi-park", "dcn-poi-parking"].every((i) => ml.hasImage(i))) ml.setLayoutProperty(ly.id, "icon-image", ["case",
                  ["all", ["match", ["get", "class"], ["railway", "rail"], true, false], ["match", ["get", "subclass"], ["station", "subway", "halt", "tram_stop", "train_station"], true, false]], "dcn-poi-subway",
                  ["==", ["get", "class"], "bus"], "dcn-poi-bus", ["==", ["get", "class"], "park"], "dcn-poi-park", ["==", ["get", "class"], "parking"], "dcn-poi-parking", oi]);
              } catch {}
              try { ml.setLayoutProperty(ly.id, "icon-allow-overlap", ["step", ["zoom"], false, 16, true]); } catch {}
              try { ml.setLayoutProperty(ly.id, "text-allow-overlap", ["step", ["zoom"], false, 17, true]); } catch {}
              try { ml.setLayoutProperty(ly.id, "text-optional", true); } catch {}
            }
            // 물 이름은 물색 계열로
            if (sl === "water_name" || /water_name|waterway/i.test(ly.id)) { try { ml.setPaintProperty(ly.id, "text-color", "#4a78a8"); } catch {} }
          }
        }
        // 🛣️ 2차: 도로·다리 질감(line-pattern) — 원본 선은 그대로 두고(광역 줌의 앰버 강조 유지) z14+에서만 같은 필터·선폭의 복제 선을 원본 바로 위에 얹는다.
        //    이미지가 없으면 복제 자체를 안 만든다(회귀 0). 다리=난간 데크(회색), 큰길=앰버 차선·연석, 2차로·골목=연앰버. 줌 1단계에 걸쳐 서서히 나타난다(툭 튀지 않게).
        try {
          const ROAD_TEX: [string, string, number][] = [
            ["road_motorway", "dcn-rd-major", 14], ["road_trunk_primary", "dcn-rd-major", 14], ["road_secondary_tertiary", "dcn-rd-street", 14], ["road_minor", "dcn-rd-street", 15],
            ["bridge_motorway", "dcn-rd-bridge", 14], ["bridge_trunk_primary", "dcn-rd-bridge", 14], ["bridge_secondary_tertiary", "dcn-rd-bridge", 14], ["bridge_street", "dcn-rd-bridge", 14],
            ["bridge_link", "dcn-rd-bridge", 14], ["bridge_motorway_link", "dcn-rd-bridge", 14], ["bridge_path_pedestrian", "dcn-rd-bridge", 15],
          ];
          for (const [orig, pat, minz] of ROAD_TEX) {
            const id = `dcn-tex-${orig}`; if (ml.getLayer(id) || !ml.hasImage(pat)) continue;
            const i = style.layers.findIndex((l: any) => l.id === orig); if (i < 0) continue;
            const src: any = style.layers[i]; const lw = src?.paint?.["line-width"]; if (src.type !== "line" || lw === undefined) continue;
            ml.addLayer({ id, type: "line", source: src.source, "source-layer": src["source-layer"], filter: src.filter, minzoom: Math.max(src.minzoom || 0, minz),
              layout: { "line-cap": src.layout?.["line-cap"] || "butt", "line-join": src.layout?.["line-join"] || "round" },
              paint: { "line-width": lw, "line-pattern": pat, "line-opacity": ["interpolate", ["linear"], ["zoom"], minz, 0, minz + 1, 1] } } as any, style.layers[i + 1]?.id);
          }
        } catch {}
        // 🌅 2차: 하늘·안개 — 기울인 화면의 지평선을 크림→연하늘로, 먼 곳은 지도 바탕색 안개로 녹인다(멀수록 자연스럽게 사라짐). 광역(z<9)은 대기 효과 0(전국 화면 불변).
        try { ml.setSky({ "sky-color": "#dbe7f2", "horizon-color": "#f7eedc", "fog-color": "#f3ecdb", "fog-ground-blend": 0.55, "horizon-fog-blend": 0.75, "sky-horizon-blend": 0.7, "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 9, 0, 11, 1] }); } catch {}
        // 🏝️ 얕은 물가 띠 2겹 — 수심 데이터가 없으니 '물가에 가까울수록 얕다'를 띠로 표현.
        //    ① 넓고 흐린 청록 띠(얕은 물의 색 변화) ② 얇고 밝은 거품선(물가). 물 폴리곤 위·심볼 아래.
        try {
          if (!ml.getLayer("dcn-water-shallow")) ml.addLayer({
            id: "dcn-water-shallow", type: "line", source: "openmaptiles", "source-layer": "water",
            filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!=", ["get", "brunnel"], "tunnel"]],
            paint: { "line-color": "#9fd3de", "line-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.25, 12, 0.42, 16, 0.5], "line-blur": ["interpolate", ["linear"], ["zoom"], 8, 2, 12, 5, 16, 12],
                     "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 11, 5, 14, 12, 17, 28] },
          }, firstSymbolId(ml));
          if (!ml.getLayer("dcn-water-edge")) ml.addLayer({
            id: "dcn-water-edge", type: "line", source: "openmaptiles", "source-layer": "water",
            filter: ["all", ["==", ["geometry-type"], "Polygon"], ["!=", ["get", "brunnel"], "tunnel"]],
            paint: { "line-color": "#e8f4fb", "line-opacity": 0.8, "line-blur": 1.2, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.6, 11, 1.6, 15, 3.2, 18, 6] },
          }, firstSymbolId(ml));
        } catch {}
        // 🏔️ 고도별 색(color-relief, MapLibre 5.6+) — 실제 고도 타일(terrarium) 값으로 평야 크림→연녹→올리브→황갈→갈회→정상 회백.
        //    한국 지형 기준 밴드(한강 저지 0~50m · 북한산 836 · 설악 1,708 · 지리 1,915 · 한라 1,950). 음영(hillshade)은 그대로 위에 얹는다.
        //    광역에선 또렷하게, 골목 줌에선 옅게(건물이 주인공) — 불투명도를 줌으로 보간. 지원 안 되는 구버전이면 조용히 건너뛴다.
        try {
          // MapLibre 권고: 3D 지형과 color-relief는 소스를 분리해야 렌더 품질이 유지된다(같은 소스면 경고). 타일 URL은 같아 브라우저 캐시를 공유한다.
          if (!ml.getSource("dcn-dem-relief")) ml.addSource("dcn-dem-relief", { type: "raster-dem", tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"], encoding: "terrarium", tileSize: 256, maxzoom: 15 });
          if (!ml.getLayer("dcn-color-relief") && ml.getSource("dcn-dem-relief")) ml.addLayer({
            id: "dcn-color-relief", type: "color-relief", source: "dcn-dem-relief", maxzoom: 17,
            paint: {
              "color-relief-color": ["interpolate", ["linear"], ["elevation"],
                0, "rgba(246,239,224,0.0)", 40, "rgba(240,238,216,0.55)", 120, "#e6ebc9", 250, "#d3dfb1", 450, "#bfcf98",
                700, "#aab882", 950, "#a29a70", 1200, "#9b8c6c", 1500, "#a59c8e", 1800, "#d9d6cf", 2000, "#f1efe9"],
              "color-relief-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.62, 11, 0.55, 14, 0.38, 16, 0.16, 18, 0.06],
            },
          } as any, ml.getLayer("water") ? "water" : firstSymbolId(ml));   // 물 아래(음영도 같은 자리에 들어가 색→음영→물 순)
        } catch {}
        // 🏔️ 지형 음영 레이어 — 물 아래·녹지 위: 산자락이 크림 지도 위로 은은히 드러난다(따뜻한 그림자·크림 하이라이트).
        try {
          if (!ml.getLayer("dcn-hillshade")) ml.addLayer({ id: "dcn-hillshade", type: "hillshade", source: "dcn-dem", maxzoom: 17, paint: { "hillshade-exaggeration": 0.5, "hillshade-shadow-color": "#5c4433", "hillshade-highlight-color": "#fff9ec", "hillshade-accent-color": "#8a6a4a", "hillshade-illumination-direction": 335, "hillshade-illumination-anchor": "map" } }, ml.getLayer("water") ? "water" : undefined);
        } catch {}
        // 초기 토글 상태(길이름/버스정류장/3D) 반영
        try { applyTogglesToMap(ml, showStreetsRef.current, showBusRef.current, show3dRef.current); } catch {}
      };
      ml.on("load", () => applyVectorStyle());
      ml.on("styledata", () => applyVectorStyle());
      applyVectorStyle();
      layerRef.current = L.layerGroup().addTo(mapA);
      canvasRef2.current = null; // (Leaflet 캔버스 렌더러 흔적 — 어댑터가 선·원을 GeoJSON 레이어로 그린다)
      // 🇰🇷 독도·울릉도 — 항상 표시(영토 표현). layerRef가 아니라 맵에 직접 붙여 drawMarkers 갱신에도 유지.
      L.marker([37.2429, 131.8665], { icon: L.divIcon({ className: "", html: makeIslandHtml("독도"), iconSize: [0, 0] }), interactive: false, zIndexOffset: 500 }).addTo(mapA);
      L.marker([37.4845, 130.9057], { icon: L.divIcon({ className: "", html: makeIslandHtml("울릉도"), iconSize: [0, 0] }), interactive: false, zIndexOffset: 500 }).addTo(mapA);
      // 스타일이 실려야 선·원 오버레이 소스가 생긴다 → load 후 준비 신호. 타일 서버 지연 대비 4초 폴백(마커는 DOM이라 스타일 없이도 그려짐).
      let readyFired = false;
      const fireReady = () => { if (readyFired || cancelled) return; readyFired = true; try { ml.resize(); } catch {} setMapReady(true); };
      ml.once("load", fireReady);
      setTimeout(fireReady, 4000);
    })();
    return () => { cancelled = true; };
  }, [tab, role]);
  // 선택 카페 핀 강조 — 마커 재생성 없이 클래스 토글
  useEffect(() => { selectedRef.current = selected; applySelectedPin(selected?.id ?? null); }, [selected]);
  useEffect(() => { try { if (window.matchMedia("(min-width: 768px)").matches) setLegendOpen(true); } catch {} }, []);
  // 지도 탭 재진입 시 사이즈 보정(숨김→표시 전환 대응). 여러 타이밍에 호출해 확실히 렌더.
  useEffect(() => {
    if (tab === "map" && mapObj.current) {
      const ts = [50, 200, 450].map((d) => setTimeout(() => mapObj.current?.invalidateSize(), d));
      return () => ts.forEach(clearTimeout);
    }
  }, [tab, sheetOpen, sheetMode]); // 시트 높이(모바일 지도 영역) 바뀌면 크기 재계산

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
  // ⚡ 마지막으로 그린 (줌, 패딩 경계) — 이 범위 안에서의 팬은 재그리기 불필요(카페 레벨 한정).
  const lastDrawRef = useRef<{ z: number; s: number; n: number; w: number; e: number } | null>(null);
  const canvasRef2 = useRef<any>(null); // 비클릭 벡터용 캔버스 렌더러(맵 초기화 때 1회 생성)
  const drawMarkers = useCallback(() => {
    const L = LRef.current; const map = mapObj.current;
    if (!L || !map || !layerRef.current) return;
    lastDrawRef.current = null; // 그리기 시작 = 기존 기억 무효(카페 레벨만 끝에서 재설정)
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
          cas.push(L.polyline(seg, { color: "#ffffff", weight: w + 2.5, opacity: 0.7, interactive: false, lineJoin: "round", lineCap: "round", renderer: canvasRef2.current ?? undefined }));
          col.push(L.polyline(seg, { color: ln.color, weight: w, opacity: lz >= 13 ? 0.9 : 0.7, interactive: false, lineJoin: "round", lineCap: "round", renderer: canvasRef2.current ?? undefined }));
        }
        if (cas.length) layerRef.current.addLayer(L.layerGroup([...cas, ...col]));
      }
    }

    // ===== 📍 내 주변 500m: 현재 위치 + 반경 원 + 500m 이내 카페만 =====
    if (nearMe) {
      const R = 500;
      layerRef.current.addLayer(L.circle([nearMe.lat, nearMe.lng], { radius: R, color: "#2f6fb0", weight: 1.5, fillColor: "#2f6fb0", fillOpacity: 0.08, interactive: false, renderer: canvasRef2.current ?? undefined }));
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
    // ⚡ 2026-08-27 성능: b.contains는 호출마다 LatLng 객체를 만들어 17,000곳 전수에서 비싸다 →
    //   경계를 숫자 4개로 풀어 단일 패스 비교(할당 0). 아울러 **화면보다 50% 넓게(pad)** 걸러 그려 두면
    //   그 여유 안에서 팬(드래그)하는 동안은 재그리기를 통째로 건너뛸 수 있다(아래 lastDrawRef).
    //   클러스터 셀은 절대 픽셀 좌표 기준이라 팬으로는 소속이 안 바뀐다 — 여유분만 있으면 화면이 정확하다.
    // 🏢 기울인(3D) 화면의 bounds는 지평선까지 품은 사다리꼴이라 그대로 쓰면 안 된다 → nearViewBox(가까운 화면만)로 상자를 잡고 여유(pad)를 준다.
    //   ⚠️ 2026-09-07 수리: 예전엔 기울임일 때 **화면 좌표로 클러스터**를 묶어, 팬할 때마다 소속이 바뀌며 뭉치가 갈라지고 붙어
    //      "마커가 정신없이 움직인다"(CEO 지적). 이제 평면·기울임 모두 **절대 월드 픽셀 셀**이라 팬으로는 소속이 절대 안 바뀐다.
    const mlv: any = mlRef.current;
    const nb = mlv ? nearViewBox(mlv) : null;
    const raw = nb ?? { s: b.getSouth(), n: b.getNorth(), w: b.getWest(), e: b.getEast() };
    const dLat = (raw.n - raw.s) * 0.35, dLng = (raw.e - raw.w) * 0.35; // 화면보다 넉넉히 그려 두면 그 안에서 팬하는 동안 재그리기 0
    const pS = raw.s - dLat, pN = raw.n + dLat, pW = raw.w - dLng, pE = raw.e + dLng;
    markersByIdRef.current = new Map();
    const inView: Cafe[] = [];
    for (const c of cafes) {
      if (!c.lat || !c.lng) continue;
      if (c.lat >= pS && c.lat <= pN && c.lng >= pW && c.lng <= pE) inView.push(c);
    }
    // 화면상 셀 크기(px) — 이 안의 카페끼리 한 뭉치. 줌인하면 px 간격 벌어져 쪼개짐.
    //   z≥16(동네 골목 줌)부턴 셀을 줄여 '2·3개 뭉치'가 개별 핀으로 풀리게 — 명동·성수 실측에서 화면이 온통 ●2로 덮였음.
    //   줌별 튜닝(2026-09-07 CEO): 광역(z13~14)은 셀을 키워 '작은 뭉치 난립'을 줄이고, 골목(z16+)은 줄여 개별 핀으로.
    const CELL = z >= 18 ? 26 : z >= 17 ? 34 : z >= 16 ? 44 : z >= 15 ? 64 : z >= 14 ? 84 : 100;
    const cells = new Map<string, Cafe[]>();
    for (const c of inView) {
      // 절대 월드 픽셀 셀 — 팬으로 소속이 바뀌지 않는다(화면 좌표를 쓰면 움직일 때마다 뭉치가 갈라진다).
      const p = map.project([c.lat, c.lng], z);
      const k = Math.floor(p.x / CELL) + ":" + Math.floor(p.y / CELL);
      const arr = cells.get(k); if (arr) arr.push(c); else cells.set(k, [c]);
    }
    const markers: any[] = [];
    let focusM: any = null;
    const addPin = (c: Cafe, forceFocus = false) => {
      const isFocus = forceFocus || c.id === focusId, isMatch = matchSet.has(c.id), isMine = myCafeIds.has(c.id);
      const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: "", html: makePinHtml(c, isMatch, isFocus, isMine, z), iconSize: [0, 0] }), zIndexOffset: isFocus ? 3000 : c.featured ? 2000 : isMatch ? 1000 : (c.synth_grade === "검증" ? 300 : c.synth_grade === "참고" ? 100 : 0) }).on("click", () => setSelected(c));
      if (isFocus) { m.bindPopup(`<b>${c.name}</b><br>${c.area}`); focusM = m; }
      markersByIdRef.current.set(c.id, m);
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
      const nVerified = pts.reduce((n, c) => n + (c.synth_grade === "검증" ? 1 : 0), 0);
      markers.push(L.marker([cx, cy], { icon: L.divIcon({ className: "", html: makeClusterHtml(pts.length, hasMatch, nVerified), iconSize: [0, 0] }), zIndexOffset: 500 }).on("click", () => map.setView([cx, cy], Math.min(z + 2, 18), { animate: true })));
    }
    // 🚇🏬 지하철역·대형 랜드마크 — 개별 카페(동) 레벨에서만, 화면 안만. 카페보다 아래·비클릭.
    if (z >= 13) {
      if (landmarks.length) {
        // 큰 랜드마크(우선순위≥3: 몰·백화점·대학·경기장·타워·공항·궁·테마파크)만, 화면당 최대 8개 — 군더더기 제거
        const lms = landmarks
          .filter(([, la, lo, , pr]) => pr >= 3 && la >= pS && la <= pN && lo >= pW && lo <= pE)
          .sort((a, c) => c[4] - a[4])
          .slice(0, 8);
        const lmLayer = lms.map(([nm, la, lo, ic]) => L.marker([la, lo], { icon: L.divIcon({ className: "", html: makeLandmarkHtml(nm, ic), iconSize: [0, 0] }), interactive: false, zIndexOffset: -800 }));
        if (lmLayer.length) layerRef.current.addLayer(L.layerGroup(lmLayer));
      }
      if (stations.length) {
        const stns = stations.filter((s) => s.lat >= pS && s.lat <= pN && s.lng >= pW && s.lng <= pE).slice(0, 20);
        const stnLayer = stns.map((s) => L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html: makeStationHtml(s.n, s.c, s.r), iconSize: [0, 0] }), interactive: false, zIndexOffset: -300 }));
        if (stnLayer.length) layerRef.current.addLayer(L.layerGroup(stnLayer));
      }
      // 지하철 출구 — z≥15에서, 화면 안 최대 26개. 연결선 없이 출구 마커만 도드라지게(역 근처에 모여 보임).
      if (z >= 15 && exits.length) {
        const exs = exits.filter((e) => e.lat >= pS && e.lat <= pN && e.lng >= pW && e.lng <= pE).slice(0, 26);
        const exLayer = exs.map((e) => L.marker([e.lat, e.lng], { icon: L.divIcon({ className: "", html: makeExitHtml(e.n), iconSize: [0, 0] }), interactive: false, zIndexOffset: 200 }));
        if (exLayer.length) layerRef.current.addLayer(L.layerGroup(exLayer));
      }
    }
    layerRef.current.addLayer(L.layerGroup(markers));
    if (focusM) (focusM as any).openPopup();
    applySelectedPin(selectedRef.current?.id ?? null);
    // ⚡ 방금 그린 범위(패딩 포함)와 줌을 기억 — live/final이 "다시 그릴 필요가 있나"를 판단하는 근거.
    lastDrawRef.current = { z, s: pS, n: pN, w: pW, e: pE }; // 기울임 포함 — 이 상자 안에서 움직이는 동안은 다시 안 그린다
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
    // ⚡ 이미 그려 둔 패딩 범위 안에서 같은 줌으로 움직이는 중이면 재그리기 생략 —
    //   클러스터 소속은 절대 픽셀 그리드라 팬으로 안 변하고, 마커도 이미 그 범위까지 그려져 있다.
    //   (강남 밀집 실측: 그리기 1회 최대 84ms = 프레임 5개 — 이 스킵이 드래그 버벅임의 본체를 없앤다.)
    const needRedraw = () => {
      const last = lastDrawRef.current; if (!last) return true;
      if (map.getZoom() !== last.z) return true;
      const mlv: any = mlRef.current;
      const nb = mlv ? nearViewBox(mlv) : null; // 그릴 때와 똑같은 기준(가까운 화면)으로 비교해야 판단이 일치한다
      const cur = nb ?? (() => { const v = map.getBounds(); return { s: v.getSouth(), n: v.getNorth(), w: v.getWest(), e: v.getEast() }; })();
      return cur.s < last.s || cur.n > last.n || cur.w < last.w || cur.e > last.e;
    };
    const live = () => { if (timer) return; timer = setTimeout(() => { timer = null; if (needRedraw()) drawMarkers(); }, 120); }; // 유저 드래그 중 ~120ms마다(필요할 때만) 재클러스터
    const final = () => { if (timer) { clearTimeout(timer); timer = null; } if (needRedraw()) drawMarkers(); }; // 멈춤·줌끝 → 필요 시 1회
    map.on("drag", live);   // ★ 유저 손가락 팬에만 라이브 → flyTo(뒤로가기 줌아웃)·줌 중엔 안 걸려 전환이 매끄러움(끝나서 한 번만 재그림)
    map.on("moveend", final);
    return () => { map.off("drag", live); map.off("moveend", final); if (timer) clearTimeout(timer); };
  }, [drawMarkers, mapReady, dong, focusId, myPinMode, othersMode]);

  // 🗺️ 상세 패널이 열린 채로 지도를 움직일 수 있게 한 뒤(패널이 포인터를 통과시킴), '지도 빈 곳 클릭'을 닫기로 쓴다.
  //    MapLibre의 click은 드래그와 구분되므로 팬 도중에는 닫히지 않는다. 핀은 자체 핸들러에서 stopPropagation → 여기 안 오고 그 카페로 전환된다.
  useEffect(() => {
    const ml = mlRef.current; if (!ml || !mapReady) return;
    const onMapClick = () => { if (selectedRef.current) setSelected(null); };
    ml.on("click", onMapClick);
    return () => { try { ml.off("click", onMapClick); } catch {} };
  }, [mapReady]);

  // 길이름·버스정류장 토글 → 벡터 레이어 visibility 적용(스타일 로드 후엔 styledata로도 한 번 더 보장)
  useEffect(() => {
    if (!mapReady) return;
    applyTogglesToMap(mlRef.current, showStreets, showBus, show3d);
    const ml = mlRef.current;
    if (ml) { const h = () => applyTogglesToMap(ml, showStreetsRef.current, showBusRef.current, show3dRef.current); ml.once && ml.once("idle", h); }
  }, [showStreets, showBus, show3d, mapReady]);
  // 🏢 3D 자동 기울임 — 동네 줌(z≥15)으로 들어오면 아직 기울이지 않은 지도를 52°로, 광역(z<14)으로 나가면 평면으로.
  //   사용자가 손으로 기울인 각도(0이 아닌 값)는 존중해 덮어쓰지 않는다.
  useEffect(() => {
    const ml = mlRef.current; if (!ml || !mapReady) return;
    const apply = () => {
      try {
        const zL = ml.getZoom() + 1, cur = ml.getPitch();
        // 🏔️ 3D 지형(산이 실제로 솟음) — 3D ON이면 항상. 고도 타일은 무료 공개(AWS), 우리 비용 0.
        //   ⚠️ 모바일(WebKit iOS·Android Chromium 모두)은 지형을 켜면 카메라 애니메이션이 영구 정지(isMoving=true — 2026-09-07 Playwright 실측, 운영에서 재현)
        //   → 3D 지형은 **마우스 환경(데스크톱)에서만**, 모바일은 지형 음영(hillshade)만. 또 고도 소스가 다 실리고 카메라가 멈춘 상태에서만 켠다.
        const terrainOk = typeof navigator !== "undefined" && !/apple/i.test(navigator.vendor || "") && typeof window !== "undefined" && window.matchMedia("(pointer: fine) and (hover: hover)").matches;
        try {
          // 🏔️ 지형은 산세가 보이는 광역(38° 구간, z<15)에서만. 동네·골목 줌에선 건물이 주인공이고, 지형이 켜져 있으면
          //    마커 높이를 매 프레임 지형에 붙여 다시 계산해 **핀이 미세하게 떨린다**(CEO 지적: 최대 줌에서 정신없이 움직임).
          //    → 기울기 밴드와 일치시킨다: 38°(광역)=지형 ON, 52°(동네)=지형 OFF.
          const has = !!ml.getTerrain();
          const wantTerrain = terrainOk && show3dRef.current && zL < 15;
          if (!wantTerrain && has) { ml.setTerrain(null); }
          else if (wantTerrain && !has && ml.getSource("dcn-dem")) {
            if (ml.isSourceLoaded("dcn-dem") && !ml.isMoving()) ml.setTerrain({ source: "dcn-dem", exaggeration: 1.35 });
            else ml.once("idle", () => { try { if (show3dRef.current && !ml.getTerrain() && ml.isSourceLoaded("dcn-dem") && (ml.getZoom() + 1) < 15) ml.setTerrain({ source: "dcn-dem", exaggeration: 1.35 }); } catch {} });
          }
        } catch {}
        // 자동 기울임: 동네(z≥15) 52° / 광역·산세(z 11~14) 38° / 전국(z<11) 평면 — 아직 안 기울인 상태(pitch≈0)에서만.
        const want = !show3dRef.current ? 0 : zL >= 15 ? 52 : zL >= 11 ? 38 : 0;
        // '손으로 기울인 각도'는 존중: 현재 각도가 우리가 마지막에 자동으로 준 값(또는 0)과 같을 때만 바꾼다.
        const untouched = cur < 1 || Math.abs(cur - autoPitchRef.current) < 1;
        if (untouched && Math.abs(cur - want) > 1) { autoPitchRef.current = want; ml.easeTo({ pitch: want, duration: want === 0 ? 400 : 500, essential: true }); }
      } catch {}
    };
    ml.on("zoomend", apply); apply();
    return () => { try { ml.off("zoomend", apply); } catch {} };
  }, [mapReady, show3d]);

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
      <div className="min-h-screen w-full nt-app" style={{ background: "var(--nt-espresso)", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)", fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }}>
        <LandingNote discover={discover} onConsumer={chooseConsumer}
          onOwner={() => { trackOwnerCta(); setShowFind(true); }}
          onLogin={() => { setOwnerPw(""); setOwnerErr(""); setOwnerPin(""); setOwnerPinErr(""); setOwnerAdminMode(false); setOwnerPwModal(true); }} />

        {ownerPwModal && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOwnerPwModal(false)} />
            <div className="relative nt-paper text-[#2a1f17] w-full max-w-sm rounded-2xl p-6 shadow-2xl">
              {/* 우측 상단: 무료 체험 */}
              <button onClick={() => setShowSignup(true)} className="absolute top-4 right-4 text-[11px] font-bold bg-[#e8b87a] text-[#2b2018] px-3 py-1.5 rounded-full shadow active:scale-95">✨ {TRIAL_DAYS}일 무료 체험</button>
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
                  <p className="text-[12px] text-[#524234] text-center mt-3">키가 없으세요? <button onClick={() => setShowSignup(true)} className="text-[#7a5122] font-bold underline">{TRIAL_DAYS}일 무료 체험 신청</button></p>
                  <button onClick={() => { setOwnerAdminMode(true); setOwnerPinErr(""); }} className="block w-full text-center text-[11px] text-[#665036] underline mt-2">관리자세요? 관리자 로그인</button>
                </>
              )}
            </div>
          </div>
        )}
        <OwnerFindModal open={showFind} onClose={() => setShowFind(false)}
          onNoMatch={() => { setShowFind(false); setShowSignup(true); }} />
        <OwnerSignupModal open={showSignup} onClose={() => setShowSignup(false)} trial source="home" />
        {backToast && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-8 z-[6000] bg-[#2a1f17] text-[#fbf7f0] text-sm px-5 py-3 rounded-full shadow-xl">
            한 번 더 누르면 나가요
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col nt-paper nt-app" style={{ position: "fixed", inset: 0, fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }}>
      {/* 📖 책장 넘김 — 탭이 바뀔 때 종이 한 장이 왼쪽으로 넘어간다(0.55s, 움직임 줄이기면 없음) */}
      {turnKey > 0 && <div key={turnKey} className="nt-turn" style={{ zIndex: 1600 }} aria-hidden />}
      {/* 📣 접속 시 안내 공지 — 데이터는 /api/discover 응답에 얹혀 온다(전용 요청 0, 비용 증가 0) */}
      <NoticeModal source={(discover as any)?.notice ?? null} />
      {/* ✨ 동적 연출(2026-07-30) — CSS 전용·가볍게·reduced-motion 존중. 우리 정체성을 '느끼게': ①골드핀 맥동 ②커피드립 로딩 ③저장 손맛 ④옥석 가리기 */}
      <style>{`
        /* 📥 홈 피드 등장 — 진입하는 순간 카드들이 차례로 떠오름(항상 보이는 화면이라 확실히 느껴짐) */
        @keyframes dcnEnter { 0% { opacity:0; transform:translateY(18px); } 100% { opacity:1; transform:translateY(0); } }
        .dcn-enter { animation: dcnEnter .55s cubic-bezier(.2,.75,.25,1) both; }
        /* ① 골드(우선노출) 핀 — 퍼지는 크레마 링 2겹(시선 유도 + B2B 가치 강조) */
        @keyframes dcnHalo { 0% { box-shadow:0 0 0 0 rgba(224,163,46,0.7); opacity:1; } 100% { box-shadow:0 0 0 16px rgba(224,163,46,0); opacity:0; } }
        .dcn-pin-feat .dcn-pin-body::after, .dcn-pin-focus .dcn-pin-body::after { content:""; position:absolute; left:2%; top:-2%; width:96%; aspect-ratio:1; border-radius:50%; pointer-events:none; animation: dcnHalo 1.5s ease-out infinite; }
        .dcn-pin-focus .dcn-pin-body::after { animation-name: dcnHaloF; }
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
          .dcn-enter, .dcn-pin-feat .dcn-pin-body::after, .dcn-pin-focus .dcn-pin-body::after, .dcn-cload .cup::before, .dcn-cload .drip, .dcn-cload .stm, .dcn-pop, .dcn-fly { animation: none !important; }
          .dcn-enter { opacity:1 !important; transform:none !important; }
        }
        /* 🎯 카페 핀 상호작용 — hover 살짝 커짐, 선택(.dcn-sel)은 크게+맥동 링. 후보 소형점은 hover 때만 이름. */
        .dcn-pin .dcn-pin-body { position:relative; margin:0 auto; background-size:contain; background-position:center bottom; background-repeat:no-repeat; transform-origin:50% 100%; transition: transform .16s cubic-bezier(.2,.8,.3,1.2), filter .16s; }
        .dcn-pin:hover .dcn-pin-body { transform: scale(1.08); }
        /* 🎯 잔 아이콘 자리 — Blender 진단 렌더로 실측한 '핀 머리 안쪽 원판'의 중심(가로 49.68%·세로 39.53%)과 지름(가로 61.04%).
           글리프는 그 원판의 76%를 채운다(테두리 링에 닿지 않는 최대 크기). 눈대중 금지: 스프라이트를 다시 뽑으면 이 값도 다시 잰다. */
        .dcn-pin-glyph { position:absolute; left:49.68%; top:39.53%; width:46.4%; aspect-ratio:1; transform:translate(-50%,-50%); display:block; filter: drop-shadow(0 1px 1px rgba(0,0,0,.3)); }
        .dcn-pin-shadow { position:absolute; left:50%; bottom:-5px; width:70%; height:16%; transform:translateX(-50%); border-radius:50%; background: radial-gradient(ellipse at center, rgba(50,33,20,.42), rgba(50,33,20,0) 70%); pointer-events:none; }
        .dcn-pin-match { position:absolute; right:-4%; top:2%; width:38%; aspect-ratio:1; border-radius:50%; background:#e0a32e; color:#fff; font-size:0.62em; font-weight:900; line-height:1; display:flex; align-items:center; justify-content:center; border:2px solid #fdfaf4; box-shadow:0 1px 3px rgba(0,0,0,.35); }
        .dcn-mk.dcn-sel { z-index: 900 !important; }
        .dcn-mk.dcn-sel .dcn-pin-body { transform: scale(1.2); filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 7px rgba(181,112,60,.95)); }
        .dcn-mk.dcn-sel .dcn-lbl { font-weight:800 !important; background:#2b2018 !important; color:#fdf3e6 !important; }
        .dcn-pin-glyph svg { width:100%; height:100%; display:block; }
        .dcn-pin-dot { display:block; width:13px; height:13px; border-radius:50%; margin:0 auto; border:2px solid #fdfaf4; box-shadow:0 0 0 2px rgba(80,55,35,.14), 0 2px 5px rgba(50,33,20,.35); transition: transform .14s; }
        .dcn-pin-mini .dcn-lbl { display:none !important; }
        .dcn-pin-mini:hover .dcn-pin-dot, .dcn-mk.dcn-sel .dcn-pin-dot { transform: scale(1.35); }
        .dcn-pin-mini:hover .dcn-lbl, .dcn-mk.dcn-sel .dcn-pin-mini .dcn-lbl { display:inline-block !important; }
        .dcn-mk:hover { z-index: 800 !important; }
        .maplibregl-ctrl-top-left, .maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right { z-index: 1000 !important; } /* 마커(≤900) 위·React 오버레이(1100) 아래 */
        .dcn-cluster-body { position:relative; background-size:contain; background-position:center; background-repeat:no-repeat; transition: transform .14s; filter: drop-shadow(0 3px 5px rgba(50,33,20,.35)); }
        .dcn-cluster:hover .dcn-cluster-body, .dcn-region-pin:hover .dcn-cluster-body { transform: scale(1.1); }
        .dcn-cluster-n { position:absolute; left:50%; top:45.8%; transform:translate(-50%,-50%); color:#fff; font-weight:800; letter-spacing:-0.3px; line-height:1; text-shadow:0 1px 2px rgba(0,0,0,.45); }
        /* 범례 견본 */
        .dcn-lg-img { width:12px; height:17px; object-fit:contain; flex:none; }
        .dcn-lg-pin { display:inline-block; width:11px; height:11px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border:1.5px solid #fdfaf4; box-shadow:0 1px 2px rgba(0,0,0,.25); flex:none; }
        .dcn-lg-dot { display:inline-block; width:9px; height:9px; border-radius:50%; border:1.5px solid #fdfaf4; box-shadow:0 1px 2px rgba(0,0,0,.25); flex:none; margin:0 1px; }
        .dcn-lg-ring { display:inline-block; width:12px; height:12px; border-radius:50%; background: conic-gradient(#6f8f63 0 60%, rgba(120,90,60,.25) 60% 100%); flex:none; }
        /* 토글 상태점 — 켜짐=초록점, 꺼짐=빈 원(문구 ON/OFF보다 한눈에) */
        .dcn-tgl-dot { display:inline-block; width:9px; height:9px; border-radius:50%; border:1.5px solid currentColor; opacity:.55; }
        .dcn-tgl-dot.on { background:#8fd18a; border-color:#8fd18a; opacity:1; box-shadow:0 0 0 2px rgba(143,209,138,.35); }
        @media (prefers-reduced-motion: reduce) { .dcn-pin .dcn-pin-body, .dcn-pin-dot, .dcn-cluster .dcn-cluster-body { transition:none; } }
        @media (max-width: 767px) { .dcn-mapwrap { bottom: var(--dcn-sheet, 0px) !important; transition: bottom .3s ease-out; } }
        /* 🗺️ 지도 기본 컨트롤을 커피 톤으로(전문성) — 톤은 유지, 밋밋한 라이브러리 기본값만 다듬음 */
        .maplibregl-ctrl-group { border-radius:12px !important; overflow:hidden; box-shadow:0 3px 12px rgba(50,33,20,.22) !important; background:#fffdf9 !important; }
        .maplibregl-ctrl-group button { width:34px !important; height:34px !important; background:#fffdf9 !important; }
        .maplibregl-ctrl-group button + button { border-top:1px solid #ece0cc !important; }
        .maplibregl-ctrl-group button:hover { background:#f4ece0 !important; }
        .maplibregl-ctrl-group button:disabled { background:#f6f0e6 !important; opacity:.55; }
        .maplibregl-ctrl-group button .maplibregl-ctrl-icon { filter: sepia(.6) saturate(.7) brightness(.55); } /* 아이콘을 커피 브라운으로 */
        .maplibregl-ctrl-top-left { top:6px !important; left:10px !important; }
        @media (max-width: 767px) { .maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out { display:none !important; } } /* 모바일은 핀치 줌 — 나침반(회전 복귀)만 남김 */
        @media (max-width: 767px) { .dcn-tgl .dcn-tgl-txt { display:none; } .dcn-tgl { padding-left:.5rem !important; padding-right:.5rem !important; } }
        .maplibregl-ctrl-bottom-left .maplibregl-ctrl-scale { margin:0 0 12px 12px !important; background:rgba(255,253,249,.86) !important; border:1.5px solid #b79a6f !important; border-top:none !important; color:#6b4f35 !important; font:600 10px/1.4 'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif !important; padding:1px 6px !important; }
        .maplibregl-ctrl-attrib { background:rgba(255,253,249,.72) !important; color:#9c8569 !important; font-size:9px !important; padding:1px 6px !important; border-radius:6px 0 0 0 !important; }
        .maplibregl-ctrl-attrib a { color:#8a6d3b !important; }
        .maplibregl-ctrl-bottom-right .maplibregl-ctrl { margin:0 !important; }
        .dcn-popup .maplibregl-popup-content { background:#fdfaf4; color:#2b2018; font:600 12px/1.4 'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif; padding:6px 10px; border-radius:10px; box-shadow:0 4px 14px rgba(50,33,20,.28); }
        .dcn-popup .maplibregl-popup-tip { border-top-color:#fdfaf4; }
        .maplibregl-canvas:focus { outline:none; }
      `}</style>
      <header className="shrink-0 nt-header z-[1500] flex items-center justify-between px-4 gap-3 relative" style={{ height: "calc(3.5rem + env(safe-area-inset-top))", paddingTop: "env(safe-area-inset-top)", boxShadow: "0 2px 10px rgba(30,18,10,.28)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => { try { sessionStorage.removeItem("dcn_role"); } catch {} setRole(null); }} className="nt-title text-[22px] leading-none shrink-0" aria-label="랜딩으로">동네 커피 노트</button>
          {/* 홈/지도/추억 토글 — 노트 색인 탭 */}
          <div className="flex rounded-full p-0.5" style={{ background: "rgba(255,255,255,.10)" }}>
            {(["home", "map", "memory"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 sm:px-3 py-1.5 text-[13px] font-bold rounded-full transition-colors whitespace-nowrap ${tab === t ? "bg-[#e9d6bd] text-[#241812]" : "text-[#d9c7ad]"}`}>
                {t === "home" ? "홈" : t === "map" ? "지도" : "추억"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0 items-center">
          {role === "owner" ? (
            <>
              <a href="/owner" className="bg-[#9c6b3f] text-[#fbf7f0] rounded-full px-3 py-1.5 text-xs whitespace-nowrap">내 카페 분석</a>
              <a href="/cafe/register" className="bg-[#2a1f17] text-[#fbf7f0] rounded-full px-3 py-1.5 text-xs whitespace-nowrap hidden sm:inline-block">사장님 등록</a>
            </>
          ) : (
            <button onClick={() => { try { sessionStorage.removeItem("dcn_role"); } catch {} setRole(null); }} className="text-[11px] text-[#c9b391] underline whitespace-nowrap">사장님이세요?</button>
          )}
        </div>
      </header>

      {/* 홈 = 잡지 1면 */}
      {tab === "home" && (
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: "3.25rem", position: "relative" }}>
          {/* 원두 실루엣 장식 제거(2026-07-31 CEO 지시) */}
          <div className="max-w-2xl mx-auto px-5 pt-4 pb-6 nt-page-in" key={`home-${turnKey}`} style={{ position: "relative", zIndex: 1 }}>
            {/* 📓 "한 권의 노트"(2026-09-12) — 배치·블록은 그대로, 재질만 종이·잉크·테이프·도장으로. 붉은 리본 책갈피가 위에서 내려온다. */}
            <i className="nt-ribbon" style={{ right: 26, top: -6, height: 64 }} aria-hidden />
            <div className="text-center mb-6" style={{ position: "relative" }}>
              {/* ☕ 커피 잔 자국 — 실제 마른 자국 이미지(절차 생성), 제목 오른쪽 위에 반쯤 걸쳐서 */}
              <div className="nt-ring b" aria-hidden style={{ top: -46, right: -54, width: 150 }} />
              {/* ✍ 날짜 — 노트 줄 하나를 차지하고 그 줄 위에 손글씨로 앉는다(요일 포함) */}
              <div className="nt-ruled text-left relative" style={{ marginTop: -4 }}>{todayLabel && <span className="nt-hand sm coffee">{todayLabel}</span>}</div>
              <div className="nt-eyebrow" style={{ position: "relative", lineHeight: "34px" }}>데이터로 큐레이션하는</div>
              <div className="nt-title text-[21px] py-2 relative" style={{ borderTop: "1px solid rgba(42,31,23,.55)", borderBottom: "1px solid rgba(42,31,23,.55)" }}>
                <span className="nt-hl text-[24px]">{homeGu ? `${homeGu}의 오늘의 커피` : "오늘의 동네 커피"}</span>
              </div>
              {/* 시·도 → 시·군·구 → 동·면 계층 선택(우리 동네). 검색 돋보기 제거. */}
              <div className="flex gap-1.5 justify-center mt-3 flex-wrap">
                <select value={homeSido} onChange={(e) => { setHomeSido(e.target.value); setHomeGu(""); setHomeDong(""); }} className="nt-select px-2.5 py-2 text-sm">
                  <option value="">시·도</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={homeGu} onChange={(e) => { setHomeGu(e.target.value); setHomeDong(""); }} disabled={!homeSido} className="nt-select px-2.5 py-2 text-sm disabled:opacity-40">
                  <option value="">시·군·구</option>{homeSido && REGIONS[homeSido].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <select value={homeDong} onChange={(e) => { const d = e.target.value; setHomeDong(d); if (d) { setSido(homeSido); setSigungu(homeGu); setDong(d); setFocusId(null); setSheetOpen(false); setTab("map"); } }} disabled={!homeGu || !homeDongOptions.length} className="nt-select px-2.5 py-2 text-sm disabled:opacity-40">
                  <option value="">{homeGu && !homeDongOptions.length ? "우리 동네 (수집중)" : "우리 동네"}</option>{homeDongOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {/* 📍 내 주변 옥석 카페 바로 찾기 — 아이콘만, 하단 내비 '내 위치' 핀과 같은 외곽선 아이콘으로 통일(발광 없음, 주변 select와 같은 톤) */}
                <button onClick={() => (nearHome ? clearNearHome() : openLocation())}
                  aria-label={nearHome ? "내 주변 500m 해제" : "내 주변 옥석 카페 바로 찾기"}
                  className={`shrink-0 w-9 h-9 flex items-center justify-center rounded-[5px] border transition-colors ${nearHome ? "border-[#7a5122] bg-[#f0e6d4]" : "border-[rgba(90,70,50,.28)] bg-white/85"}`}>
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
                <div className="flex items-baseline justify-between mb-2 nt-ruled">
                  <div className="nt-title text-[17px]">📍 내 주변 500m 옥석 카페</div>
                  <div className="text-[11px] text-[#2f6fb0] shrink-0 font-medium">{nearHomeCafes.length}곳</div>
                </div>
                {nearHomeCafes.length === 0 ? (
                  <div className="text-center text-[#665036] text-[13px] py-12 leading-relaxed">500m 내에 추천할 카페가 없습니다</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {nearHomeCafes.map(({ c, d }) => (
                      <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left nt-scrap flat px-3.5 py-3 hover:shadow-md transition-all flex flex-col">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-bold text-sm text-[#2b2018] truncate">{c.name}</span>
                          {c.synth_grade && GRADE_STYLE[c.synth_grade] && <span className="text-[8px] text-white px-1.5 py-0.5 rounded-full shrink-0" style={{ background: GRADE_STYLE[c.synth_grade].bg }}>{c.synth_grade}</span>}
                            <OwnerBadge om={(c as any).om} />
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
                    <Spotlight title="💎 오늘의 숨은 보석" items={discover.headlineAList} onOpen={openById} sub="검증됐지만 덜 알려진" toneOffset={0} featured
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
                <button onClick={() => { setSido(homeSido); setSigungu(homeGu); setDong(homeDong); setFocusId(null); setSheetOpen(false); setTab("map"); }} className="nt-btn-ink py-3.5 mt-2">🗺 {homeDong ? `${homeDong} 지도로 보기` : homeGu ? `${homeGu} 지도로 보기` : "지도에서 전체 둘러보기"} →</button>
              </>
            )}
            <p className="text-[10.5px] text-[#8f8071] mt-6 text-center leading-relaxed">모든 큐레이션은 네이버 공개 후기를 교차검증한 데이터 기반입니다.</p>
          </div>

        </div>
      )}

      {/* 지도 탭 */}
      {/* 지도 블록은 항상 마운트하고 비활성 탭에선 숨김 → 탭 전환 시 지도 파괴/재생성 없음(빠른 전환) */}
      <div className="flex-1 relative md:flex overflow-hidden" style={{ display: tab === "map" ? undefined : "none" }}>
          {/* 📱 모바일: 지도 영역을 바텀시트 '위'까지로 잡는다(--dcn-sheet). 전엔 시트가 지도 하반부를 덮어 지도 중심(서울)이 시트 밑에 숨고 화면엔 동두천·양주가 보였다. */}
          <div className="dcn-mapwrap absolute inset-0 md:relative md:flex-1 md:p-5" style={{ ["--dcn-sheet" as any]: tab === "map" ? (sheetOpen ? (sheetMode === "half" ? "calc(42dvh + 3.25rem)" : "calc(72dvh + 3.25rem)") : "calc(2.75rem + 3.25rem)") : "0px" }}>
            <div ref={mapRef} className="w-full h-full md:rounded-sm overflow-hidden bg-[#e8e0d3] z-0 md:shadow-[0_18px_30px_-18px_rgba(30,18,10,.6)]" />
            {/* 📓 접어 붙인 지도 — 접힌 자국 두 줄+가로 한 줄, 가장자리 그늘, 찢은 윗단, 테이프 2장(시안 그대로). 지도 조작은 그대로 통과 */}
            <div className="nt-mapfold md:inset-5" aria-hidden><i className="h" /><i className="edge" /><i className="nt-tear" /></div>
            <i className="nt-tape k" style={{ left: "18%", top: 6, transform: "rotate(-5deg)", zIndex: 1100 }} aria-hidden />
            <i className="nt-tape" style={{ left: "auto", right: "12%", top: 8, transform: "rotate(4deg)", zIndex: 1100 }} aria-hidden />
            {mapErr && (
              <div className="absolute inset-0 z-[1150] flex items-center justify-center p-6 text-center text-[13px] text-[#5b4636]" style={{ background: "rgba(244,236,224,0.92)" }}>
                <div><b>지도를 그릴 수 없는 브라우저예요.</b><br />최신 Chrome·Safari·Samsung 인터넷에서 열어 주세요. 목록과 검색은 그대로 쓸 수 있어요.</div>
              </div>
            )}
            {/* 🗺️ 현재 화면 카페 수 — 좌상단 줌버튼 아래(전문성). 커버리지를 숫자로. 이동/줌마다 실시간 갱신 */}
            {/* 🗺️ 좌상단 한 줄: 현재 화면 카페 수(이동/줌마다 실시간) + 모바일용 범례 버튼. 모바일 지도는 42dvh뿐이라 오버레이를 한 줄에 모은다. */}
            <div className="absolute top-14 md:top-[8.25rem] left-3 z-[1100] flex items-center gap-1.5 max-w-[calc(100vw-1.5rem)]">
              {inViewCount != null && (
                <div className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-3 h-8 text-[11px] font-bold shadow-lg pointer-events-none whitespace-nowrap" style={{ background: "rgba(43,32,24,0.86)", color: "#f4ece0", backdropFilter: "blur(3px)" }}>
                  <span className="text-[#e8b87a] text-[12px] leading-none">☕</span>
                  <span>이 화면 <b className="text-[#e8b87a]">{inViewCount.toLocaleString()}</b>곳</span>
                </div>
              )}
              <div className="md:hidden">{legendOpen ? null : (
                <button onClick={() => setLegendOpen(true)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap" style={{ background: "rgba(253,250,244,0.96)", color: "#5b4636", border: "1px solid #e6d8c2" }}>
                  <img className="dcn-lg-img" src="/pins/pin-verified.png" alt="" /><span>핀 읽는 법</span>
                </button>
              )}</div>
            </div>
            {/* 🗺️ 핀 범례 — 소비자가 색의 뜻(검증/참고/후보/취향/우선/내 카페)을 몰랐음. 데스크톱은 좌하단 기본 펼침, 모바일은 버튼으로 열면 같은 자리에. */}
            {(
              <div className={`absolute z-[1100] top-[6.25rem] left-3 md:top-auto md:left-8 md:bottom-16 ${legendOpen ? "" : "hidden md:block"}`}>
                {legendOpen ? (
                  <div className="dcn-legend rounded-xl shadow-lg px-3 py-2 text-[11px] text-[#3a2c20] leading-tight" style={{ background: "rgba(253,250,244,0.96)", backdropFilter: "blur(4px)", border: "1px solid #e6d8c2" }}>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <b className="text-[11px] text-[#5b4636]">핀 읽는 법</b>
                      <button onClick={() => setLegendOpen(false)} aria-label="범례 닫기" className="text-[#8f7a58] text-[12px] leading-none px-1">✕</button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1.5"><img className="dcn-lg-img" src="/pins/pin-verified.png" alt="" />검증된 후기</span>
                      <span className="inline-flex items-center gap-1.5"><img className="dcn-lg-img" src="/pins/pin-ref.png" alt="" />참고할 만한</span>
                      <span className="inline-flex items-center gap-1.5"><i className="dcn-lg-dot" style={{ background: "#a8927a" }} />후보(줌인하면 이름)</span>
                      <span className="inline-flex items-center gap-1.5"><span className="relative inline-block"><img className="dcn-lg-img" src="/pins/pin-ref.png" alt="" /><i className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full text-[7px] font-black text-white flex items-center justify-center" style={{ background: "#e0a32e" }}>✓</i></span>취향 일치 ✓</span>
                      <span className="inline-flex items-center gap-1.5"><img className="dcn-lg-img" src="/pins/pin-feat.png" alt="" />우선 노출 ★</span>
                      <span className="inline-flex items-center gap-1.5"><img className="dcn-lg-img" src="/pins/pin-mine.png" alt="" />내 카페 ❤</span>
                      <span className="inline-flex items-center gap-1.5 col-span-2 pt-1 mt-0.5 border-t border-[#eee2d2] text-[#665036]"><img className="dcn-lg-img" src="/pins/puck.png" alt="" style={{ height: 12 }} />숫자 받침 = 근처 카페 묶음(누르면 확대)</span>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setLegendOpen(true)} className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap" style={{ background: "rgba(253,250,244,0.96)", color: "#5b4636", border: "1px solid #e6d8c2" }}>
                    <img className="dcn-lg-img" src="/pins/pin-verified.png" alt="" /><span>핀 읽는 법</span>
                  </button>
                )}
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
              <button onClick={() => setShowStreets((v) => !v)} aria-pressed={showStreets} title="길이름·건물·상가 표시"
                className={`dcn-tgl inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors ${showStreets ? "bg-[#5b4636] text-white" : "bg-white/95 text-[#665036] border border-[#e0d3bd]"}`}>
                <span className={`dcn-tgl-dot ${showStreets ? "on" : ""}`} aria-hidden="true" /><span aria-hidden="true" className="md:hidden text-[13px] leading-none">🏷️</span><span className="dcn-tgl-txt">상세 지도</span>
              </button>
              <button onClick={() => setShow3d((v) => !v)} aria-pressed={show3d} title="3D 건물·기울임 (동네 줌에서 자동으로 기울어요)"
                className={`dcn-tgl inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors ${show3d ? "bg-[#7a5122] text-white" : "bg-white/95 text-[#665036] border border-[#e0d3bd]"}`}>
                <span className={`dcn-tgl-dot ${show3d ? "on" : ""}`} aria-hidden="true" /><span aria-hidden="true" className="md:hidden text-[13px] leading-none">🏢</span><span className="dcn-tgl-txt">3D 건물</span>
              </button>
              <button onClick={() => setShowBus((v) => !v)} aria-pressed={showBus} title="버스 정류장 표시"
                className={`dcn-tgl inline-flex items-center gap-1.5 h-8 pl-2 pr-3 rounded-full text-[11px] font-bold shadow-lg whitespace-nowrap transition-colors ${showBus ? "bg-[#235a86] text-white" : "bg-white/95 text-[#665036] border border-[#bcd0e0]"}`}>
                <span className={`dcn-tgl-dot ${showBus ? "on" : ""}`} aria-hidden="true" /><span aria-hidden="true" className="md:hidden text-[13px] leading-none">🚌</span><span className="dcn-tgl-txt">버스 정류장</span>
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
          <aside className="hidden md:block md:w-[380px] md:h-full nt-paper2 border-l border-[#d9cdb9] overflow-y-auto p-6 relative z-10">
            <div className="nt-eyebrow mb-3">접힌 지도 · {dong || sigungu || sido || "전국"}</div>
            <MapControls {...{ sido, sigungu, dong, onSido, onSigungu, setDong, dongOptions, tasteKey, setTasteKey, filtered, matchSet, setSelected, openLocation, autoGu, geoMsg, clearAuto, setShowFavs, favCount: cafes.filter((c) => bookmarkIds.has(c.id)).length, closeSheet: () => { setFocusId(null); setSheetOpen(false); } }} />
          </aside>
          {/* 📱 바텀시트 3단: 접힘(핸들만) → 반(지도와 목록이 함께 보임, 기본) → 전체. 전엔 열자마자 72dvh가 지도를 덮어 지도 탭인데 지도가 15%만 보였다. */}
          <div className="md:hidden absolute left-0 right-0 nt-paper2 nt-torn shadow-[0_-4px_24px_rgba(0,0,0,0.18)] z-[1200] flex flex-col transition-[transform,height] duration-300 ease-out will-change-transform" style={{ bottom: "3.25rem", height: sheetOpen && sheetMode === "half" ? "42dvh" : "72dvh", transform: sheetOpen ? "translateY(0)" : "translateY(calc(72dvh - 2.75rem))" }}>
            {/* 접힘 시 정확히 이 핸들(2.75rem)까지만 보이게 — 아래 목록이 삐져나오지 않음 */}
            <div className="shrink-0 w-full flex items-center justify-between px-4" style={{ height: "2.75rem" }}>
              <button onClick={() => { if (!sheetOpen) { setSheetMode("half"); setSheetOpen(true); } else if (sheetMode === "half") setSheetMode("full"); else setSheetOpen(false); }} className="flex-1 flex flex-col items-center justify-center gap-1 h-full" aria-expanded={sheetOpen}>
                <div className="w-9 h-1 bg-[#c9bda9] rounded-full" />
                <span className="text-[11px] font-bold text-[#7a5122] leading-none">{!sheetOpen ? `지역·필터 펼치기 ▴ (${filtered.length})` : sheetMode === "half" ? "더 펼치기 ▴" : "지도 보기 ▾"}</span>
              </button>
              {sheetOpen && sheetMode === "full" && (
                <button onClick={() => setSheetMode("half")} className="shrink-0 text-[11px] font-bold text-[#7a5122] px-2 h-7 rounded-full border border-[#e6d8c2] bg-white">반만 ▾</button>
              )}
            </div>
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
      <nav className="md:hidden flex items-stretch nt-paper2" style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: "3.25rem", zIndex: 1300, boxShadow: "0 -1px 0 rgba(90,70,50,0.18)" }}>
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
            <div className="flex flex-col items-center justify-center gap-0.5 rounded-2xl px-4 py-1 transition-colors" style={{ background: a.active ? "rgba(185,121,59,.14)" : "transparent" }}>
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
          <div className="relative nt-paper w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[85vh] sm:rounded-lg flex flex-col shadow-2xl overflow-hidden" style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }}>
            <div className="shrink-0 px-4 pt-4 pb-3 nt-header">
              <div className="nt-eyebrow mb-2" style={{ color: "#c9b391" }}>느낌으로 찾기</div>
              <div className="flex items-center gap-2 rounded-lg px-3" style={{ background: "rgba(247,240,228,.96)", boxShadow: "0 10px 18px -12px rgba(0,0,0,.7)" }}>
                <span className="text-[#8f8071] text-[15px] shrink-0" aria-hidden>🔍</span>
                <input autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch(searchQ)}
                  placeholder={`느낌 또는 ☕카페 이름으로 찾기`} className="flex-1 min-w-0 bg-transparent px-1 py-3 text-[17px] outline-none" style={{ fontFamily: "var(--nt-font)" }} />
                <button onClick={() => runSearch(searchQ)} className="nt-btn-ink !w-auto px-4 py-1.5 text-sm shrink-0">검색</button>
                <button onClick={() => setShowSearch(false)} className="text-2xl text-[#8f8071] leading-none px-1 shrink-0">×</button>
              </div>
              <div className="text-[11.5px] mt-2.5" style={{ color: "#e9d6bd" }}>💡 “비 오는 날 조용히” 같은 <b>느낌</b>은 물론, <b>카페 이름</b>을 바로 적어도 찾아드려요.</div>
              <div className="text-[11px] mt-1" style={{ color: "#c9b391" }}>{homeGu ? `📍 ${homeGu} 안에서` : "전체 지역에서"} 검색</div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {SEARCH_EXAMPLES.map((ex) => (
                  <button key={ex} onClick={() => runSearch(ex)} className="nt-chip" style={{ fontSize: 11.5, background: "rgba(255,255,255,.08)", color: "#e9d6bd", borderColor: "rgba(233,214,189,.35)" }}>{ex}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
              {searchLoading ? <CoffeeLoader label="취향 맞는 카페 찾는 중…" />
                : !searchRes ? <p className="text-center text-[#665036] py-10 text-sm leading-relaxed">"비 오는 날 혼자 조용히", "감성 사진 데이트"처럼<br />구체적이지 않아도 떠오르는 느낌으로 찾아드려요.</p>
                : (
                  <>
                    {searchRes.coverageNote && (
                      <div className="mb-3 nt-scrap kraft px-3.5 py-3 text-[12px] text-[#7a5a1e] leading-relaxed">
                        ⚠️ {searchRes.coverageNote}
                      </div>
                    )}
                    {searchRes.franchiseNote && (
                      <div className="mb-3 nt-scrap r px-3.5 py-3 text-[12px] text-[#6b5640] leading-relaxed">
                        ☕ {searchRes.franchiseNote}
                      </div>
                    )}
                    {/* 📍 가려는 곳 — 누르면 지도가 그 자리로 이동한다(주변 카페가 바로 보인다). 2026-09-12 사용자 피드백. */}
                    {!!searchRes.places?.length && (
                      <div className="mb-3">
                        <div className="text-[11px] text-[#665036] mb-1.5">📍 이 장소로 지도 이동 — 주변 카페를 바로 봐요</div>
                        <div className="flex flex-wrap gap-1.5">
                          {searchRes.places.map((p, i) => (
                            <button key={`${p.name}-${i}`} onClick={() => goToPlace(p.lat, p.lng, p.kind === "apt" || p.kind === "station" ? 16.5 : 15.5)}
                              className="nt-chip hover:border-[#9c6b3f] active:bg-[#faf5ea]" style={{ height: 28 }}>
                              <span>{p.icon}</span><b className="font-semibold">{p.name}</b>
                              <span className="text-[10px] text-[#8a7a68]">{p.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {searchRes.concepts.length > 0 && <div className="text-[11px] text-[#5f7355] mb-3">감지된 느낌: <b>{searchRes.concepts.join(" · ")}</b></div>}
                    {searchRes.results.length === 0 ? (
                      <p className="text-center text-[#665036] py-10 text-sm">{searchRes.places?.length
                        ? "이 이름의 카페는 없어요. 위의 📍장소를 누르면 그 주변 카페를 지도에서 볼 수 있어요."
                        : "결과가 없어요. 다른 표현이나 더 넓은 동네로 시도해 보세요."}</p>
                    ) : (
                      <div className="space-y-2">
                        {/* 📍 장소 주변 결과면 기준점을 명확히 — "어디에서 몇 m"인지 각 항목 근거에도 나온다. */}
                        <div className="text-[11px] text-[#665036] mb-1">
                          {searchRes.nearPlace
                            ? <><b className="text-[#2b2018]">{searchRes.nearPlace.icon} {searchRes.nearPlace.name}</b> 주변 {searchRes.count}곳 · 가까운 순</>
                            : <>{searchRes.region} · {searchRes.count}곳 중 가까운 순</>}
                        </div>
                        {/* 🔀 같은 동 이름이 여러 곳에 있을 때(고덕동=강동구·평택시) — 우리가 단정하지 않고 한 번에 바꾸게 한다. */}
                        {!!searchRes.regionAlts?.length && (
                          <div className="flex items-center flex-wrap gap-1.5 mb-2 text-[11px] text-[#665036]">
                            <span>혹시 이쪽인가요?</span>
                            {searchRes.regionAlts.map((a) => (
                              <button key={a} onClick={() => runSearch(searchRes.q, a)}
                                className="border border-[#d8c8ad] bg-white rounded-full px-2.5 py-1 font-semibold text-[#2b2018] hover:border-[#9c6b3f]">{a}</button>
                            ))}
                          </div>
                        )}
                        {searchRes.results.map((r) => (
                          <button key={r.id} onClick={() => { openById(r.id); setShowSearch(false); }} className="w-full text-left nt-scrap flat px-3.5 py-3 hover:border-[#9c6b3f]">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-bold text-sm text-[#2a1f17]">{r.name}</span>
                              {r.grade && GRADE_STYLE[r.grade] && <span className={`nt-pill ${r.grade === "검증" ? "verify" : r.grade === "참고" ? "ref" : "cand"}`}>{r.grade}</span>}
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
    return { L: base.filter((c: any) => (c.vb ?? "").includes("L")).length, T: base.filter((c: any) => (c.vb ?? "").includes("T")).length, D: base.filter((c: any) => (c.vb ?? "").includes("D")).length };
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
          <div className="nt-title text-[15px]">📍 지역</div>
          {autoGu
            ? <span className="text-[11px] text-[#5f7355] bg-[#eef3ea] border border-[#cfe0c2] rounded-full px-2 py-0.5">내 위치 <b>{autoGu}</b></span>
            : <button onClick={openLocation} className="text-[11px] text-white bg-[#5f7355] rounded-full px-2.5 py-1 font-medium">📍 내 위치로</button>}
        </div>
        <div className="flex gap-1.5">
          <select value={sido} onChange={(e) => onSido(e.target.value)} className="flex-1 min-w-0 nt-select px-2.5 py-2.5 text-[15px] font-normal">
            <option value="">시·도</option>{Object.keys(REGIONS).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={sigungu} onChange={(e) => onSigungu(e.target.value)} disabled={!sido} className="flex-1 min-w-0 nt-select px-2.5 py-2.5 text-[15px] font-normal disabled:opacity-50">
            <option value="">시·군·구</option>{sido && REGIONS[sido].map((g: string) => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={dong} onChange={(e) => { const d = e.target.value; setDong(d); if (d && closeSheet) closeSheet(); }} disabled={!sigungu || !(dongOptions?.length)} className="flex-1 min-w-0 nt-select px-2.5 py-2.5 text-[15px] font-normal disabled:opacity-50">
            <option value="">{sigungu && !(dongOptions?.length) ? "우리 동네(수집중)" : "우리 동네"}</option>{(dongOptions ?? []).map((d: string) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        {geoMsg && <div className="text-[10px] text-[#665036] mt-1.5">{geoMsg}</div>}
        {(sido || sigungu || dong) && <button onClick={() => { if (clearAuto) clearAuto(); else { onSido(""); } }} className="text-xs text-[#7a5122] underline mt-2">전체</button>}
      </div>
      <div className="mb-5">
        <div className="nt-title text-[15px] mb-2.5 flex items-center gap-1.5">☕ 어떤 카페 찾으세요?<InfoDot title="'결'로 거르기"><b>결</b>은 후기에서 자주 언급되는 카페의 성격이에요(조용·작업·디저트·로스팅 등). 고르면 그 결이 강한 카페만 핀·목록에 뜨고, <b>그 결이 많이 언급된 순</b>으로 정렬돼요. 측정값이 아니라 '리뷰에서 자주 나온 정도'입니다.</InfoDot></div>
        <div className="grid grid-cols-2 gap-2.5">
          {TASTE_CHOICES.map((t) => (
            <button key={t.key} onClick={() => setTasteKey(tasteKey === t.key ? null : t.key)} className={`nt-scrap p-3 text-left transition-colors ${tasteKey === t.key ? "!bg-[#2a1f17] text-[#fbf7f0]" : "text-[#2a1f17]"}`} style={tasteKey === t.key ? { backgroundImage: "none" } : undefined}>
              <i className="nt-tape sm" aria-hidden style={{ width: 62, height: 14, top: -6 }} />
              <div className="text-2xl mb-0.5">{t.emoji}</div><div className="nt-title text-[13.5px]">{t.label}</div>
              <div className={`text-[10px] mt-0.5 ${tasteKey === t.key ? "text-[#d4a574]" : "text-[#8f8071]"}`}>{t.desc}</div>
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
        <div className="flex items-baseline justify-between nt-ruled">
          <div className="nt-title text-[15px]">목록 ({listCafes.length}{tasteKey ? ` · ${TASTE_CHOICES.find((t: any) => t.key === tasteKey)?.label}` : ""})</div>
          <div className="text-[10px] text-[#8f8071] shrink-0">↕ {sortLabel}</div>
        </div>
        {/* 🧳🏠 방문객 성격 필터 — 배지가 소수라 목록을 훑어선 못 찾는다. 곳수를 함께 보여줘 헛클릭을 막는다. */}
        {(vbCounts.L > 0 || vbCounts.T > 0 || vbCounts.D > 0) && (
          <div className="flex gap-1.5 mb-2.5 flex-wrap">
            {([["L", "🏠", "동네 단골 후기", vbCounts.L], ["T", "🧳", "여행 후기 많음", vbCounts.T], ["D", "🗺️", "관광지 동네", vbCounts.D]] as const).map(([k, emoji, label, n]) => n > 0 && (
              <button key={k} onClick={() => setVbFilter(vbFilter === k ? "" : (k as "L" | "T"))}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${vbFilter === k ? "bg-[#4a5a4e] text-white border-[#4a5a4e]" : "bg-white text-[#4a5a4e] border-[#c9dbcf]"}`}>
                {emoji} {label} {n}
              </button>
            ))}
            {vbFilter && <button onClick={() => setVbFilter("")} className="text-[11px] text-[#7a5122] underline px-1">전체</button>}
          </div>
        )}
        {listCafes.length === 0 ? <p className="text-xs text-[#8f8071] nt-ruled" style={{ paddingTop: 17 }}>{tasteKey ? "이 카테고리에 해당하는 카페가 이 지역엔 없어요. 다른 결을 골라보세요." : "지역을 선택하면 목록이 나와요."}</p> : (
          <div className="nt-ruled">
            {/* 📓 목차 줄 — 번호는 손글씨, 이름은 명조, 한 줄 메모는 그 아래 줄 */}
            {listCafes.slice(0, 50).map((c: Cafe, i: number) => (
              <button key={c.id} onClick={() => setSelected(c)} className="w-full text-left block">
                <div className="nt-ln">
                  <span className="n">{i + 1}.</span>
                  <span className="nm text-[14px] flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{c.name}</span>
                    {c.synth_grade && GRADE_STYLE[c.synth_grade] && <span className={`nt-pill ${c.synth_grade === "검증" ? "verify" : c.synth_grade === "참고" ? "ref" : "cand"}`}>{GRADE_STYLE[c.synth_grade].label}</span>}
                    <span className="nt-free inline-flex items-center gap-1"><OwnerBadge om={(c as any).om} /><VisitorBadges vb={(c as any).vb} /></span>
                    {tasteKey && matchSet.has(c.id) && <span className="text-[11px] text-[#3e7a5a]">✓</span>}
                  </span>
                  <span className="m">{c.area} · 리뷰 {c.synth_count ?? 0}</span>
                </div>
                {(c.note || c.vibe) && <div className="text-[12px] text-[#5c4b3c] truncate" style={{ paddingLeft: 34 }}>{c.note || c.vibe}</div>}
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
    // 🗺️ 상세가 열려 있어도 **지도는 계속 쓸 수 있다**(CEO 지시) — 껍데기는 포인터를 통과시키고 패널만 받는다.
    //    데스크톱: 딤·클릭가로채기 없음(지도 팬·줌·다른 핀 선택 그대로). 닫기는 ✕·뒤로가기·지도 빈 곳 클릭.
    //    모바일: 패널이 화면을 꽉 채우므로 예전처럼 딤+바깥탭 닫기 유지(전환 애니메이션 중에만 보임).
    <div className="fixed inset-0 z-[3000] overflow-hidden pointer-events-none" style={{ fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }}>
      <div onClick={onClose} className={`absolute inset-0 bg-black/30 pointer-events-auto md:bg-transparent md:pointer-events-none transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} />
      <aside className={`absolute top-0 right-0 w-full md:max-w-md nt-paper shadow-2xl overflow-y-auto pointer-events-auto transition-transform duration-300 ease-out motion-reduce:transition-none ${shown ? "translate-x-0" : "translate-x-full"}`} style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top)" }}>
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
          <div className="w-full px-5 pt-4 pb-3 nt-paper2 relative" style={{ boxShadow: "0 1px 0 rgba(90,70,50,.18)" }}>
            <div className="nt-eyebrow">Dongne Coffee Note · 한 장</div>
            <div className="nt-title text-[17px] mt-0.5">동네 커피 노트</div>
            <p className="text-[11.5px] text-[#8f8071]">별점 말고, <span className="text-[#7a5122] font-bold">검증된 후기</span>로 고르세요.</p>
          </div>
        )}
        <div className="p-5 relative">
          <div className="nt-ring" aria-hidden style={{ right: -60, top: 120, width: 180 }} />
          <div className="flex items-center justify-between mb-1 relative">
            <div className="flex items-center gap-2 min-w-0"><h3 className="text-xl font-bold text-[#2a1f17] truncate">{cafe.name}</h3><OwnerBadge om={(cafe as any).om} />{g && <span className={`nt-pill shrink-0 ${cafe.synth_grade === "검증" ? "verify" : cafe.synth_grade === "참고" ? "ref" : "cand"}`}>{g.label}</span>}
              {/* 🧳🏠 방문객 성격 — 지도에서 카페를 누르면 뜨는 이 패널이 실제 소비 지점이다.
                  여기 표시가 없으면 "지도에서는 구분이 안 된다"는 말이 맞다(CEO 지적). */}
              <VisitorBadges vb={(cafe as any).vb} /></div>
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
              className="w-full nt-scrap flat pink flex items-center justify-between gap-2 px-4 py-3 text-left mb-3">
              <span className="flex flex-col">
                <span className="text-[12.5px] font-bold text-[#b23a5f] flex items-center gap-1">
                  <span className="text-[14px] leading-none">❤</span> 이 카페, 다녀가셨나요?
                </span>
                <span className="text-[10.5px] text-[#6f6047]">위치인증하고 나만의 추억으로 저장 — 무가입·30초</span>
              </span>
              <span className="text-[#d6336c] font-bold whitespace-nowrap">→</span>
            </button>
          )}
          <div className="text-[#8f8071] text-sm mb-3 relative">{cafe.area} · {cafe.vibe}</div>
          {cafe.note && <p className="text-[15px] text-[#2a1f17] font-medium leading-relaxed mb-4 relative">"{cafe.note}"</p>}
          {/* ⭐ 한눈에 판단 — 전체 카페 대비 강점/아쉬운점(리뷰 옥석 보기 전 직관 판단의 핵심) */}
          {/* 📊 리뷰 데이터 분석 — 옥석 후기 핵심(가장 먼저 눈에 띄게, 구미 당기는 hook) */}
          {(highlights.length > 0 || cafe.synth_identity) && (
            <div className="nt-ruled mb-3 relative">
              <div className="nt-sec">우리가 읽고 적은 판정 · 검증 후기 {cafe.synth_count}건</div>
              {cafe.synth_identity && <p className="nt-hand">{cafe.synth_identity}</p>}
              {highlights.length > 0 && (
                <>
                  <div className="text-[12px] text-[#8f8071]">후기에서 가장 많이 나온 것 · 숫자=언급 후기 수</div>
                  <div className="nt-chips">
                    {highlights.map((h, i) => (
                      <span key={h.label} className={`nt-chip ${i === 0 ? "ink" : ""}`}>{h.emoji} {h.label}<b>{h.count}</b></span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {/* 메뉴·가격은 카테고리화 한계로 잠정 비노출(추후 LLM으로 주력메뉴+실가격 정확 추출 예정). 평판은 유지. */}
          {reputationNote && (
            <div className="nt-ruled mb-3 relative">
              <div className="text-[13px] text-[#8a6a3a]">⚖️ <b>참고</b> · {reputationNote}</div>
            </div>
          )}
          {/* 👍 강점 / 🔎 아쉬운점 — 전체 카페 대비 상대 위치 + 언급수/평균 */}
          {profile.ok ? (
            <div className="nt-ruled mb-4 relative">
              <div className="nt-sec">한눈에 강·약 · 전체 카페 대비</div>
              {profile.strong.length > 0 && (
                <>
                  <div className="text-[12.5px] font-bold text-[#3e7a5a]">👍 이런 점이 강해요</div>
                  {profile.strong.map((s) => (
                    <div key={s.key} className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[15px] w-5 text-center flex-none">{s.emoji}</span>
                      <span className="text-[14px] font-bold text-[#2a1f17]">{s.text}</span>
                      <span className="ml-auto flex items-baseline gap-2 whitespace-nowrap">
                        <span className="nt-hand sm coffee">평균의 {s.mult}배</span>
                        <span className="nt-pill verify">상위 {s.topPct}%</span>
                      </span>
                    </div>
                  ))}
                </>
              )}
              {profile.weak.length > 0 && (
                <>
                  <div className="text-[12.5px] font-bold text-[#b07a2a]">🔎 이런 점은 참고하세요</div>
                  {profile.weak.map((w) => (
                    <div key={w.key} className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[14px] w-5 text-center flex-none">{w.emoji}</span>
                      <span className="text-[13px] text-[#5c4b3c]">{w.text}</span>
                      <span className="ml-auto nt-hand sm faint whitespace-nowrap">{w.mult < 0.2 ? "거의 언급 없음" : `평균의 ${w.mult}배`}</span>
                    </div>
                  ))}
                </>
              )}
              <p className="text-[11px] text-[#8f8071]">기준은 <b>후기 1건당 언급 비율</b>이에요 — 후기 수가 많고 적음을 보정한 공정한 비교입니다. '평균의 N배'·'상위/하위 %'는 전체 카페와 같은 기준으로 비교한 값. 절대 평가가 아닙니다.</p>
            </div>
          ) : chars.length > 0 && (
            <div className="nt-ruled mb-4 relative">
              <div className="nt-sec">이 카페가 자주 언급되는 결</div>
              <div className="nt-chips">{chars.map((ch) => <span key={ch.label} className="nt-chip">{ch.emoji} {ch.label}</span>)}</div>
            </div>
          )}
          {cafe.signature && <div className="text-sm text-[#524234] mb-4"><span className="text-[#7a5122]">추천 </span>{cafe.signature}</div>}
          {/* 방문자 후기 — 길찾기 버튼 바로 위에 배치(목록 → 상세 모달). 공개 방문기록 있을 때만. */}
          {userReviews.length > 0 && <div className="mb-4"><VisitorReviews reviews={userReviews} /></div>}
          {/* ===== 버튼 3개 — 리뷰 위에 배치, 눈에 잘 띄게 ===== */}
          <div className="flex gap-2 mb-4">
            <a href={`https://map.kakao.com/?q=${encodeURIComponent(cafe.name + " " + cafe.area)}`} target="_blank" rel="noopener noreferrer" onClick={() => trackOutbound({ target: "kakao_map", cafeId: cafe.id, source: "지도앱" })} className="flex-1 nt-btn-ink py-2.5 text-[12px] hover:bg-[#3d2f22] transition-colors flex items-center justify-center">길찾기</a>
            <a href={`/api/naver-place-redirect?id=${cafe.id}`} target="_blank" rel="noopener noreferrer" onClick={() => trackOutbound({ target: "naver_place", cafeId: cafe.id, source: "지도앱" })} className="flex-1 text-center border-2 rounded-xl py-2.5 text-[12px] font-semibold bg-white hover:bg-[#f0fef8] transition-colors flex items-center justify-center gap-1" style={{ borderColor: "#03c75a", color: "#03c75a" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="#03c75a"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/></svg>
              메뉴·시간
            </a>
          </div>

          {loadingRev && <CoffeeLoader label="근거 후기 우려내는 중…" />}
          {!loadingRev && quality && quality.raw > 0 && (
            <div className="nt-scrap flat sage px-4 py-2.5 mb-4">
              <i className="nt-tape g sm" aria-hidden />
              <div className="text-[11.5px] text-[#4f6a43] leading-relaxed flex items-start gap-1">
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
                        ? <span className="nt-pill verify" style={{ height: 18, fontSize: 9.5 }}>검증 ✓</span>
                        : rv.trust === "reference"
                        ? <span className="nt-pill ref" style={{ height: 18, fontSize: 9.5 }}>참고</span>
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
              <div className="nt-ruled">
                <div className="nt-sec">☕ {cafe.area} 비슷한 카페 더보기</div>
                {nearby.map((nc, i) => (
                  <button key={nc.id} type="button" onClick={() => onOpenCafe?.(nc.id)} className="nt-ln">
                    <span className="n">{i + 1}.</span>
                    <span className="nm text-[14px] flex items-center gap-1.5 min-w-0"><span className="truncate">{nc.name}</span>{nc.synth_grade && <span className={`nt-pill ${nc.synth_grade === "검증" ? "verify" : nc.synth_grade === "참고" ? "ref" : "cand"}`}>{nc.synth_grade}</span>}<span className="nt-free inline-flex"><VisitorBadges vb={(nc as any).vb} /></span></span>
                    <span className="m">검증후기 {nc.synth_count ?? 0}건</span>
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
            <div className="w-full max-w-lg nt-paper rounded-t-2xl max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                        ? <span className="nt-pill verify" style={{ height: 18, fontSize: 9.5 }}>검증 ✓</span>
                        : rv.trust === "reference"
                        ? <span className="nt-pill ref" style={{ height: 18, fontSize: 9.5 }}>참고</span>
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
      <div className="flex-1 overflow-y-auto flex items-start justify-center px-6 pt-16" style={{ fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }}>
        <div className="nt-scrap px-7 py-8 text-center max-w-xs w-full">
          <i className="nt-tape" aria-hidden />
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
    <div className="flex-1 overflow-y-auto nt-page-in" style={{ fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }}>
      <div className="max-w-lg mx-auto px-4 py-5 pb-[3.5rem] relative">
        <div className="nt-ring" aria-hidden style={{ right: -70, top: 150, width: 200 }} />
        <div className="flex items-center justify-between mb-3 relative">
          <div>
            <div className="nt-eyebrow">스탬프 수첩</div>
            <div className="nt-title text-[21px]">🗃 추억 보관소</div>
            <div className="text-[11px] text-[#8f8071]">이 기기의 내 추억 {visits.length}곳 · 다른 사람 기록은 안 보여요</div>
          </div>
          <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1 h-9 px-3 rounded-full text-[12px] font-bold bg-white/80 text-[#5c4b3c] border border-[rgba(90,70,50,.25)] shrink-0">⚙ 설정</button>
        </div>
        {/* 📓 도장 자리 — 다녀온 곳마다 도장 하나(위치 인증=진한 도장, 미인증=연한 도장). 빈 자리는 점선. */}
        <div className="nt-eyebrow mb-1 relative">다녀온 곳 · 도장 {visits.length}개</div>
        <div className="grid grid-cols-4 gap-2.5 mb-4 relative nt-band nt-torn-tb -mx-4 px-4 pt-6 pb-5">
          {Array.from({ length: Math.max(8, Math.ceil(visits.length / 4) * 4) }).map((_, i) => {
            const v = visits[i];
            if (!v) return <div key={`e${i}`} className="aspect-square rounded-full border-[1.5px] border-dashed border-[#c9bda9] flex items-center justify-center text-[10px] text-[#b3a692] bg-white/40">비어 있음</div>;
            const d = v.created_at ? new Date(v.created_at) : null;
            return (
              <button key={v.id} type="button" onClick={() => { setVerifyMsg(""); setViewVisit(v); }}
                className={`aspect-square nt-stamp !w-auto !h-auto ${v.verified === false ? "cand" : ""}`} style={{ fontSize: 11, transform: `rotate(${(i % 3) * 5 - 6}deg)` }} aria-label={v.name}>
                <span className="px-1 leading-[1.15] line-clamp-2 break-keep">{v.name}</span>
                {d && !isNaN(d.getTime()) && <small style={{ fontSize: 8, letterSpacing: ".06em" }}>{d.getMonth() + 1}. {d.getDate()}</small>}
              </button>
            );
          })}
        </div>
        <button onClick={onRegister} className="w-full inline-flex items-center justify-center gap-1.5 bg-[#d6336c] text-white rounded-lg py-3.5 text-[14px] font-bold shadow-sm mb-4">
          <span className="text-[16px] leading-none">➕</span> 새 카페 추억 등록하기
        </button>
        {visits.length === 0 ? (
          <div className="nt-ruled text-center text-[#8f8071] text-[13px]" style={{ paddingTop: 34, paddingBottom: 34 }}>아직 등록한 추억이 없어요.<br />카페에서 위치 인증하고 첫 추억을 남겨보세요.</div>
        ) : (
          <div className="space-y-2.5">
            {visits.map((v) => {
              const photoCount = Array.isArray(v.photos) ? v.photos.length : (v.photo_url ? 1 : 0);
              return (
              <button key={v.id} type="button" onClick={() => { setVerifyMsg(""); setViewVisit(v); }} className="w-full text-left nt-scrap p-3.5 flex gap-3 hover:shadow-md active:scale-[0.995] transition" style={{ ["--rot" as any]: (v.id % 2) ? "0.4deg" : "-0.4deg" }}>
                <i className="nt-tape sm tl" aria-hidden />
                <div className="relative w-16 h-16 shrink-0">
                  {v.photo_url ? <img src={v.photo_url} alt="" className="w-16 h-16 rounded-sm object-cover border-[3px] border-white shadow-sm" /> : <div className="w-16 h-16 rounded-sm bg-[#f3ede1] border-[3px] border-white shadow-sm flex items-center justify-center text-[22px]">{v.favorite ? "★" : "☕"}</div>}
                  {photoCount > 1 && <span className="absolute bottom-0.5 right-0.5 bg-black/60 text-white text-[9px] px-1 rounded">📷{photoCount}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {v.favorite && <span className="text-[#f0a832] text-[13px]">★</span>}
                    <span className="font-bold text-[#2b2018] text-[14px] truncate">{v.name}</span>
                    <span className="text-[10px] text-[#7a5122] shrink-0">{v.area}</span>
                    {v.verified === false ? (
                      <span className="nt-pill cand shrink-0" style={{ height: 18, fontSize: 9.5 }}>미인증</span>
                    ) : (
                      <span className="nt-pill verify shrink-0" style={{ height: 18, fontSize: 9.5 }}>인증</span>
                    )}
                    <span className="ml-auto text-[10px] text-[#665036] shrink-0">보기 ›</span>
                  </div>
                  {v.memory ? <p className="nt-hand sm mt-0.5 line-clamp-2" style={{ fontSize: 18 }}>{v.memory}</p> : <p className="text-[12px] text-[#8f8071] mt-0.5">기억 메모 없음</p>}
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
          <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }} onClick={() => setViewVisit(null)}>
            <div className="w-full max-w-lg nt-paper rounded-t-2xl max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
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
                  {viewVisit.memory ? <p className="nt-hand whitespace-pre-wrap" style={{ lineHeight: "30px" }}>{viewVisit.memory}</p> : <p className="text-[13px] text-[#8f8071]">기억 메모 없음</p>}
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
      <style>body{font-family:'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif;background:#fdfaf4;color:#2b2018;padding:24px;max-width:600px;margin:0 auto;}h1{font-size:22px;}</style></head>
      <body><h1>☕ 동네 커피 노트 — 내 기억</h1><p style="color:#7a6452;font-size:12px;">총 ${visits.length}곳 · 내보낸 날짜 ${new Date().toLocaleDateString("ko-KR")}</p>${rows}
      <script>window.onload=function(){setTimeout(function(){window.print();},400);}</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); } else setMsg("팝업이 차단됐어요. 팝업을 허용해주세요.");
  };

  return (
    <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'DCN Hand', 'Nanum Pen Script', 'Apple SD Gothic Neo', sans-serif" }} onClick={onClose}>
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
