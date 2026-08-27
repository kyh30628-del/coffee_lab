"use client";
import { useEffect, useState } from "react";
import { useLockBodyScroll } from "@/lib/useLockBodyScroll";

// 🏪 사장님이 홈에서 **자기 가게를 먼저 찾는** 창(2026-08-27).
//
// 왜 만들었나: 홈의 "🏪 사장님, 우리 카페 보러가기"가 곧바로 **가입 모달**을 띄웠다.
//   보여주지도 않고 신청부터 하라는 순서였다. 퍼널 실측에서 홈이 클릭의 65%(13/20)인데
//   그 65%가 무료 리포트를 한 번도 못 봤다. /c/[id] CTA만 고쳐서는 대다수가 그대로 막힌다.
//   → 순서를 뒤집는다: **가게 찾기 → 무료 리포트 → (원하면) 체험 신청.**
//
// 💰 비용: 공개 검색 API(/api/search)를 그대로 쓴다. **새 엔드포인트·새 크론 0.**
//   그 API는 search_cache를 이미 쓰고, 사장님 검색은 월 10여 건 규모라 부하가 무의미하다.
//   ⚠️ 입력할 때마다 쏘지 않는다 — 엔터/버튼으로만 검색(자동완성은 요청 수가 몇 배가 된다).

type Hit = { id: number; name: string; area: string; count?: number; grade?: string };

export default function OwnerFindModal({
  open, onClose, onNoMatch,
}: { open: boolean; onClose: () => void; onNoMatch: () => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  useLockBodyScroll(open);

  useEffect(() => { if (!open) { setQ(""); setHits([]); setSearched(false); } }, [open]);

  const run = async () => {
    const s = q.trim();
    if (s.length < 2) return; // 한 글자 검색은 결과가 수백 건이라 의미도 없고 부하만 준다
    setLoading(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(s)}`);
      const d = await r.json();
      setHits((d.results ?? []).slice(0, 8));
    } catch { setHits([]); }
    setLoading(false);
    setSearched(true);
  };

  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="dcn-find-title" onClick={onClose}
      className="fixed inset-0 z-[5000] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
      style={{ background: "rgba(20,14,8,0.6)" }}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-[#f4ece0] rounded-2xl border border-[#d9c9ab] shadow-xl px-5 pt-5 pb-4">
        <h2 id="dcn-find-title" className="text-[17px] font-bold text-[#2b2018] mb-1">우리 가게 찾기</h2>
        <p className="text-[12.5px] text-[#6b5a48] mb-4 leading-relaxed">
          가게 이름을 넣으면 <b>동네 순위·강점</b>을 바로 보여드려요. 가입 없이 볼 수 있어요.
        </p>

        <div className="flex gap-2 mb-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="가게 이름" autoFocus
            className="flex-1 min-w-0 border border-[#cbb89f] rounded-xl px-4 py-3 text-[15px] bg-white" />
          <button onClick={run} disabled={q.trim().length < 2}
            className="bg-[#2b2018] text-[#f4ece0] rounded-xl px-5 py-3 text-[14px] font-bold shrink-0 disabled:opacity-40">
            찾기
          </button>
        </div>

        {loading && <p className="text-[12.5px] text-[#8a7458] py-3 text-center">찾는 중…</p>}

        {!loading && hits.length > 0 && (
          <div className="space-y-2 max-h-[46vh] overflow-y-auto mb-3">
            {hits.map((c) => (
              // a 태그 — 새 화면으로 확실히 이동시킨다(모달 안에서 라우팅하면 뒤로가기가 꼬인다)
              <a key={c.id} href={`/owner/r/${c.id}`}
                className="block bg-white rounded-xl border border-[#ece0cd] px-4 py-3 hover:border-[#9c6b3f] transition">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-[#2b2018] truncate">{c.name}</span>
                  <span className="text-[11px] text-[#8a7458] shrink-0">{c.area}</span>
                </div>
                {typeof c.count === "number" && (
                  <div className="text-[11px] text-[#7a6a55] mt-0.5">검증 후기 {c.count}건{c.grade ? ` · ${c.grade}` : ""}</div>
                )}
              </a>
            ))}
          </div>
        )}

        {!loading && searched && hits.length === 0 && (
          <p className="text-[12.5px] text-[#8a7458] py-3 text-center leading-relaxed">
            찾는 가게가 없어요.<br />아직 등록 전이거나 이름이 다를 수 있어요.
          </p>
        )}

        {/* 못 찾은 사장님을 위한 길 — 여기서 기존 체험 신청으로 넘긴다 */}
        <button onClick={onNoMatch}
          className="w-full text-center text-[12px] text-[#9c6b3f] underline py-2">
          우리 가게가 안 보여요 · 등록·체험 신청
        </button>
        <button onClick={onClose} className="w-full text-center text-[12px] text-[#8a7458] py-1.5">닫기</button>
      </div>
    </div>
  );
}
