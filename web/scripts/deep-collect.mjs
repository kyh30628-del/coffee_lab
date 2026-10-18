// 🔎 깊은 수집 레인 — "이미 네이버에 있는데 우리가 안 긁은 후기"를 모은다. (2026-10-17, CEO 승인)
//
// ── 왜 이게 최신화보다 효율적인가 ──
//   `/c/[id]`의 ISR 주기는 30일이고 신선도는 온디맨드 무효화가 지킨다 → **갱신 = 재생성**이다.
//   그래서 '최신화'는 재생성 비용을 내고 "며칠 새 글" 몇 건을 얻는 장사였다(폐기).
//   깊은 수집은 다르다 — 기본 수집이 질의당 `start=1`의 상위 100건만 받아서, **이미 존재하는 후기**를
//   10~18배 놓치고 있었다(실측: 한남작업실 원본 53건 ← 깊은 수집 10콜로 고유 링크 949건).
//   한 번 긁으면 영구 자산이고, 같은 재생성 1장으로 얻는 양이 비교가 안 된다.
//
// ── 절대 날리지 않는 설계(CEO "잘못 이해하고 날려버리지 말라") ──
//   ① **추가만 한다**: 기존 raw_reviews를 읽어 합치고(링크 기준 중복 제거) 저장한다. 삭제·대체 없음.
//   ② 합친 결과가 기존보다 **작으면 쓰지 않는다**(한 건도 안 늘면 네이버 콜만 쓰고 조용히 넘어간다).
//   ③ 재합성은 `refresh:false`로 돈다 — 저장된 raw를 그대로 쓰므로 수집을 다시 하지 않는다(콜 0).
//   ④ 그 위에 synthStore의 **급감 차단기**가 또 받친다(공개 카페 후기가 기존의 80% 미만이면 쓰기 거부).
//
// ── 💰 비용(건당 실측 기준) ──
//   네이버: 곳당 최대 10콜(sim 5쪽 + date 5쪽, 100건 미만이면 즉시 중단) — **무료**, 상한은 아래 BUDGET.
//   Neon 쓰기: 늘어난 곳만 raw 1건 + 합성 1건 = **최대 2 writes/곳**. 안 늘면 **0 writes**.
//   ISR write: 늘어난 곳만 **1장**(상세만). 등급이 바뀐 곳만 전체 무효화(목록·지도·OG).
//   Vercel 함수: 무효화를 **마지막에 묶음 1회**로 보낸다.
//   실행 창: 08~21시만(이미 깨어 있는 시간) → Neon 추가 가동 0.
//
// 사용: node --import tsx scripts/deep-collect.mjs [--cap=60] [--budget=1500] [--dry]
import { readFileSync } from "node:fs";
const env = readFileSync("./.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const { neon } = await import("@neondatabase/serverless");
const { fetchDeepWebReviews } = await import("../lib/webSearchCollector.ts");
const { nameCoherence, cleanCafeName } = await import("../lib/reviewQuality.ts");
const { extractRid } = await import("../lib/reviewerProfiles.ts");
const { areaTermsFor } = await import("../lib/synthStore.ts");
const { synthAndStore } = await import("../lib/synthStore.ts");
const { invalidateCafeCaches, invalidateCafeDetailOnly } = await import("../lib/cafeCacheInvalidate.ts");
const { naverBlocked, naverUsedToday, NAVER_DAILY_QUOTA, nonClosureMayUse } = await import("../lib/naverBudget.ts");
const sql = neon(process.env.DATABASE_URL);

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split("=")[1] : d; };
const DRY = process.argv.includes("--dry");
const CAP = Number(arg("cap", process.env.DEEP_CAP || 60));          // 하루 처리 곳 수(= 최대 ISR write 수)
const BUDGET = Number(arg("budget", process.env.DEEP_BUDGET || 1500)); // 이 회차에 쓸 네이버 콜 상한
const ONLY = arg("only", "");
// 🧵 샤드 — 2026-10-17: 병목이 쿼터가 아니라 **재합성 CPU**였다(곳당 22초 중 네이버는 1.5초뿐).
//   단일 프로세스로는 창(50분) 안에 ~140곳이 한계라 네이버 유휴가 그대로 남았다(사용률 36%).
//   collect-shard와 같은 방식으로 맥 코어를 나눠 쓴다. 샤드 수는 보수적으로(3 이하) —
//   더 늘리면 네이버 초당 버스트 429가 나 콜은 쓰고 수확이 0이 된다(collect-shard가 겪은 함정).
const SHARD = Number(arg("shard", 0)), OF = Number(arg("of", 1));
const tag = OF > 1 ? `[${SHARD}/${OF}] ` : "";                                          // 특정 카페명(복구용)
const STALE_D = Number(process.env.DEEP_STALE_D || 0);
const DEADLINE_MS = Number(process.env.COLLECT_DEADLINE) > 0
  ? Number(process.env.COLLECT_DEADLINE) * 1000
  : Date.now() + Number(process.env.DEEP_MAX_MIN || 50) * 60 * 1000;

