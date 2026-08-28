// 🚚 로컬 계산 결과 → Neon 일괄 반영기 (2026-08-28).
//
// 왜 필요한가: 로컬에서 파생값을 계산하고 나면 Neon에 써야 하는데, 카페 한 곳씩 UPDATE 하면
//   왕복 1회 = 198ms(실측, 한국↔미국)라 1만 곳이면 33분간 DB를 붙잡는다. 그게 곧 Neon 요금이다.
//   그래서 **다중행 VALUES 한 방 + 트랜잭션**으로 밀어넣는다. 왕복 1만 회 → 수십 회.
//
// 안전장치 3겹:
//   ① 화이트리스트 — derivedColumns.ts 에 없는 컬럼은 쓰기 시도 자체가 예외(문서 아님, 코드가 거부).
//   ② INSERT 금지 — UPDATE ... FROM (VALUES) 형태라 **없는 카페는 조용히 건너뛴다.**
//      로컬 사본이 낡아 삭제된 카페가 있어도 되살아나지 않고, 신규 카페를 덮지도 않는다.
//   ③ 결재 잠금 — published/synth_grade 는 애초에 화이트리스트 밖이라 이 경로로 못 나간다.
//      (결재 판단이 필요한 컬럼은 Neon 쪽 기존 경로가 계속 소유한다.)

import { sql } from "./db";
import { assertLocalWritable } from "./derivedColumns";

export type Row = { id: number } & Record<string, unknown>;

/** cafes 의 실제 컬럼 타입(캐스팅용). 프로세스당 1회만 조회. */
let typeCache: Map<string, string> | null = null;
async function columnTypes(): Promise<Map<string, string>> {
  if (typeCache) return typeCache;
  const rows = (await sql`SELECT a.attname c, format_type(a.atttypid, a.atttypmod) t
    FROM pg_attribute a WHERE a.attrelid = 'cafes'::regclass AND a.attnum > 0 AND NOT a.attisdropped`) as { c: string; t: string }[];
  typeCache = new Map(rows.map((r) => [r.c, r.t]));
  return typeCache;
}

/**
 * 값을 그 컬럼 타입이 받는 형태로 바꾼다.
 *   jsonb/json — 드라이버가 JS 객체를 그대로 보내면 Postgres가 못 읽는다("invalid input syntax for json").
 *   vector     — pgvector 는 '[1,2,3]' 문자열 리터럴을 받는다.
 * 그 외 원시값은 손대지 않는다(숫자·불리언·문자열·null 그대로).
 */
function encodeFor(pgType: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (pgType === "jsonb" || pgType === "json") return typeof v === "string" ? v : JSON.stringify(v);
  if (pgType.startsWith("vector")) return Array.isArray(v) ? `[${v.join(",")}]` : v;
  return v;
}

/** Postgres 파라미터 상한 65,535. 컬럼 수에 따라 청크 크기를 자동으로 잡는다. */
function chunkSize(colCount: number): number {
  const perRow = colCount + 1; // + id
  return Math.max(1, Math.min(500, Math.floor(60000 / perRow)));
}

/**
 * 파생 컬럼만 일괄 UPDATE. 반환값 = 실제로 갱신된 행 수(존재하지 않는 id는 0으로 집계됨).
 *
 * @param rows  각 원소는 { id, ...파생컬럼 }. 모든 원소가 **같은 컬럼 집합**이어야 한다
 *              (다르면 컬럼별로 나눠 호출 — 섞으면 누락된 컬럼이 NULL로 덮인다).
 * @param opts.dryRun  true면 SQL만 만들고 쓰지 않는다(검증용).
 */
export async function bulkUpdateDerived(
  rows: Row[],
  opts?: { dryRun?: boolean; label?: string },
): Promise<{ attempted: number; updated: number; chunks: number; dryRun: boolean }> {
  if (!rows.length) return { attempted: 0, updated: 0, chunks: 0, dryRun: !!opts?.dryRun };

  const cols = Object.keys(rows[0]).filter((c) => c !== "id");
  if (!cols.length) throw new Error("bulkUpdateDerived: 갱신할 컬럼이 없습니다");
  assertLocalWritable(cols); // ① 화이트리스트 — 위반이면 여기서 던진다

  // 컬럼 집합이 행마다 다르면 NULL 덮어쓰기 사고가 난다. 미리 막는다.
  for (const r of rows) {
    const k = Object.keys(r).filter((c) => c !== "id");
    if (k.length !== cols.length || k.some((c) => !cols.includes(c))) {
      throw new Error(`bulkUpdateDerived: 행마다 컬럼 집합이 다릅니다(id=${r.id}). 컬럼별로 나눠 호출하세요.`);
    }
  }

  // 타입 캐스팅은 **추측하지 않고 스키마에서 읽는다.**
  //   FROM (VALUES ...) 안의 파라미터는 대상 컬럼 타입 문맥이 없어서 Postgres가 전부 text로 추론한다
  //   ("column synth_count is of type integer but expression is of type text"). 컬럼마다 실제 타입을
  //   명시 캐스팅해야 한다. 목록을 손으로 관리하면 컬럼이 늘 때 조용히 깨지므로 pg_attribute를 쓴다.
  const types = await columnTypes();
  const typeOf = (c: string): string => {
    const t = types.get(c);
    if (!t) throw new Error(`bulkUpdateDerived: cafes.${c} 의 타입을 찾을 수 없습니다`);
    return `::${t}`;
  };

  const CH = chunkSize(cols.length);
  let updated = 0, chunks = 0;

  for (let i = 0; i < rows.length; i += CH) {
    const part = rows.slice(i, i + CH);
    const params: unknown[] = [];
    const values = part.map((r, j) => {
      const b = j * (cols.length + 1);
      params.push(r.id, ...cols.map((c) => encodeFor(types.get(c)!, r[c])));
      const cells = cols.map((c, k) => `$${b + 2 + k}${typeOf(c)}`);
      return `($${b + 1}::bigint, ${cells.join(", ")})`;
    });
    const setList = cols.map((c) => `${c} = v.${c}`).join(", ");
    // ② UPDATE ... FROM — 매칭되는 id 가 없으면 아무 일도 안 일어난다(INSERT 불가).
    // RETURNING 으로 **실제 갱신된 행 수**를 받는다. 드라이버의 rowCount 는 이 경로에서 비어 있어서,
    //   보낸 행 수로 대신 세면 "없는 카페 1건 시도 → 1건 갱신"처럼 거짓 보고가 된다.
    //   로컬 사본이 낡아 사라진 카페를 가리키는 상황을 그 거짓 숫자가 가려버린다.
    const text = `UPDATE cafes c SET ${setList}
      FROM (VALUES ${values.join(", ")}) AS v(id, ${cols.join(", ")})
      WHERE c.id = v.id
      RETURNING c.id`;
    chunks++;
    if (opts?.dryRun) continue;
    const res = (await sql.query(text, params as never[])) as unknown[];
    updated += Array.isArray(res) ? res.length : 0;
  }

  return { attempted: rows.length, updated, chunks, dryRun: !!opts?.dryRun };
}
