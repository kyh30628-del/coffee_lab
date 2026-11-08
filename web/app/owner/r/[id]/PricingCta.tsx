"use client";
import Link from "next/link";

// 📊 무료 리포트 → 유료 안내 이동 계측. 이게 무료 리포트의 **유일한 전환 신호**다.
//   (페이지뷰와 항상 같이 발생하는 'paywall_view'는 지표로 쓸모가 없어 폐기했다.)
//   기존 cta_click 이벤트를 재사용하고 source로 출처를 가른다 — 이벤트 종류를 늘리지 않는다.
//
// 🔴 2026-11-08 발견(실측 퍼널 조사 중): 버튼 문구가 "내 순위 확인"이었는데, 바로 위 무료 카드에서
//   순위(예: "광진구 317곳 중 2위")를 **이미 공짜로 보여준다**(08-27 리뉴얼로 순위는 무료 영역으로
//   옮겨졌는데 이 문구는 안 따라왔다). 이미 본 걸 "확인하자"고 누르라는 셈이라, 클릭 안 할 이유가
//   하나 더 늘어난 꼴이었음(free_report_view 115명 중 이 경로로 pricing까지 간 건 7명뿐).
//   실제로 잠겨있는 건 "어떻게 고치나"·"누가 그 말을 했나"·매일 감시 — 바로 위 '유료 안내' 목록과
//   맞춰 문구를 바꿈.
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
      className="block text-center bg-note-paper text-note-ink rounded-xl py-3 text-[11.2px] font-bold active:scale-[0.98] transition-transform">
      약점 고치는 법 · 매일 감시 시작하기
    </Link>
  );
}
