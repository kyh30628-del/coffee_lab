"use client";
import Script from "next/script";

// 네이버 애널리틱스(wcslog) — 한국 검색 유입·검색어 가시화.
// NEXT_PUBLIC_NAVER_WCS_ID 미설정 시 아무것도 렌더하지 않음(비활성, 위험 0).
// 발급: 네이버 애널리틱스(analytics.naver.com) 가입 → 사이트 등록 → 발급된 계정ID를 env로.
export default function NaverAnalytics() {
  const wa = process.env.NEXT_PUBLIC_NAVER_WCS_ID;
  if (!wa) return null;
  return (
    <>
      <Script src="//wcs.naver.net/wcslog.js" strategy="afterInteractive" />
      <Script id="naver-wcs" strategy="afterInteractive">
        {`if(!window.wcs_add) window.wcs_add={}; window.wcs_add["wa"]="${wa}"; if(window.wcs){window.wcs_do();}`}
      </Script>
    </>
  );
}
