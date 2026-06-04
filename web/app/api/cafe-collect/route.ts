import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

type C = {
  place_id: string; name: string; area: string; address: string; lat: number; lng: number;
  hours: string; phone: string; rating: number; rating_count: number; roasts_own: boolean;
  beans: string; signature: string; uses: string; vibe: string; note: string; price_hint: string;
  acidity: number; body: number; sweet: number; taste_pick: string; tone: string;
};

const COLLECTED: C[] = [
  // ── 강동 (기존) ──
  { place_id: "ChIJbQBp-LavfDURu2J0eUk_LfQ", name: "애크로매틱 커피", area: "성내동", address: "서울 강동구 성내로14길 37", lat: 37.5262299, lng: 127.1262899, hours: "10:00–19:00", phone: "", rating: 4.4, rating_count: 164, roasts_own: true, beans: "자가 로스팅·블렌딩 (원두 카드 제공)", signature: "에스프레소·티라미수", uses: "혼자,작업,단골", vibe: "원두 설명 카드까지 챙기는 정갈한 곳", note: "에스프레소에 원두 카드를 함께 줘서 노트와 맛을 비교하며 마실 수 있는 집. 산미를 눌러 단맛을 끌어낸 로스팅.", price_hint: "", acidity: 0.3, body: 0.7, sweet: 0.6, taste_pick: "산미 부담스러우면 여기 — 부드럽고 단맛 도는 에스프레소", tone: "brown" },
  { place_id: "ChIJ9YCyUzevfDURqUd9bYnFCJ0", name: "피에로 커피", area: "성내동", address: "서울 강동구 성내동 465", lat: 37.5265854, lng: 127.1266296, hours: "08:00–22:00", phone: "02-471-5618", rating: 4.5, rating_count: 173, roasts_own: true, beans: "직접 로스팅 (과일향 싱글·피칸)", signature: "플랫화이트·피칸커피·티라미수", uses: "수다,작업,단골", vibe: "친절한 바리스타, 활기있는 사랑방", note: "직접 볶은 과일향 원두로 내린 플랫화이트가 부드럽고 단맛이 좋은 집. 티라미수도 일품.", price_hint: "피칸커피 4,800원", acidity: 0.6, body: 0.5, sweet: 0.7, taste_pick: "달콤·고소한 라떼파라면 — 과일향 원두 플랫화이트", tone: "rose" },
  { place_id: "ChIJ1V3KElmlfDUR5hi87_XU9QE", name: "커피몽타주 성내", area: "성내동", address: "서울 강동구 올림픽로48길 23-12", lat: 37.5294746, lng: 127.1218402, hours: "08:00–19:00", phone: "070-8262-1303", rating: 4.5, rating_count: 402, roasts_own: true, beans: "자가 로스팅 (Bitter Sweet 블렌드·시즌 싱글)", signature: "에스프레소 플래터·콜드브루", uses: "혼자,작업,조용", vibe: "재즈가 흐르는 차분한 스페셜티 명소", note: "강동 스페셜티의 대표 주자. 산미보다 단맛을 끌어올린 로스팅. 'Bitter Sweet' 블렌드는 다크초콜릿·카라멜 노트.", price_hint: "에스프레소 플래터 5,000원", acidity: 0.3, body: 0.8, sweet: 0.6, taste_pick: "진하고 묵직한 거 좋아하면 — 다크초콜릿·카라멜 블렌드", tone: "dark" },
  { place_id: "ChIJWZ13W1WlfDURum0f2rsj8wE", name: "해브 로스터스", area: "천호동", address: "서울 강동구 천호동 427-13 102호", lat: 37.5395724, lng: 127.1253267, hours: "08:00–17:00 (오전 중심)", phone: "02-6227-8300", rating: 5.0, rating_count: 9, roasts_own: true, beans: "매장 직접 로스팅 (싱글 다양)", signature: "핸드드립", uses: "혼자,조용", vibe: "천호동 골목 히든젬", note: "'블루보틀 부럽지 않다'는 천호동 골목의 히든젬. 섬세한 핸드드립. 오전 중심이라 시간 확인 필수.", price_hint: "", acidity: 0.7, body: 0.4, sweet: 0.5, taste_pick: "섬세한 핸드드립 좋아하면 — 오전에 가야 만나요", tone: "green" },
  { place_id: "ChIJ1--1Jqi6fDURoOfAJNRUsv8", name: "커피레시피", area: "천호동", address: "서울 강동구 천호동 316-13", lat: 37.5478985, lng: 127.1261839, hours: "화–토 11:00–15:30 (짧음)", phone: "02-478-6875", rating: 4.8, rating_count: 14, roasts_own: true, beans: "주인 직접 로스팅 (수상 원두·게이샤)", signature: "핸드드립·게이샤", uses: "혼자,조용", vibe: "작은 공간, 커피에 진심인 주인장", note: "작은 공간에서 주인이 직접 세심하게 로스팅. 밸런스가 좋고 게이샤가 일품. 영업시간이 짧으니 미리 확인.", price_hint: "", acidity: 0.8, body: 0.5, sweet: 0.6, taste_pick: "산미·꽃향 좋아하면 여기 게이샤 — 단, 영업 짧아요", tone: "gold" },
  { place_id: "ChIJsyQ9WhSxfDURp1yKtPEtF1Y", name: "러스터앤코 명일", area: "명일동", address: "서울 강동구 진황도로31길 16", lat: 37.5383075, lng: 127.1336565, hours: "09:00–22:00", phone: "", rating: 5.0, rating_count: 9, roasts_own: true, beans: "Probat 로스팅 (에티오피아·인도네시아 블렌드)", signature: "에스프레소·디저트", uses: "작업,수다,사진", vibe: "메탈릭하고 세련된, 성수동 감성", note: "Probat로 직접 로스팅하는 에스프레소가 꽃향·과일향에 초콜릿 피니시까지. 공간 완성도가 높아 분위기까지 챙기고 싶을 때.", price_hint: "", acidity: 0.6, body: 0.7, sweet: 0.5, taste_pick: "맛+분위기+사진 다 챙기고 싶을 때 — Probat 로스팅 에스프레소", tone: "steel" },
  { place_id: "ChIJNzi7jwuwfDURY_mOM-ce8M0", name: "카페이유", area: "암사동", address: "서울 강동구 암사동 461-11", lat: 37.5539119, lng: 127.1306325, hours: "10:00–20:30", phone: "070-8887-6262", rating: 4.4, rating_count: 93, roasts_own: true, beans: "직접 로스팅", signature: "바닐라빈 라떼·스콘", uses: "수다,작업,단골", vibe: "독특하고 스타일리시한 공간", note: "직접 로스팅하는 동네 터줏대감. 바닐라빈 라떼가 시그니처. 친구와 편히 수다 떨기 좋은 분위기.", price_hint: "", acidity: 0.4, body: 0.6, sweet: 0.8, taste_pick: "달달한 거 좋아하면 — 바닐라빈 라떼", tone: "cream" },

  // ── 구리 (신규) ──
  { place_id: "ChIJN_yqrYCxfDUR01xKXnj-kgM", name: "빈팩토리커피", area: "구리 수택동", address: "경기 구리시 장자대로86번길 14-6", lat: 37.5871025, lng: 127.1396036, hours: "09:00–22:00", phone: "031-562-2852", rating: 4.4, rating_count: 11, roasts_own: false, beans: "산미 있는 싱글 중심", signature: "산미 또렷한 아메리카노·자몽차", uses: "혼자,수다,단골", vibe: "장자못 근처 동네 단골 카페", note: "프랜차이즈보다 이런 동네 카페가 좋다는 단골들의 집. 산미 또렷한 아메리카노가 추천. 수택동에서 가볍게 들르기 좋아.", price_hint: "", acidity: 0.7, body: 0.5, sweet: 0.4, taste_pick: "상큼한 아메리카노 좋아하면 — 또렷한 산미", tone: "gold" },
  { place_id: "ChIJ84fy8bOwfDURb13PWoXcHLI", name: "커피 기다림", area: "구리 인창동", address: "경기 구리시 건원대로34번길 11 102호", lat: 37.6046141, lng: 127.1407899, hours: "08:00–20:00", phone: "010-6706-8044", rating: 4.7, rating_count: 21, roasts_own: true, beans: "자가 블렌드 + 산지별 드립", signature: "직접 블렌드·핸드드립(6,000원)·바닐라라떼", uses: "작업,혼자,단골", vibe: "트렌디한 로스터리 카페", note: "직접 볶는 블렌드가 고소·스모키하고 깔끔한 집. 바닐라라떼도 평이 좋아. 드립은 산지 골라서. 서울 어디 내놔도 상위권이라는 단골 평.", price_hint: "핸드드립 6,000원", acidity: 0.5, body: 0.6, sweet: 0.6, taste_pick: "고소하고 깔끔한 드립 좋아하면 — 직접 볶은 블렌드", tone: "brown" },
  { place_id: "ChIJ5WNVXACxfDURYM50SwG9ROI", name: "퍼스트커피랩 수택점", area: "구리 수택동", address: "경기 구리시 이문안로83번길 26-1", lat: 37.5932934, lng: 127.1410524, hours: "확인 필요", phone: "", rating: 4.0, rating_count: 1, roasts_own: false, beans: "데일리 블렌드", signature: "베이커리 곁들인 미디엄 바디 커피", uses: "빵,수다,작업", vibe: "주택가 골목, 빵 있는 동네 카페", note: "주택가에 자리한, 갓 구운 빵을 곁들이기 좋은 동네 카페. 부드럽고 깔끔한 미디엄 바디. 빵까지 한 끼 챙기고 싶을 때.", price_hint: "", acidity: 0.4, body: 0.5, sweet: 0.5, taste_pick: "커피+빵 한 끼로 좋아하면 — 부드러운 미디엄 바디", tone: "cream" },

  // ── 상일동 (신규) ──
  { place_id: "ChIJFRiBn6ixfDURLwMFDzYxnoE", name: "카페 느루", area: "상일동", address: "서울 강동구 상일동 277-3", lat: 37.5493512, lng: 127.1714695, hours: "09:30–21:00 (토 휴무)", phone: "02-428-1213", rating: 4.5, rating_count: 73, roasts_own: false, beans: "데일리 블렌드", signature: "루프탑·홈메이드 쿠키·차", uses: "작업,수다,사진", vibe: "주택 개조 + 루프탑, 화분 가득", note: "주택을 개조한, 동네에서 드문 루프탑 카페. 화분이 가득해 책 읽거나 작업하기 좋고 사진도 예쁘게 나와. 날 좋을 때 강추.", price_hint: "", acidity: 0.5, body: 0.5, sweet: 0.5, taste_pick: "작업·사진 둘 다 원하면 — 루프탑 있는 곳", tone: "green" },
  { place_id: "ChIJV-F_puexfDURN7utPIHL2WE", name: "노스티 상일점", area: "상일동", address: "서울 강동구 상일로7길 11 1층", lat: 37.5498478, lng: 127.1722849, hours: "08:00–22:00", phone: "", rating: 4.7, rating_count: 13, roasts_own: false, beans: "커피 + 블렌딩 티 다양", signature: "제주 말차·블렌딩 티·커피", uses: "수다,혼자,작업", vibe: "성수동 감성의 깔끔한 신상 카페", note: "상일동 카페 격전지의 신상. 커피도 밀지만 차 메뉴가 강점이라, 커피 안 마시는 일행과 가도 좋아. 안 달고 깔끔한 맛.", price_hint: "", acidity: 0.4, body: 0.4, sweet: 0.4, taste_pick: "커피 안 마시는 일행과 함께면 — 차 메뉴 강점", tone: "steel" },
];

