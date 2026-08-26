"use client";
import { useState } from "react";

// 🏅 사장님 배지 발급 페이지 — 검증 배지 HTML을 복사해 블로그·홈페이지에 붙인다.
//   우리에겐 백링크(카페 상세로 걸리는 자발적 링크), 사장님에겐 인증 마크. 서로 이득이라 지속된다.
//   ⚠️ robots.txt가 /owner를 막고 있어 이 페이지 자체는 색인 안 됨 — 의도된 것(도구 페이지).
export default function BadgePage() {
  const [q, setQ] = useState("");
  const [cafe, setCafe] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const search = async () => {
    setMsg(""); setCafe(null); setCopied(false);
    const d = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => null);
    const hit = d?.results?.[0];
    if (!hit) { setMsg("카페를 못 찾았어요. 상호를 정확히 입력해 주세요."); return; }
    // 배지는 검증·참고 등급에만 발급된다(배지가 곧 인증이므로).
    const ok = await fetch(`/api/badge/${hit.id}`).then((r) => r.ok).catch(() => false);
    if (!ok) { setMsg(`'${hit.name}'은(는) 아직 검증 등급이 아니에요. 후기가 더 쌓이면 발급됩니다.`); return; }
    setCafe(hit);
  };

  const site = "https://dongnecoffeenote.com";
  const html = cafe ? `<a href="${site}/c/${cafe.id}" target="_blank" rel="noopener"><img src="${site}/api/badge/${cafe.id}" alt="동네 커피 노트 검증 카페 — ${cafe.name}" width="230" height="54" /></a>` : "";

  return (
    <main className="min-h-screen bg-[#f4ece0] text-[#2b2018] px-5 py-10" style={{ fontFamily: "'Gowun Batang', serif" }}>
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-bold mb-2">🏅 검증 배지 달기</h1>
        <p className="text-[13.5px] text-[#524234] leading-relaxed mb-6">
          동네 커피 노트가 <b>광고·협찬을 걸러낸 진짜 후기</b>로 검증한 카페임을 보여주는 배지예요.<br />
          블로그·홈페이지·인스타 프로필 링크 어디든 붙일 수 있어요.
        </p>
        <div className="flex gap-2 mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="카페 상호 입력" className="flex-1 border border-[#cbb89f] rounded-xl px-4 py-3 bg-white text-[15px]" />
          <button onClick={search} className="bg-[#2b2018] text-[#f4ece0] rounded-xl px-5 font-bold">찾기</button>
        </div>
        {msg && <p className="text-[13px] text-[#b23a5f] mb-4">{msg}</p>}
        {cafe && (
          <div className="bg-white rounded-2xl border border-[#d9c9ab] p-5">
            <div className="text-[13px] font-bold mb-3">{cafe.name} <span className="text-[#7a5122] font-normal">({cafe.area})</span></div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/badge/${cafe.id}`} alt="배지 미리보기" width={230} height={54} className="mb-4" />
            <div className="text-[11px] font-bold text-[#52402e] mb-1">아래 HTML을 복사해 붙여넣으세요</div>
            <textarea readOnly value={html} onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="w-full h-24 text-[11px] font-mono border border-[#e3d3b8] rounded-lg p-2.5 bg-[#fdfaf4]" />
            <button onClick={() => { navigator.clipboard.writeText(html).then(() => setCopied(true)).catch(() => {}); }}
              className="mt-2 w-full bg-[#5f7355] text-white rounded-xl py-2.5 text-[13px] font-bold">{copied ? "복사됨 ✓" : "HTML 복사"}</button>
            <p className="text-[11px] text-[#7a6a55] mt-3 leading-relaxed">
              배지는 등급이 유지되는 동안 자동 갱신돼요. 검증 기준을 벗어나면 표시되지 않습니다.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
