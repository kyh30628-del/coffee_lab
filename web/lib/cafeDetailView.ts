// 📓 카페 상세 화면 공용 계산(2026-09-20) — /c/[id](서버)와 지도 상세 패널 CafePanel(클라이언트)이 **같은 함수**를 쓴다.
//   ⚠️ 이 파일은 클라이언트 번들에 들어간다 — db·criteria 등 서버 모듈을 import하지 말 것(빌드가 깨진다).
//   전부 순수 함수·조회 0. 비용 0.
import { tasteVector, tasteSimilarity, GRADE_RANK } from "./cafeProfile";

// ── 읽히는 후기 문장 판정(2026-09-20, exposureOrder에서 옮김 — 정렬과 화면이 같은 기준을 쓴다) ──
const RQ_TRUNC = /(\.{3,}|…)\s*$/;
const RQ_META = /(영업시간|운영시간|주차|도로명|지번|주소|위치\s*[:：]|OPEN|CLOSE|\d{1,2}:\d{2}|전화|문의)/gi;
const RQ_PRED = /(어요|아요|네요|습니다|해요|였어요|했어요|더라고요|더라구요|거예요|답니다|드려요|같아요|좋았|맛있|추천|만족|아쉬|별로|괜찮)/;
export function isReadableQuote(q: unknown, cafeName = ""): boolean {
  const s = String(q ?? "").trim();
  if (s.length < 20 || RQ_TRUNC.test(s)) return false;
  if ((s.match(/#/g) ?? []).length >= 3) return false;
  if ((s.match(RQ_META) ?? []).length >= 2) return false;
  if (/^\[/.test(s) && !RQ_PRED.test(s)) return false;
  // 이름을 공유하는 다른 업종(실사고: '호텔 서귀피안' 글이 '서귀피안 베이커리'에 붙음) — 상호 첫 토큰 앞뒤에 숙박어가 붙으면 제외
  const first = cafeName.trim().split(/\s+/)[0] ?? "";
  if (first.length >= 2) {
    const esc = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`${esc}\\s*(호텔|펜션|숙소|리조트|모텔|게스트하우스)|(호텔|펜션|숙소|리조트|모텔|게스트하우스)\\s*${esc}`).test(s)) return false;
  }
  return RQ_PRED.test(s);
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
export const igHandle = (u: string | null | undefined) => { const m = String(u ?? "").match(/instagram\.com\/([A-Za-z0-9._]+)/); return m ? m[1] : null; };
