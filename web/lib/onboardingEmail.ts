// 📧 구독 사장님 온보딩 메일 — 승인(체험·구독) 시 발송되는 '내 카페 열쇠' + 서비스 사용법 패키지.
//   단일 출처: app/api/subscription/route.ts(activate)와 scripts/resend-onboarding.mjs가 함께 쓴다.
//   톤: 동네 커피 노트(따뜻한 세리프·크림/커피색) · '손님 후기가 모인 우리 가게 이야기' 정서.
//   정직 원칙(pricing과 동일): 후기·등급은 모든 카페가 똑같이 검증된다. 홍보팩은 노출·홍보 도구이며 평가를 돈으로 바꾸지 않는다.

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export type OnboardingEmail = { subject: string; html: string };

// days<=7 → 체험 온보딩, 그 외 → 구독 온보딩. site는 프로토콜 포함 베이스 URL.
export function renderOnboardingEmail(opts: { cafeName: string; pin: string; days?: number; site?: string }): OnboardingEmail {
  const days = opts.days ?? 30;
  const site = (opts.site || "https://dongnecoffeenote.com").replace(/\/$/, "");
  const name = esc(opts.cafeName || "우리 카페");
  const pin = esc(opts.pin || "");
  const isTrial = days <= 7;

  const kicker = isTrial ? "7일 무료 체험이 시작됐어요" : "우리 가게 이야기가 시작됐어요";
  const intro = isTrial
    ? `우리 동네 누군가는 오늘도 사장님 가게의 커피 한 잔을 기억합니다. 손님들이 남긴 진심 어린 후기가 모여 만든 <b style="color:#5b4636">‘우리 가게 이야기’</b>를, 지금부터 <b style="color:#5b4636">7일 동안</b> 마음껏 들여다보세요.`
    : `수많은 손님이 남긴 진심이 모여 사장님 가게만의 색깔이 되었어요. 이제 그 이야기와 함께, 우리 가게를 더 오래 빛나게 해보세요.`;
  const footer = isTrial
    ? `지금 7일 무료 체험이 시작됐어요. 기간이 끝나도 구독으로 언제든 이어갈 수 있어요.`
    : `우리가게 홍보팩 구독이 시작됐어요. 함께해 주셔서 고맙습니다.`;
  const subject = isTrial
    ? `☕ ${opts.cafeName} 사장님, 우리 가게 이야기를 열어보세요 (7일 무료 체험 시작)`
    : `☕ ${opts.cafeName} 사장님, 우리 가게 이야기가 시작됐어요`;

  // 구독 사장님 전용 서비스 4종 — 아이콘·제목·설명·사용처. 실제 기능과 정확히 일치(과장 금지).
  const feature = (accent: string, icon: string, title: string, desc: string) => `
    <tr><td style="padding:0 28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbf6ec;border-left:3px solid ${accent};border-radius:10px;">
        <tr><td style="padding:13px 16px;">
          <div style="font-size:14.5px;font-weight:700;color:#2b2018;">${icon} ${title}</div>
          <div style="font-size:12.5px;color:#6b5a48;line-height:1.75;margin-top:5px;">${desc}</div>
        </td></tr>
      </table>
    </td></tr>`;

  const step = (n: string, text: string) => `
    <tr>
      <td width="26" valign="top" style="padding:3px 0;"><div style="width:20px;height:20px;border-radius:50%;background:#2b2018;color:#e8b87a;font-size:11px;font-weight:800;text-align:center;line-height:20px;">${n}</div></td>
      <td style="padding:3px 0 3px 8px;font-size:12.5px;color:#52402e;line-height:1.7;">${text}</td>
    </tr>`;

  const html = `<div style="margin:0;padding:0;background:#efe7d8;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe7d8;padding:32px 12px;"><tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;background:#fffdf9;border:1px solid #e7dcc6;border-radius:18px;overflow:hidden;font-family:'Nanum Myeongjo',Georgia,'Apple SD Gothic Neo',serif;">
        <tr><td style="background:#2b2018;padding:16px 28px;"><span style="color:#e8b87a;font-size:12px;letter-spacing:3px;">☕ 동네 커피 노트</span></td></tr>

        <tr><td style="padding:30px 28px 6px;">
          <div style="font-size:13px;color:#b07d3e;letter-spacing:0.5px;margin-bottom:8px;">${kicker}</div>
          <div style="font-size:22px;font-weight:700;color:#2b2018;line-height:1.4;">${name} 사장님,</div>
          <p style="font-size:15px;color:#52402e;line-height:1.9;margin:16px 0 0;">${intro}</p>
        </td></tr>

        <tr><td style="padding:22px 28px 6px;">
          <div style="background:#f4ece0;border:1px dashed #d8c4a3;border-radius:14px;padding:18px;text-align:center;">
            <div style="font-size:12px;color:#9c6b3f;letter-spacing:1px;margin-bottom:10px;">🔑 내 카페 열쇠</div>
            <div style="font-size:30px;font-weight:800;letter-spacing:8px;color:#2b2018;font-family:'Courier New',monospace;">${pin}</div>
          </div>
        </td></tr>
        <tr><td style="padding:10px 28px 22px;" align="center">
          <a href="${site}/owner" style="display:inline-block;background:#2b2018;color:#f4ece0;text-decoration:none;font-size:15px;font-weight:700;padding:14px 30px;border-radius:30px;">내 카페 이야기 보러 가기 →</a>
          <p style="font-size:12px;color:#a8927a;margin:14px 0 0;line-height:1.7;">화면에서 위 열쇠를 입력하면 <b style="color:#7c6a55;">내 카페로 바로</b> 들어가요.</p>
        </td></tr>

        <!-- 구독 사장님 전용 서비스 -->
        <tr><td style="padding:8px 28px 4px;">
          <div style="border-top:1px solid #efe2cd;padding-top:20px;">
            <div style="font-size:12px;color:#b07d3e;letter-spacing:1px;">사장님 전용 서비스</div>
            <div style="font-size:18px;font-weight:700;color:#2b2018;margin-top:4px;">이 네 가지를 마음껏 쓰세요</div>
          </div>
        </td></tr>
        <tr><td style="height:12px;"></td></tr>
        ${feature("#8a6d3b", "📊", "리뷰 분석 — 우리 가게를 숫자로",
          "손님 후기를 모아 <b>우리 동네 순위</b>, 우리 카페의 <b>성향 6축</b>(로스팅·작업·조용함·디저트·분위기·공간), 비슷한 카페, 12개월 리뷰 흐름을 보여드려요. 여기에 맞춘 <b>액션 플랜</b>(차별점·빈 포지션·보완점·순위 전략)까지. <span style='color:#9c6b3f'>→ 내 카페 화면에서 바로 확인</span>")}
        ${feature("#b0733e", "🎀", "쇼케이스 — 카페 상세 상단 홍보 배너",
          "우리 가게 상세페이지 <b>맨 위 배너</b>를 직접 꾸며요. 사진 3장 또는 <b>20초 홍보 영상</b>, <b>AI가 써주는 홍보 카피</b>와 <b>템플릿 10종</b>, <b>방문 혜택 쿠폰</b>까지. 노출·클릭·재생 <b>성과도 숫자</b>로 확인돼요. <span style='color:#9c6b3f'>→ 내 카페 화면 ‘쇼케이스’에서 꾸미기</span>")}
        ${feature("#c99a4e", "⭐", "우선 노출 — 손님 눈에 먼저",
          "구독 기간 동안 <b>지도 금색 핀</b>, 홈 <b>‘추천 카페’ 상단</b>, 근처에 온 손님에게 <b>가까운 카페로 자동 안내</b>돼요. 쇼케이스를 미리 꾸며두면 노출될 때 바로 빛나요. <span style='color:#9c6b3f'>→ 승인과 함께 자동 적용</span>")}
        ${feature("#7c6a55", "📰", "주간 뉴스레터 — 사장님을 위한 트렌드 레터",
          "매주 커피·디저트·동네 카페 <b>트렌드</b>와 바로 써먹는 <b>사장님 액션 플레이북</b>을 이메일로 보내드려요. <span style='color:#9c6b3f'>→ 별도 신청 없이 자동 수신(원하면 언제든 해지)</span>")}

        <!-- 시작 가이드 -->
        <tr><td style="padding:14px 28px 4px;">
          <div style="background:#faf4ea;border:1px solid #efe2cd;border-radius:12px;padding:16px 18px;">
            <div style="font-size:13.5px;font-weight:700;color:#2b2018;margin-bottom:10px;">이렇게 시작하세요</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${step("1", `위 <b>내 카페 열쇠</b>를 <a href="${site}/owner" style="color:#8a6d3b;">내 카페 화면</a>에 입력해 로그인`)}
              ${step("2", "<b>리뷰 분석</b>으로 우리 가게의 강점과 동네 순위 먼저 확인")}
              ${step("3", "<b>쇼케이스</b>에 사진·영상·쿠폰을 담아 우리 가게 매력 꾸미기")}
              ${step("4", "<b>뉴스레터</b>로 매주 트렌드를 받으며 손님 반응(성과) 지켜보기")}
            </table>
          </div>
        </td></tr>

        <tr><td style="padding:14px 28px 4px;">
          <p style="font-size:11.5px;color:#a8927a;line-height:1.8;margin:0;">손님에게 보이는 <b>후기·등급은 모든 카페가 똑같이 검증</b>돼요. 홍보팩은 <b>노출·홍보 도구</b>일 뿐, 후기 평가를 돈으로 바꾸지 않습니다. 그래서 손님이 믿고, 그 신뢰가 사장님 가게에도 힘이 됩니다.</p>
        </td></tr>

        <tr><td style="background:#faf4ea;border-top:1px solid #efe2cd;padding:18px 28px;margin-top:8px;">
          <p style="font-size:12px;color:#9c8569;margin:0;line-height:1.7;">${footer}</p>
          <p style="font-size:11px;color:#bcae98;margin:8px 0 0;">열쇠는 본인만 알 수 있게 보관해 주세요 · 문의 kyh30628@gmail.com</p>
        </td></tr>
      </table>
      <div style="font-size:11px;color:#b3a489;margin-top:14px;font-family:'Apple SD Gothic Neo',serif;">동네 커피 노트 · 진짜 후기로 고른 우리 동네 카페</div>
    </td></tr></table>
  </div>`;

  return { subject, html };
}
