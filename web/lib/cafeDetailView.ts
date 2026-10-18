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
// 📝 '문장인가' 판정(2026-10-18) — isReadableQuote보다 **엄격한 보조 기준**. 정렬에만 쓰고 숨기지 않는다.
//   왜 따로 두나: isReadableQuote의 술어 목록에 '추천·맛있·좋았' 같은 **명사·어간**이 들어 있어서
//   블로그 제목("[당진] 신상카페 아미루트, 분위기 좋은 대형카페 **추천**(수유실 완비)")이 본문으로 통과한다.
//   그 느슨함은 09-22 결정(제목 조각이라고 최신 검증 후기를 숨기지 말 것)을 지키려면 **그대로 둬야 한다** —
//   렌더 판정을 조이면 그때 사고가 재발한다. 그래서 **조이지 않고, 순서용 키를 하나 더** 만든다.
//   실측(표본 150곳·화면 3칸): 느슨한 기준으로는 91.6%가 '본문'이지만 엄격히 보면 48.2%다.
const SENT_ENDING = /(어요|아요|에요|예요|네요|더라|았다|었다|습니다|해요|거든요|던데|았어|었어)[\s.!?)”"']*$|(어요|아요|네요|습니다|더라고요|았어요|었어요)[\s,.]/;
const FIRST_PERSON = /(저는|제가|우리는|나는|내가|다녀왔|가봤|먹어봤|마셔봤|앉아|주문했)/;
export function isSentenceQuote(q: unknown): boolean {
  const s = String(q ?? "").trim();
  return SENT_ENDING.test(s) || FIRST_PERSON.test(s);
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
// 'empty' 판정에서만 지우는 말 — 업종어와 지역 접미사. **표시 텍스트는 건드리지 않는다**(판정용 사본에만 적용).
//   업종어는 그 자체로 정보가 없는 말만 넣는다("대형카페"의 '대형'처럼 수식어는 제외 — 평가일 수 있다).
const DQ_VENUE_WORD = /(카페|커피|로스터리|로스터스|베이커리|디저트|브런치|스페셜티|coffee|cafe|roaster|bakery|dessert)/gi;
const DQ_AREA_SUFFIX = /[가-힣]{2,4}(시|군|구|동|읍|면|로|길)(?=\s|$)/g;
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
  // 🔴 2026-10-18 수리 — 위 주석("상호·지역 말고는 남는 말이 없는 조각은 뺀다")이 **지켜지지 않았다.**
  //   이름 토큰만 지우고 업종어·지역어를 남겨서, 정보가 0인 조각이 인용문으로 화면에 나갔다.
  //   실측 사례: "유어스베이크샵 목동본점 유어스베이크샵 목동본점 서울 양천구 목동…", "당진 대형카페 아미루트!"
  //   → 업종어와 지역 접미사(…시/군/구/동/읍/면/로/길)도 지운 뒤에 남는 말로 판정한다.
  //   영향 실측(표본 300곳·인용문 11,544개): 추가로 빠지는 것 169개 = 표시분의 **1.48%**, 전부 정보 0 조각.
  //   ⚠️ 업종어 목록은 보수적으로 유지한다 — 넓히면 "로스팅이 깊어요" 같은 실제 평가가 빈 조각으로 오판된다.
  rest = rest.replace(DQ_VENUE_WORD, " ").replace(DQ_AREA_SUFFIX, " ");
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
// 🔴 2026-10-16 전면 수리(CEO "정보가 눈에 안 들어온다·글만 엄청 많다"). 실측으로 원인을 셋 잡았다.
//   노출 후기 2,339문장 기준(공개 상위 400곳):
//   ① **구별력 0인 말을 칠했다** — 맛집 15.5% · 빵 14.7% · 커피 11.6% · 디저트 8.8% · 추천 5.9%
//      = 상위 5개가 전체 하이라이트의 56.5%. 커피 플랫폼 후기에서 '커피'를 칠하면 아무것도 구별되지 않는다.
//   ② **단어를 중간에서 잘랐다** — 하이라이트 4,348개 중 **1,881개(43%)**가 뒤에 한글이 바로 이어졌다.
//      '커피 맛'이 "커피맛집이라"를 `커피 맛`+`집이라`로 자르고, '넓'은 어디든 걸렸다.
//   ③ **문장당 상한이 없었다** — 한 문장이 평균 4.6조각(최대 11개 하이라이트)으로 분해됐다.
//      그래서 글자 수는 2,769자인데 화면의 텍스트 조각이 277개(중위 5자)가 됐다. 읽을 수가 없다.
//   → 범용어를 버리고 **구별되는 말만** 남긴다. 조사·어미까지 한 덩어리로 칠한다. 문장당 2개로 막는다.
const KEY_TERMS = [
  // 뷰 — '뷰'·'전망' 단독은 뺀다(어느 카페나 쓴다). 종류가 말해주는 것만.
  "오션뷰", "바다뷰", "한강뷰", "노을", "일출",
  // 메뉴 — '빵'·'디저트'·'케이크'·'커피'·'라떼' 같은 분류어는 뺀다. 특정 메뉴만.
  "소금빵", "크루아상", "크로플", "휘낭시에", "스콘",
  // 공간·조건 — 가서 겪는 것(결정에 쓰이는 말)
  "조용", "좌석", "주차", "콘센트", "와이파이", "친절", "웨이팅", "가성비", "재방문",
  // 아쉬운 점 — 숨기지 않는다
  "아쉬", "별로",
];
const KEY_RE = new RegExp("(" + KEY_TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
const HANGUL = /[가-힣]/;
const KEY_MAX = 2; // 문장당 상한 — 셋 이상 칠하면 강조가 아니라 얼룩이 된다

export function splitKeyTerms(text: unknown): { t: string; k: boolean }[] {
  const s = String(text ?? "");
  if (!s) return [];
  const out: { t: string; k: boolean }[] = [];
  let last = 0;
  let used = 0;
  for (const m of s.matchAll(KEY_RE)) {
    if (used >= KEY_MAX) break;
    const i = m.index ?? 0;
    if (i < last) continue;
    // 🚫 앞이 한글이면 낱말 안이다('드립커피'의 커피, '애크로매틱커피'의 커피) → 칠하지 않는다.
    if (i > 0 && HANGUL.test(s[i - 1])) continue;
    // ✅ 뒤로 이어지는 한글(어미·조사)까지 한 덩어리로 삼는다 — '조용'만 칠하고 '한'을 떼면 글이 깨져 보인다.
    let end = i + m[0].length;
    while (end < s.length && HANGUL.test(s[end]) && end - (i + m[0].length) < 3) end++;
    if (i > last) out.push({ t: s.slice(last, i), k: false });
    out.push({ t: s.slice(i, end), k: true });
    last = end;
    used++;
  }
  if (last < s.length) out.push({ t: s.slice(last), k: false });
  return out;
}
