"use client";
import { useState, useEffect } from "react";
import { TRIAL_DAYS } from "@/lib/ownerPlan";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

// 사장님 카페 정보 입력 모달(공용) — /pricing(구독)·랜딩(무료 체험)·카페 등록 직후(prefillCafe) 사용.
//   카페 검색·선택(또는 prefill 고정) → 성함·연락처·이메일·동의 → /api/subscription(pending). 승인 시 이메일로 PIN.
// 📊 #513 신청 퍼널 계측 — 모달 오픈·제출 성공/실패를 /api/owner-funnel에 얕게 기록(개인정보 0, 실패해도 신청 흐름엔 무해).
function trackFunnel(event: string, extra?: Record<string, unknown>) {
  try {
    const anonId = typeof window !== "undefined" ? localStorage.getItem("dcn_anon") || "" : "";
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    fetch("/api/owner-funnel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ anonId, event, path, ...extra }), keepalive: true }).catch(() => {});
  } catch {}
}

export default function OwnerSignupModal({ open, onClose, trial = false, prefillCafe, source }: { open: boolean; onClose: () => void; trial?: boolean; prefillCafe?: { id: number; name: string } | null; source?: string }) {
  const [cafeQ, setCafeQ] = useState("");
  const [sug, setSug] = useState<{ id: number; name: string; area: string }[]>([]);
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [bizNo, setBizNo] = useState("");
  const [bizRegBase64, setBizRegBase64] = useState("");   // 사업자등록증 이미지(증빙)
  const [bizRegName, setBizRegName] = useState("");
  const [consent, setConsent] = useState(false);
  const [attest, setAttest] = useState(false);            // 사업주 본인확인 법적 동의
  const [news, setNews] = useState(true);                 // 주간 뉴스레터 수신동의(선택, 기본 ON)
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // 등록 직후 진입: 그 카페로 고정(검색 없이)
  useEffect(() => { if (open && prefillCafe) setPicked(prefillCafe); }, [open, prefillCafe]);
  useEffect(() => { if (open) trackFunnel("modal_open", { source, meta: { trial, prefill: !!prefillCafe } }); }, [open, source, trial, prefillCafe]);
  useLockBodyScroll(open);
  if (!open) return null;
  const reset = () => { setDone(false); setPicked(prefillCafe ?? null); setCafeQ(""); setOwnerName(""); setContact(""); setEmail(""); setBizNo(""); setBizRegBase64(""); setBizRegName(""); setConsent(false); setAttest(false); setSug([]); setErr(""); };
  const close = () => { reset(); onClose(); };
  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setErr("이미지 파일만 올려주세요"); return; }
    if (f.size > 8 * 1024 * 1024) { setErr("이미지는 8MB 이하로 올려주세요"); return; }
    setErr("");
    // 감사수리: 원본 base64 전송이 Vercel 4.5MB 본문 한도에서 413 → 업로드 전 캔버스 리사이즈(최대 1600px, JPEG 0.85)
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const max = 1600, scale = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL("image/jpeg", 0.85);
      if (url.length * 0.75 > 4 * 1024 * 1024) { setErr("이미지 용량이 너무 커요 — 4MB 이하로 줄이거나 낮은 해상도로 다시 촬영해 주세요"); return; }
      setBizRegBase64(url); setBizRegName(f.name);
    };
    img.onerror = () => { URL.revokeObjectURL(img.src); setErr("이미지를 읽을 수 없어요 — 다른 파일로 시도해 주세요"); };
    img.src = URL.createObjectURL(f);
  };

  const onCafeQ = async (v: string) => {
    setCafeQ(v); setPicked(null);
    if (v.trim().length < 1) { setSug([]); return; }
    try { const d = await (await fetch(`/api/cafe-names?q=${encodeURIComponent(v.trim())}`)).json(); setSug(d.cafes ?? []); } catch {}
  };
  const canSubmit = !!picked && !!ownerName.trim() && !!contact.trim() && !!email.trim() && !!bizRegBase64 && consent && attest;
  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cafeId: picked!.id, cafeName: picked!.name, ownerName, contact, email, bizNo, bizRegBase64, consent: true, attest: true, newsletter: news, trial }) });
      const d = await r.json();
      if (d.ok) { setDone(true); trackFunnel("submit_success", { source, cafeId: picked!.id, meta: { trial } }); }
      else { setErr(d.error || "신청에 실패했어요"); trackFunnel("submit_fail", { source, cafeId: picked!.id, meta: { trial, error: d.error || "unknown" } }); }
    } catch { setErr("네트워크 오류 — 다시 시도해 주세요"); trackFunnel("submit_fail", { source, cafeId: picked?.id, meta: { trial, error: "network" } }); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[7000]" onClick={close}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="absolute inset-x-0 bottom-0 sm:inset-0 sm:m-auto sm:w-[360px] sm:h-fit bg-[#fdfaf4] text-[#2b2018] rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="text-center py-6">
            <div className="text-3xl mb-2">🎉</div>
            <div className="font-bold mb-1">{trial ? `${TRIAL_DAYS}일 체험 신청 완료` : "구독 신청 완료"}</div>
            <p className="text-[13px] text-[#524234] leading-relaxed">관리자 승인 후 <b>등록하신 이메일로 키(PIN)</b>가 발송돼요. 그 키로 사장님 화면에 로그인하시면 <b>내 카페 분석으로 바로</b> 들어갑니다.{trial ? ` 체험은 승인일로부터 ${TRIAL_DAYS}일간이에요.` : ""}</p>
            <button onClick={close} className="w-full mt-5 bg-[#2b2018] text-[#f4ece0] rounded-lg py-2.5 text-sm font-bold">닫기</button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-1">
              <h3 className="font-bold text-lg">{trial ? `✨ ${TRIAL_DAYS}일 무료 체험 신청` : "홍보팩 구독 신청"}</h3>
              <button onClick={close} className="text-2xl text-[#82714f] leading-none -mt-1">×</button>
            </div>
            <p className="text-[12px] text-[#524234] mb-3">{prefillCafe ? "방금 등록한 카페로 체험을 신청합니다. 사장님 정보를 남겨주세요." : "내 카페를 선택하고 정보를 남겨주세요."} 승인되면 <b>이메일로 키(PIN)</b>를 보내드려요.{trial ? ` 결제 없이 ${TRIAL_DAYS}일간 모든 사장님 기능을 써보실 수 있어요.` : ""}</p>
            {prefillCafe ? (
              <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[14px]"><b>{prefillCafe.name}</b><span className="text-[12px] text-emerald-600 font-bold ml-2">✓ 방금 등록한 내 카페</span><div className="text-[11px] text-[#665036] mt-0.5">검증·공개되면 승인 후 키를 보내드려요.</div></div>
            ) : (
              <>
                <div className="relative mb-2">
                  <input value={picked ? picked.name : cafeQ} onChange={(e) => onCafeQ(e.target.value)} placeholder="내 카페 이름 검색" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] bg-white" />
                  {picked && <span className="absolute right-3 top-2.5 text-[12px] text-emerald-600 font-bold">✓ 선택됨</span>}
                  {!picked && sug.length > 0 && (
                    <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-[#d9c9b0] rounded-lg shadow-lg max-h-44 overflow-y-auto">
                      {sug.map((c) => (
                        <button key={c.id} onClick={() => { setPicked({ id: c.id, name: c.name }); setSug([]); }} className="w-full text-left px-3 py-2 text-[13px] hover:bg-[#f4ece0] border-b border-[#f0e6d4] last:border-0"><b>{c.name}</b> <span className="text-[11px] text-[#665036]">{c.area}</span></button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-[#665036] -mt-0.5 mb-2">내 카페가 목록에 없나요? <a href="/cafe/register" className="text-[#7a5122] font-bold underline">카페 등록 신청 →</a> <span className="text-[#82714f]">(검증 후 분석·체험 이용 가능)</span></p>
              </>
            )}
            <input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="사장님 성함" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-2 bg-white" />
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="연락처 (전화)" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-2 bg-white" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="이메일 (키 받을 주소)" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-2 bg-white" />
            <input value={bizNo} onChange={(e) => setBizNo(e.target.value)} inputMode="numeric" placeholder="사업자등록번호 (선택, 숫자만)" className="w-full rounded-lg border border-[#d9c9b0] px-3 py-2.5 text-[14px] mb-2 bg-white" />
            {/* 사업자등록증 이미지(필수) — 사칭 방지 증빙 */}
            <label className="block mb-2">
              <div className="text-[11.5px] font-bold text-[#52402e] mb-1">사업자등록증 사진 <span className="text-[#c0392b]">(필수)</span></div>
              <p className="text-[10.5px] text-[#82714f] mb-1">🔒 가게 확인 용도로만 사용되고, 외부에 공개되지 않아요.</p>
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-lg bg-[#2b2018] text-[#f4ece0] text-[12px] font-bold px-3 py-2">{bizRegBase64 ? "다시 선택" : "📷 이미지 선택"}</span>
                <span className="text-[11px] text-[#665036] truncate">{bizRegName || "대표자명·상호가 보이게 촬영/스캔"}</span>
                <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0])} className="hidden" />
              </div>
              {bizRegBase64 && <img src={bizRegBase64} alt="사업자등록증 미리보기" className="mt-2 w-full max-h-40 object-contain rounded-lg border border-[#e6dcc8] bg-white" />}
              <p className="text-[10.5px] text-[#665036] mt-1">⚠️ 주민등록번호 등은 <b>가리고</b> 올려주세요(본인확인엔 상호·대표자명만 필요).</p>
            </label>
            <label className="flex items-start gap-2 mb-2 cursor-pointer">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 shrink-0" />
              <span className="text-[11.5px] text-[#52402e] leading-snug"><b>(필수)</b> 승인·키(PIN) 발송을 위한 개인정보 수집·이용 동의. 연락처·이메일·서류는 <b>암호화/안전 저장</b>됩니다. <a href="/privacy" target="_blank" className="text-[#7a5122] underline">방침</a></span>
            </label>
            <label className="flex items-start gap-2 mb-3 cursor-pointer">
              <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 shrink-0" />
              <span className="text-[11.5px] text-[#52402e] leading-snug"><b>(필수)</b> 본인은 <b>해당 매장의 사업주 또는 정당한 운영 권한자</b>이며, 제출한 사업자등록증이 진본임을 확인합니다. <b>허위·사칭 신청 시</b> 이용이 제한되고 관련 법령에 따라 민·형사상 책임을 질 수 있음에 동의합니다.</span>
            </label>
            <label className="flex items-start gap-2 mb-3 cursor-pointer">
              <input type="checkbox" checked={news} onChange={(e) => setNews(e.target.checked)} className="mt-0.5 shrink-0" />
              <span className="text-[11.5px] text-[#52402e] leading-snug"><b>(선택)</b> 📰 <b>주간 커피·디저트 트렌드 뉴스레터</b> 받기. 광고성 정보 수신에 동의합니다(언제든 메일 하단 <b>수신거부</b> 가능).</span>
            </label>
            {err && <p className="text-[12px] text-[#c0392b] mb-2">{err}</p>}
            <button disabled={busy || !canSubmit} onClick={submit} className="w-full bg-[#e8b87a] text-[#2b2018] rounded-lg py-3 font-bold disabled:opacity-50">{busy ? "신청 중…" : trial ? `${TRIAL_DAYS}일 체험 신청` : "구독 신청"}</button>
          </>
        )}
      </div>
    </div>
  );
}
