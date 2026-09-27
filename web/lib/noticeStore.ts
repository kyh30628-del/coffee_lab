// 📣 공지 저장소 — 진실 원본은 DB `notices`, 코드(lib/notices.ts)는 폴백.
//   criteria와 같은 원칙: 무배포로 관리하되 DB가 죽어도 서비스가 멀쩡해야 한다.
import { sql, ensureOnce } from "./db";
import { NOTICES, type Notice } from "./notices";

export async function ensureNoticeSchema(): Promise<void> {
  await ensureOnce("notices.schema", async () => {
    await sql`CREATE TABLE IF NOT EXISTS notices (
      id TEXT PRIMARY KEY,                       -- 슬러그. ⚠️ 재사용 금지(localStorage 해제 기록 키)
      emoji TEXT NOT NULL DEFAULT '📣',
      title TEXT NOT NULL, title_past TEXT NOT NULL,
      highlight TEXT,
      body TEXT NOT NULL, body_past TEXT NOT NULL,
      sub TEXT NOT NULL DEFAULT '', sub_past TEXT NOT NULL DEFAULT '',
      cta TEXT NOT NULL DEFAULT '확인', cta_past TEXT NOT NULL DEFAULT '확인',
      cta_href TEXT,                             -- 버튼 목적지(예: /?sido=강원&tab=map). 지역 공지는 필수
      from_at TIMESTAMPTZ NOT NULL,              -- 이때부터 표시
      past_from_at TIMESTAMPTZ NOT NULL,         -- 이때부터 완료형 문구
      until_at TIMESTAMPTZ NOT NULL,             -- 이때부터 미표시
      enabled BOOLEAN NOT NULL DEFAULT true,     -- 즉시 내리기용(날짜와 별개)
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    // 해제 클릭만 기록한다 — '노출'까지 남기면 접속마다 INSERT라 DB를 계속 깨운다(비용).
    //   노출 규모는 기존 traffic_events로 근사한다(추가 쓰기 0).
    await sql`CREATE TABLE IF NOT EXISTS notice_dismissals (
      id BIGSERIAL PRIMARY KEY, notice_id TEXT NOT NULL, anon_id TEXT,
      ts TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
    await sql`CREATE INDEX IF NOT EXISTS idx_notice_dismissals_nid ON notice_dismissals (notice_id)`;
    await sql`ALTER TABLE notices ADD COLUMN IF NOT EXISTS cta_href TEXT`.catch(() => {}); // 기존 테이블 보강
    // 최초 1회 코드 폴백을 씨앗으로 넣는다(이미 있으면 건드리지 않음).
    for (const n of NOTICES) {
      await sql`INSERT INTO notices (id, emoji, title, title_past, highlight, body, body_past, sub, sub_past, cta, cta_past, cta_href, from_at, past_from_at, until_at)
        VALUES (${n.id}, ${n.emoji}, ${n.title}, ${n.titlePast}, ${n.highlight ?? null}, ${n.body}, ${n.bodyPast},
                ${n.sub}, ${n.subPast}, ${n.cta}, ${n.ctaPast}, ${n.ctaHref ?? null},
                to_timestamp(${n.from / 1000}), to_timestamp(${n.pastFrom / 1000}), to_timestamp(${n.until / 1000}))
        ON CONFLICT (id) DO NOTHING`;
    }
  });
}

// 🔴 2026-09-27 CEO 격노(공지가 34,000곳이라고 며칠째 말하는데 실제 43,952곳) —
//   공지 문구에 카페 수를 **글자로 박아둔 게 원인**이었다(nationwide-2026-09.sub: "34,000곳 넘게").
//   작성 시점(09-22)엔 맞았지만 그 뒤로도 하루 ~1,500곳씩 공개가 늘어 5일 만에 1만 곳 어긋났다.
//   같은 클래스 사고가 09-14에도 있었다(llms.txt "22,000+"가 8일 만에 낡음, revalidate=86400으로 수리).
//   → 이번에도 **글자를 고치는 게 아니라 틀릴 수 없게** 만든다: 본문에 `{count}` 자리표시자를 쓰면
//   여기서 실시간에 가까운 실제 공개 수(1시간 캐시, 반올림)로 치환한다. 관리자가 /admin/notices에서
//   "{count}곳 넘게"라고만 적으면 그 뒤로 다시는 틀리지 않는다.
let pubCountMem: { at: number; v: number } | null = null;
const PUB_COUNT_TTL_MS = 60 * 60 * 1000; // 1시간 — 공지 문구는 실시간일 필요 없다, 며칠 단위로만 안 틀리면 된다
async function livePublishedCount(): Promise<number> {
  if (pubCountMem && Date.now() - pubCountMem.at < PUB_COUNT_TTL_MS) return pubCountMem.v;
  try {
    const [r] = (await sql`SELECT count(*)::int n FROM cafes WHERE published`) as any[];
    const v = Math.floor((r?.n ?? 0) / 1000) * 1000; // 천 단위 반올림 — "43,952곳"이 아니라 "43,000곳 넘게"처럼 쓰는 문구용
    pubCountMem = { at: Date.now(), v };
    return v;
  } catch { return pubCountMem?.v ?? 0; }
}
const fillCount = (s: string, n: number) => s.replaceAll("{count}", n.toLocaleString());

const toNotice = async (r: any): Promise<Notice> => {
  const n = /\{count\}/.test(`${r.title}${r.body}${r.sub}${r.cta}`) ? await livePublishedCount() : 0;
  return {
    id: r.id, emoji: r.emoji,
    title: fillCount(r.title, n), titlePast: fillCount(r.title_past, n), highlight: r.highlight ?? undefined,
    body: fillCount(r.body, n), bodyPast: fillCount(r.body_past, n), sub: fillCount(r.sub, n), subPast: fillCount(r.sub_past, n),
    cta: fillCount(r.cta, n), ctaPast: fillCount(r.cta_past, n), ctaHref: r.cta_href ?? undefined,
    from: new Date(r.from_at).getTime(), pastFrom: new Date(r.past_from_at).getTime(), until: new Date(r.until_at).getTime(),
  };
};

/** 지금 띄울 공지 — DB 우선, 실패하면 코드 폴백. 겹치면 나중에 시작한 것.
 *
 *  🔴 2026-09-11 CEO 지적으로 발견한 '공지 부활' — 규칙이 "기간 안 + 가장 최근 시작"뿐이라,
 *    **더 나중에 시작한 공지가 끝나면 그보다 오래된 공지가 자동으로 되살아난다.**
 *    실측: 부산·경남(9/6~9/10)이 끝난 9/10 오후, 이미 17일 지난 강원(8/25~9/16)이 다시 떴다.
 *    사용자에겐 한참 전에 알린 소식이 새 소식인 양 보인다.
 *    → '한 번 다른 공지에 자리를 내준 공지는 다시 올라오지 않는다'를 규칙으로 못박는다:
 *      **지금 가장 최근 시작한 공지**가 곧 현재 공지이고, 그게 기간 밖이면 '없음'이다(앞으로 되감지 않는다).
 *    운영상 되살리려면 사람이 그 공지의 from_at을 새로 잡거나 새 id로 올린다(의도가 기록에 남는다). */
export async function currentNotice(): Promise<Notice | null> {
  try {
    await ensureNoticeSchema();
    // 기간과 무관하게 '가장 최근 시작한, 켜져 있는' 공지 하나만 본다 → 그게 기간 안일 때만 띄운다.
    const r = (await sql`SELECT * FROM notices
      WHERE enabled AND now() >= from_at
      ORDER BY from_at DESC LIMIT 1`) as any[];
    if (!r.length) return null;
    return new Date(r[0].until_at).getTime() > Date.now() ? await toNotice(r[0]) : null;
  } catch {
    const now = Date.now();
    const started = NOTICES.filter((n) => now >= n.from).sort((a, b) => b.from - a.from)[0];
    return started && now < started.until ? started : null;
  }
}

/** 관리자용 전체 목록 + 상태 + 해제 수. */
export async function listNotices() {
  await ensureNoticeSchema();
  const rows = (await sql`
    SELECT n.*, (SELECT count(*)::int FROM notice_dismissals d WHERE d.notice_id = n.id) AS dismissals
    FROM notices n ORDER BY n.from_at DESC`) as any[];
  const now = Date.now();
  return rows.map((r) => {
    const from = new Date(r.from_at).getTime(), pastFrom = new Date(r.past_from_at).getTime(), until = new Date(r.until_at).getTime();
    const status = !r.enabled ? "중지" : now < from ? "예정" : now >= until ? "종료" : now >= pastFrom ? "진행(완료형)" : "진행(예고형)";
    return { ...r, status, from, pastFrom, until };
  });
}