// 🌙 창 가드 — 08~21시만. 새벽에 DB를 깨우지 않는다(collect-catchup과 같은 규약).
const H = new Date(Date.now() + 9 * 3600e3).getUTCHours();
if (!ONLY && (H < 8 || H >= 21)) { console.log(`🔎 창 밖(${H}시) — 건너뜀`); process.exit(0); }
if (await naverBlocked()) { console.log("🔎 네이버 막힘 — 건너뜀(쓰기 0)"); process.exit(0); }

await sql`CREATE TABLE IF NOT EXISTS deep_log (
  cafe_id BIGINT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_before INT, raw_after INT, count_before INT, count_after INT, calls INT)`.catch(() => {});

// 📋 대상 — **사람이 본 카페**만(재생성이 아깝지 않은 곳), 조회 많은 순.
//   60일 조회 6,627곳 = 공개 48,623곳의 13.6%. 나머지 86%는 깊게 긁어도 아무도 안 본다.
// 🗺️ 2026-10-17 **전국 격차 보정**(CEO "전국 모든 사람들이 제약없이 차이없이 사용").
//   실측한 격차: 지역별 '검증' 비율이 **47% vs 12% = 4배**다(성동구·대구 중구 47% ↔ 완주군 12%).
//     원인은 후기 수 — 평균 56건 vs 18건이고, 검증 문턱이 30건이라 지방 소도시는 구조적으로 '참고'에 머문다.
//   더 심한 건 **희소 지역**이다: 공개 60곳 미만 지역이 **57개(카페 2,175곳)**이고
//     영양군 11곳·검증 0 · 장수군 12곳·검증 0 처럼 **신뢰 정보가 아예 없는** 곳이 있다.
//     그런데 그 지역은 조회가 거의 없어(2,175곳 중 조회된 곳 175곳) '사람이 본 카페' 기준으로는
//     **영원히 개선 대상이 아니었다** — 그게 구조적 차이다.
//   → 대상을 둘로 넓히고, 정렬을 **지역 검증비율 낮은 순**으로 바꾼다:
//     ⓐ 사람이 본 카페(종전) — 재생성이 아깝지 않은 곳
//     ⓑ 희소 지역(공개 SPARSE_MAX곳 미만) 카페 — 조회가 없어도 처리한다.
//        근거: 그 지역 사용자가 들어왔을 때 볼 게 없으면 그 자체가 '차이'다. 규모도 2,175곳으로 한정적이다.
//   정렬은 '지역 검증비율 오름차순 → 조회 내림차순'. 낮은 곳을 먼저 올려 격차를 좁힌다.
const SPARSE_MAX = Number(process.env.DEEP_SPARSE_MAX || 60);
// 🛑 포화 중단선 — 후기가 이 수 이상인 카페는 더 모아도 화면이 안 달라진다(아래 쿼리 주석에 실측 근거).
const SATURATED_AT = Number(process.env.DEEP_SATURATED_AT || 60);
const targets = ONLY
  ? await sql`SELECT id, name, area, synth_count, synth_grade, published, 0 views FROM cafes WHERE name = ${ONLY}`
  : await sql`
    WITH areastat AS (
      SELECT area, count(*)::int pub,
             100.0 * count(*) FILTER (WHERE synth_grade = '검증') / count(*) AS vpct
      FROM cafes WHERE published GROUP BY 1),
    viewed AS (
      SELECT NULLIF(substring(path from '^/c/([0-9]+)'), '')::bigint id, count(*)::int views
      FROM traffic_events
      WHERE ts > now() - interval '60 days' AND path ~ '^/c/[0-9]+'
        AND anon_id NOT IN (SELECT anon_id FROM bot_anon_cache)
      GROUP BY 1)
    SELECT c.id, c.name, c.area, c.synth_count, c.synth_grade, c.published,
           COALESCE(v.views, 0) views, a.vpct, a.pub area_pub
    FROM cafes c
    JOIN areastat a ON a.area = c.area
    LEFT JOIN viewed v ON v.id = c.id
    LEFT JOIN deep_log d ON d.cafe_id = c.id
    WHERE c.published AND c.raw_reviews IS NOT NULL AND d.cafe_id IS NULL
      AND c.raw_collected_at < now() - make_interval(days => ${STALE_D})
      AND (c.id % ${OF}) = ${SHARD}
      AND (v.id IS NOT NULL OR a.pub < ${SPARSE_MAX})   -- ⓐ 본 카페 또는 ⓑ 희소 지역
      -- 🛑 2026-10-18 **포화 중단선**(CEO 낭비 지적 → 실측으로 확정).
      --   10-17~18 실측: 처리한 3,301곳 중 **이미 후기 60건 넘은 곳에 11,967콜(전체의 52%)**이 들어갔다.
      --   그 콜이 사용자 화면에 만든 변화는 "N건 교차검증" 숫자뿐이었다 — 등급은 이미 '검증'이고,
      --   인용문 재고도 이미 남는다(구간 실측: 60~79건 → 재고 62개 / 노출 상한 30개).
      --   즉 60건 이상은 **더 모아도 화면이 달라지지 않는다** → 콜을 쓰지 않는다.
      --   45~59건 구간은 24/25곳이 이미 재고 30개를 넘지만, 등급 감점(계정 상한·3년 경과)으로
      --   '검증' 문턱에서 떨어지는 곳이 있어 남겨둔다. 상한은 환경변수로 조정 가능.
      AND COALESCE(c.synth_count, 0) < ${SATURATED_AT}
    ORDER BY a.vpct ASC, COALESCE(v.views, 0) DESC, c.synth_count DESC NULLS LAST
    LIMIT ${CAP}`;

