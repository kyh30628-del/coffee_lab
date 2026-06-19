import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";

// 관리자 '오늘의 수집' 패널 카드 클릭 시 상세 목록(모달용). 비밀번호 게이트.
// orchestrator/route.ts의 today 지표와 '동일한 KST 자정 기준 필터'를 재사용 → 카운트=목록 길이 일치.
const LIMIT = 500;

export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const metric = req.nextUrl.searchParams.get("metric") || "";
  try {
    let cafes: any[] = [];
    // 공통 SELECT 컬럼 — 모달 표 표시용(생성/합성 시각은 KST로 변환)
    switch (metric) {
      case "newCafes": // 오늘 신규발굴: created_at이 오늘(KST)
        cafes = await sql`SELECT id, name, area, dong, synth_grade AS grade, synth_count AS cnt, published, source,
            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS at
          FROM cafes WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
          ORDER BY created_at DESC LIMIT ${LIMIT}`;
        break;
      case "synthesized": // 오늘 합성처리: synth_updated가 오늘(KST)
        cafes = await sql`SELECT id, name, area, dong, synth_grade AS grade, synth_count AS cnt, published, source,
            to_char(synth_updated AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS at
          FROM cafes WHERE synth_updated >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
          ORDER BY synth_updated DESC LIMIT ${LIMIT}`;
        break;
      case "published": // 오늘 신규공개: 오늘 생성 + 공개
        cafes = await sql`SELECT id, name, area, dong, synth_grade AS grade, synth_count AS cnt, published, source,
            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'HH24:MI') AS at
          FROM cafes WHERE published AND created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
          ORDER BY created_at DESC LIMIT ${LIMIT}`;
        break;
      case "noise": // 노이즈탈락: pipeline_status='noise'
        cafes = await sql`SELECT id, name, area, dong, synth_grade AS grade, synth_count AS cnt, published, source,
            to_char(synth_updated AT TIME ZONE 'Asia/Seoul', 'MM-DD') AS at
          FROM cafes WHERE pipeline_status='noise' ORDER BY synth_updated DESC NULLS LAST LIMIT ${LIMIT}`;
        break;
      case "newQueue": // 합성대기: pipeline_status='new'
        cafes = await sql`SELECT id, name, area, dong, synth_grade AS grade, synth_count AS cnt, published, source,
            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'MM-DD') AS at
          FROM cafes WHERE pipeline_status='new' ORDER BY created_at DESC LIMIT ${LIMIT}`;
        break;
      case "dongMissing": // 동 채움: 동(洞) 없는 공개 카페(채워야 할 대상)
        cafes = await sql`SELECT id, name, area, dong, synth_grade AS grade, synth_count AS cnt, published, source,
            to_char(created_at AT TIME ZONE 'Asia/Seoul', 'MM-DD') AS at
          FROM cafes WHERE published AND dong IS NULL ORDER BY area, name LIMIT ${LIMIT}`;
        break;
      case "yt": // 유튜브 수집(누적): yt_checked_at 있는 카페(최근순)
        cafes = await sql`SELECT id, name, area, dong, synth_grade AS grade, synth_count AS cnt, published, source,
            to_char(yt_checked_at AT TIME ZONE 'Asia/Seoul', 'MM-DD') AS at
          FROM cafes WHERE yt_checked_at IS NOT NULL ORDER BY yt_checked_at DESC LIMIT ${LIMIT}`;
        break;
      default:
        return NextResponse.json({ ok: false, error: "unknown metric" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, metric, count: cafes.length, capped: cafes.length >= LIMIT, cafes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 150) }, { status: 500 });
  }
}
