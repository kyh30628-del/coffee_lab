// 공공데이터포털 소상공인시장진흥공단 「상가(상권)정보」 발굴 (PRINCIPLES §2·§4).
// 등록 상가 중 '커피전문점/카페/다방'만 → 위경도(WGS84) 직접 제공(좌표변환 불필요).
// 프랜차이즈·중복 제외, 비공개로 적재 후 합성 단계에서 검증. 키 없거나 검증 전엔 dry-run.
import { sql } from "./db";
import { brandTokenOverlap } from "./reviewQuality";

const KEY = process.env.DATA_GO_KR_KEY;
export const hasSanggaKey = () => !!KEY;
// storeListInDong: 시군구코드(signguCd)로 그 구의 상가 조회
const ENDPOINT = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong";

const FRANCHISE = ["스타벅스", "투썸", "이디야", "메가커피", "메가엠지씨", "빽다방", "컴포즈", "커피빈", "할리스", "엔제리너스", "파스쿠찌", "탐앤탐스", "폴바셋", "드롭탑", "요거프레소", "더벤티", "매머드", "공차", "스무디킹", "투썸플레이스", "카페베네", "만랩", "토프레소", "셀렉토", "더리터", "달콤커피", "커피스미스", "주커피", "백억커피", "쥬씨", "더치앤빈", "팀홀튼",
  // 영문/로마자 표기(네이버가 영문 상호로 등재하는 지점 우회 방지 — decisions#565)
  "STARBUCKS", "TWOSOME", "EDIYA", "MEGACOFFEE", "MEGAMGC", "PAIKSCOFFEE", "PAIKDABANG", "COMPOSECOFFEE", "COFFEEBEAN", "HOLLYS", "ANGELINUS", "PASCUCCI", "TOMNTOMS", "PAULBASSETT", "DROPTOP", "YOGERPRESSO", "THEVENTI", "MAMMOTHCOFFEE", "GONGCHA", "SMOOTHIEKING", "CAFEBENE", "CAFFEBENE", "MANLAB", "TOPRESSO", "SELECTO", "DALKOMMCOFFEE", "COFFEESMITH", "JUICY", "TIMHORTONS"];
const isFranchise = (n: string) => { const x = (n || "").replace(/\s/g, "").toUpperCase(); return FRANCHISE.some((f) => x.includes(f.toUpperCase())); };
// 카페 업종: 소분류명이 커피/카페/다방 (코드 필터가 빗나가도 안전망)
const isCafe = (indsSclsNm: string, indsMclsNm: string) => /커피|카페|다방/.test(indsSclsNm || "") || /비알콜/.test(indsMclsNm || "");

type Store = { bizesNm?: string; rdnmAdr?: string; lnoAdr?: string; lon?: string; lat?: string; indsSclsNm?: string; indsMclsNm?: string };

