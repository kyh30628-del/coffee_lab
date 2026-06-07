"use client";
import { useState, useEffect } from "react";

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
  const submit = async () => {
    setBusy(true); setMsg("요청 보내는 중…");
    try {
      const r = await fetch("/api/owner-promo", { method: "POST", headers: { ...hdr, "Content-Type": "application/json" }, body: JSON.stringify({ cafeId, intro: promo?.intro ?? "", photos: promo?.photos ?? [], generate: true }) });
      const d = await r.json();
      if (d.ok) { setPromo(d.promo); setMsg(d.generated ? "✨ 생성 완료 — 관리자 승인 후 노출돼요" : "✨ 요청 접수 — AI 생성 후 관리자 승인을 거쳐 노출돼요"); }
      else setMsg("오류: " + (d.error ?? ""));
    } catch { setMsg("네트워크 오류"); }
    setBusy(false);
  };

  if (!promo) return <p className="text-[12px] text-[#a8927a]">불러오는 중…</p>;
  const status = promo.ai_pending ? "🕐 AI 생성 대기 중 (내 PC 배치가 처리)"
    : promo.ai_headline ? (promo.approved ? "🟢 공개 중 — 카페 상세 상단에 노출돼요" : "🟡 관리자 승인 대기 중")
      : "글·사진을 적고 'AI 홍보물 만들기'를 눌러주세요";

  return (
    <div className="bg-gradient-to-br from-[#2b2018] to-[#4a3424] text-[#f4ece0] rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">🎀</span>
        <h3 className="text-base font-bold">우리 가게 쇼케이스</h3>
        <span className="text-[9px] bg-[#e8b87a] text-[#2b2018] px-1.5 py-0.5 rounded-full font-bold ml-auto">구독 미리보기</span>
      </div>
      <p className="text-[12px] text-[#cbb89f] leading-relaxed mb-3"><b className="text-[#f4ece0]">{cafeName}</b> · 글·사진을 올리면 <b className="text-[#f4ece0]">AI가 홍보 카피</b>를 만들고, <b className="text-[#f4ece0]">관리자 승인</b> 후 카페 상세 맨 위에 노출돼요.</p>

      <textarea value={promo?.intro ?? ""} onChange={(e) => setPromo((p: any) => ({ ...(p ?? {}), intro: e.target.value }))} placeholder="우리 가게 소개를 자유롭게 — 시그니처, 분위기, 사장님 한마디 등" rows={3} className="w-full rounded-lg p-3 text-[13px] text-[#2b2018] bg-[#fdfaf4] mb-2 resize-none" />

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

      <button disabled={busy} onClick={submit} className="w-full bg-[#e8b87a] text-[#2b2018] rounded-lg py-2.5 text-sm font-bold disabled:opacity-50 mb-2">✨ AI 홍보물 만들기 (관리자 승인 후 노출)</button>
      {msg && <p className="text-[11px] text-[#e8b87a] mb-2">{msg}</p>}

      {promo?.ai_headline && (
        <div className="rounded-xl overflow-hidden bg-[#fdfaf4] text-[#2b2018] mt-1">
          {promo.photos?.[0] && <img src={promo.photos[0]} alt="" className="w-full h-28 object-cover" />}
          <div className="p-3">
            <div className="text-[9px] text-[#9c6b3f] mb-0.5">미리보기</div>
            <div className="text-lg font-bold leading-tight">{promo.ai_headline}</div>
            {promo.ai_tagline && <div className="text-[12px] text-[#6b5a48] mt-0.5">{promo.ai_tagline}</div>}
            {Array.isArray(promo.ai_points) && promo.ai_points.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{promo.ai_points.map((pt: string, i: number) => <span key={i} className="text-[10px] bg-[#f0e6d4] text-[#8a6d3f] px-2 py-0.5 rounded-full">{pt}</span>)}</div>}
          </div>
        </div>
      )}
      <p className="text-[10.5px] text-[#cbb89f] mt-2">{status}</p>
    </div>
  );
}
