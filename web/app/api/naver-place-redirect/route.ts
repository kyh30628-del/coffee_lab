import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.redirect("https://search.naver.com");

  const [cafe] = await sql`SELECT name, area, naver_place_url FROM cafes WHERE id=${id} LIMIT 1` as any[];
  if (!cafe) return NextResponse.redirect("https://search.naver.com");

  // 캐시된 URL 있으면 바로 사용
  if (cafe.naver_place_url) {
    return NextResponse.redirect(cafe.naver_place_url);
  }

  // 네이버 통합검색 장소탭 — 지도/길찾기 사이드바 없이 카페 상세(메뉴·시간·리뷰) 직접 표시
  const query = encodeURIComponent(`${cafe.name} ${cafe.area}`);
  const placeUrl = `https://search.naver.com/search.naver?query=${query}&where=place`;

  // 캐시 저장
  await sql`UPDATE cafes SET naver_place_url=${placeUrl} WHERE id=${id}`.catch(() => {});

  return NextResponse.redirect(placeUrl);
}
