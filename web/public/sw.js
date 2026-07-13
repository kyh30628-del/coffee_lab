// PWA 설치용 최소 서비스워커 — 캐시 전혀 안 함(네트워크 기본 동작 그대로).
// ⚠️ 데이터 캐시 절대 금지: 이 서비스는 '카페 데이터 항상 최신'이 불변 규칙(CLAUDE.md 5번).
//    캐시형 SW를 붙이면 옛 카페 데이터가 남아 always-fresh·캐시무효화 원칙과 정면충돌한다.
//    이 파일의 유일한 목적은 '설치 가능(installability)' 조건 충족(등록된 SW + fetch 핸들러 존재)뿐.
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });
// no-op fetch 핸들러 — respondWith를 호출하지 않으므로 브라우저 기본(네트워크)로 처리, 캐시 안 함.
self.addEventListener("fetch", () => {});
