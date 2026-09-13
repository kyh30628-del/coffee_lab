"use client";
import { useEffect, useRef, useState } from "react";

// 📷✍ 사장님 사진·한마디 편집(PIN 로그인 사장님 전용). 저장 즉시 카페 상세에 반영(구독 활성 중일 때 노출).
type Photo = { url: string; at: string };
export default function OwnerContentEditor({ cafeId, pin }: { cafeId: number; pin: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [note, setNote] = useState("");
  const [limits, setLimits] = useState({ photos: 5, note: 200 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const [removes, setRemoves] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement | null>(null);
  const hdr = { "x-owner-pin": pin };
  useEffect(() => {
    fetch(`/api/owner-content?cafeId=${cafeId}&mine=1`, { headers: hdr, cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.ok) { setPhotos(d.content.photos ?? []); setNote(d.content.note ?? ""); if (d.limits) setLimits(d.limits); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId]);
  const keep = photos.filter((p) => !removes.has(p.url));
  const total = keep.length + pending.length;
  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const fd = new FormData();
      fd.set("cafeId", String(cafeId)); fd.set("note", note);
      removes.forEach((u) => fd.append("remove", u));
      pending.forEach((f) => fd.append("photo", f));
      const r = await fetch("/api/owner-content", { method: "POST", headers: hdr, body: fd });
      const d = await r.json();
      if (d.ok) { setPhotos(d.content.photos ?? []); setNote(d.content.note ?? ""); setPending([]); setRemoves(new Set()); setMsg("✅ 저장했어요. 카페 페이지에 바로 반영돼요."); }
      else setMsg(d.error || "저장 실패");
    } catch { setMsg("네트워크 오류"); }
    setBusy(false);
  };
  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#ece0cd] mb-4">
      <div className="text-sm font-bold text-[#52402e] mb-1">📷 우리 가게 사진 · ✍ 사장님 한마디</div>
      <p className="text-[12px] text-[#8a7458] leading-relaxed mb-3">손님이 보는 카페 페이지에 <b>사장님이 직접 올린 사진</b>과 <b>한마디</b>가 실려요. 후기·등급은 그대로예요(사장님 글은 따로 표시). 사진은 직접 촬영한 것만 올려주세요(저작권·초상권 책임은 올리는 분에게 있어요).</p>
      <div className="flex gap-2 flex-wrap mb-2">
        {keep.map((p) => (
          <div key={p.url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#ece0cd]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => setRemoves((s) => new Set(s).add(p.url))} className="absolute top-0.5 right-0.5 bg-black/60 text-white text-[10px] rounded px-1">삭제</button>
          </div>
        ))}
        {pending.map((f, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-dashed border-[#c9b391] bg-[#fbf7f0]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover opacity-80" />
            <button type="button" onClick={() => setPending((a) => a.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white text-[10px] rounded px-1">취소</button>
          </div>
        ))}
        {total < limits.photos && (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-lg border border-dashed border-[#c9b391] text-[#8a7458] text-[11px]">+ 사진<br />{total}/{limits.photos}</button>
        )}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { const fs = Array.from(e.target.files ?? []); setPending((a) => [...a, ...fs].slice(0, Math.max(0, limits.photos - keep.length))); e.target.value = ""; }} />
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, limits.note))} rows={3} placeholder="예) 매일 아침 직접 로스팅해요. 조용히 책 읽기 좋은 창가 자리가 있어요." className="w-full text-[13px] border border-[#ece0cd] rounded-xl p-3 outline-none focus:border-[#9c6b3f]" />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[11px] text-[#8a7458]">{note.length}/{limits.note}</span>
        <button type="button" onClick={save} disabled={busy} className="bg-[#2b2018] text-[#f4ece0] rounded-xl px-4 py-2 text-[13px] font-bold disabled:opacity-50">{busy ? "저장 중…" : "저장"}</button>
      </div>
      {msg && <p className="text-[12px] text-[#7a5122] mt-2">{msg}</p>}
    </div>
  );
}
