import BackLink from "../BackLink";
export const metadata = { title: "이용약관 · 동네 커피 노트" };

export default function TermsPage() {
  const updated = "2026-06-21";
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <BackLink to="/" label="홈" className="text-[#9c6b3f] mb-4" />
        <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">Terms of Service</div>
        <h1 className="text-3xl font-bold mb-1">이용약관</h1>
        <p className="text-[13px] text-[#8a7458] mb-8">동네 커피 노트 (Dongne Coffee Note) · 최종 업데이트 {updated}</p>

        <div className="space-y-7 text-[14px] leading-relaxed text-[#3d2f22]">
          <section>
            <h2 className="text-lg font-bold mb-2">1. 서비스 개요</h2>
            <p>동네 커피 노트는 네이버·구글·YouTube 등 공개 후기를 교차검증해 수도권 동네 카페를 안내하는 무료 정보 서비스입니다. 카페를 직접 운영·판매하지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. 정보의 성격</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>제공되는 등급·성격·통계는 <b>공개 후기에서 추출한 참고 정보</b>이며, 측정값이나 절대적 평가가 아닙니다.</li>
              <li>모든 수치에는 출처·근거가 함께 표시됩니다. 실제 카페 운영 정보(영업시간·메뉴 등)는 변동될 수 있으니 방문 전 확인을 권장합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. 데이터 출처와 인용 원칙</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>카페 정보는 <b>네이버·구글·YouTube 등 공개 API</b>로 수집한 후기를 교차검증한 것입니다. 각 출처의 이용약관을 준수하며, <b>원문을 복제·재호스팅하지 않고 한 줄 인용 + 출처 링크 + 날짜</b>만 표시해 항상 원문으로 연결합니다.</li>
              <li>수집한 글은 <b>영구 보관하지 않습니다.</b> 분석을 위해 <b>한시적으로만 캐시</b>하고 주기적으로(약 90일) <b>갱신·파기</b>하며, 이용자에게 보여지는 것은 우리가 산출한 <b>분석 결과 + 최소 인용(1줄)·출처 링크</b>입니다.</li>
              <li>YouTube 관련 사용에는 <a className="text-[#9c6b3f] underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 이용약관</a>·<a className="text-[#9c6b3f] underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>이 적용되며, 영상은 다운로드·재호스팅 없이 원본으로 링크하고 시청에 어떤 제한도 두지 않습니다.</li>
              <li>본인 또는 원저작자가 게시물의 <b>삭제·표시중단을 요청</b>하면 신속히(통상 30일 내) 처리합니다. 문의: kyh30628@gmail.com</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. 사장님 등록·쇼케이스·영상</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>사장님이 등록·게시·업로드한 글·사진·<b>영상</b>은 <b>본인이 권리를 가진 자료</b>여야 합니다. 허위·과장·타인 권리 침해 콘텐츠는 게시할 수 없고, 관리자 검토 후 노출이 제한될 수 있습니다.</li>
              <li>업로드 <b>영상에 포함된 음원·배경음악·타인 영상 등의 저작권 처리 책임은 사장님</b>에게 있습니다. 분쟁 발생 시 해당 콘텐츠는 즉시 비공개될 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. 사장님 본인확인·사칭 금지</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>체험·구독을 신청하는 사람은 <b>해당 매장의 사업주이거나 정당한 운영 권한자</b>여야 하며, 신청 시 <b>사업자등록증 등 본인확인 자료</b>를 사실대로 제출하고 본인확인에 동의해야 합니다.</li>
              <li><b>타인 매장의 사칭·명의도용, 허위·위조 서류 제출, 권한 없는 신청은 금지</b>됩니다. 이를 위반한 신청·게시로 발생한 <b>모든 책임은 신청자 본인</b>에게 있으며, 신청자는 그로 인한 본 서비스·해당 매장·제3자의 손해를 배상할 책임을 집니다.</li>
              <li>본 서비스는 제출 서류의 <b>합리적 대조·검토</b>를 거쳐 승인하나, 신청자가 제출한 정보의 진위를 전부 보증하지는 않습니다. 본 서비스는 <b>고의 또는 중대한 과실이 없는 한</b>, 신청자의 허위·사칭으로 인한 손해에 대해 책임지지 않습니다.</li>
              <li><b>권리침해 신고·즉시 조치</b>: 본인 매장이 도용되었거나 권리가 침해된 경우 <b>kyh30628@gmail.com</b>으로 신고할 수 있으며, 본 서비스는 확인 즉시 해당 계정의 <b>노출 중지·이용 정지·자료 비공개</b> 등 필요한 조치를 취합니다.</li>
              <li>허위·사칭이 확인되면 사전 통지 없이 <b>이용 제한·해지</b>될 수 있고, 수집된 본인확인 자료·접속기록은 <b>분쟁 대응·수사 협조</b> 목적으로 보관·제공될 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. 유료서비스·정기결제·해지·환불</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li><b>7일 무료 체험</b>: 결제 없이 7일간 사장님 기능을 이용합니다. 무료이므로 환불 대상이 아니며, 기간 종료 시 자동으로 접근이 만료됩니다.</li>
              <li><b>우리가게 홍보팩(유료 구독)</b>: 회원이 등록한 결제수단으로 <b>월 단위 요금이 자동 결제·자동 갱신</b>됩니다. 결제 전 금액·주기·갱신 방식을 고지합니다.</li>
              <li><b>요금 증액 또는 무료→유료 전환</b> 시에는 <b>시행 전 사전에 동의</b>를 받으며, 동의하지 않으면 정기결제는 진행되지 않습니다.</li>
              <li><b>해지</b>: 사장님 화면 또는 고객센터(kyh30628@gmail.com)로 언제든 <b>해지(차기 결제 중지) 또는 즉시 해지</b>할 수 있습니다.</li>
              <li><b>청약철회·환불</b>은 <a href="/business" className="text-[#9c6b3f] underline">「사업자정보·환불 정책」</a>에 따릅니다. 디지털 서비스 특성상 <b>이미 사용·개시한 기능</b>은 청약철회가 제한될 수 있으나, 본 서비스는 <b>7일 무료 체험(시험 사용)</b>을 제공하여 철회권 행사가 방해되지 않도록 합니다(「전자상거래법」 제17조). 환불은 <b>원결제수단으로 3영업일 이내</b> 처리하며, 정당한 사유 없이 지연 시 법정 지연배상금(연 15%)을 더해 지급합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. 약관 변경·회원 탈퇴·이용 제한</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>본 약관을 개정할 때는 <b>시행일 7일 전</b>(회원에게 불리하거나 중대한 변경은 <b>30일 전</b>) 서비스 내 공지하며, 시행일까지 거부 의사를 표시하지 않으면 동의한 것으로 봅니다. 동의하지 않는 회원은 이용계약을 해지할 수 있습니다.</li>
              <li>회원은 언제든지 <b>탈퇴</b>할 수 있습니다. 본 서비스는 약관 위반, <b>사칭·허위 신청</b>, 관계 법령 위반이 있는 경우 사전 통지 없이 이용을 <b>제한·정지·해지</b>할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. 책임의 한계</h2>
            <p>본 서비스는 정보 제공을 목적으로 하며, 정보의 정확성·최신성을 보장하기 위해 노력하나 이용으로 발생한 결과에 대해 법이 허용하는 범위에서 책임을 지지 않습니다. 천재지변·통신장애 등 불가항력, 회원의 귀책으로 인한 손해, 회원 상호 간 또는 회원과 제3자 간 분쟁에 대해서는 책임지지 않습니다. 사장님이 제출·게시한 정보의 진위와 그로 인한 분쟁의 책임은 해당 사장님에게 있습니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">9. 분쟁 해결·준거법</h2>
            <p>본 약관은 <b>대한민국 법</b>을 준거법으로 합니다. 분쟁은 우선 협의로 해결하되, 미해결 시 공정거래위원회 「소비자분쟁해결기준」 및 <b>한국소비자원·전자거래/콘텐츠분쟁조정위원회</b>의 조정을 신청할 수 있으며, 소(訴)는 「민사소송법」상 관할 법원에 제기합니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">10. 문의</h2>
            <p>kyh30628@gmail.com</p>
          </section>
        </div>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
