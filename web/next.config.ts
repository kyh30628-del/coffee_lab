import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // 클라이언트 번들에 현재 배포 버전을 박아넣음(자동 업데이트 감지용). Vercel 커밋 SHA, 없으면 타임스탬프.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()) },
};

export default nextConfig;
