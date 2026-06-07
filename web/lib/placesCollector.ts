// 구글 Places 리뷰 수집 (PRINCIPLES.md 2조: 공식 API, 합법)
// ⚠️ 과금 주의: Places API(New)는 호출당 과금(리뷰·평점 필드는 비싼 SKU). 기본 OFF로 두어
//    요금을 방지한다. 네이버·유튜브·블로그로 충분. 켜려면 ENABLE_GOOGLE_PLACES=1.
export type CollectedReview = { text: string; time?: number };

const KEY = process.env.GOOGLE_API_KEY;
const ENABLED = process.env.ENABLE_GOOGLE_PLACES === "1";

export async function fetchPlacesReviews(name: string, area: string): Promise<{
  reviews: CollectedReview[];
  place?: { id: string; name: string; rating?: number; ratingCount?: number };
  error?: string;
  debug?: unknown;
}> {
  if (!ENABLED) return { reviews: [], error: "Places 비활성(과금 방지) — ENABLE_GOOGLE_PLACES=1로 켜기" };
  if (!KEY) return { reviews: [], error: "GOOGLE_API_KEY 미설정" };
  try {
    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount",
      },
      body: JSON.stringify({ textQuery: `${name} ${area}`, languageCode: "ko" }),
    });
    const searchData = await searchRes.json();
    const place = searchData.places?.[0];
    if (!place) {
      return { reviews: [], error: "장소를 못 찾음", debug: { searchStatus: searchRes.status, searchData } };
    }

    // 상세 요청에 languageCode 명시 (리뷰 응답 보강)
    const detailRes = await fetch(`https://places.googleapis.com/v1/places/${place.id}?languageCode=ko`, {
      headers: {
        "X-Goog-Api-Key": KEY,
        "X-Goog-FieldMask": "id,displayName,rating,userRatingCount,reviews",
      },
    });
    const detail = await detailRes.json();
    const rawReviews = detail.reviews ?? [];
    const reviews: CollectedReview[] = rawReviews
      .map((rv: { text?: { text?: string }; originalText?: { text?: string }; publishTime?: string }) => ({
        text: rv.text?.text ?? rv.originalText?.text ?? "",
        time: rv.publishTime ? Math.floor(new Date(rv.publishTime).getTime() / 1000) : undefined,
      }))
      .filter((r: CollectedReview) => r.text);

    return {
      reviews,
      place: { id: place.id, name: place.displayName?.text ?? name, rating: place.rating, ratingCount: place.userRatingCount },
      debug: {
        foundPlace: place.displayName?.text,
        detailStatus: detailRes.status,
        rawReviewCount: rawReviews.length,
        hasReviewsField: "reviews" in detail,
        detailKeys: Object.keys(detail),
        detailError: detail.error ?? null,
      },
    };
  } catch (e) {
    return { reviews: [], error: String(e) };
  }
}
