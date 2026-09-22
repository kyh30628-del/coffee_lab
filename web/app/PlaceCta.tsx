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
const NIcon = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="#03c75a" aria-hidden><path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z"/></svg>;

export default function PlaceCta({ cafeId, mapHref, mapLabel, mapExternal, screen }: {
  cafeId: number; mapHref: string; mapLabel: string; mapExternal?: boolean; screen: "카페상세" | "지도앱";
}) {
  const [v, setV] = useState<"A" | "B">("A");
  useEffect(() => { setV(abVariant()); }, []);
  const src = `${screen}:${v}`;
  const place = `/api/naver-place-redirect?id=${cafeId}`;
  const mapProps = mapExternal ? { target: "_blank", rel: "noopener noreferrer" } : {};
  const MapEl = mapExternal ? "a" : Link;
  const map = (cls: string) => (
    <MapEl href={mapHref} className={cls} {...(mapProps as any)} onClick={() => trackOutbound({ target: mapExternal ? "kakao_map" : "map_cta", cafeId, source: src })}>{mapLabel}</MapEl>
  );
  const naver = (cls: string, label: string) => (
    <a href={place} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => trackOutbound({ target: "naver_place", cafeId, source: src })}><NIcon />{label}</a>
  );
  return v === "B"
    ? <div className="nt-cta" data-ab="B">{naver("nt-btn-ink", "네이버에서 후기·메뉴 더 보기")}{map("nt-btn-line")}</div>
    : <div className="nt-cta" data-ab="A">{map("nt-btn-ink")}{naver("nt-btn-line", "네이버 플레이스")}</div>;
}