async function fetchPage(signguCd: string, pageNo: number, numOfRows: number): Promise<{ items: Store[]; total: number; ok: boolean; err?: string }> {
  const url = `${ENDPOINT}?serviceKey=${KEY}&divId=signguCd&key=${signguCd}&pageNo=${pageNo}&numOfRows=${numOfRows}&type=json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return { items: [], total: 0, ok: false, err: `HTTP ${res.status}` };
  const data = await res.json().catch(() => null);
  const body = data?.body ?? data?.response?.body;
  const items: Store[] = body?.items ?? [];
  const total = Number(body?.totalCount ?? 0);
  if (!body) return { items: [], total: 0, ok: false, err: JSON.stringify(data ?? "").slice(0, 150) };
  return { items, total, ok: true };
}

// 한 시군구(signguCd) 발굴. apply=false면 dry-run(미적재, 샘플 반환).
export async function discoverSangga(signguCd: string, areaLabel: string, opts?: { apply?: boolean; maxPages?: number }) {
  if (!KEY) throw new Error("DATA_GO_KR_KEY 미설정");
  const apply = !!opts?.apply;
  const maxPages = opts?.maxPages ?? 20;
  const cands: { name: string; address: string; lat: number; lng: number }[] = [];
  let total = 0, scanned = 0, ok = true, err: string | undefined;
  const seen = new Set<string>();

  for (let p = 1; p <= maxPages; p++) {
    const { items, total: t, ok: pok, err: e } = await fetchPage(signguCd, p, 1000);
    if (!pok) { ok = false; err = e; break; }
    total = t || total;
    if (items.length === 0) break;
    for (const s of items) {
      scanned++;
      const name = (s.bizesNm || "").trim();
      const lat = Number(s.lat), lng = Number(s.lon);
      if (!name || !lat || !lng || isNaN(lat) || isNaN(lng)) continue;
      if (!isCafe(s.indsSclsNm || "", s.indsMclsNm || "")) continue;
      if (isFranchise(name)) continue;
      const k = name.replace(/\s/g, "") + Math.round(lat * 1000);
      if (seen.has(k)) continue;
      seen.add(k);
      cands.push({ name, address: s.rdnmAdr || s.lnoAdr || "", lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 });
    }
    if (items.length < 1000) break;
    await new Promise((x) => setTimeout(x, 200));
  }

  let inserted = 0, skipped = 0;
  if (apply) {
    for (const it of cands) {
      // 🐛 2026-08-25 전수점검: 좌표 근접(약 55m)만으로 이름검증 없이 '이미 있음' 처리하던 과잉차단 교정
      //   (lib/discover.ts decisions#814와 같은 버그). 좌표는 후보만 뽑고 동일 판정은 이름으로 한다.
      //   ⚠️ 밀도 의존 — DB가 커질수록 55m 안에 뭔가 있을 확률이 올라가 같은 코드가 점점 더 많이 버린다.
      const nameHit = await sql`SELECT id FROM cafes WHERE name = ${it.name} LIMIT 1`;
      const nearRows = nameHit.length ? [] : (await sql`SELECT id, name FROM cafes
        WHERE ABS(lat - ${it.lat}) < 0.0005 AND ABS(lng - ${it.lng}) < 0.0005 LIMIT 5`) as any[];
      const exists = nameHit.length ? nameHit
        : (nearRows.some((r: any) => brandTokenOverlap(r.name, it.name)) ? nearRows : []);
      if (exists.length > 0) { skipped++; continue; }
      const pseudoId = `dg_${it.name.replace(/\s/g, "")}_${Math.round(it.lat * 1e5)}`;
      await sql`
        INSERT INTO cafes (place_id, name, area, address, lat, lng, source, published, roasts_own)
        VALUES (${pseudoId}, ${it.name}, ${areaLabel}, ${it.address}, ${it.lat}, ${it.lng}, 'sangga', false, false)
        ON CONFLICT (place_id) DO NOTHING`;
      inserted++;
    }
  }
  return { signguCd, areaLabel, total, scanned, cafes: cands.length, inserted, skipped, apply, fetchOk: ok, err, sample: cands.slice(0, 8) };
}

// 수도권 시군구코드(법정동코드 앞 5자리). dry-run으로 검증 후 사용.
export const METRO_SIGNGU: { code: string; areaLabel: string }[] = [
  // 서울
  ["11680", "강남구"], ["11740", "강동구"], ["11305", "강북구"], ["11500", "강서구"], ["11620", "관악구"], ["11215", "광진구"], ["11530", "구로구"], ["11545", "금천구"], ["11350", "노원구"], ["11320", "도봉구"], ["11230", "동대문구"], ["11590", "동작구"], ["11440", "마포구"], ["11410", "서대문구"], ["11650", "서초구"], ["11200", "성동구"], ["11290", "성북구"], ["11710", "송파구"], ["11470", "양천구"], ["11560", "영등포구"], ["11170", "용산구"], ["11380", "은평구"], ["11110", "종로구"], ["11140", "중구"], ["11260", "중랑구"],
  // 인천 — ⚠️ 2026-08-31 정정(decisions#910): "2026-07-01 2군9구 개편"(제물포구·영종구·검단구·서해구)은
  // 실존하지 않는 행정구역명이었다(coordination#354). 중구(28110)·동구(28140)·서구(28260)는 폐지된 적
  // 없는 현행 코드이므로 복원. 이 기능은 DATA_GO_KR_KEY 자체가 로컬에 없어 현재 완전 비활성
  // (크론 미연결, dry-run만 가능)이라 급하지 않음 — 활성화 전 code.go.kr/data.go.kr StanReginCd API로
  // 재확인 권장.
  ["28110", "인천 중구"], ["28140", "인천 동구"], ["28177", "인천 미추홀구"], ["28185", "인천 연수구"], ["28200", "인천 남동구"], ["28237", "인천 부평구"], ["28245", "인천 계양구"], ["28260", "인천 서구"], ["28710", "강화군"], ["28720", "옹진군"],
  // 경기 (시 단위)
  ["41110", "수원시"], ["41130", "성남시"], ["41150", "의정부시"], ["41170", "안양시"], ["41190", "부천시"], ["41210", "광명시"], ["41220", "평택시"], ["41250", "동두천시"], ["41270", "안산시"], ["41280", "고양시"], ["41290", "과천시"], ["41310", "구리시"], ["41360", "남양주시"], ["41370", "오산시"], ["41390", "시흥시"], ["41410", "군포시"], ["41430", "의왕시"], ["41450", "하남시"], ["41460", "용인시"], ["41480", "파주시"], ["41500", "이천시"], ["41550", "안성시"], ["41570", "김포시"], ["41590", "화성시"], ["41610", "광주시"], ["41630", "양주시"], ["41650", "포천시"], ["41670", "여주시"], ["41800", "연천군"], ["41820", "가평군"], ["41830", "양평군"],
].map(([code, areaLabel]) => ({ code, areaLabel }));
