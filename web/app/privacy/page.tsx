import BackLink from "../BackLink";
export const metadata = { title: "개인정보처리방침 · 동네 커피 노트" };

export default function PrivacyPage() {
  const updated = "2026-06-08";
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
              <li>우리는 카페 관련 <b>공개 영상의 메타데이터(제목·설명·게시일·상위 댓글)만</b> 조회·표시하며, <b>영상 파일을 다운로드·저장·재호스팅하지 않습니다.</b></li>
              <li>영상은 항상 <b>원본 YouTube로 링크(▶ 영상 보기)</b>합니다.</li>
              <li>Google이 수집·이용하는 정보는 <a className="text-[#9c6b3f] underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>을 따릅니다.</li>
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
            <h2 className="text-lg font-bold mb-2">7. 문의</h2>
            <p>개인정보 관련 문의: <b>kyh30628@gmail.com</b></p>
          </section>
        </div>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
