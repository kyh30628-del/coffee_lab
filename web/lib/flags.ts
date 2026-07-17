// 구독 라이브 스위치 — 기본 ON(자동). 구독이 활성화(첫 로그인→featured)되면 소비자 노출이 자동으로 살아난다.
//   노출 대상은 featured=true·approved·featured_until>now 인 카페뿐이라, 활성 구독자가 없으면 자동으로 아무것도 안 보인다(자체 게이팅).
//   → 별도로 켤 필요 없음. SUBSCRIPTION_LIVE=false 를 명시했을 때만 비상 차단(킬스위치).
export const subscriptionLive = () => process.env.SUBSCRIPTION_LIVE !== "false";

// 💳 결제 라이브 스위치 — 기본 OFF(명시적 opt-in). subscriptionLive와 반대 극성:
//   실제 과금은 안전하게 기본 꺼짐. true여야 카드등록 버튼 노출 + cron-billing 실제 과금.
//   라이브 컷오버: 라이브 토스키 세팅 후 PAYMENTS_LIVE=true. 롤백=이 값 제거(과금 즉시 중단, 빌링키·데이터 보존).
export const paymentsLive = () => process.env.PAYMENTS_LIVE === "true";

// 🏦 계좌이체 안내메일 스위치 — 기본 OFF(대표님 지시로 발송 중단). paymentsLive와 같은 극성(명시적 opt-in).
//   off여도 신청·구독 레코드는 정상 처리되고 '이메일 발송만' 스킵된다(삭제 아닌 비활성화 — 문구·템플릿 보존).
//   재개: Vercel 환경변수 BANK_TRANSFER_EMAIL_ENABLED=on. 중단: 이 값 제거(기본 off).
export const bankTransferEmailEnabled = () => process.env.BANK_TRANSFER_EMAIL_ENABLED === "on";
