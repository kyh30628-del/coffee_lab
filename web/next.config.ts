import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  // (2026-09-03 감사) `eslint` 키는 Next 16 NextConfig 타입에서 제거됨 — 유일한 tsc 오류의 원인이라 삭제.
  //   빌드는 원래 lint를 안 돌리므로(next build) 동작 변화 없음.
  // 클라이언트 번들에 현재 배포 버전을 박아넣음(자동 업데이트 감지용). Vercel 커밋 SHA, 없으면 타임스탬프.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now()) },
  // 🛡️ 기준 검증 에이전트의 정적 dead-knob 스캔이 런타임에 소비 코드(lib/·app/api/) 소스를 읽는다.
  //   Vercel 함수 번들엔 기본적으로 .ts 소스가 없으므로, 이 라우트 함수에 소스를 강제 포함(트레이싱)해야
  //   배포 환경에서도 실제 코드를 대조할 수 있다. 검증 크론 1개 함수에만 적용(번들 영향 국소).
  outputFileTracingIncludes: {
    // 📍 장소 인덱스(전국 59,504곳, 3.1MB) — 검색 함수가 런타임에 읽는다. public/이 아니라 번들에만 넣어 브라우저 전송 0.
    "/api/search": ["./data/places.json"],
    // 📓 OG 카드 손글씨(성실체 KS 서브셋 830KB) — 5개 OG 라우트가 런타임에 읽는다
    "/api/og/cafe": ["./data/fonts/NanumSeongSirCe.ttf"],
    "/area/[gu]/opengraph-image": ["./data/fonts/NanumSeongSirCe.ttf"],
    "/area/[gu]/[taste]/opengraph-image": ["./data/fonts/NanumSeongSirCe.ttf"],
    "/area/[gu]/dong/[dong]/opengraph-image": ["./data/fonts/NanumSeongSirCe.ttf"],
    "/collections/[slug]/opengraph-image": ["./data/fonts/NanumSeongSirCe.ttf"],
    "/api/cron-criteria-verify": ["./lib/**/*.ts", "./app/api/**/*.ts"],
    "/api/admin/criteria-status": ["./lib/**/*.ts", "./app/api/**/*.ts"],
    // 관제탑이 런타임에 .ai-paused 플래그(판정 의도적 정지)를 읽는다 → 함수 번들에 포함.
    "/api/orchestrator": ["./.ai-paused"],
    // 🧬 규칙 지문(rulesFingerprint)이 런타임에 규칙 소스를 해시한다 — 번들에 포함해야 읽힌다.
    //   규칙 파일 3개만(전체 lib 아님 — 번들 크기 영향 최소).
    "/api/cron-resynth": ["./lib/reviewQuality.ts", "./lib/criteriaListsBase.ts", "./lib/discover.ts"],
    "/api/cron-sentinel": ["./lib/reviewQuality.ts", "./lib/criteriaListsBase.ts", "./lib/discover.ts"],
  },
  // 🧭 홈(랜딩) HTML은 항상 최신으로 — 인스타·페북 등 인앱 브라우저(WebView)가 must-revalidate를 무시하고
  //   옛 HTML을 디스크캐시로 붙잡아, 코드를 고쳐 배포해도 사용자 화면이 안 바뀌던 문제(2026-07-10 안드로이드
  //   인스타 초기화면 확대가 고친 뒤에도 계속 보이던 원인=stale 캐시). no-store로 셸 HTML 캐시를 원천 차단.
  //   해시된 JS/CSS 청크는 그대로 장기캐시(성능 무영향). SEO 무영향(크롤러는 매번 최신 취득).
  async headers() {
    return [
      { source: "/", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
      // 🎨 지도 질감·핀(불변 자산) — 내용이 바뀌면 파일명이 아니라 **파일 자체를 새로 렌더**하므로 URL이 같다.
      //   그래도 1년 고정이 맞다: Blender 렌더 결과를 바꾸는 일은 배포 때뿐이고, 그땐 배포와 함께 새로 받게 된다.
      //   기본값(max-age=0, must-revalidate)이면 지도 첫 로드마다 9+8건이 304 재검증을 왕복한다(실측).
      { // 🚇 철도 데이터(전국 1,332역·70노선, 2026-09-12) — 지도 탭 첫 진입에 1회 받는다.
        //   자주 안 바뀌므로 하루 캐시 + 재검증 유예. 지역을 새로 열어 갱신하면 하루 안에 따라온다.
        source: "/data/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
      { source: "/map/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      { source: "/pins/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};

export default nextConfig;
