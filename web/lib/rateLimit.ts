// 공개 API IP 레이트리밋 — 결재#1079(협업#415): 09-12 cron-costwatch 338.6GB 재경보 근본원인이
//   /api/search 정상 프로덕션 경로에 대한 봇 추정 트래픽(하루 916건, 평시 대비 ~100배)이었다.
//   #1063(0건 결과도 캐시)은 "같은 질의 반복"만 막아, 질의를 바꿔가며 훑는 봇엔 무방비였다.
//   인스턴스 로컬 메모리 슬라이딩 윈도우: Fluid Compute가 인스턴스를 재사용해 기본 방어선으로 충분하고,
//   외부 스토어(Upstash 등) 신규 연동 없이 무배포 코드만으로 즉시 적용 가능하다.
const buckets = new Map<string, { count: number; resetAt: number }>();

const MAX_BUCKETS = 20_000; // 메모리 상한 — 넘으면 가장 오래된 항목부터 정리(무한증가 방지)

export type RateLimitResult = { allowed: boolean; remaining: number; resetMs: number };

export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (buckets.size > MAX_BUCKETS) {
    let toDelete = buckets.size - MAX_BUCKETS;
    for (const k of buckets.keys()) {
      if (toDelete-- <= 0) break;
      buckets.delete(k);
    }
  }
  return { allowed: b.count <= max, remaining: Math.max(0, max - b.count), resetMs: Math.max(0, b.resetAt - now) };
}
