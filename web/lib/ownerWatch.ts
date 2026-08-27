import { sql, ensureOnce } from "./db";
import { decryptPII } from "./crypto";
import { synthAndStore } from "./synthStore";
import { optoutToken } from "./newsletter";

// 🔔 사장님 감시 알림 — 「우리 가게 리포트」를 **구독 상품**으로 만드는 핵심.
//
// 왜 필요한가(2026-08-27 실측): 체험 사장님 2곳 다 **첫날 한 번 보고 다시 안 왔다**
//   (브라운테일 7/14 시작→7/14 마지막, 바운스백 7/31→7/31). 7일을 다 쓰지도 않았다.
//   리포트는 한 번 읽으면 끝나는 물건이라, 사장님이 우리를 기억했다 찾아와주길 기대하는 구조로는
//   월 구독이 성립하지 않는다. **우리가 찾아가야 한다** — 그게 이 알림이다.
//   (그래서 체험 연장은 이 기능 뒤로 미뤘다. 보여줄 게 없는데 기간만 늘리면 의미가 없다.)
//
// 💰 비용 설계:
//   · **새 크론 0** — 이미 매일 도는 cron-billing에 얹는다(그것도 구독자 대상 잡이라 결이 같다).
//   · 조회는 구독자 수만큼. 동네 순위는 **area로 좁혀** 최대 524행, 작은 컬럼만(char/큰컬럼 미접근).
//   · 갱신(refresh=true)은 **구독자 카페만**. 곳당 ~5콜이라 몇 곳이면 무시할 수준이고,
//     이게 없으면 "새 후기를 감시해드립니다"가 거짓말이 된다(수집 큐는 raw_reviews IS NULL만 집어
//     이미 수집된 구독자 카페는 영영 다시 안 본다).
//   · **변화가 없으면 메일을 보내지 않는다.** 조용한 날에 메일이 오면 그게 해지 사유가 된다.
//
// ⚠️ 첫 실행은 기준선만 저장하고 알림하지 않는다 — 안 그러면 가입 직후 "변했습니다" 오알림이 간다.
// ⚠️ 야간(21~08 KST) 발송 금지 — 주간 레터와 동일 규칙.

export type WatchChange = { kind: "review" | "rank" | "rival"; text: string };

export async function ensureWatchSchema() {
  await ensureOnce("ownerWatch.ddl", async () => {
    await sql`CREATE TABLE IF NOT EXISTS owner_watch_state (
      cafe_id INT PRIMARY KEY,
      synth_count INT, rank INT, hood_n INT,
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      notified_at TIMESTAMPTZ
    )`;
  });
}

/** 지금 시각이 발송 가능한 시간대인가(KST 08~21시). */
export function sendableNow(now = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(now));
  return h >= 8 && h < 21;
}

/** 카페 한 곳의 현재 상태(후기수·동네순위·동네 카페수). area로 좁혀 읽는다. */
async function snapshot(cafeId: number): Promise<{ count: number; rank: number; hoodN: number; name: string; area: string } | null> {
  const me = (await sql`SELECT id, name, area, synth_count FROM cafes WHERE id=${cafeId} AND published=true LIMIT 1`)[0] as any;
  if (!me) return null;
  // area == guOf(area)가 공개 85개 동네 전부에서 성립함을 실측 확인(2026-08-27) → SQL 등가 필터.
  const hood = (await sql`SELECT id, synth_count FROM cafes WHERE published=true AND area=${me.area}`) as unknown as any[];
  const sorted = [...hood].sort((a, b) => (b.synth_count ?? 0) - (a.synth_count ?? 0) || Number(a.id) - Number(b.id));
  return {
    count: me.synth_count ?? 0,
    rank: sorted.findIndex((c) => Number(c.id) === Number(me.id)) + 1,
    hoodN: hood.length,
    name: me.name, area: me.area,
  };
}

