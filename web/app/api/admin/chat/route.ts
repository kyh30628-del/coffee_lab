import { NextRequest, NextResponse } from "next/server";
import { sql , ensureOnce } from "@/lib/db";

export const runtime = "nodejs";

// 💬 관제 챗봇 (구독 LLM·claude -p 경유) — 서비스 전 상태를 그라운딩해 자연어로 답한다.
//   ⚠️ 구독토큰 백엔드 금지(약관) → 서버는 *질문을 큐에 넣고 답을 폴링*만. 실제 LLM은 로컬 watcher가 claude -p로 돌려 답을 DB에 기록.
//   POST: 질문 적재(pending) → {id}.  GET?id=: 답 폴링.  GET: 24h 대화기록.
//   콘솔키(ANTHROPIC_API_KEY) 크레딧이 있으면 즉답 폴백도 가능하지만 기본은 claude -p 경로.

// 📚 서비스/조직/대시보드 지식 응답 — 결정론 키워드 매칭($0·LLM 안 씀).
//   사실 출처: 레포 CLAUDE.md · docs/SERVICE_OVERVIEW.md(추측 없음). '일반' 탭에서 카페·지역이 아닌
//   서비스/조직/관제/라운지/구독/파이프라인/MY PIN 질문에 바로 답한다.
type Know = { kw: string[]; a: string };
const KNOW: Know[] = [
  { kw: ["서비스", "뭐하는", "뭐야", "소개", "제품", "무슨", "어떤곳", "dongnecoffeenote", "동네커피노트"],
    a: "**동네 커피 노트** — 서울·수도권 카페를 리뷰 데이터로 검증한 큐레이션 서비스예요.\n\n- 공개 후기(네이버·구글·유튜브)를 모아 규칙으로 옥석을 가리고, AI가 **진짜 방문 검증 후기만** 최종 검증해 지도·추천으로 보여줍니다(별점 나열 X).\n- **B2C**: 지도·검색·카페 상세(형광펜 강조 근거 후기). **B2B**: 사장님 구독(인사이트·노출).\n- **MY PIN**: 사용자가 다녀온 카페 추억을 익명으로 기록·보관(무가입·개인정보 0).\n\n핵심 원칙: 모든 숫자·후기에 출처·근거가 붙는다 — 지어내지 않는다." },
  { kw: ["검증", "신뢰등급", "등급", "오염", "품질", "옥석", "발굴", "참고"],
    a: "**신뢰 등급 / 품질 해자**\n\n- **검증**(리뷰 30+) · **참고**(5~30) · **발굴**(5 미만) 3단계.\n- 진짜 방문 검증 후기만 노출하고 **오염 0**(옆가게·광고·동명 오염 금지)이 1순위 원칙.\n- 오염 발견 시 규칙만 바꿔 원본(raw_reviews)에서 재처리하는 자가치유(self-heal) 루프가 돕니다." },
  { kw: ["조직", "본부", "에이전트", "조직도", "팀", "자율"],
    a: "**자율 에이전트 조직** — 1인 운영(CEO) + 자율 에이전트 조직(launchd + Claude Code 헤드리스 + Vercel 크론)으로 돌아갑니다.\n\n- 수집(warmup)·판정(judgeloop)·품질감사·재합성·검증 등 에이전트가 정해진 시각에 자동 실행.\n- 조직 운영 현황: [운영 관제 /admin/org](/admin/org) · 전사 공간: [🏛️ 라운지 /admin/lounge](/admin/lounge)" },
  { kw: ["대시보드", "관제", "관제탑", "orchestrator", "패널", "신호등", "펀넬"],
    a: "**관제탑(Control Tower)** — 전 에이전트를 자가점검·치유·경보하는 자동화 두뇌예요.\n\n- `GET /api/orchestrator`(현황) · `?heal=1`(인증·자가치유). 관리자 대시보드 🛰️ 관제 패널에 신호등으로 표시.\n- 조립라인 펀넬에서 각 단계 대기 수(어디서 막혔나)를 봅니다.\n- 바로가기: [운영 관제 /admin/org](/admin/org)" },
  { kw: ["라운지", "lounge"],
    a: "**🏛️ 전사 라운지** — 자율 조직이 함께 일하고 나누는 공간이에요(오늘 실행·성공률·본부·결재 대기 요약).\n\n바로가기: [/admin/lounge](/admin/lounge)" },
  { kw: ["구독", "사장님", "b2b", "유료", "요금", "결제"],
    a: "**B2B 사장님 구독** — 검증된 후기 기반 액션플랜·성격축, 쇼케이스(홍보) 등록을 제공합니다.\n\n현재 구독 게이트는 **관리자 전용**(SUBSCRIPTION_LIVE=off)으로 일반 공개 전 단계예요." },
  { kw: ["수집", "파이프라인", "warmup", "유튜브", "네이버", "판정", "임베딩", "resynth", "재합성"],
    a: "**데이터 파이프라인** (원본 → 화면)\n\n- **수집**: warmup(네이버 검색 후기) → `raw_reviews`에 원본 보존(재수집 없이 규칙만 바꿔 재처리·토큰 0).\n- **정제·합성**: synthStore·reviewQuality 규칙 필터.\n- **검증**: AI 판정(Haiku·새벽만) → 레드팀 결정론 검증 → 품질 감사.\n- **서빙**: 지도·추천·카페 상세 API." },
  { kw: ["추억", "mypin", "마이핀", "개인기록", "핀", "내카페"],
    a: "**MY PIN(내 카페 추억)** — 다녀온 카페를 ❤로 지도에 기록하는 개인 공간이에요.\n\n- 위치 인증 기반 · 추억 텍스트·사진·즐겨찾기 · **무가입·개인정보 0**.\n- 백업코드 · PDF/JSON 내보내기 · 공용 PC PIN 잠금." },
];
function answerKnowledge(q: string): string | null {
  const n = q.toLowerCase().replace(/\s+/g, "");
  if (n.length < 2) return null;
  for (const k of KNOW) if (k.kw.some((w) => n.includes(w))) return k.a;
  return null;
}

