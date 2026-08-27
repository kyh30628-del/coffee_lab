"use client";
import Link from "next/link";

// 📊 카페 상세 "☕ 이 카페 사장님이신가요?" CTA 계측(decisions#782) — /api/owner-funnel에 cta_click 기록.
// 🔴 2026-08-27: 목적지를 /owner?name= → /owner/r/[id](무료 리포트)로 바꿨다.
//   /owner는 name 파라미터를 무시하고 PIN 로그인 벽을 띄워서, "무료 인사이트"라는 약속을 어기고 있었다
//   (퍼널 실측: CTA 20클릭 → 모달 4 → 신청 1 → 결제 0). cafeName은 표시용으로만 남긴다.
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
    <Link href={`/owner/r/${cafeId}`} onClick={track} className={className} style={style}>
      {children}
    </Link>
  );
}
