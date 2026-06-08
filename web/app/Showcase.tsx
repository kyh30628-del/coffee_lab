"use client";
import { useState, useEffect } from "react";
import ShowcaseBanner, { SHOWCASE_CSS, SHOWCASE_TEMPLATES, toVideoEmbed } from "./ShowcaseBanner";

// 사장님 쇼케이스 편집기 — 글·사진 → AI 홍보물 요청 → (배치 생성) → 관리자 승인 → 카페 상세 배너.
export default function Showcase({ cafeId, cafeName, pw }: { cafeId: number; cafeName: string; pw: string }) {
  const [promo, setPromo] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const hdr = { "x-admin-password": pw };

  useEffect(() => {
    let live = true; setPromo(null); setMsg("");
    fetch(`/api/owner-promo?cafeId=${cafeId}`, { headers: hdr }).then((r) => r.json())
      .then((d) => { if (live) setPromo(d.promo ?? { intro: "", photos: [] }); })
      .catch(() => { if (live) setPromo({ intro: "", photos: [] }); });
    return () => { live = false; };
  }, [cafeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const resizeImg = (file: File): Promise<string> => new Promise((res) => {
    const img = new Image(); const fr = new FileReader();
    fr.onload = () => { img.src = fr.result as string; };
    img.onload = () => { const max = 1000; let w = img.width, h = img.height; if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); } const cv = document.createElement("canvas"); cv.width = w; cv.height = h; cv.getContext("2d")!.drawImage(img, 0, 0, w, h); res(cv.toDataURL("image/jpeg", 0.82)); };
    fr.readAsDataURL(file);
  });
  const onPhoto = async (e: any) => { const f = e.target.files?.[0]; if (!f) return; const url = await resizeImg(f); setPromo((p: any) => ({ ...(p ?? {}), photos: [...((p?.photos ?? []).slice(0, 2)), url] })); e.target.value = ""; };
  const rmPhoto = (i: number) => setPromo((p: any) => ({ ...p, photos: (p?.photos ?? []).filter((_: any, j: number) => j !== i) }));
  const pickStyle = async (n: number) => {
    setPromo((p: any) => ({ ...(p ?? {}), style: n }));
    // 이미 생성된 홍보면 스타일만 즉시 저장(내용·승인 유지)
    if (promo?.ai_headline) { try { await fetch("/api/owner-promo", { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, styleOnly: true, style: n }) }); } catch {} }
  };
  const [vidLink, setVidLink] = useState("");
  const saveVideoLink = async () => {
    const link = vidLink.trim();
    if (!/^https?:\/\//.test(link)) { setMsg("유튜브/비메오 영상 링크를 붙여넣어 주세요 (https://…)"); return; }
    setBusy(true); setMsg("저장 중…");
    try {
      const r = await fetch("/api/owner-promo", { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, mode: "video", video_url: link }) });
      const d = await r.json();
      if (d.ok) { setPromo(d.promo); setVidLink(""); setMsg("✅ 영상 링크 저장 — 관리자 승인 후 노출돼요"); }
      else setMsg("저장 오류: " + (d.error ?? ""));
    } catch { setMsg("네트워크 오류"); }
    setBusy(false);
  };
  const submit = async () => {
    setBusy(true); setMsg("요청 보내는 중…");
    try {
      const r = await fetch("/api/owner-promo", { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, intro: promo?.intro ?? "", photos: promo?.photos ?? [], style: promo?.style || 1 }) });
      const d = await r.json();
      if (d.ok) { setPromo(d.promo); setMsg("💾 저장 완료 — 관리자가 검토 후 AI 어필 카피를 생성·노출해요"); }
      else setMsg("오류: " + (d.error ?? ""));
    } catch { setMsg("네트워크 오류"); }
    setBusy(false);
  };

  if (!promo) return <p className="text-[12px] text-[#a8927a]">불러오는 중…</p>;
  const status = promo.style === 0
    ? (promo.video_url ? (promo.approved ? "🟢 공개 중 — 카페 상세에 영상이 노출돼요" : "🟡 영상 — 관리자 승인 대기 중") : "🎬 홍보 영상을 올려주세요")
    : promo.ai_pending ? "🕐 관리자가 생성 요청함 — AI 카피 생성 중"
      : promo.ai_headline ? (promo.approved ? "🟢 공개 중 — 카페 상세 상단에 노출돼요" : "🟡 관리자 승인 대기 중")
        : "🟡 저장 후 관리자가 검토·생성합니다 (문구를 적고 저장해 주세요)";

  return (
    <div className="bg-gradient-to-br from-[#2b2018] to-[#4a3424] text-[#f4ece0] rounded-2xl p-4 sm:p-5">
      <style dangerouslySetInnerHTML={{ __html: SHOWCASE_CSS }} />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🎀</span>
        <h3 className="text-base font-bold">우리 가게 쇼케이스</h3>
        <span className="text-[9px] bg-[#e8b87a] text-[#2b2018] px-1.5 py-0.5 rounded-full font-bold ml-auto">구독 미리보기</span>
      </div>
      <p className="text-[12px] text-[#cbb89f] leading-relaxed mb-3"><b className="text-[#f4ece0]">{cafeName}</b> · 홍보 <b className="text-[#f4ece0]">문구를 적으면 AI가 요약</b>해 어필 카피로, 또는 <b className="text-[#f4ece0]">유튜브 영상 링크</b>를 붙일 수 있어요. <b className="text-[#f4ece0]">관리자 승인</b> 후 카페 상세 맨 위에 노출돼요.</p>

      {/* 표시 방식 — 영상 또는 템플릿(글) */}
      <div className="mb-3">
        <div className="text-[11px] text-[#cbb89f] mb-1.5">표시 방식 — 영상 또는 템플릿(글)을 고르세요 (<a href="/showcase-styles" target="_blank" className="underline">템플릿 샘플 보기</a>)</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 -mx-1 px-1">
          <button onClick={() => setPromo((p: any) => ({ ...(p ?? {}), style: 0 }))}
            className={`shrink-0 text-[10.5px] px-2.5 py-1.5 rounded-full border whitespace-nowrap ${promo?.style === 0 ? "bg-[#e8b87a] text-[#2b2018] border-[#e8b87a] font-bold" : "border-[#7a5c3c] text-[#cbb89f]"}`}>
            🎬 영상 링크
          </button>
          {SHOWCASE_TEMPLATES.map((t) => {
            const on = (promo?.style || 1) === t.id;
            return (
              <button key={t.id} onClick={() => pickStyle(t.id)} title={t.desc}
                className={`shrink-0 text-[10.5px] px-2.5 py-1.5 rounded-full border whitespace-nowrap ${on ? "bg-[#e8b87a] text-[#2b2018] border-[#e8b87a] font-bold" : "border-[#7a5c3c] text-[#cbb89f]"}`}>
                {t.id}. {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {promo?.style === 0 ? (
        // ===== 영상 링크 모드 =====
        <div>
          <div className="flex gap-1.5 mb-2">
            <input value={vidLink} onChange={(e) => setVidLink(e.target.value)} placeholder="유튜브 영상 링크 붙여넣기 (https://youtu.be/…)" className="flex-1 rounded-lg px-3 py-2 text-[12.5px] text-[#2b2018] bg-[#fdfaf4]" />
            <button disabled={busy} onClick={saveVideoLink} className="bg-[#e8b87a] text-[#2b2018] rounded-lg px-3.5 text-[13px] font-bold disabled:opacity-50">저장</button>
          </div>
          <p className="text-[10.5px] text-[#cbb89f] mb-2">유튜브에 영상을 올리고(공개/일부공개) 주소창의 링크를 붙여넣으면 카페 상세에 바로 재생돼요. 비메오도 지원.</p>
          {promo?.video_url && (
            toVideoEmbed(promo.video_url) ? (
              <div className="rounded-xl overflow-hidden border border-[#5a4633] bg-black aspect-video">
                <iframe src={toVideoEmbed(promo.video_url)!} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
              </div>
            ) : (
              <a href={promo.video_url} target="_blank" rel="noopener noreferrer" className="block text-center bg-[#3a2a1c] rounded-lg py-3 text-[12.5px] text-[#e8b87a]">▶ 등록된 영상 링크 열기 (임베드 미지원 형식)</a>
            )
          )}
        </div>
      ) : (
        // ===== 템플릿(글) 모드 =====
        <div>
          <textarea value={promo?.intro ?? ""} onChange={(e) => setPromo((p: any) => ({ ...(p ?? {}), intro: e.target.value }))} placeholder="우리 가게 홍보 문구를 자유롭게 — AI가 요약해 어필 카피로 만들어요" rows={3} className="w-full rounded-lg p-3 text-[13px] text-[#2b2018] bg-[#fdfaf4] mb-2 resize-none" />
          <div className="flex gap-2 flex-wrap mb-2.5">
            {(promo?.photos ?? []).map((url: string, i: number) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => rmPhoto(i)} className="absolute top-0 right-0 bg-black/60 text-white text-[11px] w-4.5 h-4.5 leading-none flex items-center justify-center rounded-bl">×</button>
              </div>
            ))}
            {(promo?.photos?.length ?? 0) < 3 && (
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-[#9c6b3f] flex items-center justify-center text-[#cbb89f] text-2xl cursor-pointer">+
                <input type="file" accept="image/*" onChange={onPhoto} className="hidden" />
              </label>
            )}
          </div>
          <button disabled={busy} onClick={submit} className="w-full bg-[#e8b87a] text-[#2b2018] rounded-lg py-2.5 text-sm font-bold disabled:opacity-50 mb-2">💾 저장하고 검토 요청 (관리자가 AI 카피 생성)</button>
          {promo?.ai_headline && (
            <div className="mt-1">
              <div className="text-[10px] text-[#cbb89f] mb-1">미리보기 — 위에서 스타일을 바꾸면 바로 반영돼요</div>
              <div className="rounded-xl overflow-hidden border border-[#5a4633]">
                <ShowcaseBanner style={promo.style || 1} headline={promo.ai_headline} tagline={promo.ai_tagline} points={Array.isArray(promo.ai_points) ? promo.ai_points : []} photo={promo.photos?.[0] || null} height="200px" />
              </div>
            </div>
          )}
        </div>
      )}
      {msg && <p className="text-[11px] text-[#e8b87a] mt-2">{msg}</p>}
      <p className="text-[10.5px] text-[#cbb89f] mt-2">{status}</p>
    </div>
  );
}
