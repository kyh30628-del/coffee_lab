import BackLink from "../BackLink";
export const metadata = { title: "이용약관 · 동네 커피 노트" };

export default function TermsPage() {
  const updated = "2026-06-08";
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
            <h2 className="text-lg font-bold mb-2">3. YouTube API Services</h2>
            <p>본 서비스는 YouTube API Services를 사용하며, 이용 시 <a className="text-[#9c6b3f] underline" href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube 이용약관</a> 및 <a className="text-[#9c6b3f] underline" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google 개인정보처리방침</a>이 적용됩니다. 영상은 다운로드·재호스팅하지 않고 원본 YouTube로 링크합니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">4. 사장님 등록·쇼케이스</h2>
            <p>사장님이 등록·게시한 글·사진은 본인이 권리를 가진 자료여야 합니다. 허위·과장·타인 권리 침해 콘텐츠는 게시할 수 없으며, 검토 후 노출이 제한될 수 있습니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">5. 책임의 한계</h2>
            <p>본 서비스는 정보 제공을 목적으로 하며, 정보의 정확성·최신성을 보장하기 위해 노력하나 이용으로 발생한 결과에 대해 법이 허용하는 범위에서 책임을 지지 않습니다.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold mb-2">6. 문의</h2>
            <p>kyh30628@gmail.com</p>
          </section>
        </div>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
