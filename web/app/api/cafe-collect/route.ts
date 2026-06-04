import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

// 공개데이터 자동수집 (강동 생활권). 안목 있는 리뷰 명확 → 한줄평+공개,
// 정보 부족 → 후보로 비공개(published=false). source='auto'.
const COLLECTED = [
  {
    place_id: "ChIJbQBp-LavfDURu2J0eUk_LfQ", name: "애크로매틱 커피", area: "성내동",
    address: "서울 강동구 성내로14길 37", lat: 37.5262299, lng: 127.1262899,
    hours: "10:00–19:00", phone: "", rating: 4.4, rating_count: 164, roasts_own: true,
    beans: "자가 로스팅·블렌딩 (원두 카드 제공)", signature: "에스프레소(스파클링 워터 곁들임)·티라미수",
    uses: "혼자,작업,단골", vibe: "원두 설명 카드까지 챙기는 정갈한 곳",
    note: "에스프레소에 원두 카드를 함께 줘서 노트와 맛을 비교하며 마실 수 있는 집. 산미를 눌러 단맛을 끌어낸 로스팅, 가격도 합리적.",
    price_hint: "", published: true,
  },
  {
    place_id: "ChIJ9YCyUzevfDURqUd9bYnFCJ0", name: "피에로 커피", area: "성내동",
    address: "서울 강동구 성내동 465", lat: 37.5265854, lng: 127.1266296,
    hours: "08:00–22:00", phone: "02-471-5618", rating: 4.5, rating_count: 173, roasts_own: true,
    beans: "직접 로스팅 (과일향 싱글·피칸 등)", signature: "플랫화이트·피칸 커피·티라미수",
    uses: "수다,작업,단골", vibe: "친절한 바리스타, 활기있는 동네 사랑방",
    note: "직접 볶은 과일향 원두로 내린 플랫화이트가 부드럽고 단맛이 좋은 집. 티라미수도 서울 최고 수준이라는 평.",
    price_hint: "피칸커피 4,800원", published: true,
  },
  {
    place_id: "ChIJ1V3KElmlfDUR5hi87_XU9QE", name: "커피몽타주 성내", area: "성내동",
    address: "서울 강동구 올림픽로48길 23-12", lat: 37.5294746, lng: 127.1218402,
    hours: "08:00–19:00", phone: "070-8262-1303", rating: 4.5, rating_count: 402, roasts_own: true,
    beans: "자가 로스팅 (Bitter Sweet 블렌드·시즌 싱글오리진)", signature: "에스프레소 플래터·콜드브루",
    uses: "혼자,작업,조용", vibe: "재즈가 흐르는 차분한 스페셜티 명소",
    note: "강동 스페셜티의 대표 주자. 산미보다 단맛을 끌어올린 로스팅. 'Bitter Sweet' 블렌드 원두는 다크초콜릿·카라멜 노트. 원두 사면 커피 한 잔 제공.",
    price_hint: "에스프레소 플래터 5,000원", published: true,
  },
  {
    place_id: "ChIJWZ13W1WlfDURum0f2rsj8wE", name: "해브 로스터스", area: "천호동",
    address: "서울 강동구 천호동 427-13 102호", lat: 37.5395724, lng: 127.1253267,
    hours: "08:00–17:00 (오전 중심)", phone: "02-6227-8300", rating: 5.0, rating_count: 9, roasts_own: true,
    beans: "매장 직접 로스팅 (싱글 다양)", signature: "핸드드립",
    uses: "혼자,조용", vibe: "천호동 골목 히든젬, 주인이 행복하게 내리는 곳",
    note: "'블루보틀 부럽지 않다'는 천호동 골목의 히든젬. 섬세하게 직접 로스팅한 핸드드립. 영업이 오전 중심이라 놓치기 쉬우니 시간 확인 필수.",
    price_hint: "", published: true,
  },
  {
    place_id: "ChIJ1--1Jqi6fDURoOfAJNRUsv8", name: "커피레시피", area: "천호동",
    address: "서울 강동구 천호동 316-13", lat: 37.5478985, lng: 127.1261839, roasts_own: true,
    hours: "화–토 11:00–15:30 (짧음)", phone: "02-478-6875", rating: 4.8, rating_count: 14,
    beans: "주인 직접 로스팅 (수상 원두·게이샤 등)", signature: "핸드드립·게이샤",
    uses: "혼자,조용", vibe: "작은 공간, 커피에 진심인 주인장",
    note: "작은 공간에서 주인이 직접 세심하게 로스팅. 밸런스가 좋고 게이샤가 일품. 여름엔 더치커피로 만든 음료의 꽃향이 일품. 영업시간이 짧으니 미리 확인.",
    price_hint: "", published: true,
  },
  {
    place_id: "ChIJsyQ9WhSxfDURp1yKtPEtF1Y", name: "러스터앤코 명일", area: "명일동",
    address: "서울 강동구 진황도로31길 16", lat: 37.5383075, lng: 127.1336565, roasts_own: true,
    hours: "09:00–22:00", phone: "", rating: 5.0, rating_count: 9,
    beans: "Probat 로스팅 (에티오피아·인도네시아 블렌드)", signature: "에스프레소·디저트",
    uses: "작업,수다,사진", vibe: "메탈릭하고 세련된, 성수동 감성",
    note: "Probat로 직접 로스팅하는 에스프레소가 꽃향·과일향에 초콜릿 피니시까지. 디저트와 공간 완성도가 높아 분위기까지 챙기고 싶을 때.",
    price_hint: "", published: true,
  },
  {
    place_id: "ChIJNzi7jwuwfDURY_mOM-ce8M0", name: "카페이유", area: "암사동",
    address: "서울 강동구 암사동 461-11", lat: 37.5539119, lng: 127.1306325, roasts_own: true,
    hours: "10:00–20:30", phone: "070-8887-6262", rating: 4.4, rating_count: 93,
    beans: "직접 로스팅", signature: "바닐라빈 라떼·스콘",
    uses: "수다,작업,단골", vibe: "독특하고 스타일리시한 공간",
    note: "직접 로스팅하는 동네 터줏대감. 바닐라빈 라떼가 시그니처. 친구와 편히 수다 떨기 좋은 분위기.",
    price_hint: "", published: true,
  },
];

export async function GET() {
  try {
    await ensureSchema();
    let added = 0;
    for (const c of COLLECTED) {
      await sql`
        INSERT INTO cafes (place_id, name, area, address, lat, lng, hours, phone,
          rating, rating_count, roasts_own, beans, signature, uses, vibe, note, price_hint, source, published)
        VALUES (${c.place_id}, ${c.name}, ${c.area}, ${c.address}, ${c.lat}, ${c.lng},
          ${c.hours ?? ""}, ${c.phone ?? ""}, ${c.rating ?? null}, ${c.rating_count ?? null},
          ${c.roasts_own ?? false}, ${c.beans ?? ""}, ${c.signature ?? ""}, ${c.uses ?? ""},
          ${c.vibe ?? ""}, ${c.note ?? ""}, ${c.price_hint ?? ""}, 'auto', ${c.published ?? false})
        ON CONFLICT (place_id) DO NOTHING
      `;
      added++;
    }
    const count = await sql`SELECT COUNT(*)::int AS n FROM cafes WHERE published=true`;
    return NextResponse.json({ ok: true, processed: COLLECTED.length, published_total: count[0].n });
  } catch (e) {
    console.error("cafe-collect error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
