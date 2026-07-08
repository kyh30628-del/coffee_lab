// 비즈니스 기준(숫자 임계값) 단일출처 — DB 테이블 `criteria`가 진실, 코드 DEFAULTS는 폴백 진실원본.
//   learnedTerms.ts 선례를 따른다: 동기 소비처(synthEngine.synthesize·search.gradeBonus 등)는 매번 DB를
//   못 읽으므로 모듈 캐시(TTL 60s)를 쓴다. 합성/검색/발굴 진입점이 loadCriteria()로 캐시를 갱신하고,
//   규칙은 getCriterionSync()로 동기 조회한다. DB 죽어도·행 없어도·범위벗어나도 반드시 DEFAULTS로 안전폴백.
import { sql } from "./db";

export type CriterionMeta = {
  key: string;
  category: string;
  label: string;
  def: number; // 현재값 = 기본값 = 시드값 (서비스 무변)
  min: number;
  max: number;
  unit: string;
};

// ⚠️ 이 9개 def 값은 소비처 하드코딩과 100% 동일해야 한다(서비스 출력 무변). 시드/폴백 모두 이 값.
export const META: CriterionMeta[] = [
  // 등급 바닥
  { key: "grade.floor.verified", category: "등급", label: "검증 등급 최소 검증리뷰 수(광고 제외)", def: 30, min: 5, max: 100, unit: "건" },
  { key: "grade.floor.reference", category: "등급", label: "참고 등급 최소 검증리뷰 수(광고 제외)", def: 3, min: 1, max: 50, unit: "건" },
  // 수도권 좌표 박스 (현재값 ±2)
  { key: "geo.box.lat_min", category: "지리", label: "수도권 좌표 박스 최소 위도(이하 비수도권 제외)", def: 36.8, min: 34.8, max: 38.8, unit: "°" },
  { key: "geo.box.lat_max", category: "지리", label: "수도권 좌표 박스 최대 위도(이상 비수도권 제외)", def: 38.3, min: 36.3, max: 40.3, unit: "°" },
  { key: "geo.box.lng_min", category: "지리", label: "수도권 좌표 박스 최소 경도(이하 비수도권 제외)", def: 124.5, min: 122.5, max: 126.5, unit: "°" },
  { key: "geo.box.lng_max", category: "지리", label: "수도권 좌표 박스 최대 경도(이상 비수도권 제외)", def: 127.9, min: 125.9, max: 129.9, unit: "°" },
  // 검색 등급 가산점
  { key: "search.grade_bonus.verified", category: "검색", label: "검색 랭킹 등급 가산점(검증)", def: 25, min: 0, max: 100, unit: "점" },
  { key: "search.grade_bonus.reference", category: "검색", label: "검색 랭킹 등급 가산점(참고)", def: 8, min: 0, max: 100, unit: "점" },
  // 노출 상한
  { key: "exposure.featured_cap", category: "노출", label: "우선노출(featured) 동시 노출 상한", def: 6, min: 1, max: 50, unit: "개" },
];

const BY_KEY: Record<string, CriterionMeta> = Object.fromEntries(META.map((m) => [m.key, m]));
export const DEFAULTS: Record<string, number> = Object.fromEntries(META.map((m) => [m.key, m.def]));

// 범위검증 — 통과하면 v, 아니면 null(호출부가 DEFAULTS로 폴백).
export function inRange(key: string, v: number): boolean {
  const m = BY_KEY[key];
  if (!m) return false;
  return typeof v === "number" && Number.isFinite(v) && v >= m.min && v <= m.max;
}

let CACHE: Record<string, number> = { ...DEFAULTS };
let loadedAt = 0;
let ensured = false;

