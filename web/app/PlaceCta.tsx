"use client";
import Link from "next/link";
import { trackOutbound } from "./trackOutboundClient";

// 🎯 2026-09-27 3차 — CEO "길찾기·네이버를 아이콘+짧은 이름으로, 인스타 표시 하단에 작게 영역 안에".
//   기존엔 하단 고정 큰 버튼 2개(9/26)→상단 큰 버튼+아이콘(9/27 1·2차)로 옮겨왔는데, 여전히 "화면을
//   가로지르는 큰 CTA"였다. 이번엔 아예 다른 자리(인스타 배지 바로 아래)에 인스타 배지(.nt-ig)와
//   같은 크기·같은 언어(둥근 알약 + 22px 색배지 아이콘 + 짧은 라벨)로 넣어 "정보 칩 줄"의 일부로 만든다.
//   ⚠️ 9/22 도입한 순서·강조 A/B는 여기서 접는다 — 두 칩이 이제 시각적으로 동급이라 강조 비교가 무의미해졌다.
//   클릭 추적(outbound_clicks)은 그대로 유지해 전후 클릭률을 비교할 수 있게 한다.
const PinIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#fff" aria-hidden>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
  </svg>
);
const NIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden>
    <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z" />
  </svg>
);

export default function PlaceCta({ cafeId, mapHref, mapLabel, mapExternal, screen }: {
  cafeId: number; mapHref: string; mapLabel: string; mapExternal?: boolean; screen: "카페상세" | "지도앱";
}) {
  const place = `/api/naver-place-redirect?id=${cafeId}`;
  const mapProps = mapExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const MapEl = mapExternal ? "a" : Link;
  return (
    <div className="nt-cta-mini">
      <MapEl href={mapHref} className="nt-cta-map" {...(mapProps as any)} onClick={() => trackOutbound({ target: mapExternal ? "kakao_map" : "map_cta", cafeId, source: screen })}>
        <span className="nt-cta-badge"><PinIcon /></span>{mapLabel}
      </MapEl>
      <a href={place} target="_blank" rel="noopener noreferrer" className="nt-cta-naver" onClick={() => trackOutbound({ target: "naver_place", cafeId, source: screen })}>
        <span className="nt-cta-badge"><NIcon /></span>네이버 플레이스
      </a>
    </div>
  );
}
