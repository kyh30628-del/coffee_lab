"use client";
import { useEffect, useMemo, useState } from "react";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

export type MyCafeRegCafe = { id: number; name: string; area: string };

// 내 카페 등록/수정 모달 — 2단계 저장(위치인증 임시저장 → 추억기록 확정). 무가입·device_id 기반.
// 지도 페이지(app/page.tsx)·카페 상세(app/c/[id])에서 공용으로 재사용.
export default function MyCafeRegModal({ cafes, device, visits, pin = "", initialCafeId = null, onClose, onDone }: { cafes: MyCafeRegCafe[]; device: string; visits: any[]; pin?: string; initialCafeId?: number | null; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<MyCafeRegCafe | null>(null);
  const [photos, setPhotos] = useState<string[]>([]); // 방문 사진 최대 5장(기존 URL + 새 base64 혼재 가능)
  const [memory, setMemory] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [isPublic, setIsPublic] = useState(false); // 공개 선택 시 카페 상세에 '방문자 후기'로 노출(기본 비공개)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [staged, setStaged] = useState(false); // 1단계: 임시저장 완료 → 추억 기록 팝업
  const [stagedVerified, setStagedVerified] = useState(true); // 이번 임시저장이 GPS 30m 인증됐는지(false=나중에 인증하기)
  const [unverifiedOffer, setUnverifiedOffer] = useState(false); // 위치인증 실패 → '나중에 인증하기' 노출
  const [done, setDone] = useState<string | null>(null); // 2단계: 최종 기록 성공 멘트(카페명)
  const [doneVerified, setDoneVerified] = useState(true); // 저장 완료 화면에서 인증/미인증 문구 분기

  const results = useMemo(() => {
    const k = q.replace(/\s/g, "").toLowerCase();
    if (k.length < 1) return [];
    return cafes.filter((c) => (c.name + c.area).replace(/\s/g, "").toLowerCase().includes(k)).slice(0, 20);
  }, [q, cafes]);

  // 카페 선택 시 기존 기록(기억·즐겨찾기·사진) 불러오기 — 수정모드면 기존 사진도 그대로 보여줌
  const pick = (c: MyCafeRegCafe) => {
    setPicked(c); setMsg("");
    const prev = visits.find((v) => v.id === c.id);
    setMemory(prev?.memory ?? "");
    setFavorite(!!prev?.favorite);
    setIsPublic(!!prev?.is_public);
    const existing = Array.isArray(prev?.photos) ? prev.photos : (prev?.photo_url ? [prev.photo_url] : []);
    setPhotos(existing.slice(0, 5));
  };
  // 수정모드: 추억 항목 클릭으로 들어오면 해당 카페를 자동 선택 + 기존 내용 프리필
  useEffect(() => {
    if (initialCafeId == null) return;
    const c = cafes.find((x) => x.id === initialCafeId);
    if (c) pick(c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCafeId]);

  // 마운트돼있는 동안(부모가 조건부 렌더) 항상 배경 스크롤 잠금
  useLockBodyScroll(true);

  // 사진 선택(여러 장) → 각각 캔버스로 1000px 리사이즈. 갤러리/카메라 모두 허용(capture 미지정). 최대 5장.
  const onPhoto = (e: any) => {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    const room = Math.max(0, 5 - photos.length);
    files.slice(0, room).forEach((f) => {
      const img = new Image();
      img.onload = () => {
        const max = 1000, scale = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
        cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL("image/jpeg", 0.82);
        setPhotos((prev) => prev.length >= 5 ? prev : [...prev, url]);
      };
      img.src = URL.createObjectURL(f);
    });
    e.target.value = ""; // 같은 파일 다시 고를 수 있게 초기화
  };
  const removePhoto = (i: number) => setPhotos((prev) => prev.filter((_, idx) => idx !== i));

  // 1단계: 위치 인증 → 임시저장(그 카페에서의 경험임을 보증)
  const stage = () => {
    if (!picked) { setMsg("카페를 선택해주세요"); return; }
    if (!navigator.geolocation) { setMsg("이 브라우저는 위치를 지원하지 않아요"); setUnverifiedOffer(true); return; }
    setBusy(true); setMsg("현재 위치 확인 중..."); setUnverifiedOffer(false);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const r = await fetch("/api/my-cafe", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "stage", cafeId: picked.id, device, pin, userLat: pos.coords.latitude, userLng: pos.coords.longitude, photosBase64: photos, memory, favorite, isPublic }),
        });
        const d = await r.json();
        if (d.ok) { setStagedVerified(true); setStaged(true); setMsg(""); setBusy(false); } // 위치인증 통과 → 추억 기록 팝업
        else { setMsg(d.error || "임시저장 실패"); setUnverifiedOffer(true); setBusy(false); } // 30m 밖 등 → 나중에 인증하기 안내
      } catch { setMsg("네트워크 오류"); setBusy(false); }
    }, () => { setMsg("위치 권한을 허용해주세요 (카페 30m 인증 필요)"); setUnverifiedOffer(true); setBusy(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  // 위치인증 실패 시 완화 저장 — 미인증(verified=false)으로 임시저장. 나중에 재방문해 '지금 인증하기'로 승격 가능.
  const stageUnverified = async () => {
    if (!picked) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/my-cafe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stage", cafeId: picked.id, device, pin, allowUnverified: true, photosBase64: photos, memory, favorite, isPublic }),
      });
      const d = await r.json();
      if (d.ok) { setStagedVerified(false); setStaged(true); setMsg(""); setBusy(false); }
      else { setMsg(d.error || "저장 실패"); setBusy(false); }
    } catch { setMsg("네트워크 오류"); setBusy(false); }
  };

  // 2단계: 추억을 기록합니다 — 위치 비교 없이 최종 DB 기록
  const commit = async (sendPhotos = false) => {
    if (!picked) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/my-cafe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "commit", cafeId: picked.id, device, pin, memory, favorite, isPublic, ...(sendPhotos ? { photosBase64: photos } : {}) }),
      });
      const d = await r.json();
      if (d.ok) {
        const wasVerified = staged ? stagedVerified : (visits.find((v) => v.id === picked.id)?.verified !== false);
        setDoneVerified(wasVerified); setDone(picked.name); onDone();
      } else { setMsg(d.error || "기록 실패"); setBusy(false); setStaged(false); }
    } catch { setMsg("네트워크 오류"); setBusy(false); }
  };

  // 1단계 완료 → "추억을 기록합니다" 확인 팝업 (위치 비교 없이 최종 기록)
  if (staged && !done) {
    return (
      <div className="fixed inset-0 z-[5000] flex items-center justify-center px-6" style={{ background: "rgba(43,32,24,0.6)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={() => !busy && setStaged(false)}>
        <div className="bg-[#fdfaf4] rounded-2xl px-7 py-8 text-center max-w-xs shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="text-[34px] mb-2">📖</div>
          <div className="text-[17px] font-bold text-[#2b2018] mb-1.5">추억을 기록합니다</div>
          {stagedVerified ? (
            <>
              <span className="inline-block text-[9px] font-bold text-[#5f7355] bg-[#eef3ea] rounded-full px-1.5 py-0.5 mb-1.5">✓ 인증됨</span>
              <div className="text-[13px] text-[#594839] leading-relaxed">
                <b className="text-[#d6336c]">{picked?.name}</b> 위치 인증이 끝났어요.<br />
                이 경험을 내 지도에 영구 기록할까요?
              </div>
              <div className="text-[11px] text-[#665036] mt-2 leading-relaxed">위치 인증으로 <b>진짜 그 카페에서의 경험</b>임이 확인됐어요.</div>
            </>
          ) : (
            <>
              <span className="inline-block text-[9px] font-bold text-[#665036] bg-[#f3ede1] rounded-full px-1.5 py-0.5 mb-1.5">미인증</span>
              <div className="text-[13px] text-[#594839] leading-relaxed">
                <b className="text-[#d6336c]">{picked?.name}</b> 추억을<br />
                <b>미인증</b>으로 기록할까요?
              </div>
              <div className="text-[11px] text-[#665036] mt-2 leading-relaxed">
                위치 인증을 못 했어요. <b>지금은 미인증 상태로 저장</b>돼요.<br />
                <b>나에게만 보임(비공개)</b> — 지도에서 다른 사람에게는 안 보여요. <b>인증된 기록만</b> 타인에게 지도로 공개돼요.<br />
                나중에 이 카페를 다시 방문해 <b>GPS 30m 이내</b>에서 인증하면 <b>인증 상태로 전환</b>돼 지도에 공개될 수 있어요.
              </div>
            </>
          )}
          {msg && <p className="text-[12px] text-[#c0392b] mt-2">{msg}</p>}
          <button onClick={() => commit(false)} disabled={busy} className="mt-5 w-full bg-[#d6336c] text-white rounded-xl py-3 font-bold text-[14px] disabled:opacity-60">{busy ? "기록 중..." : "추억을 기록합니다"}</button>
          <button onClick={() => setStaged(false)} disabled={busy} className="mt-2 w-full text-[#7a5122] text-[13px] py-1">다시 확인할게요</button>
        </div>
      </div>
    );
  }

  // 저장 성공 — 예쁜 멘트
  if (done) {
    return (
      <div className="fixed inset-0 z-[5000] flex items-center justify-center px-6" style={{ background: "rgba(43,32,24,0.6)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={onClose}>
        <div className="bg-[#fdfaf4] rounded-2xl px-7 py-8 text-center max-w-xs shadow-2xl" onClick={(e) => e.stopPropagation()}>
          {doneVerified ? (
            <>
              <div className="text-[40px] mb-2">❤</div>
              <span className="inline-block text-[9px] font-bold text-[#5f7355] bg-[#eef3ea] rounded-full px-1.5 py-0.5 mb-1">✓ 인증됨</span>
              <div className="text-[16px] font-bold text-[#2b2018] mb-1.5">기억이 저장됐어요</div>
              <div className="text-[13px] text-[#594839] leading-relaxed"><b className="text-[#d6336c]">{done}</b>에서의 소중한 기억이<br />지도에 ❤로 노출돼요.</div>
            </>
          ) : (
            <>
              <div className="text-[40px] mb-2">📍</div>
              <span className="inline-block text-[9px] font-bold text-[#665036] bg-[#f3ede1] rounded-full px-1.5 py-0.5 mb-1">미인증</span>
              <div className="text-[16px] font-bold text-[#2b2018] mb-1.5">미인증으로 저장됐어요</div>
              <div className="text-[13px] text-[#594839] leading-relaxed">
                <b className="text-[#d6336c]">{done}</b> 기억이 <b>미인증 상태</b>로 저장됐어요.<br />
                <b>나에게만 보임(비공개)</b> — 지도에서 다른 사람에게는 안 보여요.<br />
                나중에 이 카페를 다시 방문해 <b>GPS 30m 이내</b>에서 인증하면 <b>인증 상태로 전환</b>돼 지도에 공개될 수 있어요.
              </div>
            </>
          )}
          <button onClick={onClose} className="mt-5 w-full bg-[#d6336c] text-white rounded-xl py-2.5 font-bold text-[14px]">확인</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[5000] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.5)", fontFamily: "'Gowun Batang', AppleMyungjo, 'Apple SD Gothic Neo', 'Noto Serif KR', serif" }} onClick={onClose}>
      <div className="w-full max-w-lg bg-[#fdfaf4] rounded-t-2xl max-h-[90dvh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 — 즐겨찾기 별 */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#f0e6d4]">
          <div className="flex items-center gap-2">
            <button onClick={() => setFavorite((v) => !v)} aria-label="즐겨찾기" className="text-[22px] leading-none" style={{ color: favorite ? "#f0a832" : "#d8cab4" }}>{favorite ? "★" : "☆"}</button>
            <div className="font-bold text-[#2b2018] text-[15px]">내 카페 등록</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-[#f0e6d4] text-[#594839] text-lg">×</button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3 pb-[calc(1rem_+_env(safe-area-inset-bottom))]">
          {!picked ? (
            <>
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="카페 이름 검색"
                className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-base text-[#2b2018] bg-white" />
              <div className="space-y-1">
                {results.map((c) => (
                  <button key={c.id} onClick={() => pick(c)} className="w-full text-left px-3 py-2.5 rounded-lg bg-white border border-[#e6d9c8] hover:bg-[#fdf6ee] flex items-center justify-between">
                    <div><div className="text-[14px] font-medium text-[#2b2018]">{c.name}</div><div className="text-[11px] text-[#7a5122]">{c.area}</div></div>
                    {visits.some((v) => v.id === c.id) && <span className="text-[10px] text-[#d6336c] font-bold">❤ 기록있음</span>}
                  </button>
                ))}
                {q.length >= 1 && results.length === 0 && <p className="text-[12px] text-[#665036] px-1">검색 결과가 없어요</p>}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between bg-white border border-[#e6d9c8] rounded-lg px-3 py-2.5">
                <div><div className="text-[14px] font-bold text-[#2b2018]">{picked.name}</div><div className="text-[11px] text-[#7a5122]">{picked.area}</div></div>
                <button onClick={() => { setPicked(null); setPhotos([]); }} className="text-[11px] text-[#7a5122] underline">변경</button>
              </div>
              <div>
                <div className="text-[12px] text-[#594839] mb-1.5 font-medium">방문 사진 (최대 5장 · 선택)</div>
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((p, i) => (
                    <div key={i} className="relative aspect-square">
                      <img src={p} alt="" className="w-full h-full rounded-lg border border-[#e6d9c8] object-cover" />
                      <button type="button" onClick={() => removePhoto(i)} aria-label="삭제"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#2b2018] text-white text-[11px] leading-none shadow">×</button>
                    </div>
                  ))}
                  {photos.length < 5 && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-[#cbb89f] bg-white flex flex-col items-center justify-center text-[#7a5122] cursor-pointer">
                      <span className="text-[20px] leading-none">＋</span>
                      <span className="text-[10px] mt-0.5">사진 추가</span>
                      <span className="text-[9px] text-[#665036]">{photos.length}/5</span>
                      <input type="file" accept="image/*" multiple onChange={onPhoto} className="hidden" />
                    </label>
                  )}
                </div>
                <p className="text-[10px] text-[#665036] mt-1">갤러리에서 여러 장 선택하거나 카메라로 촬영할 수 있어요.</p>
              </div>
              {/* 기억 — 카페에서의 나의 경험 */}
              <div>
                <div className="text-[12px] text-[#594839] mb-1.5 font-medium">기억 — 이 카페에서의 나의 경험</div>
                <textarea value={memory} onChange={(e) => setMemory(e.target.value)} rows={4} maxLength={2000}
                  placeholder="오늘의 커피, 분위기, 함께한 사람… 소중한 순간을 적어보세요."
                  className="w-full border border-[#cbb89f] rounded-lg px-3 py-2.5 text-[14px] text-[#2b2018] bg-white resize-none leading-relaxed" />
                <div className="text-right text-[10px] text-[#665036]">{memory.length}/2000</div>
              </div>
              {/* 공개 설정 — 공개 시 카페 상세에 익명 방문자 후기로 노출(리뷰 재활용) */}
              <div>
                <div className="text-[12px] text-[#594839] mb-1.5 font-medium">공개 설정</div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setIsPublic(false)} className={`rounded-lg border px-3 py-2.5 text-left transition ${!isPublic ? "border-[#d6336c] bg-[#fdf0f4]" : "border-[#e6d9c8] bg-white"}`}>
                    <div className="text-[13px] font-bold text-[#2b2018]">🔒 비공개</div>
                    <div className="text-[10px] text-[#7a5122] mt-0.5">나만 보는 추억</div>
                  </button>
                  <button type="button" onClick={() => setIsPublic(true)} className={`rounded-lg border px-3 py-2.5 text-left transition ${isPublic ? "border-[#d6336c] bg-[#fdf0f4]" : "border-[#e6d9c8] bg-white"}`}>
                    <div className="text-[13px] font-bold text-[#2b2018]">🌐 공개</div>
                    <div className="text-[10px] text-[#7a5122] mt-0.5">카페 상세에 익명 후기로</div>
                  </button>
                </div>
                {isPublic && <p className="text-[10px] text-[#665036] mt-1.5">공개하면 다른 사람이 이 카페를 볼 때 <b>익명</b>으로 사진·기억이 보여요. 타인 얼굴·개인정보가 담긴 사진은 올리지 마세요.</p>}
              </div>
              {visits.some((v) => v.id === picked.id) ? (
                <>
                  <p className="text-[11px] text-[#665036] leading-relaxed">※ 이미 기록한 추억이에요. 사진(갤러리에서 추가 가능)·기억을 고치고 저장하세요. <b>이미 인증된 방문</b>이라 위치 확인은 다시 안 해도 돼요.</p>
                  {msg && <p className="text-[12px] text-[#c0392b]">{msg}</p>}
                  <button onClick={() => commit(true)} disabled={busy} className="w-full bg-[#d6336c] text-white rounded-xl py-3 font-bold text-[14px] disabled:opacity-60">
                    {busy ? "저장 중..." : "수정 저장"}
                  </button>
                </>
              ) : (
                <>
                  <div className="text-[12.5px] text-[#3d2f22] leading-relaxed bg-[#faf5ec] border border-[#e6d8bf] rounded-xl p-2.5">
                    <div className="font-bold text-[#2b2018] mb-1.5 text-[13px]">📍 위치 인증 안내</div>
                    <div className="mb-1.5"><b className="text-[#5f7355]">✅ 카페 30m 이내에서 인증</b> → <b>진짜 방문 후기</b>로 지도에 공개돼요.</div>
                    <div><b className="text-[#b06a2e]">📍 30m 밖이면 무인증</b>으로 저장 → <b>나에게만 보여요</b>(지도에 안 뜸). 나중에 그 카페에 다시 가서 인증하면 <b>공개로 전환</b>됩니다.</div>
                  </div>
                  <p className="text-[11.5px] text-[#665036] leading-relaxed">※ 타인의 얼굴·개인정보가 담긴 사진은 올리지 마세요.</p>
                  {msg && <p className="text-[12.5px] font-bold text-[#c0392b]">{msg}</p>}
                  <button onClick={stage} disabled={busy} className="w-full bg-[#d6336c] text-white rounded-xl py-3 font-bold text-[14px] disabled:opacity-60">
                    {busy ? "위치 확인 중..." : "이 카페에서 위치 인증 (임시저장)"}
                  </button>
                  {unverifiedOffer && (
                    <button onClick={stageUnverified} disabled={busy} className="w-full border border-[#cbb89f] text-[#594839] bg-white rounded-xl py-2.5 font-bold text-[13px] disabled:opacity-60">
                      📍 나중에 인증하기 (미인증으로 저장 · 나만 보임)
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