export async function ensureCriteriaTable(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS criteria (
    key TEXT PRIMARY KEY,
    category TEXT,
    label TEXT,
    value DOUBLE PRECISION NOT NULL,
    default_value DOUBLE PRECISION NOT NULL,
    min_value DOUBLE PRECISION,
    max_value DOUBLE PRECISION,
    unit TEXT,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS criteria_history (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    old_value DOUBLE PRECISION,
    new_value DOUBLE PRECISION,
    changed_by TEXT,
    changed_at TIMESTAMPTZ DEFAULT now(),
    impact_note TEXT
  )`;
  // 시드 — 현재값=value=default_value로 삽입(멱등). 이미 있으면 손대지 않음(운영자 조정값 보존).
  for (const m of META) {
    await sql`INSERT INTO criteria (key, category, label, value, default_value, min_value, max_value, unit)
      VALUES (${m.key}, ${m.category}, ${m.label}, ${m.def}, ${m.def}, ${m.min}, ${m.max}, ${m.unit})
      ON CONFLICT (key) DO NOTHING`;
  }
  ensured = true;
}

// 합성/검색/발굴 진입점에서 호출. TTL 내면 재조회 생략(핫패스 비용 0). 실패해도 DEFAULTS 유지(안전).
export async function loadCriteria(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 60_000 && loadedAt > 0) return;
  try {
    await ensureCriteriaTable();
    const rows = (await sql`SELECT key, value FROM criteria`) as { key: string; value: number }[];
    const next: Record<string, number> = { ...DEFAULTS };
    for (const r of rows) {
      const v = Number(r.value);
      // DB값이 범위 안일 때만 채택 — 범위 밖(운영 실수·마이그레이션 드리프트)은 DEFAULTS 유지.
      if (r.key in DEFAULTS && inRange(r.key, v)) next[r.key] = v;
    }
    CACHE = next;
    loadedAt = Date.now();
  } catch {
    /* 테이블 없거나 DB 오류 → DEFAULTS(현재값)로 동작. 서비스 절대 안 깨짐. */
  }
}

// 규칙(동기)에서 조회 — 캐시값이 범위 안이면 반환, 아니면 DEFAULTS. 캐시 미프라임이어도 DEFAULTS로 안전.
export function getCriterionSync(key: string): number {
  const v = CACHE[key];
  if (typeof v === "number" && inRange(key, v)) return v;
  return DEFAULTS[key];
}

// 비동기 소비처용 — 캐시 갱신 후 동기 조회.
export async function getCriterion(key: string): Promise<number> {
  await loadCriteria();
  return getCriterionSync(key);
}

// 전체 병합값(캐시 갱신 후).
export async function getCriteria(): Promise<Record<string, number>> {
  await loadCriteria();
  const out: Record<string, number> = {};
  for (const k of Object.keys(DEFAULTS)) out[k] = getCriterionSync(k);
  return out;
}

// 값 수정 — 범위검증 통과 시 UPDATE + history 적재 + 캐시무효화. 범위 밖이면 거부(throw).
export async function setCriterion(key: string, value: number, by: string, impactNote?: string): Promise<void> {
  const m = BY_KEY[key];
  if (!m) throw new Error(`알 수 없는 기준: ${key}`);
  if (!inRange(key, value)) throw new Error(`범위 초과(${m.min}~${m.max}): ${value}`);
  await ensureCriteriaTable();
  const [cur] = (await sql`SELECT value FROM criteria WHERE key=${key}`) as { value: number }[];
  const old = cur ? Number(cur.value) : m.def;
  await sql`UPDATE criteria SET value=${value}, updated_by=${by}, updated_at=now() WHERE key=${key}`;
  await sql`INSERT INTO criteria_history (key, old_value, new_value, changed_by, impact_note)
    VALUES (${key}, ${old}, ${value}, ${by}, ${impactNote ?? null})`;
  await loadCriteria(true);
}

// 기본값으로 되돌림 + history.
export async function revertCriterion(key: string, by: string): Promise<void> {
  const m = BY_KEY[key];
  if (!m) throw new Error(`알 수 없는 기준: ${key}`);
  await ensureCriteriaTable();
  const [cur] = (await sql`SELECT value, default_value FROM criteria WHERE key=${key}`) as { value: number; default_value: number }[];
  const old = cur ? Number(cur.value) : m.def;
  const def = cur ? Number(cur.default_value) : m.def;
  await sql`UPDATE criteria SET value=default_value, updated_by=${by}, updated_at=now() WHERE key=${key}`;
  await sql`INSERT INTO criteria_history (key, old_value, new_value, changed_by, impact_note)
    VALUES (${key}, ${old}, ${def}, ${by}, ${"기본값 복원"})`;
  await loadCriteria(true);
}
