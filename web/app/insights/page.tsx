import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";

// 📊 데이터 리포트 — **인용되기 위한 페이지**다(2026-08-26 CEO 승인, 백링크 전략 ③).
//   우리만 가진 숫자(검증 후기 규모·동네/여행 구분)를 공개해 기자·블로거가 출처 링크와 함께
//   인용하게 한다. 링크 구매(정책 위반)가 아니라 콘텐츠로 버는 백링크.
//
// 💰 ISR 24시간 — 전부 숫자 컬럼 집계(큰 blob 없음)라 쿼리 자체도 싸고, 하루 1번만 DB에 닿는다.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "카페 데이터 리포트 — 동네 커피 노트",
  description: "광고·협찬을 걸러낸 검증 후기 데이터로 본 서울·수도권·강원 카페 지형. 동네 단골 vs 여행객 카페 분포, 뉴스 기반 관광지 카페 동네 랭킹을 공개합니다.",
  alternates: { canonical: "/insights" },
};

async function getStats() {
  try {
    const [tot] = (await sql`SELECT count(*) FILTER (WHERE published)::int pub,
      count(*) FILTER (WHERE published AND synth_grade='검증')::int v,
      COALESCE(sum(synth_count) FILTER (WHERE published),0)::int reviews FROM cafes`) as any[];
    const [vb] = (await sql`SELECT
      count(*) FILTER (WHERE published AND visitor_n>=10 AND visitor_local>=0.08)::int local,
      count(*) FILTER (WHERE published AND visitor_n>=15 AND visitor_trip>=0.20)::int trip FROM cafes`) as any[];
    const localTop = (await sql`SELECT area, count(*)::int n FROM cafes
      WHERE published AND visitor_n>=10 AND visitor_local>=0.08 AND area IS NOT NULL
      GROUP BY area ORDER BY 2 DESC LIMIT 10`) as any[];
    const tripTop = (await sql`SELECT area, count(*)::int n FROM cafes
      WHERE published AND visitor_n>=15 AND visitor_trip>=0.20 AND area IS NOT NULL
      GROUP BY area ORDER BY 2 DESC LIMIT 10`) as any[];
    const grow = (await sql`SELECT area, count(*)::int n FROM cafes
      WHERE published AND created_at > now() - interval '30 days' AND area IS NOT NULL
      GROUP BY area ORDER BY 2 DESC LIMIT 10`) as any[];
    // 🗺️ 뉴스 기반 관광지 동네 랭킹(2026-08-27 신설) — 전국 1,391개 동의 최근 뉴스 표본에서
    //   관광 맥락 기사 비율로 판정한 71곳 중 상위. 우리만 만들 수 있는 랭킹이라 인용 가치가 크다.
    const touristDong = (await sql`SELECT t.area, t.dong, round(t.rate*100)::int pct,
        (SELECT count(*)::int FROM cafes c WHERE c.published AND c.area=t.area AND c.dong=t.dong) cafes
      FROM dong_tourism t WHERE t.is_tourist ORDER BY t.rate DESC LIMIT 10`) as any[];
    const [tCnt] = (await sql`SELECT count(*)::int total, count(*) FILTER (WHERE is_tourist)::int tourist FROM dong_tourism`) as any[];
    return { tot, vb, localTop, tripTop, grow, touristDong, tCnt };
  } catch { return null; }
}

