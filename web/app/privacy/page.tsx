import BackLink from "../BackLink";
export const metadata = { title: "개인정보처리방침 · 동네 커피 노트" };

export default function PrivacyPage() {
  const updated = "2026-06-13";
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-2xl mx-auto px-6 py-12">
        <BackLink to="/" label="홈" className="text-[#9c6b3f] mb-4" />
        <div className="text-[#9c6b3f] text-xs tracking-[0.3em] uppercase mb-2">Privacy Policy</div>
        <h1 className="text-3xl font-bold mb-1">개인정보처리방침</h1>
        <p className="text-[13px] text-[#8a7458] mb-8">동네 커피 노트 (Dongne Coffee Note) · 최종 업데이트 {updated}</p>

        <div className="space-y-7 text-[14px] leading-relaxed text-[#3d2f22]">
          <section>
            <h2 className="text-lg font-bold mb-2">1. 우리가 수집하는 것 (개인정보 최소화)</h2>
            <p>동네 커피 노트는 <b>이름·연락처·정밀 위치 등 개인을 식별하는 정보를 수집하지 않습니다.</b> 서비스 제공에 필요한 최소한만 익명으로 처리합니다.</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><b>대략적 위치(선택)</b>: ‘내 위치’ 기능 사용 시, 가까운 동네(시·군·구)를 보여주기 위해 <b>약 500m로 뭉뚱그린 좌표만</b> 익명으로 저장합니다. 정밀 좌표는 저장하지 않습니다. 동의는 선택이며 언제든 끌 수 있습니다.</li>
              <li><b>익명 방문 식별자</b>: 중복 집계를 막기 위한 무작위 브라우저 식별자(개인과 연결 불가).</li>
              <li><b>내 카페 등록 시 현재 위치(인증 목적)</b>: ‘내 카페’ 등록 시, 실제 그 카페를 방문했는지 확인하기 위해 <b>현재 위치를 카페 좌표와 비교(30m 이내)하는 순간에만 사용</b>합니다. <b>사용자의 정밀 좌표는 저장하지 않으며</b>, 인증 통과/실패 결과만 기록합니다. 동의는 선택이며, 위치 권한을 거부하면 등록만 안 될 뿐 다른 서비스는 그대로 이용할 수 있습니다.</li>
              <li><b>내 카페 등록 사진(선택)</b>: 이용자가 직접 올린 사진은 등록한 카페와 함께 저장·표시됩니다. <b>타인의 얼굴·개인정보가 담긴 사진은 올리지 마세요.</b> 브라우저 데이터 삭제 또는 요청 시 파기합니다.</li>
              <li><b>내 카페 기억(추억) 텍스트(선택)</b>: 이용자가 직접 적은 카페 경험 메모는 익명 식별자와 함께 저장됩니다. 개인을 식별하는 내용은 적지 마세요.</li>
              <li><b>기억 백업 코드(선택)</b>: 다른 기기에서 내 기록을 불러오기 위한 <b>무작위 코드(예: COFFEE-XXXX)</b>로, 이름·이메일 등 개인정보와 연결되지 않습니다. 코드를 분실하면 우리도 누구의 것인지 알 수 없어 복구가 불가능합니다. 회원가입은 필요하지 않습니다.</li>
              <li><b>내 기록 내보내기(PDF·JSON)</b>: 이용자가 원하면 본인의 기록을 <b>본인 기기로만</b> 내려받아 보관할 수 있습니다. 내보낸 파일은 서버에 전송·저장되지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">2. 이용 목적</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>내 동네 카페 추천·필터 등 서비스 제공</li>
              <li>지역별 수요 통계(익명 집계)로 서비스 개선</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">3. YouTube API Services 이용</h2>
            <p>본 서비스는 <b>YouTube API Services</b>를 사용합니다. 이용으로써 사용자는 <a className="text-[#9c6b3f] underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 이용약관</a>에 동의하는 것으로 간주됩니다.</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>우리는 카페 관련 <b>공개 영상의 메타데이터(제목·설명·게시일)와 상위 댓글의 ‘텍스트’만</b> 조회·표시하며, <b>영상 파일을 다운로드·저장·재호스팅하지 않습니다.</b></li>
              <li><b>댓글 작성자의 아이디·채널·프로필 등 개인 식별정보는 수집·저장하지 않습니다</b>(댓글 텍스트만, @멘션도 제거). 사용자를 추적·식별하거나 프로필을 만들지 않습니다.</li>
              <li>영상 출처로 표기되는 <b>채널명은 저작자 표시(attribution)</b> 목적이며, 영상은 항상 <b>원본 YouTube로 링크(▶ 영상 보기)</b>됩니다. 영상 시청에 <b>요금·구독·로그인 등 어떤 제한도 두지 않습니다.</b></li>
              <li>받은 API 데이터는 <b>교차검증 목적의 캐시</b>로만 두고 주기적으로 갱신하며, 정책 한도(통상 30일) 내 보관 후 갱신·파기합니다. 삭제 요청 시 30일 내 처리합니다.</li>
              <li>본 서비스는 <a className="text-[#9c6b3f] underline" href="https://developers.google.com/youtube/terms/api-services-terms-of-service" target="_blank" rel="noopener noreferrer">YouTube API Services 약관</a> 및 <a className="text-[#9c6b3f] underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>을 준수합니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. 후기 데이터의 출처</h2>
            <p>카페 정보는 네이버·구글·YouTube 등 <b>공개 검색 API</b>로 수집한 후기를 교차검증한 것입니다. 원문을 복제·재호스팅하지 않고 <b>인용 한 줄 + 출처 링크 + 날짜</b>만 보존하며, 원문은 항상 출처로 연결합니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. 보관 및 파기</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>익명 위치·방문 데이터는 동의 철회 또는 브라우저 데이터 삭제 시까지 보관 후 파기합니다.</li>
              <li>YouTube로부터 받은 API 데이터는 관련 정책이 정한 한도(통상 30일) 내에서만 캐시하며, 그 외에는 원본 링크로 대체합니다. 사용자는 위 ‘내 위치 끄기’ 또는 브라우저 사이트 데이터 삭제로 본인 관련 익명 데이터를 삭제할 수 있습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. 제3자 제공·판매</h2>
            <p><b>일절 없습니다.</b> 수집한 익명 데이터를 제3자에게 판매·공유하지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">7. 사장님 회원·구독 서비스 (해당 시)</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>사장님이 카페 등록·쇼케이스·유료 구독을 이용할 때는 <b>이름·이메일·연락처·가게 정보</b>와, 결제 시 <b>결제대행사(PG)를 통한 결제 정보</b>가 처리될 수 있습니다. (카드번호 등 민감 결제정보는 PG사가 처리하며 본 서비스는 보관하지 않습니다.)</li>
              <li><b>사장님 본인확인(사칭 방지)</b>을 위해 <b>사업자등록증 사본(상호·대표자명·사업자등록번호·소재지)</b>, 본인확인 <b>동의 기록</b>, 부정 신청 방지·분쟁 대응을 위한 <b>접속기록(IP·접속시각·기기정보)</b>을 수집·보관합니다. 이용 목적은 <b>사업주 본인확인, 사칭·명의도용 방지, 분쟁 대응</b>에 한합니다.</li>
              <li><b>주민등록번호는 수집하지 않습니다.</b> 제출 서류에 주민등록번호 등 불필요한 민감정보가 있으면 <b>가린 뒤</b> 올려 주세요(미가림 시 본 서비스가 마스킹·삭제할 수 있습니다).</li>
              <li><b>이용 목적</b>: 회원 식별·구독 관리·결제·고객지원·본인확인. <b>보유기간</b>: 회원 탈퇴 또는 목적 달성 시까지이며, 본인확인 서류·접속기록은 <b>분쟁 대비를 위해 구독/체험 종료 후 일정 기간(분쟁 시효 범위 내) 보관 후 파기</b>합니다(관계 법령상 보존의무가 있으면 그 기간).</li>
              <li>업로드한 홍보 영상·사진·글은 <b>승인 후 카페 상세에 공개</b>되며, 사장님 요청 시 내려집니다. (사업자등록증 등 <b>본인확인 서류는 공개되지 않습니다</b>.)</li>
              <li>접근 통제·암호화 등 합리적 <b>안전조치</b>를 적용하며, 제3자에게 판매하지 않습니다.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">8. 문의</h2>
            <p>개인정보 관련 문의: <b>dongnecoffeenote@gmail.com</b></p>
          </section>
        </div>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