const used0 = await naverUsedToday();
console.log(`${tag}🔎 깊은 수집 — 대상 ${targets.length}곳(상한 ${CAP}) · 콜 예산 ${BUDGET} · 네이버 ${used0.toLocaleString()}/${NAVER_DAILY_QUOTA.toLocaleString()}`);
if (!targets.length) { console.log("  할 일 없음"); process.exit(0); }
if (DRY) {
  for (const t of targets.slice(0, 12)) console.log(`  [지역검증 ${String(Math.round(Number(t.vpct ?? 0))).padStart(2)}% · 조회 ${String(t.views).padStart(3)} · 지역공개 ${String(t.area_pub ?? "?").padStart(4)}] ${t.name} (${t.area}) 후기 ${t.synth_count ?? 0}건`);
  console.log("  ▶ 미리보기 — 쓰기·무효화 없음"); process.exit(0);
}

const keyOf = (r) => (r.link ? `L:${r.link}` : `T:${r.source}|${(r.title || "").slice(0, 60)}|${(r.text || "").slice(0, 120)}`);
const detailOnly = [], fullPurge = [];
let calls = 0, grew = 0, flat = 0, blocked = 0, failed = 0, rawAdded = 0, writes = 0;

for (const t of targets) {
  if (Date.now() >= DEADLINE_MS) { console.log("  ⏰ 창 종료 — 중단(다음 회차가 이어감)"); break; }
  if (calls >= BUDGET) { console.log(`  콜 예산 ${BUDGET} 소진 — 중단`); break; }
  if (await naverBlocked()) { console.log("  쿼터 소진 — 중단"); break; }
  // 🚦 예약 게이트 — 2026-10-17 보강. 종전엔 naverBlocked(429·전면소진)만 봐서 **폐업·수집 예약까지 먹을 수 있었다.**
  //   nonClosureMayUse는 '폐업 예약(400) + 수집 예약(적체 기반 동적)'을 남기고서야 참이다.
  //   깊은 수집은 유휴를 쓰는 레인이지 다른 몫을 빼앗는 레인이 아니다 — 문턱에 닿으면 스스로 멈춘다.
  const gate = await nonClosureMayUse();
  if (!gate.ok) { console.log(`  예약 문턱 도달(잔여 ${gate.remaining.toLocaleString()}) — 중단, 다음 회차가 이어감`); break; }

  const row = (await sql`SELECT raw_reviews FROM cafes WHERE id=${t.id}`)[0];
  const prev = Array.isArray(row?.raw_reviews) ? row.raw_reviews : [];

  let deep;
  try { deep = await fetchDeepWebReviews(t.name, t.area ?? ""); }
  catch (e) { failed++; console.log(`  ✗ ${t.name}: ${String(e).slice(0, 60)}`); continue; }
  calls += deep.calls;
  if (deep.apiError) { failed++; continue; }

  // 0단계 **이름일치 필터** — gatherRaw가 수집 단계에서 적용하는 것과 같은 규칙.
  //   🔴 2026-10-17 사고: 이 필터를 빼고 깊은 수집 결과를 그대로 넣었더니 8곳 중 4곳의 검증 후기가
  //   꺾였다(새벽카페호르 159→54 등). 깊이 들어갈수록 느슨하게 매칭된 글이 섞이는데, 그게 원본에 들어가면
  //   오염률이 올라가 옥석 검증이 더 많이 걸러낸다 — 즉 **많이 넣을수록 나빠진다.**
  //   그래서 '더 긁는 것'과 '이름이 맞는 것만 넣는 것'은 반드시 같이 가야 한다.
  const areaTerms = await areaTermsFor(Number(t.id), t.area ?? "");
  const cname = cleanCafeName(t.name);
  let kept = deep.snippets.filter((s) => nameCoherence(cname, [s.text], areaTerms) !== 0);

  // 🔴 2026-10-18 **등급에 기여하는 글만 받는다**(CEO "품질이 좋아진 건지 안 보인다").
  //   실측한 문제: 깊은 수집으로 표시 후기는 크게 늘었는데 **등급은 절반만 올랐다** —
  //   후기 30건 문턱을 새로 넘은 310곳 중 '검증'이 된 곳은 164곳뿐(146곳 미달).
  //   원인은 `start`로 깊이 들어가면 **같은 블로거 글·오래된 글**이 대량으로 들어오는 것이다:
  //     시실리아 커피로스팅 표시 61 = verified 8 + reference 53 · **계정공제 48**
  //     봄그림 검단 떡케이크 표시 60 = verified 45 + reference 15 · **계정공제 58**
  //     울진대게빵 강구점   표시 55 = verified 20 + reference 35 · **3년+ 공제 35**
  //   등급 산정(collectOrchestrator)은 **계정당 2건까지만** 세고 **3년 넘은 글은 0.5 가중**이다.
  //   그래서 그런 글을 더 넣으면 표시 숫자만 오르고 등급은 그대로다 — "표시만 늘리는" 수집이었다.
  //   → 수집 단계에서 같은 규칙을 **미리** 적용한다: 계정당 ACCT_CAP건까지, 3년 넘은 글은 뒤로.
  //     기존 raw에 이미 있는 계정 수도 함께 센다(합치면 등급 산정은 전체를 보므로).
  //   💰 콜은 그대로다(이미 받은 결과를 고르는 것) — 같은 비용으로 등급 기여도만 올린다.
  const ACCT_CAP = Number(process.env.DEEP_ACCT_CAP || 2);
  const YEARS3 = Date.now() - 3 * 365.25 * 86400e3;
  {
    const acct = new Map();
    for (const r of prev) { const rid = extractRid(r.link); if (rid) acct.set(rid, (acct.get(rid) ?? 0) + 1); }
    const dated = (x) => { const t = x.date ? Date.parse(String(x.date)) : NaN; return Number.isFinite(t) ? t : 0; };
    // 최신 우선 → 같은 계정이 상한을 넘으면 버린다. 3년 넘은 글은 상한을 1건으로 더 조인다.
    kept = kept.sort((a, b) => dated(b) - dated(a)).filter((x) => {
      const rid = extractRid(x.link);
      const old3 = dated(x) > 0 && dated(x) < YEARS3;
      const cap = old3 ? 1 : ACCT_CAP;
      if (!rid) return !old3;                    // 계정을 못 읽는 글은 최신만 받는다
      const n = acct.get(rid) ?? 0;
      if (n >= cap) return false;
      acct.set(rid, n + 1);
      return true;
    });
  }

  // ① 합치기 — 기존을 먼저 깔고 신규를 더한다. **기존이 사라질 수 없다.**
  const byKey = new Map();
  for (const r of prev) byKey.set(keyOf(r), r);
  for (const s of kept) {
    const item = { source: "blog", text: s.text, title: s.title, desc: s.desc, time: s.time, link: s.link, date: s.date, srcName: s.source };
    if (!byKey.has(keyOf(item))) byKey.set(keyOf(item), item);
  }
  // 상한 — raw_reviews는 cron-resynth가 **반복 읽는** 큰 컬럼이다(gatherRaw -> loadRaw).
  //   무한 누적은 저장이 아니라 **조회 전송량**으로 돌아온다(비용 하드규칙).
  //   gatherRaw의 RAW_KEEP_MAX와 같은 600건으로 맞춘다 — 두 경로가 어긋나면 한쪽이 다시 잘라낸다.
  //   날짜 새것 우선(최근 글이 판정 가치가 크다). 600건 x 298B 약 179KB.
  const KEEP = Number(process.env.RAW_KEEP_MAX || 600);
  // 기존 항목은 **절대 밀어내지 않는다** — 상한을 전체에 걸면 오래된 근거가 잘려 검증 수가 꺾인다.
  //   기존을 전량 보존하고 '남은 자리'에만 신규를 날짜 새것 순으로 넣는다. 기존이 상한을 넘으면 신규 0건.
  const prevKeys = new Set(prev.map(keyOf));
  const newOnly = [...byKey.values()].filter((r) => !prevKeys.has(keyOf(r))).sort((x, y) => {
    const tx = x.date ? Date.parse(String(x.date)) : NaN, ty = y.date ? Date.parse(String(y.date)) : NaN;
    if (Number.isFinite(tx) && Number.isFinite(ty)) return ty - tx;
    if (Number.isFinite(ty)) return 1;
    if (Number.isFinite(tx)) return -1;
    return 0;
  });
  const room = Math.max(0, KEEP - prev.length);
  const merged = [...prev, ...newOnly.slice(0, room)];

  // ② 한 건도 안 늘면 쓰지 않는다 — 네이버 콜만 쓰고 DB·ISR은 건드리지 않는다.
  if (merged.length <= prev.length) {
    flat++;
    await sql`INSERT INTO deep_log (cafe_id, raw_before, raw_after, count_before, count_after, calls)
      VALUES (${t.id}, ${prev.length}, ${merged.length}, ${t.synth_count ?? 0}, ${t.synth_count ?? 0}, ${deep.calls})
      ON CONFLICT (cafe_id) DO UPDATE SET at=now(), raw_after=EXCLUDED.raw_after, calls=EXCLUDED.calls`.catch(() => {});
    continue;
  }

  // ③ raw 저장(1 write) → 재합성은 refresh:false(저장된 raw 사용, 네이버 콜 0)
  await sql`UPDATE cafes SET raw_reviews=${JSON.stringify(merged)}::jsonb, raw_collected_at=now(), raw_checked_at=now() WHERE id=${t.id}`;
  writes++;
  rawAdded += merged.length - prev.length;

  let res;
  try { res = await synthAndStore({ id: Number(t.id), name: t.name, area: t.area }, { refresh: false }); }
  catch (e) { failed++; console.log(`  ✗ 재합성 ${t.name}: ${String(e).slice(0, 60)}`); continue; }
  if (res?.blocked) {
    // 🛡️ 합성 쓰기가 막혔다면 **원본도 되돌린다**. 깊은 수집이 느슨한 글을 섞어 오염률을 올린 경우라
    //   raw만 바뀐 채 남겨두면 다음 재합성에서 같은 하락이 또 계산된다(화면은 가드가 막아도 내부가 썩는다).
    await sql`UPDATE cafes SET raw_reviews=${JSON.stringify(prev)}::jsonb WHERE id=${t.id}`.catch(() => {});
    writes++;
    blocked++;
    console.log(`  🛡️ ${String(t.name).slice(0, 18)} — 급감으로 차단, 원본 ${merged.length}→${prev.length}건 되돌림`);
    await sql`INSERT INTO deep_log (cafe_id, raw_before, raw_after, count_before, count_after, calls)
      VALUES (${t.id}, ${prev.length}, ${prev.length}, ${t.synth_count ?? 0}, ${t.synth_count ?? 0}, ${deep.calls})
      ON CONFLICT (cafe_id) DO UPDATE SET at=now(), raw_after=EXCLUDED.raw_after, calls=EXCLUDED.calls`.catch(() => {});
    continue;
  }
  writes++;

  const a = (await sql`SELECT synth_count, synth_grade FROM cafes WHERE id=${t.id}`)[0];
  const cBefore = Number(t.synth_count ?? 0), cAfter = Number(a?.synth_count ?? 0);
  const gradeChanged = a?.synth_grade !== t.synth_grade;
  grew++;
  (gradeChanged ? fullPurge : detailOnly).push(Number(t.id));
  console.log(`  ${tag}✅ ${String(t.name).slice(0, 18).padEnd(20)} 원본 ${prev.length}→${merged.length} · 검증 ${cBefore}→${cAfter}${gradeChanged ? ` · 등급 ${t.synth_grade}→${a.synth_grade}` : ""} (${deep.calls}콜 · 등급기여 ${kept.length}/${deep.snippets.length})`);

  await sql`INSERT INTO deep_log (cafe_id, raw_before, raw_after, count_before, count_after, calls)
    VALUES (${t.id}, ${prev.length}, ${merged.length}, ${cBefore}, ${cAfter}, ${deep.calls})
    ON CONFLICT (cafe_id) DO UPDATE SET at=now(), raw_before=EXCLUDED.raw_before, raw_after=EXCLUDED.raw_after,
      count_before=EXCLUDED.count_before, count_after=EXCLUDED.count_after, calls=EXCLUDED.calls`.catch(() => {});
}

