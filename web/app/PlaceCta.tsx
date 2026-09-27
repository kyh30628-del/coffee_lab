"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trackOutbound } from "./trackOutboundClient";

// 🧪 상세 하단 행동 버튼 A/B(2026-09-22 CEO "네이버 플레이스 버튼 위치·문구 실험 바로 적용").
//   실측(7일·봇 제외): 상세 도달 882명 중 네이버 플레이스 클릭 100명(11%) — 다음 행동이 약하다.
//   A(대조) = 지도/길찾기(진한 버튼) + '네이버 플레이스'(선 버튼)  ← 지금까지의 화면
//   B(실험) = '네이버에서 후기·메뉴 더 보기'(진한 버튼, 앞) + 지도/길찾기(선 버튼, 뒤)
//   배정 = 기기 id(dcn_anon) 해시 50/50, 한 기기는 항상 같은 안. 클릭 로그의 source에 `:A`/`:B`를 붙여 같은 표(outbound_clicks)에서 비교한다.
//   판정 = 상세 방문자 대비 naver_place 클릭률. 2주 뒤(10-06) 결론. 어느 쪽이든 이동은 반드시 된다(preventDefault 없음).
export function abVariant(): "A" | "B" {
  try {
    const id = localStorage.getItem("dcn_anon") || localStorage.getItem("dcn_device") || "";
    if (!id) return "A";
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    return (h & 1) === 0 ? "A" : "B";
  } catch { return "A"; }
}
// 2026-09-27 2차 — CEO "길찾기·네이버 플레이스를 아이콘으로 눈에 잘 띄게".
//   네이버 N 로고를 흰 배지 안에 넣어 "브랜드 앱 아이콘"처럼 도드라지게 한다
//   (맨몸 초록 글자보다 인식·신뢰 신호가 강하다 — 네이버·카카오 등 실제 앱들이 쓰는 방식).
const NBadge = () => (
  <span className="nt-nbadge" aria-hidden>
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#03c75a"><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z" /></svg>
  </span>
);
// 지도 핀 — Material "place" 글리프(구멍 뚫린 단일 path, 별도 원 합성 불필요). 사이트 아이콘 언어(stroke 아웃라인)와
// 달리 **채움**으로 그린다 — 어두운 버튼 위에서 15px 크기에 얇은 선보다 덩어리진 실루엣이 더 잘 읽힌다(실측 대조).
const PinIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
  </svg>
);

export default function PlaceCta({ cafeId, mapHref, mapLabel, mapExternal, screen }: {
  cafeId: number; mapHref: string; mapLabel: string; mapExternal?: boolean; screen: "카페상세" | "지도앱";
}) {
  // ⚠️ 09-26 한때 화면마다 버튼을 상단·하단 2개씩 두고 위치별(slot)로 source를 갈랐다 —
  //   똑같이 생긴 버튼이 한 페이지에 둘 보여 CEO 지적(09-27)으로 하단 제거, 화면당 1개로 되돌림.
  //   slot 구분은 더 쓰이지 않지만 과거 outbound_clicks.source에 '카페상세상단'이 남아있을 수 있다(집계 시 참고).
  const [v, setV] = useState<"A" | "B">("A");
  useEffect(() => { setV(abVariant()); }, []);
  const src = `${screen}:${v}`;
  const place = `/api/naver-place-redirect?id=${cafeId}`;
  const mapProps = mapExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const MapEl = mapExternal ? "a" : Link;
  const map = (cls: string) => (
    <MapEl href={mapHref} className={cls} {...(mapProps as any)} onClick={() => trackOutbound({ target: mapExternal ? "kakao_map" : "map_cta", cafeId, source: src })}><PinIcon />{mapLabel}</MapEl>
  );
  const naver = (cls: string, label: string) => (
    <a href={place} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => trackOutbound({ target: "naver_place", cafeId, source: src })}><NBadge />{label}</a>
  );
  return v === "B"
    ? <div className="nt-cta" data-ab="B">{naver("nt-btn-ink", "네이버에서 후기·메뉴 더 보기")}{map("nt-btn-line")}</div>
    : <div className="nt-cta" data-ab="A">{map("nt-btn-ink")}{naver("nt-btn-line", "네이버 플레이스")}</div>;
}
