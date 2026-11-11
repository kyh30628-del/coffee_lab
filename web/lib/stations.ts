// 🚇 지하철역 사전 — 2026-11-10 (유입 확대: "{역} 카페"는 한국 지역 검색의 대표 패턴인데 우리는 역 단위 페이지가 0이었다).
//   좌표 출처: OpenStreetMap(ODbL) 지하철역 노드. lib/data/stations.json = {역명(역 제외): [lat, lng]} (이름이 같은 다른 도시 역은 모호해 제외).
//   ⚠️ 데이터는 정적 파일이다 — 역이 새로 생겨도 서비스는 그대로 돈다(새 역만 못 잡을 뿐). 갱신은 scripts/build-stations 절차 참조.
import data from "./data/stations.json";

export const STATIONS = data as unknown as Record<string, [number, number]>;
export const STATION_RADIUS_M = 600;   // 도보 약 8분
export const STATION_MIN_CAFES = 8;    // 이 미만이면 페이지를 열지 않는다(목록이 빈약하면 "BEST"라 쓸 수 없다)

const M_PER_DEG_LAT = 110570;
export const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
export function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dy = (lat1 - lat2) * M_PER_DEG_LAT, dx = (lng1 - lng2) * mPerDegLng((lat1 + lat2) / 2);
  return Math.hypot(dx, dy);
}
/** URL의 "강남역"/"강남" 둘 다 받는다. 사전에 없으면 null. */
export function resolveStation(raw: string): string | null {
  const n = decodeURIComponent(raw).trim().replace(/역$/, "");
  return STATIONS[n] ? n : null;
}
/** 좌표에서 가장 가까운 역(maxM 이내) — 카페 상세의 "가까운 역" 링크용. 629개 순회라 CPU 무시 수준. */
export function nearestStation(lat: number, lng: number, maxM = 700): { name: string; m: number } | null {
  let best: { name: string; m: number } | null = null;
  for (const [name, [la, ln]] of Object.entries(STATIONS)) {
    if (Math.abs(la - lat) > 0.01 || Math.abs(ln - lng) > 0.012) continue; // 빠른 박스 컷
    const m = distM(lat, lng, la, ln);
    if (m <= maxM && (!best || m < best.m)) best = { name, m };
  }
  return best;
}
/** 반경 안의 다른 역들(가까운 순) — 역 페이지의 "주변 역" 링크용. */
export function nearbyStations(name: string, maxKm = 3, limit = 12): { name: string; km: number }[] {
  const s = STATIONS[name]; if (!s) return [];
  return Object.entries(STATIONS).filter(([n]) => n !== name)
    .map(([n, [la, ln]]) => ({ name: n, km: distM(s[0], s[1], la, ln) / 1000 }))
    .filter((x) => x.km <= maxKm).sort((a, b) => a.km - b.km).slice(0, limit);
}
