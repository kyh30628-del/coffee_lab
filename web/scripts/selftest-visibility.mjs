// 👁️ "저장했는데 화면에 안 보이는가" 자동 점검 — DB 접속 O · 하루 1회 크론이 호출.
//
// 왜 만들었나(2026-08-24, CEO 지적):
//   사장님의 카페 추억이 **한 달 넘게 지도에서 안 보였는데 아무도 몰랐다.**
//   데이터는 멀쩡했고(7건 전부 정상) 문제는 전부 화면 코드였다 —
//   ①클러스터에 흡수 ②줌아웃 시 미표시 ③지역 필터에 갇힘. 세 경로 모두 조용히 실패했다.
//   지표가 0이면 "수요가 없다"로 오해하게 된다 — 실제로 나는 그렇게 오판했다.
//
// 이 점검이 잡는 것: **저장 데이터가 화면에 도달할 수 있는 상태인지**를 매일 확인한다.
//   (렌더링 코드 자체는 못 보지만, "표시 불가 조건"에 걸린 데이터는 전부 잡는다)
export async function checkVisibility(sql) {
  const problems = [];

  // ① 내 카페 기록 — 지도 핀이 그려지려면 카페가 공개·좌표 보유여야 한다
  const visits = await sql`SELECT v.id, v.cafe_id, c.name, c.published, c.lat, c.lng
    FROM user_visits v LEFT JOIN cafes c ON c.id = v.cafe_id`;
  for (const v of visits) {
    if (!v.name) problems.push({ kind: "내카페", id: v.id, why: "카페가 DB에서 사라짐" });
    else if (!v.published) problems.push({ kind: "내카페", id: v.id, why: `${v.name} 비공개 → 지도 목록에서 빠짐` });
    else if (!v.lat || !v.lng) problems.push({ kind: "내카페", id: v.id, why: `${v.name} 좌표 없음 → 핀 불가` });
  }

  // ② 즐겨찾기(찜) — 목록·핀 모두 cafes에 있어야 뜬다
  const marks = await sql`SELECT b.id, b.cafe_id, c.name, c.published, c.lat, c.lng
    FROM bookmarks b LEFT JOIN cafes c ON c.id = b.cafe_id`;
  for (const b of marks) {
    if (!b.name) problems.push({ kind: "찜", id: b.id, why: "카페가 DB에서 사라짐" });
    else if (!b.published) problems.push({ kind: "찜", id: b.id, why: `${b.name} 비공개 → 목록에서 빠짐` });
    else if (!b.lat || !b.lng) problems.push({ kind: "찜", id: b.id, why: `${b.name} 좌표 없음` });
  }

  // ③ 공개 방문기 — is_public·finalized·verified 다 참인데 카페가 비공개면 영영 안 보인다
  const pub = await sql`SELECT v.id, c.name, c.published FROM user_visits v JOIN cafes c ON c.id = v.cafe_id
    WHERE v.is_public AND v.finalized AND v.verified AND NOT c.published`;
  for (const p of pub) problems.push({ kind: "공개방문기", id: p.id, why: `${p.name} 카페가 비공개라 노출 불가` });

  return { ok: problems.length === 0, count: problems.length, problems: problems.slice(0, 20),
    checked: { visits: visits.length, bookmarks: marks.length } };
}
