// 키워드/리스트 사전 — 서버전용 DB 오퍼레이션 계층(오버레이 조회·편집·이력). ⚠️ 이 파일은 db(neon)를 import한다.
//   클라이언트 안전 코어(BASE 정의·동기 getter·캐시)는 lib/criteriaListsBase.ts에 분리했다.
//   'use client' 홈(page → cafeProfile → charScore)은 base만 import → db가 클라 번들에 절대 실리지 않는다(사고 재발 차단).
//   서버 진입점(합성/검색/발굴/어드민)만 이 파일의 async 함수를 호출한다. 동기 getter는 base로 재수출(server 소비처 무변경).
//   ⚠️ lib/issues.ts 동결영역 미접촉 — 편집→결재/이슈 자동생성 없음. 변경이력은 criteria_list_history에만 적재.
import { sql } from "./db";
import {
  LIST_META, BASE_BY_KEY, effective, isListKey, applyCache,
  listKeys, getListSync, getListSetSync,
} from "./criteriaListsBase";

// 동기 API·정의는 base 단일출처를 그대로 재수출 — 기존 서버 소비처(import ... from "./criteriaLists")는 무변경.
export type { ListMeta } from "./criteriaListsBase";
export { LIST_META, BASE_BY_KEY, listKeys, isListKey, effective, getListSync, getListSetSync };

let loadedAt = 0;
let ensured = false;

export async function ensureCriteriaListsTable(): Promise<void> {
  if (ensured) return;
  // 오버레이 1행 = (key, item)당 하나의 오버라이드. op=add(항목추가) | remove(항목숨김). status=active | reverted.
  await sql`CREATE TABLE IF NOT EXISTS criteria_lists (
    key TEXT NOT NULL,
    item TEXT NOT NULL,
    op TEXT NOT NULL DEFAULT 'add',
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT DEFAULT 'manual',
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (key, item)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS criteria_list_history (
    id BIGSERIAL PRIMARY KEY,
    key TEXT NOT NULL,
    item TEXT,
    action TEXT NOT NULL,
    actor TEXT,
    note TEXT,
    at TIMESTAMPTZ DEFAULT now()
  )`;
  ensured = true;
}

// 합성/검색/발굴 진입점에서 호출. TTL 내면 재조회 생략(핫패스 비용 0). 실패해도 BASE 유지(안전폴백).
export async function loadCriteriaLists(force = false): Promise<void> {
  if (!force && Date.now() - loadedAt < 60_000 && loadedAt > 0) return;
  try {
    await ensureCriteriaListsTable();
    const rows = (await sql`SELECT key, item, op FROM criteria_lists WHERE status='active'`) as { key: string; item: string; op: string }[];
    const byKey = new Map<string, Map<string, "add" | "remove">>();
    for (const r of rows) {
      if (!isListKey(r.key)) continue; // 미등록 키 무시(드리프트 방어)
      if (r.op !== "add" && r.op !== "remove") continue;
      let m = byKey.get(r.key);
      if (!m) { m = new Map(); byKey.set(r.key, m); }
      m.set(r.item, r.op);
    }
    const nextArr: Record<string, string[]> = {};
    const nextSet: Record<string, Set<string>> = {};
    for (const k of Object.keys(BASE_BY_KEY)) {
      const arr = effective(k, byKey.get(k));
      nextArr[k] = arr;
      nextSet[k] = new Set(arr);
    }
    applyCache(nextArr, nextSet);
    loadedAt = Date.now();
  } catch {
    /* 테이블 없거나 DB 오류 → BASE(현재값)로 동작. 서비스 절대 안 깨짐. */
  }
}

// 비동기 소비처/어드민용 — 캐시 갱신 후 조회.
export async function getList(key: string): Promise<string[]> {
  await loadCriteriaLists();
  return getListSync(key);
}

// 어드민 전체 조회 — 각 사전의 BASE·오버라이드·유효리스트를 함께 반환.
export type ListView = {
  key: string; category: string; label: string; consumer: string;
  base: string[]; effective: string[];
  added: string[]; removed: string[]; // 오버라이드로 추가된/숨겨진 항목
  isDefault: boolean;
};
export async function getAllLists(): Promise<ListView[]> {
  await ensureCriteriaListsTable();
  const rows = (await sql`SELECT key, item, op FROM criteria_lists WHERE status='active'`) as { key: string; item: string; op: string }[];
  const ovByKey = new Map<string, Map<string, "add" | "remove">>();
  for (const r of rows) {
    if (!isListKey(r.key) || (r.op !== "add" && r.op !== "remove")) continue;
    let m = ovByKey.get(r.key); if (!m) { m = new Map(); ovByKey.set(r.key, m); }
    m.set(r.item, r.op);
  }
  return LIST_META.map((meta) => {
    const ov = ovByKey.get(meta.key);
    const eff = effective(meta.key, ov);
    const added: string[] = []; const removed: string[] = [];
    if (ov) for (const [item, op] of ov) { if (op === "add") added.push(item); else removed.push(item); }
    return { key: meta.key, category: meta.category, label: meta.label, consumer: meta.consumer,
      base: meta.items.slice(), effective: eff, added, removed, isDefault: added.length === 0 && removed.length === 0 };
  });
}