export async function GET() {
  try {
    await ensureSchema();
    // 사진 + 취향 컬럼 보장
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS photo_url TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS acidity REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS body REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS sweet REAL`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS taste_pick TEXT`;
    await sql`ALTER TABLE cafes ADD COLUMN IF NOT EXISTS tone TEXT`;

    for (const c of COLLECTED) {
      await sql`
        INSERT INTO cafes (place_id, name, area, address, lat, lng, hours, phone,
          rating, rating_count, roasts_own, beans, signature, uses, vibe, note, price_hint,
          acidity, body, sweet, taste_pick, tone, source, published)
        VALUES (${c.place_id}, ${c.name}, ${c.area}, ${c.address}, ${c.lat}, ${c.lng},
          ${c.hours}, ${c.phone}, ${c.rating}, ${c.rating_count}, ${c.roasts_own},
          ${c.beans}, ${c.signature}, ${c.uses}, ${c.vibe}, ${c.note}, ${c.price_hint},
          ${c.acidity}, ${c.body}, ${c.sweet}, ${c.taste_pick}, ${c.tone}, 'auto', true)
        ON CONFLICT (place_id) DO UPDATE SET
          area=EXCLUDED.area, beans=EXCLUDED.beans, signature=EXCLUDED.signature,
          uses=EXCLUDED.uses, vibe=EXCLUDED.vibe, note=EXCLUDED.note, price_hint=EXCLUDED.price_hint,
          acidity=EXCLUDED.acidity, body=EXCLUDED.body, sweet=EXCLUDED.sweet,
          taste_pick=EXCLUDED.taste_pick, tone=EXCLUDED.tone, updated_at=now()
      `;
    }
    const count = await sql`SELECT COUNT(*)::int AS n FROM cafes WHERE published=true`;
    const areas = await sql`SELECT area, COUNT(*)::int AS n FROM cafes WHERE published=true GROUP BY area ORDER BY n DESC`;
    return NextResponse.json({ ok: true, processed: COLLECTED.length, published_total: count[0].n, areas });
  } catch (e) {
    console.error("cafe-collect error:", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
