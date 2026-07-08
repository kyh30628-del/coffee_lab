import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // 클라이언트 번들에 현재 배포 버전을 박아넣음(자동 업데이트 감지용). Vercel 커밋 SHA, 없으면 타임스탬프.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()) },
  // 🛡️ 기준 검증 에이전트의 정적 dead-knob 스캔이 런타임에 소비 코드(lib/·app/api/) 소스를 읽는다.
  //   Vercel 함수 번들엔 기본적으로 .ts 소스가 없으므로, 이 라우트 함수에 소스를 강제 포함(트레이싱)해야
  //   배포 환경에서도 실제 코드를 대조할 수 있다. 검증 크론 1개 함수에만 적용(번들 영향 국소).
  outputFileTracingIncludes: {
    "/api/cron-criteria-verify": ["./lib/**/*.ts", "./app/api/**/*.ts"],
    "/api/admin/criteria-status": ["./lib/**/*.ts", "./app/api/**/*.ts"],
  },
};

export default nextConfig;
