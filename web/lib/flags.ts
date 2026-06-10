// 구독 라이브 스위치. SUBSCRIPTION_LIVE=true 일 때만 소비자에게 featured·쇼케이스·쿠폰·지오프로모 노출.
// 미설정(기본): 구독 기능은 관리자에서만 관리·확인되고 소비자 사이트엔 안 뜸(실서비스 오픈 전 안전장치).
export const subscriptionLive = () => process.env.SUBSCRIPTION_LIVE === "true";
