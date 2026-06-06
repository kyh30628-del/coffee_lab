import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const ID = process.env.NAVER_CLIENT_ID;
const SECRET = process.env.NAVER_CLIENT_SECRET;

// 프랜차이즈/대형 체인 제외 (헌법0: 동네 카페 정체성)
const FRANCHISE = ["스타벅스","투썸","이디야","메가커피","메가엠지씨","빽다방","컴포즈","커피빈","할리스","엔제리너스","파스쿠찌","탐앤탐스","폴바셋","드롭탑","요거프레소","더벤티","매머드","공차","스무디킹","스벅","투썸플레이스","카페베네","페이바","감성커피","더카페","코너스톤","하삼동","매가","벤티","고나우"];

function stripTags(s: string) { return (s || "").replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").trim(); }
// 명백한 비(非)카페 제외 (고로케·제과·정육 등)
const NON_CAFE = ["고로케","정육","마트","편의점","세탁","미용","약국","치킨","피자","분식","국밥","삼겹","횟집","노래","PC방","문구"];
function isFranchise(name: string) { const n = name.replace(/\s/g, ""); return FRANCHISE.some((f) => n.includes(f)); }
function isNonCafe(name: string, category: string) { const blob = (name + category).replace(/\s/g, ""); return NON_CAFE.some((k) => blob.includes(k)); }

// 네이버 지역검색: 좌표(mapx,mapy)는 KATEC가 아니라 WGS84*10^7 형식
async function localSearch(query: string) {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=comment`;
  const res = await fetch(url, { headers: { "X-Naver-Client-Id": ID!, "X-Naver-Client-Secret": SECRET! } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []).map((it: any) => ({
    name: stripTags(it.title),
    address: it.roadAddress || it.address || "",
    category: it.category || "",
    lng: it.mapx ? Number(it.mapx) / 1e7 : null,
    lat: it.mapy ? Number(it.mapy) / 1e7 : null,
  }));
}

// POST { region: "강동구", keywords?: [...] }
export async function POST(req: NextRequest) {
  if (!ID || !SECRET) return NextResponse.json({ ok: false, error: "네이버 키 미설정" }, { status: 500 });
  try {
    await ensureSchema();
    const { region, keywords, areaLabel } = await req.json();
    const storeArea = areaLabel || region;
    if (!region) return NextResponse.json({ ok: false, error: "region 필요" }, { status: 400 });

    // 개성 카페가 걸리는 키워드 조합
    const kws: string[] = keywords ?? ["로스터리", "스페셜티 카페", "직접로스팅 카페", "수제 디저트 카페", "감성 카페"];
    const seen = new Set<string>();
    const found: any[] = [];

    for (const kw of kws) {
      const items = await localSearch(`${region} ${kw}`);
      for (const it of items) {
        if (!it.name || !it.lat || !it.lng) continue;
        if (isFranchise(it.name)) continue;
        if (isNonCafe(it.name, it.category)) continue;
        const key = it.name.replace(/\s/g, "") + Math.round(it.lat * 1000);
        if (seen.has(key)) continue;
        seen.add(key);
        found.push(it);
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    // DB 적재 (중복은 이름+좌표 근사로 스킵, published=false)
    let inserted = 0, skipped = 0;
    for (const it of found) {
      const exists = await sql`
        SELECT id FROM cafes WHERE name = ${it.name} OR (ABS(lat - ${it.lat}) < 0.0005 AND ABS(lng - ${it.lng}) < 0.0005) LIMIT 1`;
      if (exists.length > 0) { skipped++; continue; }
      const pseudoId = `nl_${it.name.replace(/\s/g, "")}_${Math.round(it.lat * 1e5)}`;
      await sql`
        INSERT INTO cafes (place_id, name, area, address, lat, lng, source, published, roasts_own)
        VALUES (${pseudoId}, ${it.name}, ${storeArea}, ${it.address}, ${it.lat}, ${it.lng}, 'discover', false, false)
        ON CONFLICT (place_id) DO NOTHING`;
      inserted++;
    }

    return NextResponse.json({ ok: true, region, found: found.length, inserted, skipped, names: found.map((f) => f.name) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
