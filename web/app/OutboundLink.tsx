"use client";
import { trackOutbound } from "./trackOutboundClient";

// 🚪 외부로 나가는 링크 + 계측을 한 몸으로 묶은 컴포넌트.
//   서버 컴포넌트(/c/[id] 등)에서는 onClick을 달 수 없어 이 얇은 클라이언트 래퍼가 필요하다.
//   ⚠️ 계측이 실패해도 이동은 반드시 되어야 하므로 preventDefault를 절대 하지 않는다(기본 동작 유지).
export default function OutboundLink({
  href, target: dest, cafeId, source, className, style, children,
}: {
  href: string;
  target: "naver_place" | "kakao_map";
  cafeId?: number | null;
  source?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={style}
      onClick={() => trackOutbound({ target: dest, cafeId, source })}
    >
      {children}
    </a>
  );
}