function validItem(raw: string): string {
  const item = String(raw ?? "").trim();
  if (!item) throw new Error("빈 항목은 추가할 수 없습니다");
  if (item.length > 40) throw new Error("항목이 너무 깁니다(최대 40자)");
  return item;
}
async function logHist(key: string, item: string | null, action: string, actor: string, note?: string) {
  await sql`INSERT INTO criteria_list_history (key, item, action, actor, note) VALUES (${key}, ${item}, ${action}, ${actor}, ${note ?? null})`;
}

// 항목 추가 — 유효리스트에 item이 반드시 들어오게: remove 오버라이드가 있으면 해제, BASE에 없으면 add 오버라이드 삽입.
export async function addListItem(key: string, rawItem: string, by: string, note?: string): Promise<void> {
  if (!isListKey(key)) throw new Error(`알 수 없는 사전: ${key}`);
  const item = validItem(rawItem);
  await ensureCriteriaListsTable();
  const inBase = (BASE_BY_KEY[key] ?? []).includes(item);
  if (inBase) {
    // BASE에 이미 있음 → 혹시 걸려있던 remove 오버라이드만 해제(있으면).
    await sql`DELETE FROM criteria_lists WHERE key=${key} AND item=${item} AND op='remove'`;
  } else {
    await sql`INSERT INTO criteria_lists (key, item, op, status, source, note, updated_at)
      VALUES (${key}, ${item}, 'add', 'active', 'manual', ${note ?? null}, now())
      ON CONFLICT (key, item) DO UPDATE SET op='add', status='active', note=${note ?? null}, updated_at=now()`;
  }
  await logHist(key, item, "add", by, note);
  await loadCriteriaLists(true);
}

// 항목 제거 — 유효리스트에서 item이 빠지게: BASE 항목이면 remove 오버라이드 삽입, add 오버라이드였으면 그 행 삭제.
export async function removeListItem(key: string, rawItem: string, by: string, note?: string): Promise<void> {
  if (!isListKey(key)) throw new Error(`알 수 없는 사전: ${key}`);
  const item = validItem(rawItem);
  await ensureCriteriaListsTable();
  const inBase = (BASE_BY_KEY[key] ?? []).includes(item);
  if (inBase) {
    await sql`INSERT INTO criteria_lists (key, item, op, status, source, note, updated_at)
      VALUES (${key}, ${item}, 'remove', 'active', 'manual', ${note ?? null}, now())
      ON CONFLICT (key, item) DO UPDATE SET op='remove', status='active', note=${note ?? null}, updated_at=now()`;
  } else {
    // BASE에 없는데 제거 요청 = 추가 오버라이드를 되돌리는 것 → 그 행 삭제.
    await sql`DELETE FROM criteria_lists WHERE key=${key} AND item=${item}`;
  }
  await logHist(key, item, "remove", by, note);
  await loadCriteriaLists(true);
}

// 항목 되돌리기 — 이 (key,item)의 모든 오버라이드 제거(하드코딩 기본 멤버십으로 복원).
export async function revertListItem(key: string, rawItem: string, by: string): Promise<void> {
  if (!isListKey(key)) throw new Error(`알 수 없는 사전: ${key}`);
  const item = validItem(rawItem);
  await ensureCriteriaListsTable();
  await sql`DELETE FROM criteria_lists WHERE key=${key} AND item=${item}`;
  await logHist(key, item, "revert", by);
  await loadCriteriaLists(true);
}

// 사전 통째 기본값 복원 — 이 key의 모든 오버라이드 제거.
export async function revertListKey(key: string, by: string): Promise<void> {
  if (!isListKey(key)) throw new Error(`알 수 없는 사전: ${key}`);
  await ensureCriteriaListsTable();
  await sql`DELETE FROM criteria_lists WHERE key=${key}`;
  await logHist(key, null, "revert_all", by);
  await loadCriteriaLists(true);
}
