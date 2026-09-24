// 📓 카페 상세 화면 공용 계산(2026-09-20) — /c/[id](서버)와 지도 상세 패널 CafePanel(클라이언트)이 **같은 함수**를 쓴다.
//   ⚠️ 이 파일은 클라이언트 번들에 들어간다 — db·criteria 등 서버 모듈을 import하지 말 것(빌드가 깨진다).
//   전부 순수 함수·조회 0. 비용 0.
import { tasteVector, tasteSimilarity, GRADE_RANK } from "./cafeProfile";

// ── 읽히는 후기 문장 판정(2026-09-20, exposureOrder에서 옮김 — 정렬과 화면이 같은 기준을 쓴다) ──
const RQ_TRUNC = /(\.{3,}|…)\s*$/;
const RQ_META = /(영업시간|운영시간|주차|도로명|지번|주소|위치\s*[:：]|OPEN|CLOSE|\d{1,2}:\d{2}|전화|문의)/gi;
const RQ_PRED = /(어요|아요|네요|습니다|해요|였어요|했어요|더라고요|더라구요|거예요|답니다|드려요|같아요|좋았|맛있|추천|만족|아쉬|별로|괜찮)/;
// 이름을 공유하는 다른 업종(실사고: '호텔 서귀피안' 글이 '서귀피안 베이커리'에 붙음) — 상호 첫 토큰 앞뒤에 숙박어가 붙으면 **다른 가게 글**.
//   이건 가독성이 아니라 오염이라 화면에서 제외하고 정렬에서도 맨 뒤로 보낸다(2026-09-22 분리).
export function isOtherBusinessQuote(q: unknown, cafeName = ""): boolean {
  const s = String(q ?? "").trim();
  const first = cafeName.trim().split(/\s+/)[0] ?? "";
  if (first.length < 2) return false;
  const esc = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${esc}\\s*(호텔|펜션|숙소|리조트|모텔|게스트하우스)|(호텔|펜션|숙소|리조트|모텔|게스트하우스)\\s*${esc}`).test(s);
}
export function isReadableQuote(q: unknown, cafeName = ""): boolean {
  const s = String(q ?? "").trim();
  // 2026-09-22: 잘린 꼬리(…)는 더 이상 탈락 사유가 아니다 — 수집 스니펫이 91자에서 잘리며 전부 …로 끝나, 사실상 최신 글 전부를
  //   '안 읽힘'으로 몰아 숨겼다(CEO 지적). 술어가 있으면 잘려도 읽히는 문장이다(…를 붙여 그대로 인용).
  if (s.length < 20) return false;
  if ((s.match(/#/g) ?? []).length >= 3) return false;
  if ((s.match(RQ_META) ?? []).length >= 2) return false;
  if (/^\[/.test(s) && !RQ_PRED.test(s)) return false;
  if (isOtherBusinessQuote(s, cafeName)) return false;
  return RQ_PRED.test(s);
}
// 🔴 2026-09-22 CEO("최신 후기를 왜 누락시키냐 — 밑에는 26년 6월인데 목록은 3월이 최신"): 읽히지 않는 글(제목 조각·정보카드·
//   해시태그 덩어리)을 **숨기지 않고** 제목처럼 다듬어 보여준다. 실측(7곳 전부): 최신 검증 후기 대부분이 이 관문에 걸려 화면에서
//   사라졌다(서귀피안 검증최신 2026.08 → 화면 2025.11). 인용문 88%가 본문이 아니라 스니펫이라 생기는 구조적 한계.
//   readable=false면 따옴표 없이 제목 줄로 렌더한다. 정리: 앞머리 [태그]·이모지 제거, 해시태그 제거, 영업시간/주소/전화
//   정보카드 시작점에서 자르기, 잘린 꼬리(....)는 …로.
const DQ_META_CUT = /(\s*[ㅁ□■▪️•⏰☎📍📞🕐]?\s*(영업시간|운영시간|오픈시간|주차\s*여부|주차\s*[:：]|주소\s*[:：]?|위치\s*[:：]|전화\s*[:：]?|문의\s*[:：]?|OPEN|CLOSE)|\s\d{1,2}:\d{2}\s*[~\-–])/i;
//   empty=true: 다듬고 나니 상호·지역 말고는 남는 말이 없는 조각("☕ 속초 메이트힐 로스터리 카페 (feat.") — 이건 보여줄 정보가 없어 뺀다.
export function displayQuote(q: unknown, cafeName = ""): { text: string; readable: boolean; empty: boolean } {
  const raw = String(q ?? "").replace(/\s+/g, " ").trim();
  if (isReadableQuote(raw, cafeName)) return { text: raw, readable: true, empty: false };
  const truncated = RQ_TRUNC.test(raw) || /\(feat\.?\s*$/.test(raw);
  let t = raw.replace(/\(feat\.?\s*$/, "").replace(RQ_TRUNC, "");
  t = t.replace(/^(\s*[\[(【][^\]\)】]{0,24}[\])】]\s*)+/, "");       // 앞머리 [제주카페] (양평 카페)
  t = t.replace(/^[^\p{L}\p{N}"'“]+/u, "");                               // 앞머리 이모지·기호
  t = t.replace(/#[^\s#]+/g, " ");                                        // 해시태그
  const cut = t.search(DQ_META_CUT); if (cut > 12) t = t.slice(0, cut);   // 정보카드 시작점에서 자름
  t = t.replace(/[\s·,\-–—:|｜/]+$/g, "").replace(/\s+/g, " ").trim();
  if (t.length < 8) t = raw;                                              // 너무 깎이면 원문 그대로
  let rest = t;
  for (const tok of cafeName.split(/\s+/).filter((x) => x.length >= 2)) rest = rest.split(tok).join(" ");
  const empty = (rest.match(/[\p{L}]/gu) ?? []).length < 6;
  return { text: truncated || t.length < raw.length - 4 ? t + "…" : t, readable: false, empty };
}

// ── 거리 ──
export function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtKm = (km: number | null) => km === null ? "" : km < 1 ? `${Math.max(1, Math.round(km * 10)) * 100}m` : km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km)}km`;

// ── 근처 카페 순위(2026-09-20 CEO 승인) — 같은 읍면동(0) → 반경 10km(1) → 같은 시군구(2). 10km 밖 다른 시군구는 버린다.
//   같은 단계 안에서는 등급 → 거리 → 결 유사도 → 후기 수. 종전 "같은 시군구+결 유사도"는 서귀포시에서 31~71km를 '이 동네'라 불렀다.
export type NearbyCafe = { id: number; name: string; synth_grade: string | null; synth_count: number | null; area: string; dong: string | null; km: number | null; tier: 0 | 1 | 2 };
type NearbyCenter = { id: number; lat?: number | null; lng?: number | null; dong?: string | null; area: string; char_scores?: Record<string, number> | null; synth_count?: number | null };
export function rankNearby(center: NearbyCenter, rows: any[], limit = 6): NearbyCafe[] {
  const hasGeo = typeof center.lat === "number" && typeof center.lng === "number";
  const mine = tasteVector(center.char_scores, center.synth_count);
  return rows
    .filter((r) => r && r.id !== center.id)
    .map((r) => {
      const km = hasGeo && typeof r.lat === "number" && typeof r.lng === "number" ? distKm(center.lat as number, center.lng as number, r.lat, r.lng) : null;
      const tier: 0 | 1 | 2 = r.dong && r.dong === center.dong && r.area === center.area ? 0 : km !== null && km <= 10 ? 1 : 2;
      return { id: Number(r.id), name: String(r.name), synth_grade: r.synth_grade ?? null, synth_count: r.synth_count ?? null, area: String(r.area), dong: r.dong ?? null, km, tier,
        sim: tasteSimilarity(mine, tasteVector(r.char_scores, r.synth_count)) };
    })
    .filter((r) => r.tier < 2 || r.area === center.area)
    .sort((a, b) =>
      a.tier - b.tier ||
      (GRADE_RANK[a.synth_grade ?? ""] ?? 3) - (GRADE_RANK[b.synth_grade ?? ""] ?? 3) ||
      (a.km ?? 99) - (b.km ?? 99) ||
      b.sim - a.sim ||
      (b.synth_count ?? 0) - (a.synth_count ?? 0))
    .slice(0, limit)
    .map(({ sim: _s, ...r }) => r);
}
export function nearbyTitle(nearby: NearbyCafe[], area: string, dong?: string | null): string {
  if (nearby.length > 0 && nearby[0].tier === 0 && dong) return `${dong} 근처 카페`;
  if (nearby.length > 0 && nearby[0].tier === 1) return "가까운 카페";
  return `${area}의 다른 카페`;
}

// ── 후기 시기 — review_dates("YYYY.MM.DD") 배열 기반. 작은 jsonb 하나라 조회 0.
const DATE_RE = /^\d{4}\.\d{2}\.\d{2}$/;
export function monthlySeries(dates: unknown, months = 14): { key: string; n: number }[] | null {
  const arr = Array.isArray(dates) ? (dates as unknown[]).map(String).filter((d) => DATE_RE.test(d)) : [];
  if (!arr.length) return null;
  const now = new Date(); const out: { key: string; n: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`, n: 0 });
  }
  const idx = new Map(out.map((o, i) => [o.key, i]));
  for (const d of arr) { const i = idx.get(d.slice(0, 7)); if (i !== undefined) out[i].n++; }
  return out;
}
// 🕰️ 후기 나이 — 정의는 cafeProfile.ts(요약 가중치도 같이 쓴다·순환 import 방지). 화면 네 곳은 여기서 가져간다.
export { reviewAge, OLD_REVIEW_MONTHS } from "./cafeProfile";

export function freshnessOf(dates: unknown): { recent: number; latest: string; stale: boolean } | null {
  const arr = Array.isArray(dates) ? (dates as unknown[]).map(String).filter((d) => DATE_RE.test(d)) : [];
  if (!arr.length) return null;
  const ts = arr.map((d) => new Date(d.replace(/\./g, "-")).getTime()).filter((t) => Number.isFinite(t));
  if (!ts.length) return null;
  const latestT = Math.max(...ts); const cut = Date.now() - 365 * 86400000;
  const latest = new Date(latestT); const recent = ts.filter((t) => t >= cut).length;
  return { recent, latest: `${latest.getFullYear()}.${String(latest.getMonth() + 1).padStart(2, "0")}`, stale: latestT < cut };
}

// ── 이름표(이모지 없음) — 결 막대·타일용
export const CHAR_LABEL: Record<string, string> = { roast: "직접 로스팅", work: "작업하기 좋은", quiet: "조용한", dessert: "디저트", mood: "분위기", space: "넓은 공간", pet: "애견 동반", brunch: "브런치", view: "뷰", bakery: "베이커리", terrace: "테라스·야외" };
export function charBarsOf(cs: unknown, n = 5): [string, number][] {
  return Object.entries((cs ?? {}) as Record<string, number>)
    .filter(([k, v]) => CHAR_LABEL[k] && Number(v) > 0)
    .map(([k, v]) => [k, Number(v)] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// ── 주소 표시 — 시도·시군구·읍면동 접두를 떼고 도로명부터(앞은 화면에서 굵게 따로 찍는다)
export function addrTail(address: string | null | undefined, area: string, dong: string | null | undefined): string {
  if (!address) return "";
  const toks = String(address).trim().split(/\s+/);
  let i = 0;
  if (toks[i] && /(특별자치도|특별자치시|특별시|광역시|도)$/.test(toks[i]) && toks[i] !== area) i++;
  while (i < toks.length && (toks[i] === area || (dong && toks[i] === dong) || area.split(" ").includes(toks[i]))) i++;
  return toks.slice(i).join(" ");
}
// 📸 09-24: 첫 경로를 무조건 계정으로 읽어 '@p'·'@reel'·'@stories'·'@invites'가 떴다(공개 84곳 실측).
//   계정 형식(`/계정`·`/@계정`)과 스토리(`/stories/계정/`)만 계정으로 인정하고, 게시물·초대·태그처럼 계정을 알 수 없는 링크는 숨긴다.
const IG_RESERVED = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "s", "_u", "share", "direct", "web", "about", "invites", "legal", "developer"]);
export const igHandle = (u: string | null | undefined) => {
  const m = String(u ?? "").match(/instagram\.com\/@?([A-Za-z0-9._]+)(?:\/([A-Za-z0-9._]+))?/);
  if (!m) return null;
  const first = m[1].toLowerCase();
  if (first === "stories") return m[2] && !IG_RESERVED.has(m[2].toLowerCase()) ? m[2] : null;
  return IG_RESERVED.has(first) ? null : m[1];
};
// 링크도 계정 프로필로 통일(추적 파라미터·스토리 만료 링크 제거). 계정을 모르면 null.
export const igProfileUrl = (u: string | null | undefined) => { const h = igHandle(u); return h ? `https://www.instagram.com/${h}/` : null; };

// ── 후기 문장 속 핵심어(2026-09-20 CEO: "영역별로 강조·하이라이트") — 결정하는 데 쓰이는 말만. 화면은 <mark class="nt-key">로 감싼다.
const KEY_TERMS = ["오션뷰","바다뷰","한강뷰","뷰가 끝내","뷰가 좋","뷰 맛집","뷰맛집","전망","뷰","바다","노을","일출","소금빵","크루아상","크로플","휘낭시에","스콘","케이크","케익","디저트","빵이 맛","빵 맛","빵","커피가 맛","커피 맛","커피","라떼","아메리카노","맛있","맛집","분위기","감성","조용","넓","좌석","주차","콘센트","와이파이","친절","재방문","또 오","또 가","인생","최고","추천","가성비","웨이팅","아쉬","별로"];
const KEY_RE = new RegExp("(" + KEY_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
export function splitKeyTerms(text: unknown): { t: string; k: boolean }[] {
  const s = String(text ?? "");
  if (!s) return [];
  const out: { t: string; k: boolean }[] = [];
  let last = 0;
  for (const m of s.matchAll(KEY_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: s.slice(last, i), k: false });
    out.push({ t: m[0], k: true });
    last = i + m[0].length;
  }
  if (last < s.length) out.push({ t: s.slice(last), k: false });
  return out;
}
