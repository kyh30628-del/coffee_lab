import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { SITE } from "@/lib/seoData";

// 🛡️ 검증 방법론 공개(2026-08-13, 벤치마킹 A — CEO 승인).
//   근거: 다이닝코드·타베로그의 신뢰는 '검증을 브랜드로 만든 것'에서 나온다. 우리는 검증을 하면서도 안 팔고 있었다.
//   2026-07 네이버 영수증 리뷰 29,000건 조작 검거 보도로 리뷰 신뢰가 공론화된 시점 — 방법론을 실데이터 숫자로 공개한다.
//   ⚠️ 여기 숫자는 전부 DB 실시간 집계(작은 컬럼·배열 헤더만) — 과장 금지, 화면≠사실 금지.
export const runtime = "nodejs";
export const revalidate = 86400; // 1일 — 숫자는 천천히 변한다

export const metadata: Metadata = {
  title: "검증 방법 — 동네 커피 노트가 후기를 거르는 기준",
  description: "광고·협찬·영수증 조작 후기를 어떻게 걸러내는지, 검증·참고 등급이 어떻게 매겨지는지 실제 숫자와 함께 공개합니다.",
  alternates: { canonical: `${SITE}/trust` },
  openGraph: { title: "동네 커피 노트 검증 방법", description: "후기를 거르는 기준과 실제 숫자 공개", url: `${SITE}/trust`, siteName: "동네 커피 노트", type: "website", locale: "ko_KR" },
};

async function getStats() {
  try {
    const [c] = (await sql`SELECT COUNT(*)::int total,
      COUNT(*) FILTER (WHERE published)::int pub,
      COUNT(*) FILTER (WHERE published AND synth_grade='검증')::int verified,
      COUNT(*) FILTER (WHERE published AND synth_grade='참고')::int ref,
      COUNT(*) FILTER (WHERE NOT COALESCE(published,false) AND pipeline_status IN ('excluded','held'))::int excluded,
      COALESCE(SUM(synth_count) FILTER (WHERE published),0)::int passed
      FROM cafes`) as any[];
    return c;
  } catch { return null; }
}

const RULES = [
  { icon: "💰", name: "광고·협찬 글", how: "'원고료·제공받아·협찬' 등 대가성 표기와 홍보 문형을 규칙으로 자동 제외" },
  { icon: "📋", name: "서포터즈·기자단", how: "위촉·발대식 등 조직 홍보 활동 글 제외" },
  { icon: "🏪", name: "옆가게·다른 지점 후기", how: "다른 상호·다른 지점 이야기가 섞인 후기는 근접성·주소 대조로 제외" },
  { icon: "🎭", name: "동명(같은 이름) 오염", how: "이름만 같은 다른 업체·다른 지역 콘텐츠를 지역어 동반 검증으로 제외" },
  { icon: "🗑️", name: "스팸·무관 콘텐츠", how: "코인·부동산·DB판매 등 카페와 무관한 SEO 스팸 하드 차단" },
  { icon: "🛒", name: "비방문 게시판", how: "중고거래·창업 커뮤니티 등 방문 후기가 있을 수 없는 출처는 링크 단위로 제외" },
];

