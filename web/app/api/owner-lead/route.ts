import { NextRequest, NextResponse } from "next/server";
import { sql, ensureOnce } from "@/lib/db";
import { encryptPII } from "@/lib/crypto";
import crypto from "crypto";

export const runtime = "nodejs";

// 📧 사장님 이메일 리드 수집(2026-08-27 CEO 승인, 수익화 4순위).
//   무료 리포트를 본 사장님이 이메일을 남기면 **월 1회** 가게 요약(순위·검증 후기 수)을 보낸다.
//   유료(매일 감시·즉시 알림·약점 처방)와 급을 나눈 무료 라이트 — 결제 전 단계의 연락처 자산.
//   발송은 lib/ownerWatch.runOwnerLeadDigest(매월 1일, cron-billing에 편승 — 새 크론 0).
//
// 🔐 이메일 = 개인정보 → subscriptions와 동일하게 encryptPII로 암호화 저장.
//   중복·수신거부 대조용으로는 **해시**(email_hash)만 쓴다 — 평문 인덱스를 만들지 않는다.
// 💰 남용 방어: 입력 검증 + (cafe,email) 중복 차단 + anon당 하루 3건 상한. 테이블은 작다.

const emailHash = (e: string) => crypto.createHash("sha256").update(e.toLowerCase().trim()).digest("hex");

export async function POST(req: NextRequest) {
  try {
    await ensureOnce("ownerLead.ddl", async () => {
      await sql`CREATE TABLE IF NOT EXISTS owner_leads (
        id BIGSERIAL PRIMARY KEY,
        cafe_id INT NOT NULL,
        email TEXT NOT NULL,          -- encryptPII 암호문
        email_hash TEXT NOT NULL,     -- 중복·수신거부 대조용(sha256)
        anon_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_sent_at TIMESTAMPTZ,
        UNIQUE (cafe_id, email_hash)
      )`;
    });

    const b = await req.json().catch(() => ({}));
    const cafeId = Number(b.cafeId);
    const email = String(b.email ?? "").trim().toLowerCase();
    const anonId = String(b.anonId ?? "").slice(0, 64);

    if (!Number.isFinite(cafeId) || cafeId <= 0) return NextResponse.json({ ok: false, error: "잘못된 요청" }, { status: 400 });
    // 이메일 형식 — 과한 정규식 대신 실용 검증(@ 1개 + 도메인 점).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254)
      return NextResponse.json({ ok: false, error: "이메일 형식을 확인해 주세요" }, { status: 400 });

    const cafe = (await sql`SELECT id FROM cafes WHERE id=${cafeId} AND published=true LIMIT 1`)[0];
    if (!cafe) return NextResponse.json({ ok: false, error: "카페를 찾을 수 없어요" }, { status: 404 });

    // 남용 상한 — 같은 익명ID가 하루 3건 넘게 등록하면 차단(스크립트 방어).
    if (anonId) {
      const [{ n }] = (await sql`SELECT count(*)::int n FROM owner_leads
        WHERE anon_id=${anonId} AND created_at > now() - interval '1 day'`) as any[];
      if (n >= 3) return NextResponse.json({ ok: false, error: "잠시 후 다시 시도해 주세요" }, { status: 429 });
    }

    const hash = emailHash(email);
    // 수신거부 이력이 있으면 조용히 성공 처리(재구독 강요 안 함) — newsletter_optout은 평문 이메일 키.
    const opted = (await sql`SELECT 1 FROM newsletter_optout WHERE email=${email} LIMIT 1`).length > 0;
    if (!opted) {
      await sql`INSERT INTO owner_leads (cafe_id, email, email_hash, anon_id)
        VALUES (${cafeId}, ${encryptPII(email)}, ${hash}, ${anonId || null})
        ON CONFLICT (cafe_id, email_hash) DO NOTHING`;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "일시적 오류" }, { status: 500 });
  }
}
