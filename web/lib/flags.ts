// 구독 라이브 스위치 — 기본 ON(자동). 구독이 활성화(첫 로그인→featured)되면 소비자 노출이 자동으로 살아난다.
//   노출 대상은 featured=true·approved·featured_until>now 인 카페뿐이라, 활성 구독자가 없으면 자동으로 아무것도 안 보인다(자체 게이팅).
//   → 별도로 켤 필요 없음. SUBSCRIPTION_LIVE=false 를 명시했을 때만 비상 차단(킬스위치).
export const subscriptionLive = () => process.env.SUBSCRIPTION_LIVE !== "false";
