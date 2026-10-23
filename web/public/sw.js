// PWA 설치용 최소 서비스워커 — 캐시 전혀 안 함(네트워크 기본 동작 그대로).
// ⚠️ 데이터 캐시 절대 금지: 이 서비스는 '카페 데이터 항상 최신'이 불변 규칙(CLAUDE.md 5번).
//    캐시형 SW를 붙이면 옛 카페 데이터가 남아 always-fresh·캐시무효화 원칙과 정면충돌한다.
//    이 파일의 유일한 목적은 '설치 가능(installability)' 조건 충족(등록된 SW + fetch 핸들러 존재)뿐.
self.addEventListener("install", () => { self.skipWaiting(); });

// 🧹 2026-09-13 (CEO "옛 캐시는 지워") — 활성화될 때마다 **이 출처의 Cache Storage를 전부 비운다.**
//   왜 필요한가: 우리가 지금 캐시를 안 쓴다고 해서 사용자 기기에 남은 캐시가 사라지지는 않는다.
//   과거 버전·확장·다른 도구가 넣어둔 항목이 있으면 그대로 남아 옛 화면·옛 데이터를 되살릴 수 있다.
//   비우는 건 안전하다 — 우리는 캐시에서 읽는 코드가 한 줄도 없으므로 잃을 게 없고, 다음 요청은 전부 네트워크로 간다.
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* Cache Storage 미지원·차단 환경에서도 활성화는 계속된다 */ }
    await self.clients.claim();
  })());
});
// no-op fetch 핸들러 — respondWith를 호출하지 않으므로 브라우저 기본(네트워크)로 처리, 캐시 안 함.
self.addEventListener("fetch", () => {});

// 🔔 재방문 장치(2026-10-23) — 찜한 카페에 새 소식이 생기면 푸시로 알린다.
//   payload는 JSON { title, body, url }. 캐시와 무관(이 파일 상단 규칙 위반 아님) — 알림 표시만 한다.
self.addEventListener("push", (e) => {
  let data = { title: "동네 커피 노트", body: "새 소식이 있어요", url: "/" };
  try { if (e.data) data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url },
    tag: "dcn-push", // 같은 태그면 중복 알림이 쌓이지 않고 최신 것으로 교체된다.
  }));
});

// 알림 클릭 — 이미 열려 있으면 그 탭을 포커스, 없으면 새로 연다.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const hit = all.find((c) => c.url.includes(self.location.origin));
    if (hit) { hit.focus(); hit.navigate(url); } else { await self.clients.openWindow(url); }
  })());
});
