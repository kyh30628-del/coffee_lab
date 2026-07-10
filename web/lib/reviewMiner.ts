// 리뷰 속 숨은 카페 발굴 (PRINCIPLES §3 — 막힌 소스 대신 가진 데이터 최대활용).
//   이미 수집된 raw_reviews에 박혀있는 상호를 기계적 추출 → 네이버 지역검색으로 실재·좌표·동 확정 → 신규 적재.
//   LLM 없음(토큰 0). 프랜차이즈·메뉴어·동명·중복 제거. coreTokens(리뷰품질 해자) 재사용해 식별어 검증.
//   적재는 pipeline_status='new'(비공개) → 기존 게이트(합성·판정·임베딩·검증) 통과해야만 공개.
import { sql } from "./db";
import { coreTokens } from "./reviewQuality";
import { isFranchise, parseDong } from "./discover";
import { loadCriteria, getCriterionSync } from "./criteria";
import { bumpNaver, markNaverExhausted } from "./naverBudget"; // 마이닝도 같은 25k/일 소비 → 공용 예산 계상

const NID = process.env.NAVER_CLIENT_ID, NSEC = process.env.NAVER_CLIENT_SECRET;
const norm = (s: string) => (s || "").toLowerCase().replace(/\s/g, "");

// 메뉴·일반어(상호 아님). 접미(커피/베이커리…) 떼고 이것만 남으면 탈락.
const MENU = new Set(["드립", "핸드드립", "비엔나", "더치", "캡슐", "필터", "블랙", "아메리카노", "에스프레소", "콜드브루", "라떼", "호주식", "스페셜티", "대형", "감성", "디저트", "원두", "로스팅", "핸드", "아이스", "따뜻한", "달달한", "크림", "고소한", "진한", "연한", "달콤한", "무료", "주변", "근처", "우리", "오늘", "요즘", "신상", "예쁜", "분위기", "맛있는", "유명", "인기"]);
const isMenu = (n: string) => MENU.has(n.replace(/(커피|로스터스|로스터리|로스터즈|베이커리)$/i, ""));

async function naverLocal(q: string): Promise<{ items?: any[]; err?: number }> {
  if (!NID || !NSEC) return { err: 0 };
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(q)}&display=3`,
      { headers: { "X-Naver-Client-Id": NID, "X-Naver-Client-Secret": NSEC } });
    if (r.status === 200) { bumpNaver(1).catch(() => {}); return { items: (await r.json()).items || [] }; } // 성공 쿼리 계상
    if (r.status === 429) { markNaverExhausted().catch(() => {}); return { err: 429 }; } // 실측 한도초과 → 소진 마킹·즉시 중단(백오프 재시도 폐지: 예산으로 사전 차단)
    return { err: r.status };
  }
  return { err: 429 };
}

export type MineResult = { area: string; sampled: number; candidates: number; verified: number; inserted: number; calls: number; names: string[]; stopped?: string };

// areaLabel 예: "강동구" / "안양시" / "인천 미추홀구". apply=false면 적재 안 함(dry-run).
export async function mineArea(areaLabel: string, opts?: { maxCalls?: number; apply?: boolean; rawLimit?: number }): Promise<MineResult> {
  const maxCalls = opts?.maxCalls ?? 25;
  const apply = !!opts?.apply;
  const rawLimit = opts?.rawLimit ?? 100;
  const keyword = areaLabel.split(" ").pop() || areaLabel; // ILIKE·주소매칭용 핵심어(미추홀구 등)

  await loadCriteria(); // 수도권 좌표박스 기준 캐시 프라임(폴백=36.8~38.3/124.5~127.9)
  const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
  const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");
  const all = (await sql`SELECT name, lat, lng FROM cafes`) as any[];
  const haveN = all.map((c) => norm(c.name));
  const rows = (await sql`SELECT raw_reviews FROM cafes WHERE area ILIKE ${"%" + keyword + "%"} AND raw_reviews IS NOT NULL LIMIT ${rawLimit}`) as any[];

  let text = "";
  for (const r of rows) for (const rv of (r.raw_reviews || [])) text += " " + (rv.title || "") + " " + (rv.desc || "");
  const cand = new Map<string, { name: string; count: number }>();
  const re = /([가-힣A-Za-z0-9]{2,8})(커피|로스터스|로스터리|로스터즈|베이커리)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) { const full = m[1] + m[2]; const k = norm(full); cand.set(k, { name: full, count: (cand.get(k)?.count || 0) + 1 }); }

  const pool = [...cand.values()]
    .filter((c) => c.count >= 3 && !isFranchise(c.name) && !isMenu(c.name) && coreTokens(c.name, [keyword]).length > 0)
    .filter((c) => { const n = norm(c.name); return !haveN.some((h) => h.includes(n) || n.includes(h)); })
    .sort((a, b) => b.count - a.count);

  let calls = 0, inserted = 0, verified = 0, stopped: string | undefined;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const c of pool) {
    if (calls >= maxCalls) { stopped = "maxCalls"; break; }
    const res = await naverLocal(keyword + " " + c.name); calls++;
    if (res.err) { stopped = `naver ${res.err}`; break; }
    const tok = coreTokens(c.name, [keyword]);
    const hit = (res.items || []).find((it: any) => {
      const pn = norm((it.title || "").replace(/<[^>]+>/g, ""));
      const isCafe = /카페|커피|디저트|베이커리|로스터/.test(it.category || "");
      return it.address?.includes(keyword) && isCafe && tok.some((t) => pn.includes(norm(t))) && !isFranchise((it.title || "").replace(/<[^>]+>/g, ""));
    });
    if (!hit) continue;
    const name = (hit.title || "").replace(/<[^>]+>/g, "").trim();
    const lat = Number(hit.mapy) / 1e7, lng = Number(hit.mapx) / 1e7;
    const nN = norm(name);
    if (!name || !lat || !lng || isNaN(lat) || isNaN(lng)) continue;
    // 🗺️ 수도권 박스 밖(비수도권 동명업체)은 적재 안 함 — 네이버가 타지역 지점 반환해도 서비스(수도권)와 무관.
    if (!(lat >= latMin && lat <= latMax && lng >= lngMin && lng <= lngMax)) continue;
    // 최종 중복: 이름 또는 좌표 근사 또는 이번 배치 중복
    if (seen.has(nN) || haveN.some((h) => h.includes(nN) || nN.includes(h))
      || all.some((a) => a.lat && Math.abs(a.lat - lat) < 0.0005 && Math.abs(a.lng - lng) < 0.0005)) continue;
    seen.add(nN);
    verified++;
    names.push(name);
    if (apply) {
      const dong = parseDong(hit.address || hit.roadAddress || "");
      const pid = `mn_${name.replace(/\s/g, "")}_${Math.round(lat * 1e5)}`;
      await sql`INSERT INTO cafes (place_id, name, area, dong, naver_category, address, lat, lng, source, published, roasts_own, pipeline_status)
        VALUES (${pid}, ${name}, ${keyword}, ${dong}, ${hit.category || ""}, ${hit.address || ""}, ${lat}, ${lng}, 'discover', false, false, 'new')
        ON CONFLICT (place_id) DO NOTHING`;
      inserted++;
    }
  }
  return { area: areaLabel, sampled: rows.length, candidates: pool.length, verified, inserted, calls, names, stopped };
}
