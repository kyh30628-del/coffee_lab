import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  ensureCriteriaListsTable, getAllLists, isListKey,
  addListItem, removeListItem, revertListItem, revertListKey,
} from "@/lib/criteriaLists";
export const runtime = "nodejs";

// 📚 리스트 사전 관제 — 소비자 출력을 형성하는 하드코딩 키워드 사전(성향축·맛·용도·검색개념·오염리스트 등)을 무배포로 편집.
//   하드코딩 BASE=폴백 진실원본, DB=오버라이드(추가/제거/되돌리기). 항목 편집일 뿐 카페 공개상태는 직접 바꾸지 않는다.
//   ⚖️ DoA: 리스트 편집은 소비자 영향 있으나 대량 공개변동 직접유발 아님 → L2(기조실장) 전결. 소유=품질본부.
//   ⚠️ lib/issues.ts 동결영역 미접촉 — 편집→결재/이슈 자동생성 없음. 변경이력은 criteria_list_history에만 적재.
const authed = (req: NextRequest) =>
  !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureCriteriaListsTable();
  const lists = await getAllLists();
  const categories: string[] = [];
  for (const l of lists) if (!categories.includes(l.category)) categories.push(l.category);
  const history = (await sql`SELECT id, key, item, action, actor, note, at FROM criteria_list_history ORDER BY at DESC LIMIT 40`) as any[];
  return NextResponse.json({ ok: true, categories, lists, history });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const key = String(body?.key ?? "");
  const item = String(body?.item ?? "");
  const by = "기조실장(L2 전결)";

  if (!isListKey(key)) return NextResponse.json({ ok: false, error: "알 수 없는 사전" }, { status: 400 });

  try {
    if (action === "add") { await addListItem(key, item, by, body?.note); return NextResponse.json({ ok: true, added: item }); }
    if (action === "remove") { await removeListItem(key, item, by, body?.note); return NextResponse.json({ ok: true, removed: item }); }
    if (action === "revert") { await revertListItem(key, item, by); return NextResponse.json({ ok: true, reverted: item }); }
    if (action === "revert_all") { await revertListKey(key, by); return NextResponse.json({ ok: true, revertedAll: key }); }
    return NextResponse.json({ ok: false, error: "알 수 없는 동작" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