export default async function TrustPage() {
  const s = await getStats();
  const jsonLd = {
    "@context": "https://schema.org", "@type": "AboutPage", name: "동네 커피 노트 검증 방법",
    description: "리뷰 교차검증 방법론과 실제 숫자 공개", url: `${SITE}/trust`,
  };
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto px-5 py-9">
        <Link href="/" className="text-[#7a5122] text-[13px] underline">← 동네 커피 노트</Link>
        <div className="text-[#7a5122] text-[11px] tracking-[0.25em] uppercase mt-4 mb-1">동네 커피 노트 · 검증 방법</div>
        <h1 className="text-[26px] font-bold leading-tight mb-3">저희는 후기를 이렇게 거릅니다</h1>
        <p className="text-[14px] text-[#524234] leading-relaxed mb-6">
          영수증 리뷰 수만 건이 조작으로 적발되는 시대입니다. 동네 커피 노트는 별점을 모으지 않습니다 —
          <b> 네이버·구글·유튜브의 공개 후기를 교차검증해서, 실제 방문이 확인되는 이야기만</b> 남깁니다.
        </p>

        {s && (
          <div className="grid grid-cols-2 gap-2.5 mb-8">
            <div className="bg-white rounded-xl border border-[#e0d3bd] px-4 py-3.5"><div className="text-[22px] font-bold">{s.total.toLocaleString()}</div><div className="text-[11.5px] text-[#6f6047]">검토한 카페</div></div>
            <div className="bg-white rounded-xl border border-[#e0d3bd] px-4 py-3.5"><div className="text-[22px] font-bold">{s.pub.toLocaleString()}</div><div className="text-[11.5px] text-[#6f6047]">검증을 통과해 공개된 카페</div></div>
            <div className="bg-white rounded-xl border border-[#e0d3bd] px-4 py-3.5"><div className="text-[22px] font-bold">{s.passed.toLocaleString()}</div><div className="text-[11.5px] text-[#6f6047]">교차검증을 통과한 후기</div></div>
            <div className="bg-white rounded-xl border border-[#e0d3bd] px-4 py-3.5"><div className="text-[22px] font-bold text-[#8a4f3f]">{s.excluded.toLocaleString()}</div><div className="text-[11.5px] text-[#6f6047]">오염·비카페로 격리(비공개)</div></div>
          </div>
        )}

        <h2 className="text-[18px] font-bold mb-3">1. 무엇을 걸러내나요</h2>
        <div className="flex flex-col gap-2 mb-8">
          {RULES.map((r) => (
            <div key={r.name} className="bg-white rounded-xl border border-[#e6dcc8] px-4 py-3">
              <div className="text-[13.5px] font-bold">{r.icon} {r.name}</div>
              <div className="text-[12px] text-[#665036] mt-0.5 leading-relaxed">{r.how}</div>
            </div>
          ))}
        </div>

        <h2 className="text-[18px] font-bold mb-3">2. 등급은 이렇게 매깁니다</h2>
        <div className="bg-white rounded-xl border border-[#e6dcc8] px-4 py-3.5 mb-2">
          <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: "#5f7355" }}>검증</span>
          <span className="text-[12.5px] text-[#524234] ml-2 leading-relaxed">서로 다른 출처의 실제 방문 후기가 충분히 쌓여 교차 확인된 카페{s ? ` (현재 ${s.verified.toLocaleString()}곳)` : ""}</span>
        </div>
        <div className="bg-white rounded-xl border border-[#e6dcc8] px-4 py-3.5 mb-8">
          <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ background: "#9c6b3f" }}>참고</span>
          <span className="text-[12.5px] text-[#524234] ml-2 leading-relaxed">진짜 후기는 확인됐지만 아직 수가 적어 교차 확인이 덜 된 카페{s ? ` (현재 ${s.ref.toLocaleString()}곳)` : ""}</span>
        </div>

        <h2 className="text-[18px] font-bold mb-3">3. 한 번 걸러서 끝나지 않습니다</h2>
        <p className="text-[13px] text-[#524234] leading-relaxed mb-8">
          공개된 카페도 매일 자동 감시가 다시 봅니다. 오염이 새로 발견되면 즉시 격리되고, 판단이 애매한 건은
          자동으로 처리하지 않고 사람이 직접 확인합니다. 프랜차이즈는 다루지 않습니다 — 동네의 개인 카페만 큐레이션합니다.
        </p>

        <h2 className="text-[18px] font-bold mb-3">4. 솔직한 한계 — 저희가 못 하는 것</h2>
        <div className="bg-white rounded-xl border border-[#e6dcc8] px-4 py-3.5 mb-3">
          <div className="text-[13.5px] font-bold mb-1">🔍 협찬을 100% 걸러내지는 못합니다</div>
          <div className="text-[12.5px] text-[#524234] leading-relaxed">
            저희가 볼 수 있는 건 블로그 <b>원문 전체가 아니라 검색 결과 발췌</b>입니다(네이버가 제공하는 범위).
            글 안에서 <b>카페가 언급된 부분</b>은 잘 보이지만, 협찬 고지 문구는 대개 글 끝에 따로 적혀 있어
            그 발췌에 들어오지 않습니다. 그래서 <b>고지가 발췌에 잡힌 협찬 글은 자동 제외</b>하고,
            고지가 안 보이는 글은 <b>&lsquo;업체 정보 나열형&rsquo; 문체·동일 시기 반복 패턴</b> 같은 간접 신호로 걸러
            <b>노출 순위를 뒤로 미룹니다</b>(지우지는 않습니다 — 진짜 후기가 함께 죽으면 안 되니까요).
          </div>
        </div>
        <div className="bg-white rounded-xl border border-[#e6dcc8] px-4 py-3.5 mb-3">
          <div className="text-[13.5px] font-bold mb-1">🤖 자동 검증은 완벽하지 않습니다</div>
          <div className="text-[12.5px] text-[#524234] leading-relaxed">
            드물게 잘못 걸러지거나 놓치는 후기가 있습니다. 발견되는 대로 고치고, 애매한 건은 자동으로 처리하지 않고
            사람이 직접 확인합니다.
          </div>
        </div>
        <p className="text-[13px] text-[#524234] leading-relaxed mb-8">
          맛과 분위기의 판단은 결국 취향의 영역이라, 저희는 &lsquo;<b>이 글이 이 카페를 실제로 다녀와서 쓴 글인가</b>&rsquo;까지를 책임집니다.
        </p>

        <Link href="/area" className="block w-full text-center bg-[#2b2018] text-[#f4ece0] rounded-xl py-3.5 font-bold">검증된 동네 카페 보러 가기 →</Link>
        <div className="text-center text-[11px] text-[#9c8a6c] mt-8">숫자는 실시간 데이터 기준 · 동네 커피 노트</div>
      </div>
    </main>
  );
}