/** 이전 상태와 비교해 '알릴 만한 변화'만 뽑는다. 사소한 흔들림은 버린다. */
export function diffChanges(
  prev: { synth_count: number | null; rank: number | null; hood_n: number | null },
  now: { count: number; rank: number; hoodN: number; area: string },
): WatchChange[] {
  const out: WatchChange[] = [];
  const pc = prev.synth_count ?? 0, pr = prev.rank ?? 0, ph = prev.hood_n ?? 0;

  if (now.count > pc) {
    const d = now.count - pc;
    out.push({ kind: "review", text: `검증된 새 후기 <b>${d}건</b>이 확인됐어요 (총 ${now.count}건)` });
  }
  // 순위는 1칸 흔들림까지 무시 — 동점·신규 공개로 매일 미세하게 움직인다. 2칸 이상만 알린다.
  if (pr > 0 && now.rank > 0 && Math.abs(now.rank - pr) >= 2) {
    const up = now.rank < pr;
    out.push({ kind: "rank",
      text: `${now.area} 순위가 <b>${pr}위 → ${now.rank}위</b>로 ${up ? "올랐어요" : "내려갔어요"}` });
  }
  if (ph > 0 && now.hoodN > ph) {
    out.push({ kind: "rival", text: `${now.area}에 카페 <b>${now.hoodN - ph}곳</b>이 새로 등록됐어요 (총 ${now.hoodN}곳)` });
  }
  return out;
}

export function buildHtml(cafeName: string, cafeId: number, changes: WatchChange[], email: string): string {
  const site = "https://dongnecoffeenote.com";
  const items = changes.map((c) => `<li style="margin:0 0 8px;line-height:1.7">${c.text}</li>`).join("");
  return `<div style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:520px;margin:0 auto;background:#f4ece0;padding:28px 24px;color:#2b2018">
  <div style="font-size:11px;letter-spacing:.2em;color:#9c6b3f;margin-bottom:6px">우리 가게 리포트</div>
  <h1 style="font-size:19px;margin:0 0 4px">${cafeName}에 변화가 있어요</h1>
  <p style="font-size:12.5px;color:#7a6a55;margin:0 0 18px">지난 확인 이후 달라진 점만 모았어요.</p>
  <ul style="background:#fff;border:1px solid #e6dcc8;border-radius:14px;padding:16px 18px 16px 34px;font-size:13.5px;margin:0 0 18px">${items}</ul>
  <a href="${site}/owner/r/${cafeId}" style="display:block;text-align:center;background:#2b2018;color:#f4ece0;text-decoration:none;border-radius:12px;padding:13px;font-size:14px;font-weight:700">우리 가게 리포트 보기</a>
  <p style="font-size:10.5px;color:#8a7458;margin:18px 0 0;line-height:1.7">
    네이버·구글·유튜브 공개 후기를 교차검증한 데이터입니다.<br>
    <a href="${site}/api/newsletter-optout?e=${encodeURIComponent(email)}&t=${optoutToken(email)}" style="color:#9c6b3f">알림 그만 받기</a>
  </p></div>`;
}

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false; // 키 없으면 조용히 건너뛴다 — 감시 자체(상태 갱신)는 계속 돈다
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "동네 커피 노트 <onboarding@resend.dev>", to: [to], subject, html }),
    });
    return r.ok;
  } catch { return false; }
}

/**
 * 하루 1회 실행. 활성 구독 카페만 ①최신 후기로 갱신 → ②변화 감지 → ③변화가 있을 때만 메일.
 * 반환값은 관제·원장 기록용.
 */
