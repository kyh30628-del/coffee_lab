import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { CHAR_AXES } from "@/lib/charScore";
import Track from "./Track";
import PricingCta from "./PricingCta";
import LeadForm from "./LeadForm";

// ☕ 「우리 가게 리포트」 무료 진단 — 사장님이 PIN 없이 자기 가게를 바로 볼 수 있는 화면.
//
// 왜 만들었나(2026-08-27 CEO 승인): /c/[id]의 CTA가 "무료 인사이트"를 약속하면서
//   /owner?name=OO 로 보냈는데, /owner는 name을 무시하고 **PIN 로그인 벽**을 띄웠다.
//   퍼널 실측 = CTA 20클릭 → 모달 4 → 신청 1 → **결제 0**. 전환율이 아니라 약속을 어긴 게 문제였다.
//
// 💰 비용 설계(절대 규칙 — 이거 못 지키면 만들지 않는다):
//   ① **ISR 24시간**. 같은 카페를 몇 번을 봐도 DB는 하루 1회만 읽는다. 봇이 훑어도 CDN이 답한다.
//   ② **동네(area)로 좁힌 조회**. 기존 owner-insight는 동네 순위를 내려고 **공개 15,268행을 통째로**
//      읽는다(구독자 2명이라 안 드러났을 뿐). 여기선 area로 좁혀 최대 524행(강남구) — 29배 적다.
//      area == guOf(area)가 공개 85개 동네 전부에서 성립함을 실측 확인해서 SQL로 내릴 수 있었다.
//   ③ **인스턴스 메모리 상한**. ISR 재생성(=캐시 미스)만 세서 시간당 상한을 넘기면 DB를 아예 안 친다.
//      robots가 /owner를 이미 막지만, 무시하는 스크래퍼가 14,688곳을 훑는 최악을 이걸로 막는다.
//   ④ 큰 컬럼(synth_reviews·raw_reviews) **절대 안 읽는다**. char_scores(작은 jsonb)만.
//
// ⚠️ 무료/유료 경계(CEO 승인): 무료 = 순위·후기수·등급·**강점 1개**.
//    유료 = 약점 내용·전체 축·액션플랜·경쟁카페·후기 원문·감시 알림. 약점은 **제목만 보이고 내용은 가린다**.

export const runtime = "nodejs";
export const revalidate = 86400; // 24시간 — 후기·순위는 하루 단위로도 충분히 최신이다

type Props = { params: Promise<{ id: string }> };

// ③ 인스턴스 메모리 상한 — 캐시 미스(=ISR 재생성)만 카운트한다.
const GUARD_WINDOW_MS = 60 * 60 * 1000;
const GUARD_MAX = 300; // 시간당 새로 계산할 카페 수 상한
let guard = { at: 0, n: 0 };
function overGuard(): boolean {
  const now = Date.now();
  if (now - guard.at > GUARD_WINDOW_MS) guard = { at: now, n: 0 };
  guard.n += 1;
  return guard.n > GUARD_MAX;
}

type Axis = { key: string; label: string; emoji: string; me: number; avg: number; diff: number; pen: number; meRaw: number; hoodHas: number };
type Report = {
  id: number; name: string; area: string; dong: string | null;
  grade: string | null; count: number; rank: number; hoodN: number;
  strong: Axis | null; top: Axis | null; weak: Axis | null; lockedCount: number;
  /** 우리가 대신 걸러낸 양 — '분석'보다 '노동'이 사장님에겐 더 구체적이다(2026-08-27). */
  filtered: { raw: number; ads: number; kept: number } | null;
};

