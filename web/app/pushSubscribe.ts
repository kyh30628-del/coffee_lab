// 🔔 재방문 장치(2026-10-23) — 푸시 구독 신청 헬퍼. 북마크(즐겨찾기) 같은 **고의도 순간에만** 부른다.
//   PwaInstall.tsx의 dcn:install-hint와 같은 결 — 아무 때나 권한을 물으면 대부분 거절하고 다시는 안 뜬다.
//   ⚠️ 권한이 "이미 거절됨(denied)"이면 재요청하지 않는다(브라우저가 거부·사용자 경험 해침).

const DISMISS_KEY = "dcn_push_dismiss";
const DAY = 864e5;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushDismissedRecently(): boolean {
  try { return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now() - 30 * DAY; } catch { return false; }
}
export function dismissPush(): void {
  try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
}

/** 북마크 추가 같은 고의도 순간에 호출. 이미 거절/비활성이면 조용히 스킵. */
export async function maybeSubscribePush(deviceId: string): Promise<boolean> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!key) return false; // 운영키 미설정(설정 전까지 조용히 비활성)
    if (Notification.permission === "denied") return false;
    if (pushDismissedRecently()) return false;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return true; // 이미 구독 중
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { dismissPush(); return false; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer });
    await fetch("/api/push/subscribe", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device: deviceId, subscription: sub.toJSON() }),
    });
    return true;
  } catch { return false; }
}
