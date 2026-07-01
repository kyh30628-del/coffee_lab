import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    // 감사수리: 비정수 id가 SQL 예외(500)로 새던 것 → 400으로 차단
    if (!id || !Number.isInteger(Number(id))) return NextResponse.json({ ok: false, error: "잘못된 id" }, { status: 400 });

    const [cafe] = await sql`SELECT name, area, naver_place_url FROM cafes WHERE id=${id} LIMIT 1` as any[];
    if (!cafe) return NextResponse.redirect("https://search.naver.com");

    // 캐시된 URL 있으면 바로 사용
    if (cafe.naver_place_url) {
      return NextResponse.redirect(cafe.naver_place_url);
    }

    // 네이버 통합검색 장소탭 — 지도/길찾기 사이드바 없이 카페 상세(메뉴·시간·리뷰) 직접 표시
    const query = encodeURIComponent(`${cafe.name} ${cafe.area}`);
    const placeUrl = `https://search.naver.com/search.naver?query=${query}&where=place`;

    // 감사수리: 무인증 GET이 검색 URL을 naver_place_url에 영구 저장해 컬럼을 오염시키던 것 제거 — 저장 없이 redirect만
    return NextResponse.redirect(placeUrl);
  } catch {
    // 감사수리: 전체 try/catch — 실패 시에도 사용자는 네이버 검색으로
    return NextResponse.redirect("https://search.naver.com");
  }
}
