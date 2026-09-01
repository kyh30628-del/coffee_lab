"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// ❤ 찜한 카페 다시 보기 — 명시적으로 저장한 카페의 재방문 유도(2026-09-01, 협업#363→결재#932).
//
// 왜 만들었나: 마케팅팀 관찰(4사이클 연속) — naver 세션재방문율이 8.4%→7.0%→6.4%로 정체.
//   찜(WishButton)은 이미 있지만 회수 동선이 지도 앱의 즐겨찾기 탭뿐이다. 그런데 유입의 대부분은
//   /c/[id] 같은 SEO 상세 페이지에 착지하고 지도까지 가는 사람은 적다(RecentCafes 실측과 동일 구조) —
//   즉 "찜은 했는데 다시 보러 지도까지 갈 이유가 없어" 방치된다.
//   → RecentCafes와 같은 자리(SEO 상세 페이지)에 "찜한 카페"를 직접 노출해 회수 동선을 짧게 만든다.
//
// 💰 비용: 기존 /api/bookmark GET 재사용(새 API·새 테이블 0). device_id 없으면 호출도 안 함.
// ⚠️ 정직성: 찜한 게 없으면(또는 전부 현재 카페면) 아무것도 그리지 않는다.
export default function SavedCafes({ excludeId }: { excludeId?: number }) {
  const [items, setItems] = useState<{ id: number; name: string; area: string; synth_grade?: string }[]>([]);

  useEffect(() => {
    let dev = "";
    try { dev = localStorage.getItem("dcn_device") || ""; } catch {}
    if (!dev) return; // 찜한 적 없으면 device_id 자체가 없다 — 호출 스킵
    fetch(`/api/bookmark?device=${dev}`).then((r) => r.json())
      .then((d) => {
        if (!d?.ok) return;
        const cafes = (d.cafes ?? []).filter((c: any) => !excludeId || Number(c.id) !== Number(excludeId));
        setItems(cafes);
      }).catch(() => {});
  }, [excludeId]);

  if (items.length === 0) return null; // 찜이 없는 사람에겐 빈 껍데기를 보여주지 않는다

  return (
    <div className="mt-7">
      <div className="text-[13px] font-bold text-[#5a4632] mb-2">❤ 찜한 카페 다시 보기</div>
      <div className="flex flex-col gap-2">
        {items.slice(0, 8).map((c) => (
          <Link key={c.id} href={`/c/${c.id}`}
            className="flex items-center gap-2.5 bg-white border border-[#f0b8cc] rounded-xl px-3.5 py-2.5">
            <span className="flex flex-col text-left min-w-0">
              <span className="text-[13.5px] font-bold text-[#3d2f22] truncate">{c.name}</span>
              <span className="text-[10.5px] text-[#6f6047] truncate">{c.area}</span>
            </span>
            {c.synth_grade && <span className="ml-auto text-[10px] font-bold bg-[#2b2018] text-[#e8b87a] px-2 py-0.5 rounded-full whitespace-nowrap">{c.synth_grade}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
