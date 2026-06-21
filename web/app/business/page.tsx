import BackLink from "../BackLink";

export const metadata = { title: "사업자 정보·환불 정책 · 동네 커피 노트" };

// 전자상거래법 사업자정보 표시 + 환불·청약철회 정책 (유료 결제 도입용 골격).
// ⚠️ [입력 필요] 부분은 실제 사업자등록·통신판매업 신고 정보로 채운 뒤 공개하세요.
const FILL = "[입력 필요]";

export default function BusinessInfo() {
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-2xl mx-auto px-5 py-10">
        <BackLink to="/" label="홈" className="text-[#9c6b3f] mb-4" />
        <h1 className="text-3xl font-bold mb-1">사업자 정보 · 환불 정책</h1>
        <p className="text-[13px] text-[#8a7458] mb-8">전자상거래 등에서의 소비자보호에 관한 법률에 따른 표시 사항입니다.</p>

        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 mb-8 text-[12px] text-amber-800">
          ⚠️ <b>운영자 안내</b>: 유료 결제를 시작하기 전 아래 <b>[입력 필요]</b> 항목을 실제 사업자등록·통신판매업 신고 정보로 채우고, <b>통신판매업 신고</b>를 완료하세요. (무료 체험만 운영 중이면 결제 의무 표시는 약하지만, 유료 과금 시 필수입니다.)
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">1. 사업자 정보</h2>
          <table className="w-full text-[13px] border border-[#e6dcc8] rounded-lg overflow-hidden">
            <tbody>
              {[
                ["상호(서비스명)", `${FILL} (동네 커피 노트)`],
                ["대표자", FILL],
                ["사업자등록번호", FILL],
                ["통신판매업 신고번호", FILL],
                ["사업장 주소", FILL],
                ["고객센터 이메일", "kyh30628@gmail.com"],
                ["고객센터 전화", FILL],
                ["호스팅 제공자", "Vercel Inc."],
                ["결제대행(PG)", FILL],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-[#f0e6d4] last:border-0">
                  <th className="text-left align-top bg-[#faf4ea] px-3 py-2 w-40 font-bold text-[#52402e]">{k}</th>
                  <td className={`px-3 py-2 ${v === FILL ? "text-rose-500 font-bold" : "text-[#52402e]"}`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">2. 요금·결제</h2>
          <ul className="list-disc ml-5 space-y-1.5 text-[13px] text-[#52402e]">
            <li><b>7일 무료 체험</b>: 결제 없이 7일간 사장님 기능 이용. 체험은 <b>무료이므로 환불 대상이 아닙니다</b>. 체험 종료 시 자동으로 접근이 만료됩니다.</li>
            <li><b>우리가게 홍보팩(구독)</b>: 월 ₩9,900(부가세 포함 여부: {FILL}). 결제는 PG사를 통해 처리되며, 카드 등 민감 결제정보는 본 서비스가 보관하지 않습니다.</li>
            <li>구독은 별도 해지 전까지 <b>{FILL}(예: 매월 자동결제)</b> 됩니다. 해지는 사장님 화면 또는 고객센터로 요청할 수 있습니다.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">3. 청약철회·환불 정책</h2>
          <ul className="list-disc ml-5 space-y-1.5 text-[13px] text-[#52402e]">
            <li><b>원칙(청약철회)</b>: 결제일로부터 <b>7일 이내</b>에는 청약을 철회하고 전액 환불받을 수 있습니다. 단, 아래 ‘제한’에 해당하면 제한될 수 있습니다.</li>
            <li><b>제한</b>: 디지털 서비스 특성상 <b>홍보팩 기능(우선노출·쇼케이스 게시 등)을 이미 사용·개시</b>한 경우, 사용분에 대해서는 청약철회가 제한될 수 있습니다(전자상거래법 제17조 단서). 이 경우 <b>잔여기간 일할 계산 환불</b>을 적용합니다.</li>
            <li><b>일할 환불 예</b>: 월 구독 중도 해지 시 = 결제금액 × (잔여일수 ÷ 결제주기 일수). 위약금은 부과하지 않습니다.</li>
            <li><b>본 서비스 귀책</b>(장애·오류 등)으로 정상 이용이 불가했던 경우 해당 기간은 전액 환불 또는 기간 연장으로 보상합니다.</li>
            <li><b>환불 방법</b>: 원결제수단 취소를 원칙으로 하며, 영업일 기준 {FILL}일 이내 처리됩니다. 신청·문의: <b>kyh30628@gmail.com</b>.</li>
            <li><b>사칭·약관 위반으로 이용이 정지된 경우</b>, 위반에 따른 정지는 환불 사유에 해당하지 않을 수 있습니다(<a href="/terms" className="text-[#9c6b3f] underline">이용약관</a> 참조).</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-bold mb-3">4. 분쟁 해결</h2>
          <p className="text-[13px] text-[#52402e] leading-relaxed">소비자 분쟁은 <b>공정거래위원회 고시 ‘소비자분쟁해결기준’</b>에 따라 처리하며, 협의가 어려운 경우 <b>한국소비자원·전자거래분쟁조정위원회</b> 등에 조정을 신청할 수 있습니다. 1차 문의: <b>kyh30628@gmail.com</b>.</p>
        </section>

        <p className="text-[11px] text-[#a8927a] leading-relaxed">본 페이지는 전자상거래법상 표시 의무 이행을 돕기 위한 골격이며, 실제 공개 전 <b>사업자등록·통신판매업 신고 정보 기입</b>과 <b>법률 검토</b>를 권장합니다.</p>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
