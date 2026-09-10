import type { NextRequest } from "next/server";
import { ogCard, OG_SIZE } from "@/lib/ogCard";

// 🌙 DB를 치지 않는 OG 카드 — 2026-09-10 CEO 결재("색인 우선 · 위험 없는 것부터").
//
// 왜 만들었나: 기존 `app/c/[id]/opengraph-image.tsx`는 크롤러가 이미지를 가져갈 때마다
//   **자기 요청으로 DB를 한 번 친다.** 실측(2026-09-09 새벽 00~08시): OG 라우트 2,146회 호출,
//   전부 캐시 미스. 카페 이름 한 줄 때문에 새벽 내내 DB를 깨우고 있었다.
//   Neon은 5분 무요청이어야 잠드는데, 이것만으로도 간격이 안 난다.
//
// 어떻게 없앴나: 이미지에 필요한 값(이름·지역·등급·특징)은 **본문 페이지가 이미 읽어둔 것**이다.
//   그 값을 og:image URL의 쿼리에 실어 보내면, 이미지 라우트는 쿼리만 읽고 그린다 → DB 접속 0.
//   본문 페이지는 ISR 30일 캐시라 그 읽기도 30일에 한 번뿐이다.
//
// ⚠️ 쿼리 값은 **우리 서버가 만든 URL**로만 들어온다(사용자 입력 아님). 그래도 길이를 자르고
//   문자열로만 다뤄 렌더에 넣는다 — 이미지라 스크립트 실행 경로가 없다.
export const runtime = "nodejs";
// ⚠️ force-static을 걸면 **쿼리를 못 읽는다**(2026-09-10 로컬 실측: 카페 이름 대신 기본 카드가 나왔다).
//   쿼리로 그리는 라우트라 동적이어야 한다. 대신 응답 헤더로 CDN에 영구 캐시시킨다 —
//   URL이 같으면 그림도 항상 같으므로 재생성 자체가 필요 없다(1년 · immutable).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const cut = (s: string | null, n: number) => (s ? String(s).slice(0, n) : "");
  const title = cut(q.get("t"), 40) || "동네 커피 노트";
  const subtitle = cut(q.get("s"), 70) || "진짜 후기로 고른 우리 동네 카페";
  const badge = cut(q.get("b"), 10) || undefined;
  const footer = cut(q.get("f"), 60) || undefined;
  const traits = cut(q.get("r"), 40).split("|").filter(Boolean).slice(0, 2);
  const res = await ogCard({ title, subtitle, badge, traits, footer });
  res.headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
  return res;
}

export const size = OG_SIZE;
