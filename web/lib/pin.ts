import { createHash } from "crypto";

// 공용 PC 잠금용 PIN 해시. 기기 식별자를 섞어 같은 PIN이라도 기기마다 다른 해시.
// (4자리 로컬 잠금 수준의 보호 — 민감 결제정보 아님)
const SALT = "dcn_pin_v1_8f3a2c";

export function hashPin(device: string, pin: string): string {
  return createHash("sha256").update(`${device}:${pin}:${SALT}`).digest("hex");
}
