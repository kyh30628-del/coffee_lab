import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "동네 커피 노트 — 취향으로 찾는 동네 카페",
  description: "수도권 동네 로스터리·카페를 취향과 근거로 안내합니다. 네이버 공개 후기를 교차검증해 산미·바디·단맛까지.",
};

// 모바일 최적화: 화면 꽉 채우고, 사용자 확대로 깨지지 않게
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#2b2018",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