export async function runOwnerWatch(opts?: { dry?: boolean }): Promise<{
  subs: number; refreshed: number; changed: number; sent: number; baseline: number; skipped: string | null;
}> {
  await ensureWatchSchema();
  const dry = !!opts?.dry;

  const subs = (await sql`
    SELECT s.id, s.cafe_id, s.cafe_name, s.email
    FROM subscriptions s
    LEFT JOIN owner_watch_state w ON w.cafe_id = s.cafe_id
    WHERE s.status = 'active' AND s.cafe_id IS NOT NULL
    ORDER BY w.checked_at ASC NULLS FIRST`) as unknown as any[];
  if (!subs.length) return { subs: 0, refreshed: 0, changed: 0, sent: 0, baseline: 0, skipped: "활성 구독 없음" };

  // 야간이면 감시·갱신은 하되 발송만 미룬다(다음 날 창에서 나간다).
  const canSend = sendableNow() && !dry;

  // 💰 쿼터 안전장치 — 구독자가 늘어도 갱신이 폭주하지 않게 상한을 둔다.
  //   곳당 ~5콜이라 100곳이면 ~500콜(일 25,000 대비 2%). 넘치면 다음 날 이어서 돈다
  //   (오래 안 본 카페부터 도니 결국 전부 돌아간다).
  const REFRESH_CAP = Number(process.env.OWNER_WATCH_REFRESH_CAP || 100);

  let refreshed = 0, changed = 0, sent = 0, baseline = 0;
  for (const s of subs) {
    const cafeId = Number(s.cafe_id);
    // ① 유료 카페 우선 갱신 — 이게 없으면 새 후기를 영영 못 본다(수집 큐가 안 집는다).
    if (!dry && refreshed < REFRESH_CAP) {
      try { await synthAndStore({ id: cafeId, name: s.cafe_name, area: "" }, { refresh: true }); refreshed++; }
      catch { /* 갱신 실패가 감시를 멈추지 않는다 — 다음 날 다시 시도 */ }
    }
    const now = await snapshot(cafeId);
    if (!now) continue;

    const prev = (await sql`SELECT synth_count, rank, hood_n FROM owner_watch_state WHERE cafe_id=${cafeId}`)[0] as any;
    if (!prev) {
      // ② 첫 실행 = 기준선만 저장. 알림하지 않는다(가입 직후 오알림 방지).
      if (!dry) await sql`INSERT INTO owner_watch_state (cafe_id, synth_count, rank, hood_n)
        VALUES (${cafeId}, ${now.count}, ${now.rank}, ${now.hoodN}) ON CONFLICT (cafe_id) DO NOTHING`;
      baseline++;
      continue;
    }

    const changes = diffChanges(prev, now);
    if (!changes.length) {
      if (!dry) await sql`UPDATE owner_watch_state SET checked_at=now() WHERE cafe_id=${cafeId}`;
      continue; // ③ 변화 없으면 메일 안 보낸다
    }
    changed++;

    if (canSend) {
      const email = (decryptPII(s.email) || "").trim().toLowerCase();
      const optedOut = email ? (await sql`SELECT 1 FROM newsletter_optout WHERE email=${email} LIMIT 1`).length > 0 : true;
      if (email.includes("@") && !optedOut) {
        const ok = await send(email, `${s.cafe_name} — 새로운 변화가 있어요`, buildHtml(s.cafe_name, cafeId, changes, email));
        if (ok) sent++;
      }
    }
    // 발송 성공 여부와 무관하게 상태는 갱신한다 — 실패한 변화를 매일 재발송하면 스팸이 된다.
    if (!dry) await sql`UPDATE owner_watch_state
      SET synth_count=${now.count}, rank=${now.rank}, hood_n=${now.hoodN}, checked_at=now(),
          notified_at=${canSend ? new Date().toISOString() : null}
      WHERE cafe_id=${cafeId}`;
  }
  return { subs: subs.length, refreshed, changed, sent, baseline, skipped: canSend ? null : "발송 시간대 아님(21~08 KST)" };
}

