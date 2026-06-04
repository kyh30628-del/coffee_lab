import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-2xl mx-auto px-6 py-16">
        {/* 히어로 */}
        <header className="mb-14">
          <div className="text-[#9c6b3f] text-xs tracking-[0.4em] uppercase mb-4">Neighborhood Coffee Guide</div>
          <h1 className="text-5xl font-bold leading-[1.15]">
            동네 커피 노트
          </h1>
          <p className="text-[#6b5a48] mt-5 text-lg leading-relaxed">
            프랜차이즈 말고, 내 동네에 숨어 있는 진짜 좋은 커피.
            별점이 아니라 커피 좀 아는 사람이 직접 골라 적었습니다.
          </p>
        </header>

        {/* 두 갈래 진입 */}
        <div className="space-y-4">
          <Link href="/cafe" className="group block bg-[#fdfaf4] rounded-2xl p-7 border border-[#ece0cd] shadow-[0_2px_20px_rgba(80,50,20,0.06)] hover:border-[#9c6b3f] transition-colors">
            <div className="text-[#9c6b3f] text-xs tracking-widest uppercase mb-2">커피 마실 곳 찾기</div>
            <h2 className="text-2xl font-bold mb-2">강동 동네 카페 둘러보기</h2>
            <p className="text-[#6b5a48] text-[15px] leading-relaxed mb-4">
              오늘 뭐 하러 가는지(작업·수다·혼자) 고르면, 거기 맞는 동네 로스터리를 안목 담긴 노트와 함께 보여드려요.
            </p>
            <span className="text-[#9c6b3f] font-medium text-sm group-hover:underline">가이드 열기 →</span>
          </Link>

          <Link href="/cafe/register" className="group block bg-[#2b2018] text-[#f4ece0] rounded-2xl p-7 hover:bg-[#3d2f22] transition-colors">
            <div className="text-[#d4a574] text-xs tracking-widest uppercase mb-2">사장님이세요?</div>
            <h2 className="text-2xl font-bold mb-2">우리 가게 소개하기</h2>
            <p className="text-[#cbb89f] text-[15px] leading-relaxed mb-4">
              광고가 아니라, 커피를 아는 손님에게 우리 가게의 결을 전하는 안내. 무료로 등록하세요.
            </p>
            <span className="text-[#d4a574] font-medium text-sm group-hover:underline">가게 등록하기 →</span>
          </Link>
        </div>

        {/* 우리가 다른 점 */}
        <section className="mt-14">
          <div className="text-[#9c6b3f] text-xs tracking-widest uppercase mb-4">네이버 지도와 다른 점</div>
          <div className="space-y-3 text-[15px] text-[#524434] leading-relaxed">
            <p>· <strong className="text-[#2b2018]">별점이 아니라 안목.</strong> "4.5점"이 아니라 "이 집은 이래서, 이런 사람한테, 이걸 시켜".</p>
            <p>· <strong className="text-[#2b2018]">발견이 아니라 연결.</strong> 그냥 목록이 아니라 오늘 내 목적에 맞는 곳으로.</p>
            <p>· <strong className="text-[#2b2018]">커피를 아는 사람의 노트.</strong> 원두·로스팅·맛까지 읽고 고른 안내.</p>
          </div>
        </section>

        <footer className="mt-16 pt-8 border-t border-[#d9c9b0] text-[11px] text-[#a8927a] leading-relaxed">
          위치·영업시간은 공개 정보 · 큐레이션은 직접 확인하거나 사장님이 등록한 정보입니다. 현재 강동 지역부터 시작합니다.
        </footer>
      </div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}
