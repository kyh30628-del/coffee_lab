// 🎁 사장님 요금제 상수 — **체험 기간의 단일 출처**.
//
// 왜 상수로 묶나: 체험/유료 구분이 `duration_days <= 7`로 **4곳에 흩어져** 있었다
//   (subscription/route.ts · onboardingEmail.ts · admin/page.tsx · BillingManage.tsx).
//   기간을 바꿀 때 한 곳이라도 놓치면 15일 체험이 '유료 구독'으로 오분류되어
//   ①시작 시점이 첫 로그인이 아니라 승인 시점이 되고 ②유료 온보딩 메일이 나가고
//   ③관제탑 배지가 '구독중'으로 뜬다. 그래서 여기 하나만 고치면 전부 따라오게 만든다.
//
// 2026-08-26 CEO 확정: 체험 7일 → **15일**. (30일 제안했으나 15일로 결정.)
//   근거: 15일이면 신규 후기 기대값 ≈2건 — 체험 중에 "감시 상품"의 가치를 실제로 한 번은 보게 된다.

/** 무료 체험 일수. 이 값 하나가 승인·메일·배지·약관 문구를 모두 결정한다. */
export const TRIAL_DAYS = 15;

/**
 * 저장된 이용기간이 '체험'인가.
 * ⚠️ 경계값 주의: 유료 플랜은 30일이라 `<= TRIAL_DAYS`로 안전하게 갈린다.
 *   훗날 TRIAL_DAYS 이하 길이의 **유료** 플랜을 만들면 이 판정으로는 구분할 수 없다
 *   — 그때는 subscriptions에 plan 종류 컬럼을 두고 그것으로 갈라야 한다(기간으로 추론 금지).
 */
export function isTrialDuration(days: number | null | undefined): boolean {
  return (days ?? 30) <= TRIAL_DAYS;
}