// ── 📧 무료 리드 월간 요약(2026-08-27, 수익화 4순위) ─────────────────────────────
//   owner_leads(무료·월 1회)는 유료 감시(매일·즉시)와 급을 나눈다. 리포트의 약속
//   "매월 1일에 동네 순위·검증 후기 수 변화를 한 통으로"를 이 함수가 이행한다.
//   💰 새 크론 0 — cron-billing이 매일 도는 김에 KST 1일에만 실행. 발송량 = 리드 수(작음).
//   ⚠️ last_sent_at 가드로 같은 달 중복 발송 차단(크론 재시도에도 안전).
export async function runOwnerLeadDigest(): Promise<{ leads: number; sent: number; skipped: string | null }> {
  const kstDay = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", day: "numeric" }).format(new Date()));
  if (kstDay !== 1) return { leads: 0, sent: 0, skipped: "매월 1일 아님" };
  if (!sendableNow()) return { leads: 0, sent: 0, skipped: "발송 시간대 아님" };

  const leads = (await sql`
    SELECT l.id, l.cafe_id, l.email
    FROM owner_leads l
    WHERE l.last_sent_at IS NULL OR l.last_sent_at < date_trunc('month', now())
    LIMIT 500`) as unknown as any[]; // Resend 무료 한도 보호 — 넘치면 다음 실행(내일)엔 1일이 아니라 스킵되므로
                                     // 500을 넘기 전에 발송 인프라를 재검토해야 한다(현재 리드 0에서 시작).
  if (!leads.length) return { leads: 0, sent: 0, skipped: "리드 없음" };

  let sent = 0;
  for (const l of leads) {
    const email = (decryptPII(l.email) || "").trim().toLowerCase();
    if (!email.includes("@")) continue;
    if ((await sql`SELECT 1 FROM newsletter_optout WHERE email=${email} LIMIT 1`).length) continue;
    const now = await (async () => {
      const me = (await sql`SELECT id, name, area, synth_count FROM cafes WHERE id=${l.cafe_id} AND published=true LIMIT 1`)[0] as any;
      if (!me) return null;
      const hood = (await sql`SELECT id, synth_count FROM cafes WHERE published=true AND area=${me.area}`) as unknown as any[];
      const sorted = [...hood].sort((a, b) => (b.synth_count ?? 0) - (a.synth_count ?? 0) || Number(a.id) - Number(b.id));
      return { name: me.name, area: me.area, count: me.synth_count ?? 0,
        rank: sorted.findIndex((c) => Number(c.id) === Number(me.id)) + 1, hoodN: hood.length };
    })();
    if (!now) continue;
    const site = "https://dongnecoffeenote.com";
    const html = `<div style="font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;max-width:520px;margin:0 auto;background:#f4ece0;padding:28px 24px;color:#2b2018">
      <div style="font-size:11px;letter-spacing:.2em;color:#9c6b3f;margin-bottom:6px">월간 가게 요약 · 무료</div>
      <h1 style="font-size:19px;margin:0 0 14px">${now.name} — 이번 달 요약</h1>
      <ul style="background:#fff;border:1px solid #e6dcc8;border-radius:14px;padding:16px 18px 16px 34px;font-size:13.5px;margin:0 0 18px;line-height:1.9">
        <li>${now.area} 카페 ${now.hoodN}곳 중 <b>${now.rank}위</b> (검증 후기 수 기준)</li>
        <li>검증을 통과한 후기 <b>${now.count}건</b></li>
      </ul>
      <a href="${site}/owner/r/${l.cafe_id}" style="display:block;text-align:center;background:#2b2018;color:#f4ece0;text-decoration:none;border-radius:12px;padding:13px;font-size:14px;font-weight:700">전체 리포트 보기</a>
      <p style="font-size:10.5px;color:#8a7458;margin:14px 0 0;line-height:1.7">새 후기가 올라온 즉시 알림·약점 처방은 <a href="${site}/pricing" style="color:#9c6b3f">우리 가게 리포트 구독</a>에서.<br>
      <a href="${site}/api/newsletter-optout?e=${encodeURIComponent(email)}&t=${optoutToken(email)}" style="color:#9c6b3f">더 이상 받지 않기</a></p></div>`;
    const ok = await send(email, `${now.name} — ${new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"long"}).format(new Date())} 가게 요약`, html);
    if (ok) { sent++; await sql`UPDATE owner_leads SET last_sent_at=now() WHERE id=${l.id}`; }
  }
  return { leads: leads.length, sent, skipped: null };
}