async function getReport(id: number): Promise<Report | null> {
  const me = (await sql`
    SELECT id, name, area, dong, synth_grade, synth_count, char_scores, synth_quality
    FROM cafes WHERE id = ${id} AND published = true LIMIT 1`)[0] as any;
  if (!me) return null;

  // ② 동네로 좁힌다 — 전수 스캔 금지. area == guOf(area)가 성립하므로 SQL 등가 필터.
  const hood = (await sql`
    SELECT id, synth_count, char_scores FROM cafes
    WHERE published = true AND area = ${me.area}`) as unknown as any[];

  // 순위 — 동점은 id로 타이브레이크(정렬 없는 SELECT라 순위가 흔들리던 버그, 2026-07-26과 동일 원칙).
  const sorted = [...hood].sort(
    (a, b) => (b.synth_count ?? 0) - (a.synth_count ?? 0) || Number(a.id) - Number(b.id),
  );
  const rank = sorted.findIndex((c) => Number(c.id) === Number(me.id)) + 1;

  // 축별 백분위 — 절대 카운트는 축마다 baseline이 다르고 리뷰량 편향이 있어 그대로 못 쓴다.
  //   같은 동네 '비영(0 초과)' 분포 안의 중위순위 백분위로 환산(owner-insight와 동일 산식).
  const nonzero: Record<string, number[]> = {};
  for (const ax of CHAR_AXES) {
    nonzero[ax.key] = hood
      .map((c) => (c.char_scores ?? {})[ax.key] ?? 0)
      .filter((v: number) => v > 0)
      .sort((a: number, b: number) => a - b);
  }
  const score = (count: number, key: string): number => {
    if (!count || count <= 0) return 0; // 언급 0 = 근거 없음. 0점으로 정직히 둔다.
    const arr = nonzero[key];
    if (!arr.length) return 0;
    let below = 0, equal = 0;
    for (const v of arr) { if (v < count) below++; else if (v === count) equal++; }
    return Math.round(((below + equal / 2) / arr.length) * 100);
  };

  const axes: Axis[] = CHAR_AXES.map((ax) => {
    const meScore = score((me.char_scores ?? {})[ax.key] ?? 0, ax.key);
    const hoodScores = hood.map((c) => score((c.char_scores ?? {})[ax.key] ?? 0, ax.key));
    const avg = hoodScores.length ? Math.round(hoodScores.reduce((s, x) => s + x, 0) / hoodScores.length) : 0;
    const has = hood.filter((c) => ((c.char_scores ?? {})[ax.key] ?? 0) > 0).length;
    return { key: ax.key, label: ax.label, emoji: ax.emoji, me: meScore, avg,
      diff: meScore - avg, pen: hood.length ? Math.round((has / hood.length) * 100) : 0,
      meRaw: (me.char_scores ?? {})[ax.key] ?? 0, hoodHas: has };
  });

  // 강점 = 동네 평균을 가장 크게 앞선 축(절대 수준도 있어야 함).
  const strong = [...axes].filter((a) => a.me >= 55 && a.diff >= 10).sort((a, b) => b.diff - a.diff)[0] ?? null;
  // 폴백 — 뚜렷한 강점이 없는 카페(실측 27%)도 첫 화면이 비면 안 된다. 다만 **동네 대비 우위라고 말하지 않고**
  //   "가장 많이 언급된 특징"으로만 정직하게 쓴다. 언급 자체가 0이면 그것도 없다고 말한다(실측 0.1%).
  const top = strong ? null : ([...axes].filter((a) => a.me > 0).sort((a, b) => b.me - a.me)[0] ?? null);
  // 약점 = 동네에서는 흔한데(침투율 40%+) 우리는 언급이 없거나 뒤처지는 축. 제목만 보여주고 내용은 잠근다.
  const weak = [...axes].filter((a) => a.pen >= 40 && a.diff <= -10).sort((a, b) => a.diff - b.diff)[0] ?? null;

  return {
    id: Number(me.id), name: me.name, area: me.area, dong: me.dong,
    grade: me.synth_grade, count: me.synth_count ?? 0, rank, hoodN: hood.length,
    strong, top, weak, lockedCount: axes.filter((a) => a.me > 0).length,
    filtered: (() => {
      const q = me.synth_quality ?? null;
      const raw = Number(q?.raw ?? 0);
      if (!raw) return null;
      // 광고·협찬으로 걸러낸 건수 — rejectReasons 키가 문구라 '광고'로 시작하는 항목을 합친다.
      const ads = Object.entries(q?.rejectReasons ?? {})
        .filter(([k]) => k.startsWith("광고"))
        .reduce((s2, [, v]) => s2 + Number(v || 0), 0);
      return { raw, ads, kept: me.synth_count ?? 0 };
    })(),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // 🔒 검색엔진에 올리지 않는다 — robots.ts가 /owner를 이미 막지만 메타로도 이중 차단.
  //   사장님 개인 화면이 검색에 뜰 이유가 없고, 크롤러가 14,688곳을 훑으면 ISR 재생성이 폭증한다.
  return { title: "우리 가게 리포트", robots: { index: false, follow: false } };
}

const CARD = "bg-white rounded-2xl border border-[#e6dcc8] px-5 py-4";

export default async function FreeReportPage({ params }: Props) {
  const { id } = await params;
  const n = Number(id);

  if (!Number.isFinite(n) || n <= 0) return <Shell><Msg>주소가 올바르지 않아요.</Msg></Shell>;
  if (overGuard()) {
    // 상한 초과 — DB를 치지 않고 돌려보낸다. 사람이 이 화면을 볼 일은 사실상 없다(시간당 300곳).
    return <Shell><Msg>지금은 조회가 몰려 잠시 뒤에 다시 열어주세요.</Msg></Shell>;
  }

  const r = await getReport(n);
  if (!r) return <Shell><Msg>아직 공개 전이거나 찾을 수 없는 카페예요.</Msg></Shell>;

  return (
    <Shell>
      <Track cafeId={r.id} event="free_report_view" />
      <div className="text-[#9c6b3f] text-[11px] tracking-[0.3em] uppercase mb-1">For Owners</div>
      <h1 className="text-[22px] font-bold text-[#2b2018] leading-snug mb-0.5">{r.name}</h1>
      <p className="text-[12.5px] text-[#7a6a55] mb-5">
        {r.area}{r.dong ? ` · ${r.dong}` : ""} · 후기 데이터로 본 우리 가게
      </p>

      {/* 무료 ① 동네 순위 — "이미 데이터에 잡혀 있다"는 사실을 가장 먼저 보여준다 */}
      <div className={`${CARD} mb-3`}>
        <div className="text-[11px] text-[#8a7458] mb-1">{r.area} 카페 {r.hoodN.toLocaleString()}곳 중</div>
        <div className="text-[28px] font-bold text-[#2b2018] leading-none">
          {r.rank > 0 ? <>{r.rank}<span className="text-[15px] font-medium text-[#7a6a55]">위</span></> : "—"}
        </div>
        <div className="text-[11.5px] text-[#7a6a55] mt-1.5">후기 수 기준 · 검증된 후기만 셉니다</div>
      </div>

      {/* 무료 ② 검증 후기 */}
      <div className={`${CARD} mb-3 flex items-center justify-between`}>
        <span className="text-[13px] text-[#524234]">교차검증을 통과한 후기</span>
        <span className="text-[15px] font-bold text-[#2b2018]">
          {r.count.toLocaleString()}건{r.grade ? <span className="ml-1.5 text-[11px] font-medium text-[#9c6b3f]">{r.grade}</span> : null}
        </span>
      </div>

      {/* 무료 ③ 강점 1개 — 근거가 없으면 없다고 말한다(억지로 만들지 않는다) */}
      <div className={`${CARD} mb-3`}>
        <div className="text-[11px] text-[#8a7458] mb-1.5">{r.strong ? "우리 가게의 강점" : "가장 많이 언급된 특징"}</div>
        {r.strong ? (
          <>
            <div className="text-[16px] font-bold text-[#2b2018] mb-1">{r.strong.emoji} {r.strong.label}</div>
            <p className="text-[12.5px] text-[#524234] leading-relaxed">
              동네 평균 <b>{r.strong.avg}점</b> 대비 <b className="text-[#5f7355]">{r.strong.diff}점 높습니다</b>
              {" "}(우리 {r.strong.me}점). 손님들이 이 점을 가장 많이 이야기해요.
            </p>
          </>
        ) : r.top ? (
          <>
            <div className="text-[16px] font-bold text-[#2b2018] mb-1">{r.top.emoji} {r.top.label}</div>
            <p className="text-[12.5px] text-[#524234] leading-relaxed">
              손님들이 <b>가장 많이 이야기한 특징</b>이에요. 다만 동네 평균({r.top.avg}점)을 뚜렷하게
              앞서지는 않아요(우리 {r.top.me}점) — 여기를 키우면 차별점이 됩니다.
            </p>
          </>
        ) : (
          <p className="text-[12.5px] text-[#7a6a55] leading-relaxed">
            아직 후기에서 뚜렷하게 잡히는 특징이 없어요. 후기가 쌓이면 달라집니다.
          </p>
        )}
      </div>

      {/* 🔒 유료 경계 — 사실(무엇이 없는지)은 공짜로 보여주고, 처방(어떻게 바꾸나)을 잠근다.
          흐린 더미 텍스트를 가려두던 걸 걷어냈다(2026-08-27): 후크가 가짜면 전환되지 않는다.
          우리 데이터에 '부정 후기'는 사실상 없지만(1,745건 중 0.6%·대부분 오탐) **'부재'는 명확히 있다.
          동네는 다 듣는 말인데 우리만 안 나오는 것 — 심리적 효과는 같고, 이건 실제로 존재한다. */}
      <div className={`${CARD} mb-3`}>
        <div className="text-[11px] text-[#8a7458] mb-1.5">우리 가게에 없는 말</div>
        {r.weak ? (
          <>
            <div className="text-[16px] font-bold text-[#2b2018] mb-1.5">{r.weak.emoji} {r.weak.label}</div>
            <p className="text-[12.5px] text-[#524234] leading-relaxed">
              {r.area} 카페 <b>{r.hoodN}곳 중 {r.weak.hoodHas}곳({r.weak.pen}%)</b>이 이 얘기를 들어요.
              {r.weak.meRaw > 0
                ? <> 사장님 가게는 <b className="text-[#a4553f]">{r.weak.meRaw}번</b>뿐이라 동네에서 뒤처져 있어요.</>
                : <> 그런데 사장님 가게는 <b className="text-[#a4553f]">아직 한 번도 안 나왔어요.</b></>}
            </p>
          </>
        ) : (
          <>
            <div className="text-[16px] font-bold text-[#2b2018] mb-1.5">🔍 아직 뚜렷한 약점은 없어요</div>
            <p className="text-[12.5px] text-[#524234] leading-relaxed">동네 카페들이 공통으로 듣는 말 중 크게 뒤처진 항목이 없습니다.</p>
          </>
        )}
        <div className="mt-3 pt-3 border-t border-[#f0e6d4] text-[12px] text-[#7a6a55] leading-relaxed">
          🔒 <b>무엇을 어떻게 바꿔야 하는지</b>와 <b>어떤 손님이 이 말을 했는지</b>는 구독하면 보실 수 있어요.
        </div>
      </div>

      {/* 노동 절약 — '분석'보다 '우리가 대신 한 일'이 훨씬 구체적이다 */}
      {r.filtered && (
        <div className={`${CARD} mb-3`}>
          <div className="text-[11px] text-[#8a7458] mb-2">사장님 대신 해둔 일</div>
          <p className="text-[12.5px] text-[#524234] leading-relaxed">
            블로그·유튜브 글 <b>{r.filtered.raw.toLocaleString()}건</b>을 모아
            {r.filtered.ads > 0 ? <> 광고·협찬 <b>{r.filtered.ads}건</b>과</> : null} 다른 가게·무관한 글을 걸러내고,
            진짜 방문 후기 <b>{r.filtered.kept}건</b>만 남겼어요.
          </p>
          <p className="text-[11px] text-[#8a7458] mt-1.5">직접 하면 {r.filtered.raw.toLocaleString()}건을 하나씩 열어봐야 해요.</p>
        </div>
      )}

      {/* 유료 안내 — '노출'이 아니라 '감시'를 판다 */}
      <div className="bg-[#2b2018] text-[#f4ece0] rounded-2xl px-5 py-5 mb-4">
        <div className="text-[15px] font-bold mb-2">우리 가게 리포트</div>
        <ul className="text-[12.5px] leading-[1.9] text-[#e2d5c0] mb-4">
          <li>· <b className="text-[#f4ece0]">새 후기가 올라오면</b> 알려드려요</li>
          <li>· <b className="text-[#f4ece0]">동네 순위가 바뀌면</b> 알려드려요</li>
          <li>· 근처에 <b className="text-[#f4ece0]">새 카페가 생기면</b> 알려드려요</li>
          <li>· 약점·개선 포인트와 {r.lockedCount}개 축 전체 분석</li>
        </ul>
        <PricingCta cafeId={r.id} />
      </div>

      {/* 📧 유료가 부담스러운 사장님을 위한 낮은 계단 — 월 1회 무료 요약(리드 수집) */}
      <LeadForm cafeId={r.id} />

      <p className="text-[11px] text-[#8a7458] leading-relaxed text-center">
        네이버·구글·유튜브 공개 후기를 교차검증한 데이터입니다.{" "}
        <Link href="/trust" className="underline text-[#9c6b3f]">검증 방법</Link>
        {" · "}
        <Link href={`/c/${r.id}`} className="underline text-[#9c6b3f]">손님이 보는 화면</Link>
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f4ece0]" style={{ fontFamily: "'Gowun Batang', AppleMyungjo, serif" }}>
      <div className="max-w-md mx-auto px-5 py-8">{children}</div>
      <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" rel="stylesheet" />
    </main>
  );
}

function Msg({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-16">
      <p className="text-[13.5px] text-[#6b5a48] mb-5">{children}</p>
      <Link href="/" className="text-[12.5px] text-[#9c6b3f] underline">홈으로</Link>
    </div>
  );
}
