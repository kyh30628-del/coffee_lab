"use client";
import Link from "next/link";

// 📊 카페 상세 "☕ 이 카페 사장님이신가요?" CTA 계측(decisions#782) — /api/owner-funnel에 cta_click 기록.
//   #513(홈 CTA 계측)과 동일 패턴. 서버 컴포넌트(/c/[id])에서는 onClick을 달 수 없어 얇은 클라이언트 래퍼로 감쌌다.
//   읽기전용, 실패해도 이동은 그대로(계측 실패가 사용자 플로우를 막지 않음).
export default function OwnerCtaLink({ cafeId, cafeName, className, style, children }: {
  cafeId: number;
  cafeName: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const track = () => {
    try {
      const anonId = localStorage.getItem("dcn_anon") || "";
      fetch("/api/owner-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anonId, event: "cta_click", source: "cafe_detail", cafeId, path: `/c/${cafeId}` }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  };
  return (
    <Link href={`/owner?name=${encodeURIComponent(cafeName)}`} onClick={track} className={className} style={style}>
      {children}
    </Link>
  );
}
