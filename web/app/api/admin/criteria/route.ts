import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { META, DEFAULTS, ensureCriteriaTable, getCriteria, setCriterion, revertCriterion, inRange } from "@/lib/criteria";
export const runtime = "nodejs";

// 🎛️ 기준 관제 — 흩어진 하드코딩 임계값의 단일출처(criteria) 조회·수정·되돌리기 + 영향 미리보기.
//   ⚠️ 이 API는 '기준값'만 저장한다. 실제 카페 공개상태는 바꾸지 않는다(반영은 합성/재판정 파이프라인).
//   대량비공개 방지: geo.box·grade.floor 변경이 공개카페 다수를 흔들면 명시적 재확인(confirm) 없이는 저장 거부.
const authed = (req: NextRequest) =>
  !!req.headers.get("x-admin-password") && req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;

const BLAST_THRESHOLD = 20; // 재합성 시 공개상태가 바뀔 수 있는 카페 수 상한 — 초과 시 재확인 게이트(인천삭제사고 교훈)

// ⚖️ DoA(위임전결) 티어 — 기준 변경 위험도별 승인규칙(ORG-CHARTER 위임전결 준수).
//   L3(대량영향): grade.floor·geo.box → 공개상태를 흔들 수 있어 CEO 확인 게이트(대량변동 시 아래 409 차단기와 연결).
//   L2(소영향): search.grade_bonus·exposure → 랭킹/노출만 영향(공개 무변) → 기조실장 전결·바로 적용.
//   ⚠️ 티어는 '확인 게이트 + 문서'로만 구현. 기준변경→결재row 자동생성 등 lib/issues.ts 자동경로는 절대 만들지 않는다.
const tierOf = (key: string): "L3" | "L2" =>
  key.startsWith("grade.floor.") || key.startsWith("geo.box.") ? "L3" : "L2";

// 제안값 기준 영향 시뮬레이션(읽기전용). key 하나만 바뀐다고 보고, 나머지는 현재 기준값.
async function previewImpact(key: string, value: number): Promise<{
  kind: string; wouldUnpublish: number; changed: number; note: string; samples: string[];
}> {
  const cur = await getCriteria();
  const box = { ...cur };
  box[key] = value;

  if (key.startsWith("geo.box.")) {
    // 새 좌표박스 밖으로 나가는 '현재 공개' 카페 = 재합성 시 비공개될 후보(대량비공개 위험 지표)
    const latMin = box["geo.box.lat_min"], latMax = box["geo.box.lat_max"], lngMin = box["geo.box.lng_min"], lngMax = box["geo.box.lng_max"];
    const [row] = (await sql`SELECT count(*)::int c FROM cafes
      WHERE published AND (lat IS NULL OR lng IS NULL OR NOT (lat BETWEEN ${latMin} AND ${latMax} AND lng BETWEEN ${lngMin} AND ${lngMax}))`) as { c: number }[];
    const samp = (await sql`SELECT name FROM cafes
      WHERE published AND (lat IS NULL OR lng IS NULL OR NOT (lat BETWEEN ${latMin} AND ${latMax} AND lng BETWEEN ${lngMin} AND ${lngMax}))
      LIMIT 8`) as { name: string }[];
    const n = row?.c ?? 0;
    return { kind: "geo", wouldUnpublish: n, changed: n, note: `새 좌표박스 밖 공개 카페 ${n}곳 — 재합성 시 비공개 후보`, samples: samp.map((s) => s.name) };
  }

  if (key.startsWith("grade.floor.")) {
    const V = box["grade.floor.verified"], R = box["grade.floor.reference"];
    // 등급은 synth_count(검증리뷰 수 근사)로 판정: c>=V→검증, c>=R→참고, else 후보.
    //   현재 published & 참고/검증인데 새 R 미만 → 재합성 시 후보로 떨어져 비공개 후보(대량비공개 위험).
    const [drop] = (await sql`SELECT count(*)::int c FROM cafes
      WHERE published AND synth_grade IN ('검증','참고') AND COALESCE(synth_count,0) < ${R}`) as { c: number }[];
    // 등급 밴드 자체가 바뀌는 카페 수(배지·랭킹 영향, 비공개와 무관)
    const [shift] = (await sql`SELECT count(*)::int c FROM cafes WHERE synth_grade IS NOT NULL AND
      CASE WHEN COALESCE(synth_count,0) >= ${V} THEN '검증' WHEN COALESCE(synth_count,0) >= ${R} THEN '참고' ELSE '후보' END <> synth_grade`) as { c: number }[];
    const samp = (await sql`SELECT name FROM cafes
      WHERE published AND synth_grade IN ('검증','참고') AND COALESCE(synth_count,0) < ${R} LIMIT 8`) as { name: string }[];
    const wu = drop?.c ?? 0;
    return { kind: "grade", wouldUnpublish: wu, changed: shift?.c ?? 0, note: `참고↑ 미만으로 등급강등되어 비공개될 공개카페 ${wu}곳 · 등급 밴드 변동 ${shift?.c ?? 0}곳(추정: synth_count 기준)`, samples: samp.map((s) => s.name) };
  }

  return { kind: "rank", wouldUnpublish: 0, changed: 0, note: "랭킹/노출에만 영향(공개상태 무변) — 미리보기 생략", samples: [] };
}

