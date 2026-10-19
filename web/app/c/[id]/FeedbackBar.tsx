"use client";
import { useEffect, useState } from "react";

// 💬 한 줄 피드백 (2026-10-19, CEO 지시 "간결하게 · 아주 직관적으로")
//
// 설계 원칙 — **한 번 탭하면 끝**이다.
//   · 👍/👎를 누르는 순간 **즉시 접수**된다. 텍스트는 그 뒤에 "선택"으로만 권한다.
//     (텍스트를 필수로 하면 응답률이 10분의 1로 떨어진다 — 한 탭만으로도 신호가 남아야 한다)
//   · 보낸 뒤에는 조용히 감사 한 줄만 남고 사라진다(ReportButton과 같은 결).
//   · 같은 카페는 30일간 다시 묻지 않는다(localStorage) — 재방문자를 괴롭히지 않는다.
//   · 뒤로가기를 **가로채지 않는다.** 모바일 제스처·검색 복귀를 막지 않는 게 합의 사항이다.
//
// 자리 두 곳(같은 컴포넌트):
//   bottom         — 상세 페이지 하단 상시. 끝까지 읽은 사람이 자연스럽게 누른다.
//   after-outlink  — 지도·전화 같은 외부 클릭 직후. "이 정보가 쓸모 있었나"를 묻기 가장 자연스러운 시점.
//                    `window.dispatchEvent(new Event("dcn:outlink"))` 로 펼친다.
//
// 기기키는 다른 익명 기능과 **같은 키**(dcn_device)를 재사용 — 새 식별자 생성 0.
function anonKey(): string {
  try {
    let k = localStorage.getItem("dcn_device");
    if (!k) { k = `d_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`; localStorage.setItem("dcn_device", k); }
    return k;
  } catch { return `s_${Math.random().toString(36).slice(2, 14)}`; }
}
const seenKey = (cafeId: number) => `dcn_fb_${cafeId}`;
const DAYS_30 = 30 * 864e5;

export default function FeedbackBar({ cafeId }: { cafeId: number }) {
  const [hidden, setHidden] = useState(true);          // 30일 내 이미 남겼으면 아예 안 보인다
  const [kind, setKind] = useState<"like" | "meh" | null>(null);
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState<"bottom" | "after-outlink">("bottom");

  useEffect(() => {
    try {
      const t = Number(localStorage.getItem(seenKey(cafeId)) || 0);
      setHidden(!!t && Date.now() - t < DAYS_30);
    } catch { setHidden(false); }
    const onOut = () => setPlace("after-outlink");
    window.addEventListener("dcn:outlink", onOut);
    return () => window.removeEventListener("dcn:outlink", onOut);
  }, [cafeId]);

  const send = async (k: "like" | "meh", text?: string) => {
    setBusy(true);
    try {
      await fetch("/api/feedback", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: k, note: text ?? "", cafeId, place, anon: anonKey(), path: location.pathname }),
      });
    } catch { /* 실패해도 사용자를 붙잡지 않는다 */ }
    setBusy(false);
    try { localStorage.setItem(seenKey(cafeId), String(Date.now())); } catch {}
  };

  if (hidden) return null;
  if (done) return (
    <p className="mt-3 text-[13px] text-[#33684b]">✓ 고맙습니다. 더 정확하게 만드는 데 쓰겠습니다.</p>
  );

  // 1단계 — 한 탭. 누르면 즉시 접수된다.
  if (!kind) return (
    <div className="mt-3 flex items-center gap-2 flex-wrap">
      <span className="text-[13px] text-[#5b4a36]">
        {place === "after-outlink" ? "이 정보가 도움이 됐나요?" : "이 카페 정보, 어땠나요?"}
      </span>
      <button type="button" disabled={busy} onClick={() => { setKind("like"); send("like"); }}
        className="nt-chip" aria-label="좋아요">👍 좋아요</button>
      <button type="button" disabled={busy} onClick={() => { setKind("meh"); send("meh"); }}
        className="nt-chip" aria-label="아쉬워요">👎 아쉬워요</button>
    </div>
  );

  // 2단계 — 선택 입력. 안 써도 이미 접수됐다고 분명히 알린다.
  return (
    <div className="mt-3">
      <p className="text-[13px] text-[#5b4a36]">
        {kind === "like" ? "👍 고맙습니다." : "👎 알려주셔서 고맙습니다."}
        <span className="text-[#7a6750]"> 한 줄 더 남겨주시면 바로 고칩니다. (선택)</span>
      </p>
      <div className="mt-2 flex items-start gap-2">
        <textarea
          value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={2} maxLength={500}
          placeholder={kind === "like" ? "어떤 점이 좋았나요?" : "무엇이 아쉬웠나요?"}
          className="flex-1 min-w-0 rounded-lg border border-note-line bg-white px-3 py-2 text-[14px] leading-relaxed outline-none focus:border-note-brown"
        />
        <div className="flex flex-col gap-1">
          <button type="button" disabled={busy || !note.trim()}
            onClick={async () => { await send(kind, note.trim()); setDone(true); }}
            className="nt-btn whitespace-nowrap disabled:opacity-40">보내기</button>
          <button type="button" onClick={() => setDone(true)}
            className="text-[12px] text-[#7a6750] whitespace-nowrap">그냥 닫기</button>
        </div>
      </div>
    </div>
  );
}
