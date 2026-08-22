// 🔎 리뷰 텍스트 검색 — 에이전트 전용 **안전 경로**. (2026-08-22 신설)
//
// 왜 필요한가 — 실측 사고:
//   룰갭 에이전트가 매일 임시 스크립트를 만들어 이렇게 검색했다:
//     SELECT ... FROM cafes WHERE published AND raw_reviews::text ILIKE '%키워드%'
//   `raw_reviews`는 **869MB**다. ::text 변환 + 전수 ILIKE라 **회당 27~61초**가 걸렸고,
//   pg_stat_statements 기준 단 9회로 **381초**를 태웠다(그날 전체 DB 시간의 상위 1·5위).
//   인덱스를 못 타는 형태라 카페 20,092행 × 평균 43KB를 통째로 읽는다.
//
// 대체 원리:
//   ① 기본 대상을 `synth_reviews_all`(93MB)로 — raw 대비 **9배 저렴**하고,
//      "지금 노출 중인 후기"가 곧 소비자 위험이라 룰 발굴 목적엔 이쪽이 더 정확하다.
//   ② `jsonb_path_query_array(...,'$[*].quote')`로 **인용문만** 잘라 검사(링크·메타 제외).
//   ③ 매칭을 SQL 안에서 끝내 앱으로는 결과 몇 줄만 보낸다(전송비 0에 가깝게).
//   ④ LIMIT 강제 — 무한 결과로 전송이 커지는 걸 막는다.
//
// raw_reviews를 꼭 봐야 한다면 rawSample()을 쓴다(전수 금지, 표본 상한 필수).
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";

function db() {
  if (!process.env.DATABASE_URL) {
    for (const line of fs.readFileSync(new URL("../../.env.local", import.meta.url), "utf8").split("\n")) {
      const m = line.match(/^DATABASE_URL=(.*)$/);
      if (m) process.env.DATABASE_URL = m[1].replace(/^["']|["']$/g, "");
    }
  }
  return neon(process.env.DATABASE_URL);
}

/**
 * 노출 중인 인용문에서 키워드 검색(권장 기본).
 * @param {string} term  검색어(정규식 아님 — 그대로 매칭)
 * @param {number} limit 최대 결과(기본 20, 상한 100)
 */
export async function grepExposed(term, limit = 20) {
  const sql = db();
  const lim = Math.min(Math.max(1, limit), 100);
  return await sql`
    SELECT id, name, area,
           left((jsonb_path_query_array(synth_reviews_all, '$[*].quote')::text), 300) sample
    FROM cafes
    WHERE published
      AND jsonb_path_query_array(synth_reviews_all, '$[*].quote')::text ILIKE ${"%" + term + "%"}
    LIMIT ${lim}`;
}

/** 매칭 카페 수만 셀 때(결과 전송 0). */
export async function countExposed(term) {
  const sql = db();
  const r = await sql`
    SELECT count(*)::int n FROM cafes
    WHERE published
      AND jsonb_path_query_array(synth_reviews_all, '$[*].quote')::text ILIKE ${"%" + term + "%"}`;
  return r[0].n;
}

/**
 * ⚠️ raw_reviews 검색 — **전수 금지**. 최근 수집분 표본만 본다.
 *   raw는 869MB라 전수 스캔이 회당 수십 초다. 꼭 필요할 때만, 반드시 표본으로.
 * @param {number} sample 검사할 카페 수 상한(기본 500, 최대 2000)
 */
export async function rawSample(term, sample = 500, limit = 20) {
  const sql = db();
  const s = Math.min(Math.max(1, sample), 2000);
  const lim = Math.min(Math.max(1, limit), 100);
  return await sql`
    SELECT id, name, area FROM (
      SELECT id, name, area, raw_reviews FROM cafes
      WHERE published AND raw_reviews IS NOT NULL
      ORDER BY raw_collected_at DESC NULLS LAST LIMIT ${s}
    ) t
    WHERE jsonb_path_query_array(raw_reviews, '$[*].text')::text ILIKE ${"%" + term + "%"}
    LIMIT ${lim}`;
}
