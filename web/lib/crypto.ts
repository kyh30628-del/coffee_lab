import crypto from "crypto";

// 개인정보 앱 레벨 암호화(AES-256-GCM). 키는 PII_ENC_KEY(env)에만 — DB엔 암호문만 저장.
// DB가 통째로 유출돼도 키 없이는 복호화 불가.
const KEY = process.env.PII_ENC_KEY && /^[0-9a-fA-F]{64}$/.test(process.env.PII_ENC_KEY)
  ? Buffer.from(process.env.PII_ENC_KEY, "hex") : null;

export function encryptPII(text: string): string {
  if (!text) return text;
  if (!KEY) return text; // 키 미설정(개발) — 운영은 키 필수
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return "enc:" + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptPII(stored: string): string {
  if (!stored || !stored.startsWith("enc:")) return stored ?? "";
  if (!KEY) return "(암호화됨 — 키 필요)";
  try {
    const buf = Buffer.from(stored.slice(4), "base64");
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch { return "(복호화 실패)"; }
}