export async function GET(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  await ensureCriteriaTable();
  const rows = (await sql`SELECT key, category, label, value, default_value, min_value, max_value, unit, updated_by, updated_at FROM criteria`) as any[];
  const byKey = new Map(rows.map((r) => [r.key, r]));
  // META 순서대로(누락 행은 시드값으로 채움 — 방금 ensure로 시드됐지만 방어적).
  const items = META.map((m) => {
    const r = byKey.get(m.key);
    return {
      key: m.key, category: m.category, label: m.label, unit: m.unit,
      value: r ? Number(r.value) : m.def,
      default_value: r ? Number(r.default_value) : m.def,
      min_value: r ? Number(r.min_value) : m.min,
      max_value: r ? Number(r.max_value) : m.max,
      updated_by: r?.updated_by ?? null,
      updated_at: r?.updated_at ?? null,
      isDefault: (r ? Number(r.value) : m.def) === m.def,
      tier: tierOf(m.key), // ⚖️ L3(CEO 확인)·L2(기조실장 전결)
    };
  });
  const history = (await sql`SELECT id, key, old_value, new_value, changed_by, changed_at, impact_note FROM criteria_history ORDER BY changed_at DESC LIMIT 30`) as any[];
  // 카테고리 그룹핑(META 순서 유지)
  const categories: string[] = [];
  for (const m of META) if (!categories.includes(m.category)) categories.push(m.category);
  return NextResponse.json({ ok: true, categories, items, history, blastThreshold: BLAST_THRESHOLD });
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const action = body?.action ?? "set";
  const key = String(body?.key ?? "");
  const by = "CEO(관제)";

  if (!(key in DEFAULTS)) return NextResponse.json({ ok: false, error: "알 수 없는 기준" }, { status: 400 });

  try {
    if (action === "revert") {
      await revertCriterion(key, by);
      return NextResponse.json({ ok: true, reverted: key });
    }

    const value = Number(body?.value);
    if (!Number.isFinite(value)) return NextResponse.json({ ok: false, error: "값이 숫자가 아님" }, { status: 400 });
    if (!inRange(key, value)) return NextResponse.json({ ok: false, error: "허용 범위를 벗어남" }, { status: 400 });

    // 미리보기만(저장 안 함)
    if (action === "preview") {
      const impact = await previewImpact(key, value);
      return NextResponse.json({ ok: true, preview: impact, needConfirm: impact.wouldUnpublish > BLAST_THRESHOLD });
    }

    // 저장 — grade.floor/geo.box는 서버에서 영향 재계산 후 대량변동이면 confirm 없이는 거부(차단기).
    if (key.startsWith("grade.floor.") || key.startsWith("geo.box.")) {
      const impact = await previewImpact(key, value);
      if (impact.wouldUnpublish > BLAST_THRESHOLD && !body?.confirm) {
        return NextResponse.json({ ok: false, needConfirm: true, preview: impact,
          error: `공개카페 ${impact.wouldUnpublish}곳이 흔들릴 수 있어(상한 ${BLAST_THRESHOLD}) 재확인이 필요합니다` }, { status: 409 });
      }
      await setCriterion(key, value, by, impact.note);
      return NextResponse.json({ ok: true, saved: key, value, preview: impact });
    }

    await setCriterion(key, value, by);
    return NextResponse.json({ ok: true, saved: key, value });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 400 });
  }
}
