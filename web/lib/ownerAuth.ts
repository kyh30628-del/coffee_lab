import { sql } from "./db";

// 사장님 권한 범위: "admin"=전체 접근(관리자/기존 owner pw), 숫자=해당 cafe_id만, null=권한 없음.
// 관리자 비밀번호(x-admin-password) 또는 활성 구독 PIN(x-owner-pin)으로 인증.
export async function ownerScope(req: { headers: { get: (k: string) => string | null } }): Promise<"admin" | number | null> {
  const pw = req.headers.get("x-admin-password");
  if (pw && pw === process.env.ADMIN_PASSWORD) return "admin";
  const pin = (req.headers.get("x-owner-pin") || "").trim().toUpperCase();
  if (pin.length >= 6) {
    try {
      const r = (await sql`SELECT cafe_id FROM subscriptions WHERE pin = ${pin} AND status = 'active'`)[0] as any;
      if (r?.cafe_id) return Number(r.cafe_id);
    } catch { /* 테이블 없을 수 있음 */ }
  }
  return null;
}