// 🗂 대화기록(chat_archive) — chat_queue는 24h만 보존(기존 그대로)하므로, purge 직전에 별도 저장소로 미리
//   복제해 대표님이 새 대화로 맥락을 리셋해도 /admin 대화기록 패널(읽기전용)에서 과거 지시·대화를 계속 열람할 수 있게 한다.
//   기존 chat_queue 흐름(질문 적재·폴링·삭제)은 전혀 바뀌지 않는다 — 순수 추가(mirror)일 뿐.
let lastPurgeAt = 0;
async function archiveThenPurge() {
  await sql`CREATE TABLE IF NOT EXISTS chat_archive (
    id SERIAL PRIMARY KEY, question TEXT, answer TEXT, mode TEXT, created_at TIMESTAMPTZ
  )`.catch(() => {});
  await sql`INSERT INTO chat_archive (question, answer, mode, created_at)
    SELECT question, answer, mode, created_at FROM chat_queue WHERE created_at < now()-interval '24 hours'`.catch(() => {});
  await sql`DELETE FROM chat_queue WHERE created_at < now()-interval '24 hours'`.catch(() => {}); // 24h 보존(기존 동작 그대로)
}

async function ensure() {
  // 💰 2026-08-20 전수 적용: 이 함수 일부는 메모 플래그조차 없어 **매 요청** DDL이 돌았다 — 배포 단위 1회로.
  await ensureOnce("admin_chat.ensure", async () => {
  await sql`CREATE TABLE IF NOT EXISTS chat_queue (
    id SERIAL PRIMARY KEY, question TEXT, history JSONB, status TEXT DEFAULT 'pending',
    answer TEXT, mode TEXT, created_at TIMESTAMPTZ DEFAULT now(), answered_at TIMESTAMPTZ
  )`.catch(() => {});
  // 🏷️ 답변 생성에 실제 사용된 모델(sonnet/opus/haiku) — 로컬 워커(chat-watch.mjs)가 실 호출 모델을 그대로 기록.
  //   결정론(quick)·보고성 메시지는 LLM을 안 써 NULL로 남는다(채팅 UI 배지는 값 있을 때만 표시 — 고정 텍스트 금지).
  await sql`ALTER TABLE chat_queue ADD COLUMN IF NOT EXISTS llm_model TEXT`.catch(() => {});
  await sql`CREATE TABLE IF NOT EXISTS work_orders (id SERIAL PRIMARY KEY, command TEXT, action TEXT, tier TEXT, created_at TIMESTAMPTZ DEFAULT now())`.catch(() => {}); // 챗봇 작업지시 감사
  });
  // ⚠️ 래핑 사고 수리: 아카이브는 스키마가 아니라 주기 업무로직 — 배포당 1회면 24h 보존이 멈춘다.
  //   반대로 예전(매 폴링 15초)은 과잉이었다 → 인스턴스당 1시간 게이트.
  if (Date.now() - lastPurgeAt > 60 * 60 * 1000) { lastPurgeAt = Date.now(); await archiveThenPurge(); }
}

export async function POST(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await ensure();
  try {
    const { message, history } = await req.json();
    if (!message || typeof message !== "string") return NextResponse.json({ ok: false, error: "no message" }, { status: 400 });
    const r = (await sql`INSERT INTO chat_queue (question, history) VALUES (${message.slice(0, 2000)}, ${JSON.stringify(Array.isArray(history) ? history.slice(-8) : [])}::jsonb) RETURNING id`) as any[];
    return NextResponse.json({ ok: true, id: r[0].id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 150) }, { status: 500 });
  }
}

