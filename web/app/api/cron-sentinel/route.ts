import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { healAreaLabel, healOutOfBox } from "@/lib/synthStore";
import { recordRun } from "@/lib/agentLog";

export const runtime = "nodejs";
export const maxDuration = 300;

// 🛡️ 데이터 정합성 센티넬 — 신뢰/해자 파수꾼. "사장님이 버그를 발견하기 전에 내가 먼저"(선제 탐지).
//   백로그를 치우는 게 아니라, 깨끗한 상태를 '유지'하고 새 오염이 들어오면 즉시 경보한다.
//   ① 모든 정합성 축을 매일 스캔 ② 안전한 것만 자동 치유(area·박스밖·명백 중복) ③ 나머진 리포트(관제탑).
//   파괴적 자동조치는 '명백한 것'만(보수). 애매하면 보고만.

const authed = (req: NextRequest) => {
  const s = process.env.CRON_SECRET;
  return (!!s && req.headers.get("authorization") === `Bearer ${s}`) || !s;
};

// 명백 중복 = 정규화 이름 동일 + 좌표 ~55m 이내(같은 자리 같은 이름 = 같은 카페). 더 풍부한(후기 많은) 쪽만 남김.
const normName = (s: string) => (s || "").replace(/\s/g, "").replace(/(\d+호?점|본점|지점)$/, "").toLowerCase();
async function healExactDuplicates(): Promise<{ resolved: number; pairs: string[] }> {
  const rows = (await sql`SELECT id, name, lat, lng, COALESCE(synth_count,0) sc FROM cafes WHERE published AND lat IS NOT NULL`) as any[];
  const grp: Record<string, any[]> = {};
  for (const r of rows) {
    const k = normName(r.name) + "@" + Math.round(r.lat * 2000) + "_" + Math.round(r.lng * 2000);
    (grp[k] = grp[k] || []).push(r);
  }
  const pairs: string[] = [];
  let resolved = 0;
  for (const g of Object.values(grp)) {
    if (g.length < 2) continue;
    g.sort((a, b) => b.sc - a.sc || a.id - b.id); // 후기 많은 → 남김
    const keep = g[0];
    for (const loser of g.slice(1)) {
      await sql`UPDATE cafes SET published = false, pipeline_status = 'excluded', updated_at = now() WHERE id = ${loser.id}`.catch(() => {});
      resolved++;
      if (pairs.length < 6) pairs.push(`${loser.name} → ${keep.name}(유지)`);
    }
  }
  return { resolved, pairs };
}

export async function GET(req: NextRequest) {
  try {
    if (!authed(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    await ensureSchema();
    await sql`CREATE TABLE IF NOT EXISTS sentinel_reports (id SERIAL PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT now(), clean BOOLEAN, report JSONB)`.catch(() => {});

    // ── ① 자동 치유(안전·결정론·멱등) ──
    const area = await healAreaLabel().catch(() => ({ fixed: 0, names: [] as string[] }));
    const box = await healOutOfBox().catch(() => ({ excluded: 0, names: [] as string[] }));
    const dup = await healExactDuplicates().catch(() => ({ resolved: 0, pairs: [] as string[] }));

    // ── ② 치유 후 잔여 정합성 스캔(전 축) ──
    const one = async (p: Promise<any[]>) => Number((await p)[0]?.c ?? 0);
    const checks = {
      area_mismatch_seoul: await one(sql`SELECT count(*) c FROM cafes WHERE published AND area LIKE '%구' AND area NOT LIKE '인천%' AND address LIKE '서울%' AND position(area in address)=0`),
      area_mismatch_gg: await one(sql`SELECT count(*) c FROM cafes WHERE published AND area LIKE '%시' AND address LIKE '경기%' AND position(replace(area,'시','') in address)=0`),
      out_of_box: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat<36.8 OR lat>38.3 OR lng<124.5 OR lng>127.9)`),
      non_capital_addr: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (address LIKE '충청%' OR address LIKE '강원%' OR address LIKE '전라%' OR address LIKE '경상%' OR address LIKE '대전%' OR address LIKE '부산%' OR address LIKE '대구%' OR address LIKE '울산%' OR address LIKE '광주광역시%' OR address LIKE '세종%' OR address LIKE '제주%')`),
      missing_synth: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (synth_count IS NULL OR synth_count=0)`),
      missing_char: await one(sql`SELECT count(*) c FROM cafes WHERE published AND char_scores IS NULL`),
      missing_coord: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat IS NULL OR lng IS NULL OR lat=0 OR lng=0)`),
      missing_address: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (address IS NULL OR address='')`),
      bad_grade: await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_grade IS NOT NULL AND synth_grade NOT IN ('검증','참고','후보')`),
      // 🆕 이름일치율 사각(구구커피류): 노출 후기가 '실제 그 카페'를 거의 안 말함(<0.3). offctx로는 안 보이는 오염
      //   (남의 카페 후기도 '카페 맥락어'는 있으니까). cleanCafeName 게이트 배포 후 재합성분은 정확. 경보만(재등급은 결재).
      name_pollution: await one(sql`SELECT count(*) c FROM cafes WHERE published AND synth_coherence IS NOT NULL AND synth_coherence < 0.3 AND COALESCE(offctx_ok,false)=false`),
    };
    const residual = Object.values(checks).reduce((s, n) => s + n, 0);
    const healedTotal = area.fixed + box.excluded + dup.resolved;
    const clean = residual === 0;

    // ── ③ 리포트 ──
    const flags = Object.entries(checks).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`);
    await sql`INSERT INTO sentinel_reports (clean, report) VALUES (${clean}, ${JSON.stringify({ checks, healed: { area: area.fixed, box: box.excluded, dup: dup.resolved } })}::jsonb)`.catch(() => {});

    const detail = `치유 ${healedTotal}(area${area.fixed}·박스${box.excluded}·중복${dup.resolved}) · ${clean ? "정합성 OK ✅" : "⚠️ 잔여 " + flags.join(" ")}`;
    await recordRun("cron-sentinel", true, detail, healedTotal);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), clean, healed: { area: area.fixed, areaNames: area.names, box: box.excluded, dup: dup.resolved, dupPairs: dup.pairs }, checks, flags });
  } catch (e) {
    await recordRun("cron-sentinel", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