export default async function InsightsPage() {
  const s = await getStats();
  if (!s) return <main className="min-h-screen bg-[#f4ece0] p-10 text-center text-[#524234]">리포트를 준비 중이에요.</main>;
  const upd = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const Row = ({ items }: { items: any[] }) => (
    <ol className="space-y-1.5">{items.map((x, i) => (
      <li key={x.area} className="flex items-center gap-2 text-[13.5px]">
        <span className="w-5 text-right font-bold text-[#82714f]">{i + 1}</span>
        <Link href={`/area/${encodeURIComponent(x.area)}`} className="underline underline-offset-2 text-[#2b2018]">{x.area}</Link>
        <span className="ml-auto text-[#7a5122] font-bold">{x.n}곳</span>
      </li>))}
    </ol>
  );
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-2xl mx-auto px-5 py-10">
        <div className="text-[#7a5122] text-[11px] tracking-[0.25em] uppercase mb-1">동네 커피 노트 · 데이터 리포트</div>
        <h1 className="text-[26px] font-bold leading-tight mb-2">검증 후기로 본 카페 지형</h1>
        <p className="text-[13.5px] text-[#524234] leading-relaxed mb-1">
          별점·광고가 아니라 <b>광고·협찬·무관 글을 걸러낸 공개 후기</b>만으로 집계했습니다.
        </p>
        <p className="text-[11.5px] text-[#7a6a55] mb-7">기준일 {upd} · 매일 갱신 · 인용 시 출처 링크를 부탁드려요.</p>

        <div className="grid grid-cols-3 gap-2 mb-8">
          {[["검증 완료 카페", s.tot.pub.toLocaleString() + "곳"], ["검증 등급", s.tot.v.toLocaleString() + "곳"], ["검증 통과 후기", s.tot.reviews.toLocaleString() + "건"]].map(([k, v]) => (
            <div key={k} className="bg-white rounded-2xl border border-[#e6dcc8] p-4 text-center">
              <div className="text-[17px] font-bold">{v}</div><div className="text-[10.5px] text-[#7a5122] mt-1">{k}</div>
            </div>))}
        </div>

        <section className="mb-8">
          <h2 className="text-[17px] font-bold mb-1">🏠 동네 단골 카페 vs 🧳 여행객 카페</h2>
          <p className="text-[12.5px] text-[#524234] leading-relaxed mb-3">
            후기를 쓴 사람이 <b>단골·생활권 방문자</b>인지 <b>여행 중 방문자</b>인지 신호어로 분류했습니다.
            전국 공개 카페 중 동네 단골 카페 <b>{s.vb.local.toLocaleString()}곳</b>, 여행객 카페 <b>{s.vb.trip.toLocaleString()}곳</b>.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-[#e6dcc8] p-4">
              <div className="text-[12px] font-bold text-[#4a5a4e] mb-2">🏠 동네 단골 카페가 많은 지역</div><Row items={s.localTop} />
            </div>
            <div className="bg-white rounded-2xl border border-[#e6dcc8] p-4">
              <div className="text-[12px] font-bold text-[#4a5a4e] mb-2">🧳 여행객 후기 카페가 많은 지역</div><Row items={s.tripTop} />
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-[17px] font-bold mb-1">📈 최근 30일, 검증 카페가 늘어난 지역</h2>
          <div className="bg-white rounded-2xl border border-[#e6dcc8] p-4 mt-3"><Row items={s.grow} /></div>
        </section>

        <section className="mb-8">
          <h2 className="text-[17px] font-bold mb-1">🗺️ 뉴스가 &lsquo;관광지&rsquo;로 다루는 카페 동네 TOP 10</h2>
          <p className="text-[12.5px] text-[#665036] mb-3">
            전국 {Number(s.tCnt?.total ?? 0).toLocaleString()}개 동의 최근 언론 보도를 표본 조사해, 관광 맥락 기사 비율이
            높은 동네를 가려냈습니다(판정 {s.tCnt?.tourist ?? 0}곳). 후기 말투가 아니라 <b>공개된 보도</b>로 판정한 수치입니다.
          </p>
          <div className="bg-white rounded-2xl border border-[#e6dcc8] p-4">
            <ol className="space-y-1.5">{(s.touristDong ?? []).map((x: any, i: number) => (
              <li key={`${x.area}${x.dong}`} className="flex items-center gap-2 text-[13.5px]">
                <span className="w-5 text-right font-bold text-[#82714f]">{i + 1}</span>
                <span className="text-[#2b2018]">{x.area} <b>{x.dong}</b></span>
                <span className="text-[11px] text-[#8a7458]">검증 카페 {x.cafes}곳</span>
                <span className="ml-auto text-[#7a5122] font-bold">관광기사 {x.pct}%</span>
              </li>))}
            </ol>
          </div>
        </section>

        <p className="text-[11.5px] text-[#665036] bg-white/60 border border-[#e6dcc8] rounded-lg px-3 py-2.5 leading-relaxed">
          집계 방법: 네이버·구글·유튜브 공개 후기를 교차 수집한 뒤 광고·협찬 표기, 서포터즈·기자단, 동명·옆가게 오염,
          템플릿 도배를 규칙 기반으로 제외했습니다. <Link href="/trust" className="underline text-[#7a5122]">검증 방법 자세히</Link>
        </p>
        {/* 📎 인용 안내 — 이 페이지의 존재 이유(백링크). 조건을 낮추고 명확하게. */}
        <p className="mt-3 text-[11.5px] text-[#665036] bg-[#fdf6e9] border border-[#ecd9b0] rounded-lg px-3 py-2.5 leading-relaxed">
          📎 <b>이 리포트의 수치·순위는 출처 표기 시 자유롭게 인용하실 수 있습니다.</b>{" "}
          &ldquo;동네 커피 노트(dongnecoffeenote.com)&rdquo;와 링크를 함께 적어주세요. 기사·영상용 상세 데이터가
          필요하면 언제든 요청 주세요.
        </p>
      </div>
    </main>
  );
}
