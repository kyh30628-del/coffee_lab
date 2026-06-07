// 공공데이터 LOCALDATA(지방행정 인허가) 발굴 (PRINCIPLES §2·§4): 공식·합법 전수 데이터.
// 등록된 휴게음식점 중 '카페'만 + 영업중만 → 발굴 누락 최소화 + 폐업 정리(최신성).
// 좌표는 EPSG:5174(중부원점 TM) → WGS84 변환. 키·좌표 검증 전엔 dry-run(미적재) 권장.
import proj4 from "proj4";
import { sql } from "./db";

const KEY = process.env.LOCALDATA_KEY;
export const hasLocaldataKey = () => !!KEY;
const OPN_SVC_ID = "07_24_04_P"; // 휴게음식점

// LOCALDATA 좌표계(EPSG:5174, GRS80 중부원점 Bessel)
proj4.defs("EPSG:5174", "+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43");
function toWgs84(x?: string | number, y?: string | number): { lat: number; lng: number } | null {
  const X = Number(x), Y = Number(y);
  if (!X || !Y || isNaN(X) || isNaN(Y)) return null;
  try {
    const [lng, lat] = proj4("EPSG:5174", "WGS84", [X, Y]);
    if (lat < 36.5 || lat > 38.5 || lng < 125.5 || lng > 128) return null; // 수도권 범위 밖이면 변환 의심 → 버림
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  } catch { return null; }
}

const FRANCHISE = ["스타벅스", "투썸", "이디야", "메가커피", "메가엠지씨", "빽다방", "컴포즈", "커피빈", "할리스", "엔제리너스", "파스쿠찌", "탐앤탐스", "폴바셋", "드롭탑", "요거프레소", "더벤티", "매머드", "공차", "스무디킹", "투썸플레이스", "카페베네", "만랩", "토프레소", "셀렉토", "더리터", "달콤커피", "커피스미스", "주커피", "백억커피", "쥬씨", "더치앤빈"];
const isFranchise = (n: string) => { const x = (n || "").replace(/\s/g, ""); return FRANCHISE.some((f) => x.includes(f)); };
// 카페로 볼지: 업태가 커피/다방/카페 또는 상호에 카페·커피·로스터 포함
const isCafe = (bplcNm: string, uptaeNm: string) => {
  const u = uptaeNm || "", n = bplcNm || "";
  if (/커피|다방|카페/.test(u)) return true;
  if (/카페|커피|로스터|coffee/i.test(n)) return true;
  return false;
};

type LdRow = { bplcNm?: string; siteWhladdr?: string; rdnWhladdr?: string; x?: string; y?: string; trdStateNm?: string; trdStateGbn?: string; uptaeNm?: string };

async function fetchPage(localCode: string, pageIndex: number, pageSize: number): Promise<{ rows: LdRow[]; total: number; ok: boolean }> {
  const url = `https://www.localdata.go.kr/platform/rest/GR0/openDataApi?authKey=${KEY}&opnSvcId=${OPN_SVC_ID}&localCode=${localCode}&pageIndex=${pageIndex}&pageSize=${pageSize}&resultType=json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return { rows: [], total: 0, ok: false };
  const data = await res.json().catch(() => null);
  const body = data?.result?.body;
  const rows: LdRow[] = body?.rows?.[0]?.row ?? [];
  const total = Number(body?.totalCount ?? 0);
  return { rows, total, ok: true };
}

// 한 행정구역(localCode) 발굴. apply=false면 dry-run(미적재, 샘플 반환).
export async function discoverLocaldata(localCode: string, areaLabel: string, opts?: { apply?: boolean; maxPages?: number }) {
  if (!KEY) throw new Error("LOCALDATA_KEY 미설정");
  const apply = !!opts?.apply;
  const maxPages = opts?.maxPages ?? 10;
  const candidates: { name: string; address: string; lat: number; lng: number }[] = [];
  let total = 0, scanned = 0, ok = true;

  for (let p = 1; p <= maxPages; p++) {
    const { rows, total: t, ok: pok } = await fetchPage(localCode, p, 500);
    if (!pok) { ok = false; break; }
    total = t || total;
    if (rows.length === 0) break;
    for (const r of rows) {
      scanned++;
      const name = (r.bplcNm || "").trim();
      const open = (r.trdStateNm || "").includes("영업") || r.trdStateGbn === "01";
      if (!name || !open) continue;                       // 폐업·휴업 제외
      if (!isCafe(name, r.uptaeNm || "")) continue;       // 카페만
      if (isFranchise(name)) continue;                    // 프랜차이즈 제외
      const co = toWgs84(r.x, r.y);
      if (!co) continue;                                  // 좌표 변환 실패 제외
      candidates.push({ name, address: r.rdnWhladdr || r.siteWhladdr || "", lat: co.lat, lng: co.lng });
    }
    await new Promise((x) => setTimeout(x, 200));
  }

  let inserted = 0, skipped = 0;
  if (apply) {
    for (const it of candidates) {
      const exists = await sql`SELECT id FROM cafes WHERE name = ${it.name} OR (ABS(lat - ${it.lat}) < 0.0005 AND ABS(lng - ${it.lng}) < 0.0005) LIMIT 1`;
      if (exists.length > 0) { skipped++; continue; }
      const pseudoId = `ld_${it.name.replace(/\s/g, "")}_${Math.round(it.lat * 1e5)}`;
      await sql`
        INSERT INTO cafes (place_id, name, area, address, lat, lng, source, published, roasts_own)
        VALUES (${pseudoId}, ${it.name}, ${areaLabel}, ${it.address}, ${it.lat}, ${it.lng}, 'localdata', false, false)
        ON CONFLICT (place_id) DO NOTHING`;
      inserted++;
    }
  }

  return { localCode, areaLabel, total, scanned, cafes: candidates.length, inserted, skipped, apply, fetchOk: ok, sample: candidates.slice(0, 8) };
}
