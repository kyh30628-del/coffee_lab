import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { SITE } from "@/lib/seoData";
import { COLLECTIONS, collectionBySlug, collectionKeywords } from "@/lib/collections";
import KakaoShare from "../../KakaoShare";

// 동네 교차검증 컬렉션 — 동적 템플릿(레지스트리 lib/collections.ts 구동).
// 데이터 100% 라이브(cafes), 하드코딩 카페명 0. 성수 최초 발행 구조를 재사용.
export const revalidate = 1800; // 30분 — 비공개/신규 반영
export const dynamicParams = false;

const GRADE_BG: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 후보: "#a8927a" };

type Row = { id: number; name: string; dong: string | null; grade: string | null; count: number | null; identity: string | null };
type Agg = { cafes: number; raw: number; verified: number; ad: number; branch: number };

export function generateStaticParams() {
  return COLLECTIONS.map((c) => ({ slug: c.slug }));
}

async function getCafes(label: string, area: string, limit = 12): Promise<Row[]> {
  try {
    return (await sql`SELECT id, name, dong, synth_grade AS grade, synth_count AS count, synth_identity AS identity
      FROM cafes WHERE published AND synth_grade='검증' AND area=${area} AND regexp_replace(dong, '[0-9]+가$', '')=${label}
      ORDER BY synth_count DESC NULLS LAST LIMIT ${limit}`) as unknown as Row[];
  } catch { return []; }
}

