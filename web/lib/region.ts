import { sql } from "@/lib/db";

// 🗺️ 동네(구/시) 분류·집계 단일 출처.
//   DB의 area 컬럼은 이미 깨끗한 동네 키다: 서울="마포구", 경기="수원시", 인천="인천 남동구"(인천만 접두).
//   (공개 66개 area 전부 `^(인천 )?…(구|시|군)$` 형태 — 실측 확인.)
//   → area를 그대로 키로 쓴다. 예전 REGIONS 부분매칭 guOf가 오히려 깨끗한 키를 망가뜨렸다:
//     "인천 남동구".includes("동구")=true → "인천 동구"로 오분류 / "인천 중구"·"서울 중구"를 "중구"로 병합.
//   화면(오너 리포트·공유 리포트)이 반드시 이 함수 하나만 쓰게 해 동네 순위·곳수가 화면마다 어긋나지 않게 한다.
export function guOf(area: string | null | undefined): string {
  return (area ?? "").trim();
}

// 동네 공개 카페 곳수 — 지역 페이지 "N곳" 카피의 단일 출처(표시 리스트 길이 30을 곳수로 오용 금지).
export async function regionPublishedCount(area: string): Promise<number> {
  try { return Number(((await sql`SELECT count(*)::int n FROM cafes WHERE published AND area=${area}`)[0] as any)?.n ?? 0); }
  catch { return 0; }
}
