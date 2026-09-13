import Link from "next/link";
import type { StartupReport } from "@/lib/startupReport";

// 리포트 본문(서버 컴포넌트) — full=false면 잠긴 섹션은 흐리게 + 안내. 숫자는 전부 buildStartupReport 실측.
const Lock = ({ children }: { children: React.ReactNode }) => (
  <div className="relative">
    <div className="select-none pointer-events-none" style={{ filter: "blur(5px)", opacity: 0.55 }} aria-hidden>{children}</div>
    <div className="absolute inset-0 flex items-center justify-center"><span className="nt-scrap flat kraft px-3 py-1.5 text-[12.5px] font-bold text-[#7a5122]">🔒 전문에서 열려요</span></div>
  </div>
);
export default function Report({ r, full }: { r: StartupReport; full: boolean }) {
  const d = r.def;
  const maxTrend = Math.max(1, ...r.trend.map((t) => t.n));
  const Sec = ({ title, locked, children }: { title: string; locked?: boolean; children: React.ReactNode }) => (
    <section className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
      <div className="nt-sec">{title}</div>
      {locked && !full ? <Lock>{children}</Lock> : children}
    </section>
  );
  return (
    <>
      {/* 무료: 숫자 3개 */}
      <section className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
        <div className="nt-sec">한눈에 · 검증 후기로 본 {d.title}</div>
        <div className="nt-free grid grid-cols-3 gap-2 py-2">
          {[["카페", `${r.cafes}곳`, `검증 등급 ${r.verified}곳`], ["검증 후기", `${r.totalReviews.toLocaleString()}건`, `카페당 평균 ${r.avgReviews}건`], ["최근 1년", `개업 ${r.permits.opened12} · 폐업 ${r.permits.closed12}`, r.permits.closeRate12 != null ? `폐업률 ${r.permits.closeRate12}%(인허가 기준)` : "인허가 집계"]].map(([k, v, s]) => (
            <div key={k} className="nt-scrap flat text-center py-3 px-2"><div className="text-[11px] text-[#63523f]">{k}</div><div className="nt-title text-[20px] leading-tight">{v}</div><div className="text-[11px] text-[#7a5122]">{s}</div></div>
          ))}
        </div>
      </section>

      <Sec title="손님이 이 동네 카페에서 실제로 찾는 것 · 성격 12축">
        <p className="text-[13px] text-[#5c4b3c]">카페 {r.cafes}곳의 검증 후기에서 각 성격이 뚜렷하게 언급된 카페의 비율이에요. 높을수록 이미 흔한 것, 낮을수록 비어 있는 자리예요.</p>
        <ul className="nt-free py-1">
          {r.axes.map((a) => (
            <li key={a.key} className="flex items-center gap-2 text-[13px] py-[3px]">
              <span className="w-28 shrink-0">{a.emoji} {a.label}</span>
              <span className="flex-1 h-[10px] rounded-full bg-[#eadfcd] overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${a.pct}%`, background: a.pct <= 15 ? "#a93a32" : "#7a5122" }} /></span>
              <span className="w-20 text-right text-[12px] text-[#63523f]">{a.pct}% · {a.n}곳</span>
            </li>
          ))}
        </ul>
      </Sec>

      <Sec title="비어 있는 자리 · 아무도 안 잡은 포지션" locked>
        {r.openAxes.length ? (
          <p className="nt-hand"><span className="nt-hl">{r.openAxes.map((a) => `${a.emoji} ${a.label}(${a.pct}%)`).join(" · ")}</span></p>
        ) : <p className="text-[13px]">이 동네는 12축이 고르게 차 있어요. 빈 자리로 승부하기보다 상위 카페의 성격을 더 세게 하는 전략이 맞아요.</p>}
        <p className="text-[13px] text-[#5c4b3c]">이 동네 카페 중 15% 이하만 갖고 있는 성격이에요. 손님 후기가 이미 그 말을 쓰고 있는데(아래 검색어 참고) 공급이 없으면, 그게 첫 손님이 오는 이유가 됩니다.</p>
      </Sec>

      <Sec title="이 동네 상위 5곳 · 무엇으로 이기고 있나" locked>
        <ul>
          {r.top.map((c, i) => (
            <li key={c.id} className="text-[13.5px] flex gap-2 items-baseline"><b className="text-[#7a5122] w-5 shrink-0">{i + 1}</b><span className="truncate"><b>{c.name}</b> · 후기 {c.count}건{c.topAxis ? ` · ${c.topAxis}` : ""}{c.identity ? <span className="text-[#63523f]"> — {c.identity}</span> : null}</span></li>
          ))}
        </ul>
      </Sec>

      <Sec title="최근 1년 개업·폐업 · 인허가 공공데이터" locked>
        <p className="text-[13.5px]">인허가에 매칭된 {r.permits.matched}곳 중 최근 12개월 <b>개업 {r.permits.opened12}곳 · 폐업 {r.permits.closed12}곳</b>{r.permits.closeRate12 != null ? ` (폐업률 ${r.permits.closeRate12}%)` : ""}.</p>
        {r.permits.openedRecent.length > 0 && <p className="text-[13px] text-[#5c4b3c]">최근 문 연 곳: {r.permits.openedRecent.map((o) => `${o.name}(${o.opened})`).join(" · ")}</p>}
        <p className="text-[11.5px] text-[#63523f]">출처: 지방행정 인허가 데이터(공공데이터포털, 이용 제한 없음). 등기 상호와 간판이 다를 수 있어요.</p>
      </Sec>

      <Sec title="후기가 늘고 있나 · 월별 검증 후기 수" locked>
        <div className="nt-free flex items-end gap-[3px] h-24 py-1">
          {r.trend.map((t) => (
            <div key={t.ym} className="flex-1 flex flex-col items-center justify-end h-full" title={`${t.ym} ${t.n}건`}>
              <div className="w-full rounded-t" style={{ height: `${Math.max(4, (t.n / maxTrend) * 100)}%`, background: t.partial ? "#d9c7ad" : "#7a5122" }} />
              <span className="text-[9px] text-[#63523f] mt-0.5">{t.ym.slice(2).replace(".", "/")}</span>
            </div>
          ))}
        </div>
        <p className="text-[11.5px] text-[#63523f]">연한 막대는 수집 시차로 아직 집계 중인 달이에요. 절대 수치보다 계절 흐름과 추세를 보세요.</p>
      </Sec>

      <Sec title="손님이 이 동네를 찾을 때 쓰는 말 · 검색어" locked>
        {r.queries.length ? (
          <ul className="nt-free flex flex-wrap gap-1.5 py-1">{r.queries.map((q) => <li key={q.q} className="nt-chip">{q.q}<b>{q.n}</b></li>)}</ul>
        ) : <p className="text-[13px]">최근 6개월 이 동네 검색 기록이 아직 적어요.</p>}
        <p className="text-[11.5px] text-[#63523f]">동네 커피 노트 안에서 손님이 실제로 입력한 검색어(최근 6개월). 메뉴·간판·SNS 문구를 이 말로 맞추면 첫 유입이 빨라요.</p>
      </Sec>

      <section className="nt-ruled nt-margin-gutter" style={{ paddingTop: 34 }}>
        <p className="text-[11.5px] text-[#63523f]">이 리포트는 공개 후기를 교차검증한 동네 커피 노트의 자체 집계와 인허가 공공데이터로 만듭니다. 후기 원문은 담지 않습니다. 매출·임대료·유동인구는 다루지 않으며, 창업 결정의 참고 자료일 뿐 결과를 보장하지 않습니다. 생성 {r.generatedAt.slice(0, 10)}.</p>
        <Link href="/startup" className="text-[12px] text-[#7a5122] underline underline-offset-2">다른 동네 리포트 →</Link>
      </section>
    </>
  );
}
