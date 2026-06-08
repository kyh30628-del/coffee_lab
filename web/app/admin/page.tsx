"use client";
import { useState } from "react";
import BackLink from "../BackLink";
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  AreaChart, Area, CartesianGrid, Tooltip } from "recharts";

type Cafe = {
  id: number; name: string; area: string; note: string; beans: string;
  signature: string; uses: string; phone: string; source: string; published: boolean;
};
type Stats = {
  content: {
    total: number; published: number; hidden: number; owner_pending: number; embedded: number; has_dates: number; raw_cached: number; llm_judged: number;
    grades: { grade: string; n: number }[];
    quality: { avg_noise_pct: number | null; raw: number; rejected: number };
    topRegions: { region: string; n: number }[];
  };
  visitors: {
    total: number; agreed: number; declined: number; located: number; returners: number; active7d: number; new7d: number; avg_visits: number | null;
    daily: { d: string; n: number }[];
    regions: { region: string; n: number }[];
  };
};

const GRADE_COLOR: Record<string, string> = { 검증: "#5f7355", 참고: "#9c6b3f", 발굴: "#a8927a", 미합성: "#cbd5e1" };
const BAR = "#9c6b3f";

export default function AdminPage() {
  const [pw, setPw] = useState("");
  const [authed, setAuthed] = useState(false);
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [msg, setMsg] = useState("");
  const [showAuto, setShowAuto] = useState(false);
  const [q, setQ] = useState("");
  const [review, setReview] = useState<any[]>([]);

  const load = async (password: string) => {
    setMsg("불러오는 중...");
    const r = await fetch("/api/admin/cafes", { headers: { "x-admin-password": password } });
    if (r.status === 401) { setMsg("비밀번호가 틀렸습니다."); return; }
    const d = await r.json();
    if (d.ok) { setCafes(d.cafes); setAuthed(true); setMsg(""); }
    else { setMsg("오류: " + d.error); return; }
    fetch("/api/admin/stats", { headers: { "x-admin-password": password } }).then((x) => x.json()).then((s) => { if (s.ok) setStats(s); }).catch(() => {});
    loadReview(password);
  };

  const act = async (id: number, action: string, published?: boolean) => {
    await fetch("/api/admin/cafes", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": pw }, body: JSON.stringify({ id, action, published }) });
    load(pw);
  };

  // 🎀 쇼케이스 승인
  const loadReview = (password: string) => fetch("/api/promo-queue?review=1", { headers: { "x-admin-password": password } }).then((x) => x.json()).then((d) => { if (d.ok) setReview(d.review ?? []); }).catch(() => {});
  const promoAct = async (cafeId: number, action: "approve" | "reject") => {
    await fetch("/api/promo-queue", { method: "POST", headers: { "Content-Type": "application/json", "x-admin-password": pw }, body: JSON.stringify({ cafeId, [action]: true }) });
    loadReview(pw);
  };

  if (!authed) {
    return (
      <main className="min-h-screen bg-stone-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-sm">
          <BackLink to="/" label="홈" className="text-stone-400 mb-4" />
          <h1 className="text-xl font-bold mb-1">관리자 대시보드</h1>
          <p className="text-sm text-stone-500 mb-4">비밀번호를 입력하세요.</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(pw)}
            placeholder="비밀번호" className="w-full border rounded-lg px-3 py-2.5 mb-3" />
          <button onClick={() => load(pw)} className="w-full bg-stone-900 text-white rounded-lg py-2.5 font-medium">들어가기</button>
          {msg && <p className="text-sm text-red-600 mt-3">{msg}</p>}
        </div>
      </main>
    );
  }

  const ownerPending = cafes.filter((c) => !c.published && c.source === "owner");
  const autoHidden = cafes.filter((c) => !c.published && c.source !== "owner");
  const live = cafes.filter((c) => c.published);
  const searched = q.trim() ? cafes.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())) : [];

  const Kpi = ({ label, value, sub, color = "text-stone-900" }: { label: string; value: any; sub?: string; color?: string }) => (
    <div className="bg-white rounded-xl border p-3.5">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-stone-500 mt-0.5">{label}</div>
      {sub && <div className="text-[10px] text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
  const Card = ({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) => (
    <div className="bg-white rounded-xl border p-4">
      <div className="text-sm font-bold text-stone-700 mb-3">{title}</div>
      {children}
      {note && <p className="text-[10px] text-stone-400 mt-2">{note}</p>}
    </div>
  );
  const Row = ({ c }: { c: Cafe }) => (
    <div className="bg-white rounded-xl p-4 border flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold">{c.name}</span>
          <span className="text-xs text-stone-400">{c.area}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${c.source === "owner" ? "bg-blue-100 text-blue-700" : c.source === "seed" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-500"}`}>{c.source}</span>
          {!c.published && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-500">비공개</span>}
        </div>
        {c.note && <p className="text-sm text-stone-600 mt-1 line-clamp-1">{c.note}</p>}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={() => act(c.id, "publish", !c.published)} className={`text-xs px-3 py-1.5 rounded-lg ${c.published ? "bg-stone-200 text-stone-700" : "bg-emerald-600 text-white"}`}>{c.published ? "숨기기" : "공개하기"}</button>
        <button onClick={() => { if (confirm(`${c.name} 삭제?`)) act(c.id, "delete"); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-600">삭제</button>
      </div>
    </div>
  );

  const ct = stats?.content, vs = stats?.visitors;
  const agreeRate = vs && vs.total ? Math.round((vs.agreed / vs.total) * 100) : 0;
  const keptPct = ct?.quality?.raw ? Math.round(((ct.quality.raw - ct.quality.rejected) / ct.quality.raw) * 100) : 0;

  return (
    <main className="min-h-screen bg-stone-100 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <BackLink to="/" label="홈" className="text-stone-500" />
          <h1 className="text-2xl font-bold">관리자 대시보드</h1>
          <button onClick={() => load(pw)} className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700">새로고침</button>
        </div>

        {/* ===== 🎀 쇼케이스 승인 대기 ===== */}
        {review.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">🎀 쇼케이스 승인 대기 ({review.length})</div>
            <div className="space-y-3">
              {review.map((p) => (
                <div key={p.cafe_id} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-sm">{p.name}</span>
                      <span className="text-[11px] text-stone-400">{p.area}</span>
                      {p.ai_pending && <span className="text-[10px] bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded-full ml-auto">AI 생성 대기</span>}
                    </div>
                    {p.intro && <p className="text-[12px] text-stone-500 mb-2 line-clamp-2">사장님 글: {p.intro}</p>}
                    {p.style === 0 ? (
                      p.video_url ? (
                        <div className="rounded-lg overflow-hidden bg-black">
                          <span className="text-[10px] text-amber-600 px-1">🎬 영상 (소비자 노출 예정)</span>
                          <video src={p.video_url} controls playsInline preload="metadata" className="w-full max-h-48" />
                        </div>
                      ) : <p className="text-[12px] text-stone-400">영상 업로드 대기 중</p>
                    ) : p.ai_headline ? (
                      <div className="rounded-lg overflow-hidden bg-stone-900 text-stone-50">
                        {p.photos?.[0] && <img src={p.photos[0]} alt="" className="w-full h-28 object-cover" />}
                        <div className="p-3">
                          <div className="text-[9px] text-amber-300 mb-0.5">미리보기 (소비자 노출 예정)</div>
                          <div className="text-base font-bold">{p.ai_headline}</div>
                          {p.ai_tagline && <div className="text-[12px] text-stone-300 mt-0.5">{p.ai_tagline}</div>}
                          {Array.isArray(p.ai_points) && p.ai_points.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{p.ai_points.map((pt: string, i: number) => <span key={i} className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">{pt}</span>)}</div>}
                        </div>
                      </div>
                    ) : <p className="text-[12px] text-stone-400">AI 카피 생성 대기 중 — 로컬 배치 실행 후 다시 확인</p>}
                  </div>
                  <div className="flex border-t border-stone-100">
                    <button onClick={() => promoAct(p.cafe_id, "approve")} disabled={!p.ai_headline && !p.video_url} className="flex-1 py-2.5 text-sm font-bold text-emerald-700 disabled:text-stone-300">✓ 승인 (노출)</button>
                    <button onClick={() => promoAct(p.cafe_id, "reject")} className="flex-1 py-2.5 text-sm text-rose-600 border-l border-stone-100">✕ 반려</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== 콘텐츠 현황 ===== */}
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">콘텐츠 현황</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <Kpi label="전체 카페" value={ct?.total ?? "·"} />
          <Kpi label="공개 중" value={ct?.published ?? "·"} color="text-emerald-600" />
          <Kpi label="비공개" value={ct?.hidden ?? "·"} color="text-stone-500" />
          <Kpi label="사장님 등록대기" value={ct?.owner_pending ?? "·"} color="text-blue-600" sub="사람 검수 필요" />
        </div>

        {ct && (
          <div className="grid sm:grid-cols-2 gap-3 mb-4">
            <Card title="등급 분포 (공개)" note="검증 30+ · 참고 5~30 · 발굴 5미만(자동 비공개)">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={ct.grades} dataKey="n" nameKey="grade" cx="50%" cy="50%" innerRadius={42} outerRadius={70} paddingAngle={2}
                    label={(e: any) => `${e.grade} ${e.n}`} labelLine={false} fontSize={11}>
                    {ct.grades.map((g) => <Cell key={g.grade} fill={GRADE_COLOR[g.grade] ?? "#cbd5e1"} />)}
                  </Pie><Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Card>
            <Card title="지역별 공개 카페 (상위 12)">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ct.topRegions} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <XAxis type="number" hide /><YAxis type="category" dataKey="region" width={70} tick={{ fontSize: 10, fill: "#57534e" }} />
                  <Tooltip /><Bar dataKey="n" fill={BAR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {ct && (
          <div className="mb-4">
            <Card title="🛡 리뷰 검증 엔진 현황 (해자)" note="규칙으로 노이즈 제거 → Sonnet이 맥락 판정 → 양질 후기만 공개. 매일 자동 갱신.">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                <div><div className="text-xl font-bold text-stone-900">{ct.total ? Math.round((ct.raw_cached / ct.total) * 100) : 0}%</div><div className="text-[11px] text-stone-500">원본 수집(예열)</div><div className="text-[10px] text-stone-400">{ct.raw_cached}/{ct.total}</div></div>
                <div><div className="text-xl font-bold text-emerald-600">{ct.total ? Math.round((ct.llm_judged / ct.total) * 100) : 0}%</div><div className="text-[11px] text-stone-500">AI 맥락 판정</div><div className="text-[10px] text-stone-400">{ct.llm_judged}/{ct.total}</div></div>
                <div><div className="text-xl font-bold text-[#9c6b3f]">{ct.quality.avg_noise_pct ?? 0}%</div><div className="text-[11px] text-stone-500">노이즈 제거율</div><div className="text-[10px] text-stone-400">옥석만</div></div>
              </div>
              <p className="text-[10px] text-stone-400 mt-2.5">예열(00:10)으로 원본을 한 번 모아두고, Sonnet 판정(04:00)이 매일 정확도를 끌어올립니다.</p>
            </Card>
          </div>
        )}

        {ct && (
          <div className="mb-6">
            <Card title="데이터 품질" note="모든 화면 데이터는 검증된 옥석 리뷰만 사용">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div><div className="text-xl font-bold text-[#9c6b3f]">{ct.quality.avg_noise_pct ?? 0}%</div><div className="text-[11px] text-stone-500">평균 노이즈 제거</div></div>
                <div><div className="text-xl font-bold text-emerald-600">{keptPct}%</div><div className="text-[11px] text-stone-500">옥석 채택률</div></div>
                <div><div className="text-xl font-bold text-stone-900">{ct.total ? Math.round((ct.embedded / ct.total) * 100) : 0}%</div><div className="text-[11px] text-stone-500">임베딩 커버리지</div></div>
                <div><div className="text-xl font-bold text-stone-900">{ct.total ? Math.round((ct.has_dates / ct.total) * 100) : 0}%</div><div className="text-[11px] text-stone-500">리뷰주기 데이터</div></div>
              </div>
              <p className="text-[11px] text-stone-400 mt-2.5 text-center">총 수집 {ct.quality.raw?.toLocaleString()}건 중 노이즈 {ct.quality.rejected?.toLocaleString()}건 제거 → 옥석 {(ct.quality.raw - ct.quality.rejected).toLocaleString()}건</p>
            </Card>
          </div>
        )}

        {/* ===== 접속/방문자 (익명) ===== */}
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">접속 · 방문자 현황</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <Kpi label="총 방문자" value={vs?.total ?? "·"} sub="익명 식별자 기준" />
          <Kpi label="위치 동의" value={vs?.agreed ?? "·"} color="text-emerald-600" sub={`동의율 ${agreeRate}%`} />
          <Kpi label="재방문자" value={vs?.returners ?? "·"} color="text-[#9c6b3f]" sub={`평균 ${vs?.avg_visits ?? 0}회`} />
          <Kpi label="최근 7일 활성" value={vs?.active7d ?? "·"} color="text-amber-600" sub={`신규 ${vs?.new7d ?? 0}`} />
        </div>

        {vs && (
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Card title="일별 신규 방문 (최근 14일)">
              {vs.daily.length === 0 ? <p className="text-sm text-stone-400 py-8 text-center">아직 방문 데이터가 적어요.</p> : (
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart data={vs.daily} margin={{ top: 5, right: 8, bottom: 0, left: -20 }}>
                    <defs><linearGradient id="vis" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5f7355" stopOpacity={0.5} /><stop offset="100%" stopColor="#5f7355" stopOpacity={0.05} /></linearGradient></defs>
                    <CartesianGrid stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="d" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={1} axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#94a3b8" }} width={26} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any) => [`${v}명`, "신규"]} />
                    <Area type="monotone" dataKey="n" stroke="#5f7355" strokeWidth={2} fill="url(#vis)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>
            <Card title="방문자 동네 분포 (위치 동의자)" note="≈500m 익명화 · 개인정보 미수집">
              {vs.regions.length === 0 ? <p className="text-sm text-stone-400 py-8 text-center">위치 동의 데이터가 아직 적어요.</p> : (
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={vs.regions} layout="vertical" margin={{ left: 8, right: 12 }}>
                    <XAxis type="number" hide /><YAxis type="category" dataKey="region" width={80} tick={{ fontSize: 10, fill: "#57534e" }} />
                    <Tooltip /><Bar dataKey="n" fill="#5f7355" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>
        )}
        <p className="text-[10px] text-stone-400 mb-6">합법·익명 수집만: 브라우저 익명 식별자, (동의 시) 대략 지역(≈500m). 이름·연락처·정밀위치는 수집하지 않습니다.</p>

        {/* ===== 검수 관리 ===== */}
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">검수 관리</div>
        <section className="mb-4">
          <h2 className="text-sm font-bold text-stone-700 mb-1">🙋 사장님 등록 검수 대기 ({ownerPending.length})</h2>
          <p className="text-[11px] text-stone-400 mb-2">사장님이 <b>/cafe/register</b>로 직접 등록한 가게. 확인 후 공개/삭제.</p>
          {ownerPending.length === 0 ? <p className="text-sm text-stone-400 bg-white rounded-xl p-4 border">아직 사장님 직접 등록 신청이 없습니다.</p> :
            <div className="space-y-2">{ownerPending.map((c) => <Row key={c.id} c={c} />)}</div>}
        </section>
        <section className="mb-6">
          <h2 className="text-sm font-bold text-stone-700 mb-1">🔍 자동수집 미공개 · 데이터 부족 ({autoHidden.length})</h2>
          <p className="text-[11px] text-stone-400 mb-2">검증 리뷰 5건 미만(발굴)으로 자동 비공개. 사람 요청 아님 · 리뷰 쌓이면 자동 공개.</p>
          {autoHidden.length === 0 ? <p className="text-sm text-stone-400">없음</p> : (
            <>
              <button onClick={() => setShowAuto((v) => !v)} className="text-xs px-3 py-1.5 rounded-lg bg-stone-200 text-stone-700 mb-2">{showAuto ? "접기 ▲" : `목록 펼치기 ▼ (${autoHidden.length})`}</button>
              {showAuto && <div className="space-y-2">{autoHidden.map((c) => <Row key={c.id} c={c} />)}</div>}
            </>
          )}
        </section>

        {/* ===== 카페 검색 관리 (1000+ 전체 나열 대신 검색) ===== */}
        <div className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">카페 검색 관리</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`카페 이름 검색 (전체 ${cafes.length}곳)`} className="w-full border rounded-lg px-4 py-2.5 mb-3 bg-white" />
        {q.trim() === "" ? <p className="text-sm text-stone-400">이름을 검색해 개별 카페를 공개/숨김/삭제 관리하세요. (공개 {live.length} · 비공개 {ownerPending.length + autoHidden.length})</p>
          : searched.length === 0 ? <p className="text-sm text-stone-400">'{q}' 검색 결과 없음</p>
          : <div className="space-y-2">{searched.slice(0, 40).map((c) => <Row key={c.id} c={c} />)}{searched.length > 40 && <p className="text-xs text-stone-400 text-center">상위 40곳만 표시 · 더 좁혀 검색하세요</p>}</div>}
      </div>
    </main>
  );
}
