import { sql } from "./db";
import { noteWrite } from "./writeScope";

// 👤 리뷰어 신뢰 프로필 — 1단계: 수집만 (decisions #699 · docs/DESIGN-reviewer-trust.md).
//
// ⚠️ 이 모듈은 **판정에 아무 영향도 주지 않는다.** 등급·노출·점수 불변. 오직 계정 단위 통계를
//   적재만 한다(설계 1단계). 2단계=시뮬 리포트, 3단계(실제 가중 반영)=별도 CEO 결재.
//
// 설계 대비 정제 1건: 설계서의 reviewer_profiles(증분 카운터)는 재합성이 같은 카페를 8~9일마다
//   재처리할 때 **카운트가 부풀어 오르는** 문제가 있다(멱등 아님). → (rid, cafe_id) 단위로
//   그 카페의 통계를 **통째 교체(upsert-replace)** 하는 reviewer_cafes로 바꾼다. 재합성이 몇 번
//   돌아도 같은 입력이면 같은 행 = 멱등. 계정 전체 프로필은 rid로 SUM(2·3단계에서 집계).
//
// 💰 비용: 재합성이 어차피 읽는 데이터에 편승(추가 스캔 0). 쓰기 = 카페당 계정 수십 행 upsert.

export type ReviewerCafeStat = { accepted: number; rejectedAd: number; firstDt: string | null; lastDt: string | null };

/** 링크 → 계정 ID. 네이버 블로그만(노출 후기의 97%). 그 외 출처는 null = 프로필 대상 아님(불이익 없음). */
export function extractRid(link?: string | null): string | null {
  if (!link) return null;
  const m = String(link).match(/(?:m\.)?blog\.naver\.com\/(?:PostView\.naver\?blogId=)?([A-Za-z0-9_-]{2,30})/);
  if (!m) return null;
  const id = m[1].toLowerCase();
  // 경로형 URL의 예약어 오추출 방지(블로그 ID가 아닌 경로 조각)
  if (["postview", "postlist", "guestbook"].includes(id)) return null;
  return `naver:${id}`;
}

/** 'YYYYMMDD' 등 느슨한 날짜를 ISO로. 못 읽으면 null(방어적). */
export function looseDate(d?: string | null): string | null {
  if (!d) return null;
  const s = String(d).trim();
  const m = s.match(/^(\d{4})[.\-/]?(\d{2})[.\-/]?(\d{2})/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

let ensured = false;
async function ensure(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS reviewer_cafes (
    rid TEXT NOT NULL,
    cafe_id BIGINT NOT NULL,
    accepted INT NOT NULL DEFAULT 0,
    rejected_ad INT NOT NULL DEFAULT 0,
    first_dt DATE, last_dt DATE,
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (rid, cafe_id)
  )`;
  await sql`CREATE INDEX IF NOT EXISTS reviewer_cafes_rid ON reviewer_cafes (rid)`.catch(() => {});
  ensured = true;
}

/**
 * 한 카페의 재합성 결과에서 나온 계정별 통계를 통째 교체(멱등).
 * 실패는 삼키지 않고 호출부에 알리되, **합성 본류를 절대 막지 않는다**(호출부가 비치명 처리).
 */
export async function upsertReviewerStats(cafeId: number, stats: Map<string, ReviewerCafeStat>): Promise<number> {
  if (!stats || stats.size === 0) return 0;
  await ensure();
  // ⚡ 2026-08-28: 원래 건당 1왕복 INSERT 루프였다. 카페 한 곳에 계정이 수백~수천이라
  //   왕복만 856회/카페(실측·건당 380ms) → 재합성 한 곳에 수 분, 그동안 Neon 활성시간을 그대로 태웠다.
  //   같은 SQL(ON CONFLICT 포함)을 **다중행 VALUES 한 방**으로 묶는다: 왕복 856회 → 2회.
  //   Map 키가 rid라 한 청크 안에 (rid, cafe_id) 중복이 없다 = ON CONFLICT 재적용 오류 불가.
  const rows = [...stats.entries()];
  const CHUNK = 500; // 행당 파라미터 6개 → 3,000개(Postgres 상한 65,535 훨씬 아래)
  let n = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const params: (string | number | null)[] = [];
    const values = part.map(([rid, s], j) => {
      const b = j * 6;
      params.push(rid, cafeId, s.accepted, s.rejectedAd, s.firstDt, s.lastDt);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::date, $${b + 6}::date, now())`;
    });
    await sql.query(
      `INSERT INTO reviewer_cafes (rid, cafe_id, accepted, rejected_ad, first_dt, last_dt, updated_at)
       VALUES ${values.join(", ")}
       ON CONFLICT (rid, cafe_id) DO UPDATE SET
         accepted=EXCLUDED.accepted, rejected_ad=EXCLUDED.rejected_ad,
         first_dt=EXCLUDED.first_dt, last_dt=EXCLUDED.last_dt, updated_at=now()`,
      params,
    );
    n += part.length;
  }
  noteWrite("reviewer_cafes.*");
  return n;
}