// 🧹 무효화 — 마지막에 묶음. 내용만 바뀐 곳도 상세 1장은 지워야 화면에 반영된다(ISR 30일 주기).
//   등급이 바뀐 곳만 목록·지도·OG까지 간다.
// 내용만 바뀐 곳은 **상세 1장만** — OG(4.5MB 폰트 렌더)·공유 페이지는 등급이 안 바뀌면 그대로여도 된다.
//   등급이 바뀐 곳만 전체(목록·지도·검색·OG)로 간다. 카페당 ISR write 3 → 1.
if (detailOnly.length) await invalidateCafeDetailOnly(detailOnly).catch((e) => console.log(`  무효화(상세) 실패: ${String(e).slice(0, 70)}`));
if (fullPurge.length) await invalidateCafeCaches(fullPurge).catch((e) => console.log(`  무효화(전체) 실패: ${String(e).slice(0, 70)}`));
const used1 = await naverUsedToday();
console.log(`${tag}🔎 끝 — 늘어난 곳 ${grew} · 변화없음 ${flat} · 차단 ${blocked} · 실패 ${failed}`);
// 💓 하트비트 — 관제탑이 이 레인의 정지를 감지하게 한다(3종 세트 ①: 러너 heartbeat).
try {
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["--import", "tsx", "scripts/heartbeat.mjs", "deep-collect", "0",
    `늘어난 곳 ${grew} · 차단 ${blocked} · 원본 +${rawAdded} · ISR ${detailOnly.length + fullPurge.length * 3}장`],
    { stdio: "ignore" });
} catch { /* 하트비트 실패가 레인을 막지 않는다 */ }
console.log(`   원본 +${rawAdded.toLocaleString()}건 · Neon 쓰기 ${writes}건 · ISR write ${detailOnly.length + fullPurge.length * 3}장(상세만 ${detailOnly.length} + 등급변경 ${fullPurge.length}×3) · 네이버 ${(used1 - used0).toLocaleString()}콜`);
