"use client";
import { useState, useEffect } from "react";
import { upload } from "@vercel/blob/client";
import ShowcaseBanner, { SHOWCASE_CSS, SHOWCASE_TEMPLATES } from "./ShowcaseBanner";

// 사장님 쇼케이스 편집기 — 글·사진 → AI 홍보물 요청 → (배치 생성) → 관리자 승인 → 카페 상세 배너.
export default function Showcase({ cafeId, cafeName, pw }: { cafeId: number; cafeName: string; pw: string }) {
  const [promo, setPromo] = useState<any>(null);
  const [month, setMonth] = useState<any>(null);
  const [coupon, setCoupon] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const hdr = { "x-admin-password": pw };
  const reload = () => fetch(`/api/owner-promo?cafeId=${cafeId}`, { headers: hdr }).then((r) => r.json())
    .then((d) => { setPromo(d.promo ?? { intro: "", photos: [] }); setMonth(d.month ?? null); setCoupon(d.promo?.coupon ?? ""); });

  useEffect(() => {
    let live = true; setPromo(null); setMonth(null); setMsg("");
    fetch(`/api/owner-promo?cafeId=${cafeId}`, { headers: hdr }).then((r) => r.json())
      .then((d) => { if (live) { setPromo(d.promo ?? { intro: "", photos: [] }); setMonth(d.month ?? null); setCoupon(d.promo?.coupon ?? ""); } })
      .catch(() => { if (live) setPromo({ intro: "", photos: [] }); });
    return () => { live = false; };
  }, [cafeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveCoupon = async () => {
    setBusy(true);
    try { const r = await fetch("/api/owner-promo", { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, couponOnly: true, coupon }) }); const d = await r.json(); if (d.ok) { setPromo(d.promo); setMsg("🎟 쿠폰 저장됨"); } } catch {}
    setBusy(false);
  };

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
  const [vidBusy, setVidBusy] = useState(false);
  const onVideo = async (e: any) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    const dur = await new Promise<number>((res) => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => res(v.duration); v.onerror = () => res(0); v.src = URL.createObjectURL(f); });
    if (dur > 0 && dur > 23) { setMsg("영상이 너무 길어요 — 20초 이내로 올려주세요"); return; }
    if (f.size > 80 * 1024 * 1024) { setMsg("파일이 너무 큽니다 (80MB 이내). 20초 정도로 짧게 찍어주세요"); return; }
    setVidBusy(true); setMsg("영상 업로드 중… (잠시 걸려요)");
    try {
      const blob = await upload(`showcase/${cafeId}-${Date.now()}.${(f.name.split(".").pop() || "mp4")}`, f, { access: "public", handleUploadUrl: "/api/showcase-video", clientPayload: pw });
      const r = await fetch("/api/owner-promo", { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, mode: "video", video_url: blob.url }) });
      const d = await r.json();
      if (d.ok) { setPromo(d.promo); setMsg("✅ 영상 업로드 완료 — 관리자 승인 후 노출돼요"); }
      else setMsg("저장 오류: " + (d.error ?? ""));
    } catch (err) { setMsg("영상 업로드 실패: " + String(err).slice(0, 70)); }
    setVidBusy(false);
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
        <span className="text-[9px] bg-[#e8b87a] text-[#2b2018] px-1.5 py-0.5 rounded-full font-bold ml-auto">💎 구독 전용</span>
      </div>
      <p className="text-[12px] text-[#cbb89f] leading-relaxed mb-3"><b className="text-[#f4ece0]">{cafeName}</b> · 홍보 <b className="text-[#f4ece0]">문구를 적으면 AI가 요약</b>해 어필 카피로, 또는 <b className="text-[#f4ece0]">홍보 영상</b>을 올릴 수 있어요. <b className="text-[#f4ece0]">관리자 승인</b> 후 카페 상세 맨 위에 노출돼요.</p>

      {/* 📊 성과 분석 — 우리 앱 1차 데이터 */}
      {promo?.approved && (
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] text-[#cbb89f]">📊 우리 가게 홍보 성과</span>
            {promo?.featured && <span className="text-[9px] bg-[#e8b87a] text-[#2b2018] px-1.5 py-0.5 rounded-full font-bold">⭐ 우선 노출 중{promo.featured_until ? ` (D-${Math.max(0, Math.ceil((new Date(promo.featured_until).getTime() - Date.now()) / 86400000))})` : ""}</span>}
          </div>
          {/* 이번 달 리포트 */}
          {month && (
            <div className="bg-black/25 rounded-lg px-3 py-2 mb-1.5">
              <div className="text-[10px] text-[#cbb89f] mb-1">이번 달
                {month.prevViews > 0 && month.views !== month.prevViews && (
                  <span className={month.views >= month.prevViews ? "text-emerald-300 ml-1.5" : "text-rose-300 ml-1.5"}>
                    {month.views >= month.prevViews ? "▲" : "▼"} 지난달 대비 {Math.abs(Math.round((month.views - month.prevViews) / month.prevViews * 100))}%
                  </span>
                )}
              </div>
              <div className="flex gap-4 text-[12px] text-[#f4ece0]">
                <span>노출 <b className="text-[#e8b87a]">{month.views}</b></span>
                <span>클릭 <b className="text-[#e8b87a]">{month.clicks}</b></span>
                <span>재생 <b className="text-[#e8b87a]">{month.plays}</b></span>
              </div>
            </div>
          )}
          <div className="text-[9px] text-[#a8927a] mb-1">누적</div>
          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-black/25 rounded-lg py-2 text-center"><div className="text-lg font-bold text-[#e8b87a]">{promo.views ?? 0}</div><div className="text-[9px] text-[#cbb89f]">노출(조회)</div></div>
            <div className="bg-black/25 rounded-lg py-2 text-center"><div className="text-lg font-bold text-[#e8b87a]">{promo.clicks ?? 0}</div><div className="text-[9px] text-[#cbb89f]">클릭</div></div>
            <div className="bg-black/25 rounded-lg py-2 text-center"><div className="text-lg font-bold text-[#e8b87a]">{promo.plays ?? 0}</div><div className="text-[9px] text-[#cbb89f]">영상 재생</div></div>
          </div>
        </div>
      )}

      {/* 🎟 쿠폰·프로모션 — 손님 유입 */}
      {promo?.approved && (
        <div className="mb-3">
          <div className="text-[11px] text-[#cbb89f] mb-1.5">🎟 방문 혜택 (카페 상세에 노출 → 손님 유입)</div>
          <div className="flex gap-1.5">
            <input value={coupon} onChange={(e) => setCoupon(e.target.value)} maxLength={60} placeholder="예) 이 글 보고 오면 사이즈업 ☕" className="flex-1 min-w-0 rounded-lg px-3 py-2 text-[12.5px] text-[#2b2018] bg-[#fdfaf4]" />
            <button disabled={busy} onClick={saveCoupon} className="shrink-0 bg-[#9c6b3f] text-[#f4ece0] rounded-lg px-4 text-[13px] font-bold disabled:opacity-50">저장</button>
          </div>
        </div>
      )}

      {/* 표시 방식 — 영상 또는 템플릿(글) */}
      <div className="mb-3">
        <div className="text-[11px] text-[#cbb89f] mb-1.5">표시 방식 — 영상 또는 템플릿(글)을 고르세요 (<a href="/showcase-styles" target="_blank" className="underline">템플릿 샘플 보기</a>)</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1.5 -mx-1 px-1">
          <label className={`shrink-0 text-[10.5px] px-2.5 py-1.5 rounded-full border whitespace-nowrap cursor-pointer ${promo?.style === 0 ? "bg-[#e8b87a] text-[#2b2018] border-[#e8b87a] font-bold" : "border-[#7a5c3c] text-[#cbb89f]"}`}>
            🎬 영상 업로드
            <input type="file" accept="video/*" onChange={onVideo} className="hidden" />
          </label>
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
        // ===== 영상 모드 =====
        <div>
          {promo?.video_url ? (
            <>
              <div className="rounded-xl overflow-hidden border border-[#5a4633] mb-2 bg-black">
                <video src={promo.video_url} controls playsInline preload="metadata" className="w-full max-h-56" />
              </div>
              <label className="block text-center text-[11px] text-[#e8b87a] underline cursor-pointer">다른 영상으로 교체<input type="file" accept="video/*" onChange={onVideo} className="hidden" /></label>
            </>
          ) : (
            <label className="block border-2 border-dashed border-[#9c6b3f] rounded-xl py-7 text-center text-[#cbb89f] text-[13px] cursor-pointer">
              {vidBusy ? "업로드 중…" : <>🎬 홍보 영상 올리기 (탭하여 선택)<br /><span className="text-[10.5px] opacity-80">약 20초 이내 · 80MB · mp4/mov</span></>}
              <input type="file" accept="video/*" onChange={onVideo} className="hidden" disabled={vidBusy} />
            </label>
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
          <button disabled={busy} onClick={submit} className="w-full bg-[#e8b87a] text-[#2b2018] rounded-lg py-2.5 font-bold disabled:opacity-50 mb-2 text-center leading-tight">💾 저장하고 검토 요청<br /><span className="text-[10px] font-normal opacity-80">(관리자가 AI 카피 생성)</span></button>
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