async function getAgg(label: string, area: string): Promise<Agg> {
  try {
    const rows = (await sql`SELECT synth_quality q FROM cafes
      WHERE published AND synth_grade='검증' AND area=${area} AND regexp_replace(dong, '[0-9]+가$', '')=${label}`) as { q: any }[];
    let cafes = 0, raw = 0, verified = 0, ad = 0, branch = 0;
    for (const r of rows) {
      const q = r.q; if (!q) continue; cafes++; raw += q.raw || 0; verified += q.verified || 0;
      for (const [k, v] of Object.entries(q.rejectReasons || {})) {
        const n = Number(v) || 0;
        if (/광고|협찬/.test(k)) ad += n;
        else if (/다른 지점|다른 위치|동명|다른 지역/.test(k)) branch += n;
      }
    }
    return { cafes, raw, verified, ad, branch };
  } catch { return { cafes: 0, raw: 0, verified: 0, ad: 0, branch: 0 }; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = collectionBySlug(slug);
  if (!c) return { title: "컬렉션을 찾을 수 없어요 — 동네 커피 노트" };
  const canon = `${SITE}/collections/${c.slug}`;
  const title = `${c.label} 카페 추천 — 협찬 없이 진짜 후기로 교차검증한 곳 | 동네 커피 노트`;
  const desc = `${c.label} 카페, 광고·협찬·타지점 후기를 걸러내고 실제 방문 후기만 교차검증해 골랐어요. 로스터리·핸드드립·디저트까지 검증 등급으로 정리.`;
  return {
    title, description: desc, keywords: collectionKeywords(c.label),
    alternates: { canonical: canon },
    openGraph: { title, description: desc, url: canon, siteName: "동네 커피 노트", type: "article", locale: "ko_KR" },
  };
}

export default async function CollectionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = collectionBySlug(slug);
  if (!c) notFound();
  const { label, area } = c;
  const canon = `${SITE}/collections/${slug}`;
  const areaHref = `/area/${encodeURIComponent(area)}`;
  const [cafes, agg] = await Promise.all([getCafes(label, area, 12), getAgg(label, area)]);
  const nf = (n: number) => n.toLocaleString("ko-KR");
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList", name: `${label} 검증 카페`, numberOfItems: cafes.length,
    itemListElement: cafes.slice(0, 20).map((cf, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/c/${cf.id}`, name: cf.name })),
  };
  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018]" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <div className="max-w-2xl mx-auto px-5 py-9">
        <Link href={areaHref} className="text-[#9c6b3f] text-[13px] underline">← {area} 카페 전체</Link>
        <div className="text-[#9c6b3f] text-[11px] tracking-[0.25em] uppercase mt-4 mb-1">동네 커피 노트 · 검증 큐레이션</div>
        <h1 className="text-[26px] font-bold leading-tight mb-3">{label} 카페 추천<br />— 협찬 없이 진짜 후기로 교차검증한 곳</h1>

        <p className="text-[14.5px] text-[#4a3b2c] leading-relaxed mb-3">
          {label} 카페 후기는 왜 믿기 어려울까요. 협찬·체험단 글, 다른 동네 같은 이름의 지점 후기, &lsquo;가봤다&rsquo;는 언급만 있는 글이 검색 결과를 채웁니다.
          동네 커피 노트는 {label} 카페의 공개 후기를 <b>한 곳씩 교차검증</b>해, 광고·협찬과 타지점·동명 오염을 걸러낸 <b>실제 방문 후기만</b> 남겼어요.
        </p>

        {agg.cafes > 0 && (
          <div className="bg-white/70 border border-[#e6dcc8] rounded-xl px-4 py-3.5 mb-3">
            <div className="text-[12px] text-[#9c6b3f] font-bold mb-2 tracking-wide">{label} 교차검증, 숫자로</div>
            <ul className="text-[13.5px] text-[#4a3b2c] leading-relaxed space-y-1">
              <li>· 검증 카페 <b>{nf(agg.cafes)}곳</b> · 공개 후기 원본 <b>{nf(agg.raw)}건</b>을 한 건씩 검토</li>
              <li>· 광고·협찬 글 <b>{nf(agg.ad)}건</b> 자동 제외</li>
              <li>· 다른 지점·동명 카페 오염 후기 <b>{nf(agg.branch)}건</b> 제외</li>
              <li>· 실제 방문·경험 후기 <b>{nf(agg.verified)}건</b>만 채택</li>
            </ul>
            <p className="text-[11px] text-[#8a7458] mt-2">※ 수치는 실시간 검증 데이터 기준이라 조금씩 변할 수 있어요.</p>
          </div>
        )}

        <p className="text-[12px] text-[#8a7458] bg-white/60 border border-[#e6dcc8] rounded-lg px-3 py-2 mb-6">☕ <b>영수증 리뷰·광고·협찬은 빼고</b>, 네이버·구글·유튜브 공개 후기를 교차검증해 진짜 후기로만 골랐어요.</p>

        <h2 className="text-[17px] font-bold mb-3">후기로 검증한 {label} 카페</h2>
        {cafes.length === 0 ? (
          <p className="text-[13px] text-[#8a7458] py-8 text-center">지금 목록을 불러오지 못했어요. <Link href={areaHref} className="underline text-[#9c6b3f]">{area} 전체 보기</Link></p>
        ) : (
          <ol className="space-y-2.5">
            {cafes.map((cf, i) => (
              <li key={cf.id}>
                <Link href={`/c/${cf.id}`} className="block bg-white rounded-xl border border-[#e6dcc8] px-4 py-3 hover:shadow-sm transition">
                  <div className="flex items-center gap-2">
                    <span className="text-[#bcae98] text-[13px] font-bold w-5 shrink-0">{i + 1}</span>
                    <span className="font-bold text-[15px]">{cf.name}</span>
                    {cf.dong && <span className="text-[12px] text-[#8a7458]">{cf.dong}</span>}
                    {cf.grade && <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded ml-auto shrink-0" style={{ background: GRADE_BG[cf.grade] || "#a8927a" }}>{cf.grade}</span>}
                  </div>
                  {cf.identity && <p className="text-[12.5px] text-[#6b5a48] leading-snug mt-1.5 line-clamp-2 pl-7">{cf.identity}</p>}
                </Link>
              </li>
            ))}
          </ol>
        )}

        <div className="mt-7">
          <Link href={`/?region=${encodeURIComponent(area)}`} className="block w-full bg-[#2b2018] text-[#f4ece0] rounded-xl py-3 text-center font-bold">{label} 카페 지도에서 더 보기 →</Link>
          <div className="mt-3">
            <KakaoShare
              title={`${label} 카페 추천 — 협찬 없이 진짜 후기로 검증`}
              description={`광고·협찬·타지점 후기 빼고 진짜 방문 후기로 검증한 ${label} 카페`}
              imageUrl={`${canon}/opengraph-image`}
              link={canon}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
