"use client";
import Link from "next/link";

// 📊 무료 리포트 → 유료 안내 이동 계측. 이게 무료 리포트의 **유일한 전환 신호**다.
//   (페이지뷰와 항상 같이 발생하는 'paywall_view'는 지표로 쓸모가 없어 폐기했다.)
//   기존 cta_click 이벤트를 재사용하고 source로 출처를 가른다 — 이벤트 종류를 늘리지 않는다.
export default function PricingCta({ cafeId }: { cafeId: number }) {
  const track = () => {
    try {
      const anonId = localStorage.getItem("dcn_anon") || "";
      fetch("/api/owner-funnel", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ anonId, event: "cta_click", source: "free_report", cafeId, path: `/owner/r/${cafeId}` }),
      }).catch(() => {});
    } catch {}
  };
  return (
    <Link href="/pricing" onClick={track}
      className="block text-center bg-[#f4ece0] text-[#2b2018] rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] transition-transform">
      자세히 보기
    </Link>
  );
}
