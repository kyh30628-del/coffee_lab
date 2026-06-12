import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.redirect("https://m.place.naver.com");

  // 1. 캐시된 URL 확인
  const [cafe] = await sql`SELECT name, area, naver_place_url FROM cafes WHERE id=${id} LIMIT 1` as any[];
  if (!cafe) return NextResponse.redirect("https://m.place.naver.com");

  if (cafe.naver_place_url) {
    return NextResponse.redirect(cafe.naver_place_url);
  }

  // 2. Naver 검색으로 Place ID 추출
  const query = `${cafe.name} ${cafe.area}`;
  const ID = process.env.NAVER_CLIENT_ID;
  const SEC = process.env.NAVER_CLIENT_SECRET;
  const fallback = `https://m.place.naver.com/place/list?query=${encodeURIComponent(query)}&entry=plt`;

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=1`,
      { headers: { "X-Naver-Client-Id": ID!, "X-Naver-Client-Secret": SEC! } }
    );
    const data = await res.json();
    const item = (data.items ?? [])[0];

    // Naver Place URL 패턴에서 ID 추출
    // link가 map.naver.com 형식이거나, 별도로 place 검색
    let placeUrl = fallback;

    if (item) {
      // Naver 지역 검색 결과의 mapx/mapy로 별도 확인 불가, 다른 방법 시도
      // link가 naver 계열이면 place ID 추출 시도
      const link = item.link || "";
      const placeMatch = link.match(/place\/(\d+)/);
      if (placeMatch) {
        placeUrl = `https://m.place.naver.com/restaurant/${placeMatch[1]}/home`;
      } else {
        // Naver Maps search URL로 place ID 추출 시도
        const searchRes = await fetch(
          `https://map.naver.com/p/api/search/allSearch?query=${encodeURIComponent(query)}&type=all&page=1&displayCount=1`,
          { headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://map.naver.com" } }
        ).catch(() => null);
        if (searchRes?.ok) {
          const searchData = await searchRes.json().catch(() => null);
          const placeId = searchData?.result?.place?.list?.[0]?.id;
          if (placeId) placeUrl = `https://m.place.naver.com/restaurant/${placeId}/home`;
        }
      }
    }

    // 캐시 저장
    await sql`UPDATE cafes SET naver_place_url=${placeUrl} WHERE id=${id}`;
    return NextResponse.redirect(placeUrl);
  } catch {
    return NextResponse.redirect(fallback);
  }
}
