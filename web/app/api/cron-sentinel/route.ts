import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { healAreaLabel, healOutOfBox } from "@/lib/synthStore";
import { recordRun } from "@/lib/agentLog";
import { probeConsoleKey } from "@/lib/consoleKeyProbe";
import { loadCriteria, getCriterionSync } from "@/lib/criteria";

export const runtime = "nodejs";
export const maxDuration = 300;

// 🆕 이름-불일치 스캔(coherence 부풀림 사각 전담): 노출후기 다수가 '실제 그 카페명'을 안 담거나(quoteMatchConfidence=0)
//   제목이 먼 광역시(부산·대구…)를 주제로 삼으면 동명 타지역/옆가게 오염 의심. name_pollution(coherence<0.3)이
//   '까페'·'대구 중구' 같은 일반어/구名 충돌로 1.0 부풀 때 못 잡던 케이스(비비·MY FAVORITE·외할머니)를 잡는다.
//   ⚠️ 탐지·경보 전용(자동 비공개 안 함) — 붙임/띄어쓰기 변형 오탐이 있으므로 CEO/기조실장 검토 큐로만.
const FAR_METRO = ["부산", "대구", "대전", "울산", "전주", "창원", "김해", "포항", "목포", "여수", "순천"];
async function scanNameMismatch(): Promise<{ count: number; samples: string[] }> {
  // SQL 프리필터: 먼 광역시 토큰이 노출후기에 든 카페만(전수 대신 후보만 → 300s 내 완료). jsonb 페이로드는
  //   id별 청크로 받아 64MB 회피. 이후 JS로 '제목 주제(앞8자·2회+)+우리지역 아님+이름에 없음' 정밀 확인.
  const rx = FAR_METRO.map((m) => m).join("|");
  const cand = (await sql`SELECT id FROM cafes WHERE published AND synth_reviews IS NOT NULL AND synth_reviews::text ~ ${rx}`) as any[];
  const ids = cand.map((r) => r.id);
  const flagged: { id: number; name: string; area: string; hits: number; shown: number }[] = [];
  for (let i = 0; i < ids.length; i += 40) {
    const batch = ids.slice(i, i + 40);
    const rows = (await sql`SELECT id, name, area, dong, synth_reviews FROM cafes WHERE id = ANY(${batch})`) as any[];
    for (const c of rows) {
      const areaTerms = [c.area, c.dong].filter(Boolean) as string[];
      const revs = c.synth_reviews || [];
      let hits = 0;
      for (const r of revs) {
        const q = (r.quote || "") as string;
        const fm = FAR_METRO.find((m) => q.includes(m));
        if (!fm) continue;
        if (areaTerms.some((a) => a.includes(fm)) || c.name.replace(/\s/g, "").includes(fm)) continue; // 우리 지역/이름이면 정상
        if (/(서울|경기|인천)/.test(q)) continue; // 우리 시도 동반=브랜치/출신 언급 보존
        if (q.indexOf(fm) <= 7 || q.split(fm).length - 1 >= 2) hits++; // 그 지역이 글 주제일 때만
      }
      if (hits > 0) flagged.push({ id: c.id, name: c.name, area: c.area, hits, shown: revs.length });
    }
  }
  flagged.sort((a, b) => b.hits / b.shown - a.hits / a.shown || b.hits - a.hits);
  return { count: flagged.length, samples: flagged.slice(0, 40).map((f) => `#${f.id} ${f.name}[${f.area}] ${f.hits}/${f.shown} 먼광역시`) };
}

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
    await loadCriteria(); // 수도권 좌표박스 기준 캐시 프라임(폴백=36.8~38.3/124.5~127.9)
    const latMin = getCriterionSync("geo.box.lat_min"), latMax = getCriterionSync("geo.box.lat_max");
    const lngMin = getCriterionSync("geo.box.lng_min"), lngMax = getCriterionSync("geo.box.lng_max");
    const one = async (p: Promise<any[]>) => Number((await p)[0]?.c ?? 0);
    const checks = {
      area_mismatch_seoul: await one(sql`SELECT count(*) c FROM cafes WHERE published AND area LIKE '%구' AND area NOT LIKE '인천%' AND address LIKE '서울%' AND position(area in address)=0`),
      area_mismatch_gg: await one(sql`SELECT count(*) c FROM cafes WHERE published AND area LIKE '%시' AND address LIKE '경기%' AND position(replace(area,'시','') in address)=0`),
      out_of_box: await one(sql`SELECT count(*) c FROM cafes WHERE published AND (lat<${latMin} OR lat>${latMax} OR lng<${lngMin} OR lng>${lngMax})`),
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
    // 🆕 이름-불일치/먼광역시 오염 스캔(coherence 사각 전담) — 탐지·경보만(자동 비공개 안 함).
    const mismatch = await scanNameMismatch().catch(() => ({ count: 0, samples: [] as string[] }));
    (checks as any).name_mismatch = mismatch.count;
    // name_mismatch는 '정합성 실패'가 아니라 검토 워치리스트 → clean 판정서 제외(경보 폭주 방지, 별도 표면화).
    const residual = Object.entries(checks).reduce((s, [k, n]) => s + (k === "name_mismatch" ? 0 : (n as number)), 0);
    const healedTotal = area.fixed + box.excluded + dup.resolved;
    const clean = residual === 0;

    // ── ②-b 콘솔키 크레딧 실측 프로브(트래픽 무관) ──
    //   search_log.ai_err는 실사용자 검색이 있어야만 소진을 잡는다 → 검색 뜸하면 소진돼도 신호 소멸(조용한 저하).
    //   여기서 소액 호출(max_tokens:1)로 크레딧 상태를 직접 확인해 console_key_state에 적재. 관제탑·재무팀이 이 값을
    //   읽어 '정상' 단정 대신 실측으로 판단한다. 소진 시 호출=400=과금0. ※ 소진은 저영향(검색 결정론 폴백·moat 구독 유지)
    //   이라 여기선 정보성 로그로만 남긴다 — 위험 판정은 관제탑이 폴백 유무를 반영해 LOW로 표면화(CEO 2026-07-08).
    const probe = await probeConsoleKey().catch((e) => ({ signal: "exception" as const, ok: true, detail: String(e).slice(0, 100) }));

    // ── ③ 리포트 ──
    const flags = Object.entries(checks).filter(([, n]) => n > 0).map(([k, n]) => `${k}:${n}`);
    await sql`INSERT INTO sentinel_reports (clean, report) VALUES (${clean}, ${JSON.stringify({ checks, nameMismatch: mismatch.samples, healed: { area: area.fixed, box: box.excluded, dup: dup.resolved }, consoleKey: probe })}::jsonb)`.catch(() => {});

    const probeNote = probe.signal === "ok" ? "콘솔키 크레딧 정상" : probe.signal === "credit" ? "콘솔키 크레딧 소진(콘솔경로 중단·검색 결정론폴백 정상=저영향)" : `콘솔키 프로브 ${probe.signal}`;
    const detail = `치유 ${healedTotal}(area${area.fixed}·박스${box.excluded}·중복${dup.resolved}) · ${clean ? "정합성 OK ✅" : "⚠️ 잔여 " + flags.join(" ")} · ${probeNote}`;
    await recordRun("cron-sentinel", true, detail, healedTotal);
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), clean, healed: { area: area.fixed, areaNames: area.names, box: box.excluded, dup: dup.resolved, dupPairs: dup.pairs }, checks, flags, nameMismatch: mismatch, consoleKey: probe });
  } catch (e) {
    await recordRun("cron-sentinel", false, String(e).slice(0, 150));
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