// GET ?id= : 답 폴링 / GET : 24h 기록
export async function GET(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await ensure();
  // 🗺️ 지역 전용 모드 — 결정론 SQL 즉답(LLM 안 씀·$0). dong(동)·area(구/시) 매칭 집계.
  const region = req.nextUrl.searchParams.get("region");
  if (region !== null) {
    const q = region.trim().slice(0, 40);
    if (!q) return NextResponse.json({ ok: false, error: "지역명을 입력하세요" }, { status: 400 });
    // 📚 서비스/조직/관제/라운지 등 지식 질문이면 결정론 지식으로 즉답(SQL·LLM 안 씀).
    //   지역/카페명은 이 키워드를 포함하지 않으므로 정상적으로 아래 SQL 경로로 흐른다.
    const know = answerKnowledge(q);
    if (know) return NextResponse.json({ ok: true, kind: "knowledge", region: q, answer: know });
    const like = `%${q}%`;
    try {
      const a = (await sql`SELECT
        count(*) FILTER (WHERE published)::int pub,
        count(*) FILTER (WHERE published AND synth_grade='검증')::int verified,
        count(*) FILTER (WHERE published AND synth_grade='참고')::int ref,
        count(*) FILTER (WHERE NOT published)::int unpub,
        count(*)::int total,
        max(synth_updated) FILTER (WHERE published) last_pub,
        avg(lat) FILTER (WHERE published) clat, avg(lng) FILTER (WHERE published) clng
        FROM cafes WHERE dong LIKE ${like} OR area LIKE ${like}`)[0] as any;
      const names = ((await sql`SELECT name FROM cafes WHERE published AND (dong LIKE ${like} OR area LIKE ${like})
        ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT 8`) as any[]).map((r) => r.name);
      // 🔎 카페명 검색 — 지역(동/구)만 매칭하던 버그 수정: 카페 이름 일부로도 검색되게 한다.
      //   공개floor·오염게이트는 published가 이미 반영(발행된 카페만) → 그대로 유지.
      const cafes = ((await sql`SELECT id, name, area, dong, synth_grade FROM cafes
        WHERE published AND name LIKE ${like}
        ORDER BY (synth_grade='검증') DESC, synth_count DESC NULLS LAST LIMIT 8`) as any[])
        .map((r) => ({ id: r.id, name: r.name, area: r.area, dong: r.dong, grade: r.synth_grade }));
      // 대표 구/시(지도 링크용) — toGu가 area만 받아, 매칭 카페 중 최다 area로 지도를 건다(동·구·시 모두 안전).
      const gu = ((await sql`SELECT area FROM cafes WHERE published AND (dong LIKE ${like} OR area LIKE ${like})
        GROUP BY area ORDER BY count(*) DESC LIMIT 1`)[0] as any)?.area || q;
      // 질문이 동을 지목했으면 정확한 동名(지도 동 필터=정확일치라). 구/시 질문이면 매칭 없어 null.
      const dong = ((await sql`SELECT dong FROM cafes WHERE published AND dong LIKE ${like}
        GROUP BY dong ORDER BY count(*) DESC LIMIT 1`)[0] as any)?.dong || null;
      // 지도 센터링용 중심좌표 + 줌(동 매칭이면 촘촘히 15, 구/시면 13). 필터 안 걸고 이 지점으로만 이동.
      return NextResponse.json({ ok: true, region: q, pub: a.pub, verified: a.verified, ref: a.ref, unpub: a.unpub, total: a.total, last_pub: a.last_pub, gu, dong, clat: a.clat, clng: a.clng, cz: dong ? 15 : 13, names, cafes });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e).slice(0, 120) }, { status: 500 });
    }
  }
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const r = (await sql`SELECT status, answer, mode, llm_model FROM chat_queue WHERE id=${Number(id)}`.catch(() => [])) as any[];
    if (!r.length) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, status: r[0].status, answer: r[0].answer, mode: r[0].mode, llm_model: r[0].llm_model });
  }
  const rows = (await sql`SELECT question, answer, status, llm_model, to_char(created_at AT TIME ZONE 'Asia/Seoul','HH24:MI') t FROM chat_queue WHERE created_at > now()-interval '24 hours' ORDER BY id ASC LIMIT 100`.catch(() => [])) as any[];
  return NextResponse.json({ ok: true, history: rows });
}

// 대화기록 전체 삭제 (위젯 🗑) — 삭제 전 chat_archive로 먼저 복제해 별도 저장소(대화기록 패널)에서는 계속 열람 가능하게 한다.
export async function DELETE(req: NextRequest) {
  if (req.headers.get("x-admin-password") !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  await sql`CREATE TABLE IF NOT EXISTS chat_archive (
    id SERIAL PRIMARY KEY, question TEXT, answer TEXT, mode TEXT, created_at TIMESTAMPTZ
  )`.catch(() => {});
  await sql`INSERT INTO chat_archive (question, answer, mode, created_at)
    SELECT question, answer, mode, created_at FROM chat_queue`.catch(() => {});
  const r = (await sql`DELETE FROM chat_queue RETURNING id`.catch(() => [])) as any[];
  return NextResponse.json({ ok: true, deleted: r.length });
}
