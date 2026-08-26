// 🗺️ 서비스 범위 **단일 출처** — "어디까지가 우리 서비스인가"를 여기 하나로 둔다.
//
// 왜 만들었나(2026-08-26): 같은 목록이 세 군데에 복제돼 있었고, 강원을 편입하자 두 곳이 뒤처져
//   **정상 공개된 강원 카페 139곳을 "비수도권 주소 공개"·"박스 밖 공개"로 HIGH 경보**했다.
//   관제탑에 빨간불이 뜨는데 실제로는 소비자 손상이 없는 오경보 — 경보의 신뢰를 깎는 최악의 형태다.
//     · lib/synthStore.ts healOutOfBox  (강원 제외 완료)
//     · lib/issues.ts integ:noncap      (강원 포함된 채 방치 → 오경보)
//     · app/api/cron-selfaudit          (강원 포함된 채 방치 → 오경보)
//   드리프트를 막는 방법은 하나뿐이다: **목록을 한 곳에만 둔다.**
//
// ⚠️ 좌표 박스는 여기 적지 않는다 — criteria(DB) 단일출처를 getCriterionSync로 읽어라.
//   하드코딩하면 무배포로 박스를 넓혀도 이 경보만 옛 값을 써서 또 오경보가 난다(실제로 그랬다).

/** 서비스 범위 **밖**인 시·도 주소 접두. 여기 없는 시·도는 서비스 범위 안이라는 뜻이다. */
export const OUT_OF_SCOPE_PREFIXES = [
  "충청", "충북", "충남",
  "전라", "전북", "전남",
  "경상", "경북", "경남",
  "대전", "대구", "부산", "울산", "세종", "제주",
  "광주광역시", // '경기 광주시'와 구분하려고 광역시만
] as const;
// 서비스 범위 안: 서울·경기·인천 + 강원(2026-08-25 편입). lib/regionList.ts의 SIDO_GU와 짝을 이룬다.

/** `address LIKE ...` OR 절 — SQL 조각으로 그대로 끼워 쓴다(태그드 템플릿은 조각 합성이 안 되므로 문자열). */
export const OUT_OF_SCOPE_SQL = OUT_OF_SCOPE_PREFIXES.map((p) => `address LIKE '${p}%'`).join(" OR ");

/** 좌표 박스 SQL 조각 — criteria(DB) 단일출처를 읽어 만든다. 하드코딩 금지.
 *  ⚠️ 태그드 템플릿(sql`…`)은 조각 합성이 안 되므로 sql.query(문자열)와 함께 쓴다.
 *  호출 전 loadCriteria()로 캐시를 프라임할 것(안 하면 DEFAULTS 폴백값이 쓰인다). */
export function geoBoxSql(g: (k: string) => number, col = { lat: "lat", lng: "lng" }): string {
  return `${col.lat} BETWEEN ${g("geo.box.lat_min")} AND ${g("geo.box.lat_max")} AND ${col.lng} BETWEEN ${g("geo.box.lng_min")} AND ${g("geo.box.lng_max")}`;
}
