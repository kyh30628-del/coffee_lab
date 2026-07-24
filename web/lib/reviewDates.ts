// 검증 후기 게시일(review_dates) 기반 최근성 유틸 — momentum·discover 공용(DRY).
// review_dates는 "2026.07.20" 형태 문자열 배열(JSONB). '.'→'-' 치환 후 파싱해 최근 N일 건수 집계.
export const recentN = (dates: unknown, days: number): number => {
  if (!Array.isArray(dates)) return 0;
  const cut = Date.now() - days * 86400000;
  let n = 0;
  for (const d of dates) {
    const t = Date.parse(String(d).replace(/\./g, "-"));
    if (!isNaN(t) && t >= cut) n++;
  }
  return n;
};
