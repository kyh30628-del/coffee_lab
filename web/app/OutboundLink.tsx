"use client";
import { trackOutbound } from "./trackOutboundClient";

// 🚪 외부로 나가는 링크 + 계측을 한 몸으로 묶은 컴포넌트.
//   서버 컴포넌트(/c/[id] 등)에서는 onClick을 달 수 없어 이 얇은 클라이언트 래퍼가 필요하다.
//   ⚠️ 계측이 실패해도 이동은 반드시 되어야 하므로 preventDefault를 절대 하지 않는다(기본 동작 유지).
export default function OutboundLink({
  href, target: dest, cafeId, source, className, style, children,
}: {
  href: string;
  target: "naver_place" | "kakao_map" | "map_cta" | "nearby" | "record" | "favs_link";
  cafeId?: number | null;
  source?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  // 내부 이동(지도·다음 카페)은 같은 탭이 자연스럽다 — 새 탭은 외부로 나갈 때만.
  const external = /^https?:\/\//.test(href) || href.startsWith("/api/");
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={className}
      style={style}
      onClick={() => trackOutbound({ target: dest, cafeId, source })}
    >
      {children}
    </a>
  );
}
