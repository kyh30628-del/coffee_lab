// 규칙갭 자가학습 — reviewQuality/discover가 런타임에 '학습된 사전'을 하드코딩 사전과 합쳐 읽는다.
// 의사결정 틀: 결정론 탐지(토큰0) → 자동적용은 '사전(리스트)'만, '로직'은 승인. 모든 적용은 DB에 로그·즉시 롤백 가능.
//   reviewQuality는 동기 함수라 DB를 매번 못 읽음 → 모듈 캐시. 합성 진입점(synthAndStore 등)이 합성 전
//   loadLearnedTerms()로 캐시를 갱신(TTL 60s)하고, 규칙은 getLearned()로 동기 조회한다.
import { sql } from "./db";

export type LearnedKind = "nonbranch" | "district" | "generic" | "franchise";
const KINDS: LearnedKind[] = ["nonbranch", "district", "generic", "franchise"];

let CACHE: Record<LearnedKind, Set<string>> = { nonbranch: new Set(), district: new Set(), generic: new Set(), franchise: new Set() };
let loadedAt = 0;
let ensured = false;

export async function ensureLearnedTable(): Promise<void> {
  if (ensured) return;
  await sql`CREATE TABLE IF NOT EXISTS learned_terms (
    term TEXT NOT NULL,
    kind TEXT NOT NULL,
    evidence_count INT DEFAULT 0,
    sample_cafes JSONB,
    status TEXT DEFAULT 'active',        -- active | pending(승인대기) | rolled_back
    source TEXT DEFAULT 'auto',          -- auto | manual
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    applied_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (term, kind)
  )`;
  ensured = true;
}

// 합성 진입점에서 호출. TTL 내면 재조회 생략(핫패스 비용 0).
export async function loadLearnedTerms(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 60_000 && loadedAt > 0) return;
  try {
    await ensureLearnedTable();
    const rows = (await sql`SELECT term, kind FROM learned_terms WHERE status='active'`) as { term: string; kind: string }[];
    const next: Record<LearnedKind, Set<string>> = { nonbranch: new Set(), district: new Set(), generic: new Set(), franchise: new Set() };
    for (const r of rows) if ((KINDS as string[]).includes(r.kind)) next[r.kind as LearnedKind].add(r.term);
    CACHE = next;
    loadedAt = Date.now();
  } catch { /* 테이블 없거나 DB 오류 → 하드코딩 사전만으로 동작(안전 폴백) */ }
}

// 규칙(동기)에서 조회.
export function getLearned(kind: LearnedKind): Set<string> { return CACHE[kind]; }
export function hasLearned(kind: LearnedKind, term: string): boolean { return CACHE[kind].has(term); }

// 학습 적용/철회(에이전트·관리자가 사용).
export async function applyLearned(kind: LearnedKind, term: string, opts?: { evidence?: number; samples?: number[]; status?: string; source?: string; note?: string }): Promise<void> {
  await ensureLearnedTable();
  await sql`INSERT INTO learned_terms (term, kind, evidence_count, sample_cafes, status, source, note, applied_at)
    VALUES (${term}, ${kind}, ${opts?.evidence ?? 0}, ${JSON.stringify(opts?.samples ?? [])}::jsonb, ${opts?.status ?? "active"}, ${opts?.source ?? "auto"}, ${opts?.note ?? null}, now())
    ON CONFLICT (term, kind) DO UPDATE SET evidence_count=EXCLUDED.evidence_count, sample_cafes=EXCLUDED.sample_cafes, status=EXCLUDED.status, applied_at=now()`;
  await loadLearnedTerms(true);
}

export async function rollbackLearned(kind: LearnedKind, term: string, note?: string): Promise<void> {
  await ensureLearnedTable();
  await sql`UPDATE learned_terms SET status='rolled_back', note=${note ?? null} WHERE term=${term} AND kind=${kind}`;
  await loadLearnedTerms(true);
}
