import { NextRequest, NextResponse } from "next/server";
import { sql , ensureOnce } from "@/lib/db";
import { hashPin } from "@/lib/pin";
export const runtime = "nodejs";

// 공용 PC 잠금 — 기기별 PIN(개인정보 아님, 익명 기기 식별자에 종속)
async function ensure() {
  await ensureOnce("my-cafe-pin.ddl", async () => {
    await sql`CREATE TABLE IF NOT EXISTS device_pins (
      device_id TEXT PRIMARY KEY,
      pin_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )`;
  });
}
const isPin = (p: any) => typeof p === "string" && /^\d{4,8}$/.test(p);

// GET ?device : PIN 설정 여부만 반환(해시·값은 노출 안 함)
export async function GET(req: NextRequest) {
  await ensure();
  const device = req.nextUrl.searchParams.get("device") || "";
  if (!device) return NextResponse.json({ ok: true, hasPin: false });
  const [row] = await sql`SELECT 1 FROM device_pins WHERE device_id = ${device} LIMIT 1` as any[];
  return NextResponse.json({ ok: true, hasPin: !!row });
}

// POST {device, action: set|verify|change|remove, pin, newPin}
export async function POST(req: NextRequest) {
  try {
    await ensure();
    const { device, action, pin, newPin } = await req.json();
    if (!device) return NextResponse.json({ ok: false, error: "device 필요" }, { status: 400 });
    const [row] = await sql`SELECT pin_hash FROM device_pins WHERE device_id = ${device} LIMIT 1` as any[];

    if (action === "set") {
      if (row) return NextResponse.json({ ok: false, error: "이미 PIN이 설정돼 있어요" }, { status: 409 });
      if (!isPin(pin)) return NextResponse.json({ ok: false, error: "PIN은 숫자 4~8자리예요" }, { status: 400 });
      await sql`INSERT INTO device_pins (device_id, pin_hash) VALUES (${device}, ${hashPin(device, pin)})`;
      return NextResponse.json({ ok: true });
    }

    if (action === "verify") {
      if (!row) return NextResponse.json({ ok: true, valid: true, hasPin: false }); // PIN 없으면 통과
      return NextResponse.json({ ok: true, valid: row.pin_hash === hashPin(device, pin || ""), hasPin: true });
    }

    if (action === "change") {
      if (!row) return NextResponse.json({ ok: false, error: "설정된 PIN이 없어요" }, { status: 404 });
      if (row.pin_hash !== hashPin(device, pin || "")) return NextResponse.json({ ok: false, error: "현재 PIN이 틀려요" }, { status: 403 });
      if (!isPin(newPin)) return NextResponse.json({ ok: false, error: "새 PIN은 숫자 4~8자리예요" }, { status: 400 });
      await sql`UPDATE device_pins SET pin_hash = ${hashPin(device, newPin)} WHERE device_id = ${device}`;
      return NextResponse.json({ ok: true });
    }

    if (action === "remove") {
      if (!row) return NextResponse.json({ ok: true }); // 이미 없음
      if (row.pin_hash !== hashPin(device, pin || "")) return NextResponse.json({ ok: false, error: "PIN이 틀려요" }, { status: 403 });
      await sql`DELETE FROM device_pins WHERE device_id = ${device}`;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "알 수 없는 action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
