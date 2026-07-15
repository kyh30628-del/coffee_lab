import Link from "next/link";
import BackLink from "../BackLink";

// 포스터 허브 — 지금까지 만든 모든 포스터 유형을 한 화면에서 모아보고 진입하는 관문.
// 실제 생성 화면은 각 하위 경로(carousel·cafe·area)에 있다.

const CARDS: { href: string; icon: string; title: string; desc: string; meta: string }[] = [
  {
    href: "/poster/carousel",
    icon: "🎠",
    title: "인스타 캐러셀",
    desc: "서비스 소개용 5장짜리 캐러셀 — 훅·문제제기·해법·기능·CTA",
    meta: "1080 × 1080 · 5장",
  },
  {
    href: "/poster/cafe",
    icon: "☕",
    title: "카페소개 포스터",
    desc: "검증등급 카페 1곳을 소개하는 포스터 — 검색으로 직접 골라 생성",
    meta: "1080 × 1080",
  },
  {
    href: "/poster/area",
    icon: "🗺️",
    title: "지역소개 포스터",
    desc: "구/동 단위로 검증된 카페 수·리뷰 수를 소개하는 지역 큐레이션 포스터",
    meta: "1080 × 1080",
  },
  {
    href: "/poster/copy",
    icon: "✍️",
    title: "홍보카피 포스터",
    desc: "스토리텔링·후킹 질문·통계 인용 등 7종 카피 중 골라 지역명을 자유 입력하면 실시간 반영되는 카피 포스터",
    meta: "1080 × 1080 · 카피 7종",
  },
];

export default function PosterHubPage() {
  return (
    <main
      className="min-h-screen bg-[#f4ece0] text-[#2b2018]"
      style={{
        fontFamily: "'Gowun Batang', serif",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
      }}
    >
      <div className="max-w-4xl mx-auto px-6 py-10">
        <BackLink to="/" label="홈" className="text-[#7a5122] mb-4" />
        <div className="text-[#7a5122] text-xs tracking-[0.3em] uppercase mb-2">Poster Studio</div>
        <h1 className="text-3xl font-bold mb-1">홍보 포스터</h1>
        <p className="text-[13px] text-[#665036] mb-8 leading-relaxed">
          유형을 골라 인스타 홍보용 포스터를 만들고 PNG로 저장하세요. 카페·지역 포스터는 전부 실제 검증 데이터
          기준이에요.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="block bg-white/60 border border-[#e6dcc8] rounded-xl p-5 hover:border-[#c0a883] hover:bg-white/80 transition"
            >
              <div className="text-3xl mb-3">{c.icon}</div>
              <div className="text-[16px] font-bold mb-1">{c.title}</div>
              <p className="text-[12.5px] text-[#524234] leading-relaxed mb-3">{c.desc}</p>
              <div className="text-[11px] text-[#665036]">{c.meta}</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
