"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// 🕘 최근 본 카페 — 무가입·서버 조회 0의 리텐션 장치(2026-08-16).
//
// 왜 만들었나(실측): 재방문율 3.5%(1,916명 중 67명)인데, 기존 리텐션 장치는 **사실상 안 쓰인다** —
//   북마크 4건(기기 2대)·내 카페 기록 5건(기기 2대). 원인은 두 가지다.
//     ① 즐겨찾기는 **지도 앱 안에만** 있는데 유입의 96%는 SEO 페이지(테마·상세)에 착지하고
//        지도까지 가는 사람이 주당 15명뿐이라, 존재 자체를 알 방법이 없었다.
//     ② 사용자에게 **명시적 저장 행동을 요구**했다. 4건이 그 답이다 — 사람들은 저장을 안 한다.
//   → 저장을 요구하지 않는다. 카페를 열어보기만 하면 자동으로 쌓이고, 다시 왔을 때 이어보게 한다.
//     재방문자는 평균 14.6PV로 1회성(3.9PV)의 4배라 붙잡을 가치가 크다.
//
// 💰 비용: localStorage만 사용 — DB 조회·서버 호출 0. 무가입 원칙(기기 로컬) 유지.
// ⚠️ 정직성: 목록이 비면 **아무것도 그리지 않는다**. 첫 방문자에게 빈 껍데기를 보여주지 않는다.

const KEY = "dcn_recent_cafes";
const MAX = 8;

export type RecentCafe = { id: number; name: string; area: string; grade?: string };

function read(): RecentCafe[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && Number(x.id) > 0).slice(0, MAX) : [];
  } catch { return []; }
}

/** 상세 페이지에서 호출 — 이 카페를 최근 목록 맨 앞에 올린다(중복 제거·상한 유지). */
function remember(c: RecentCafe) {
  try {
    const cur = read().filter((x) => String(x.id) !== String(c.id));
    localStorage.setItem(KEY, JSON.stringify([c, ...cur].slice(0, MAX)));
  } catch { /* 저장 실패는 조용히 무시 — 기능이 없어도 서비스는 정상 */ }
}

export default function RecentCafes({ current, title = "🕘 최근 본 카페" }: {
  /** 현재 보고 있는 카페(상세 페이지에서만 전달) — 기록하고, 목록에선 제외한다. */
  current?: RecentCafe;
  title?: string;
}) {
  const [items, setItems] = useState<RecentCafe[]>([]);

  useEffect(() => {
    if (current?.id) remember(current);
    // 기록 후 읽어서 현재 카페는 빼고 보여준다(자기 자신을 '최근 본'에 노출하지 않음)
    setItems(read().filter((x) => !current || String(x.id) !== String(current.id)));
  }, [current?.id]);

  if (items.length === 0) return null; // 첫 방문자에겐 아무것도 안 보인다

  return (
    <div className="mt-7">
      <div className="text-[13px] font-bold text-[#5a4632] mb-2">{title}</div>
      <div className="flex flex-col gap-2">
        {items.map((c) => (
          <Link key={c.id} href={`/c/${c.id}`}
            className="flex items-center gap-2.5 bg-white border border-[#e0d3bd] rounded-xl px-3.5 py-2.5">
            <span className="flex flex-col text-left min-w-0">
              <span className="text-[13.5px] font-bold text-[#3d2f22] truncate">{c.name}</span>
              <span className="text-[10.5px] text-[#6f6047] truncate">{c.area}</span>
            </span>
            {c.grade && <span className="ml-auto text-[10px] font-bold bg-[#2b2018] text-[#e8b87a] px-2 py-0.5 rounded-full whitespace-nowrap">{c.grade}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
