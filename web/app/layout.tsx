import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import VisitPing from "./VisitPing";
import NaverAnalytics from "./NaverAnalytics";
import PwaInstall from "./PwaInstall";

export const metadata: Metadata = {
  metadataBase: new URL("https://dongnecoffeenote.com"),
  title: "동네 커피 노트 — 취향으로 찾는 동네 카페",
  description: "수도권 동네 로스터리·카페를 취향과 근거로 안내합니다. 네이버 공개 후기를 교차검증해 산미·바디·단맛까지.",
  manifest: "/manifest.json",
  openGraph: {
    type: "website", siteName: "동네 커피 노트", locale: "ko_KR",
    title: "동네 커피 노트 — 취향으로 찾는 동네 카페",
    description: "수도권 동네 카페를 취향과 데이터로 안내해요. 네이버 공개 후기를 교차검증한 산미·바디·단맛·결.",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image", title: "동네 커피 노트", description: "취향으로 찾는 우리 동네 카페", images: ["/og.png"] },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION,
    other: process.env.NAVER_SITE_VERIFICATION ? { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION } : {},
  },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "커피 노트", statusBarStyle: "black-translucent" },
};

// 모바일 최적화: 화면 꽉 채우고 device-width에 정확히 맞춤.
//   ⚠️ maximumScale:1 / userScalable:false 제거(2026-07-10) — iOS Safari는 user-scalable=no를 무시하지만
//   인스타·페북 인앱 브라우저(WKWebView)는 이를 '존중'해 페이지를 잘못된 배율로 고정하고, 사용자가
//   핀치로 되돌릴 수도 없게 만든다(=인스타 링크로 들어오면 화면 배율이 안 맞던 원인). Safari에서만 정상이던 이유.
//   확대 허용이 Apple 접근성 권장이자 인앱 배율 버그의 표준 해법. 지도는 Leaflet이 자체 제스처를 처리해 무영향.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2b2018",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full subpixel-antialiased">
      <head>
        {/* 폰트를 문서 head에서 조기 연결·로딩 → 아이폰에서 글자가 점점 뜨던 문제 완화 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap" />
      </head>
      <body className="min-h-full">
        {children}
        <PwaInstall />
        <VisitPing />
        <Analytics />
        <NaverAnalytics />
      </body>
    </html>
  );
}
