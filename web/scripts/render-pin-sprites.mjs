#!/usr/bin/env node
// 🎨 3D 핀 에셋 렌더러 — three.js(게임 프로젝트 node_modules)를 헤드리스 Chromium(SwiftShader)에서 돌려
//   유광 세라믹 느낌의 3D 핀을 등급별 색으로 렌더 → public/pins/*.png (알파 배경, 192×240 @ 표시 48px 기준 4x).
//   비용 0(로컬 렌더·정적 파일 ~10KB/장). 다시 뽑을 때: node scripts/render-pin-sprites.mjs
//   Playwright·three 는 ~/game-project 에 있다(커피 프로젝트 의존성에 추가하지 않는다 — 빌드 크기 불변).
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
const req = createRequire("/Users/wangwida/game-project/package.json");
const { chromium } = req("playwright");
const THREE_FILE = "/Users/wangwida/game-project/node_modules/three/build/three.module.js";
const THREE_URL = "https://local.pins/three.module.js"; // about:blank 페이지는 file:// 모듈을 못 불러 → 라우트로 파일 내용을 공급
const OUT = new URL("../public/pins/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const VARIANTS = {
  verified: "#5f7355", ref: "#9c6b3f", cand: "#a8927a", feat: "#e3a52f", mine: "#d6336c", focus: "#b5703c",
};
const W = 192, H = 240;

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<canvas id="c" width="${W}" height="${H}"></canvas>
<script type="module">
window.__stage = "import";
import * as THREE from "${THREE_URL}";
window.__stage = "imported";
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(${W}, ${H}, false); renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(26, ${W}/${H}, 0.1, 100);
cam.position.set(0, 0.9, 7.2); cam.lookAt(0, -0.25, 0);
// 조명: 키(좌상 앞)·필(우측 약)·림(뒤 위) + 반구광
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b5240, 0.55));
const key = new THREE.DirectionalLight(0xfff4e0, 1.6); key.position.set(-2.4, 3.2, 3.5); scene.add(key);
const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5); fill.position.set(3, 0.6, 2.5); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 0.9); rim.position.set(0.8, 2.5, -3.5); scene.add(rim);
// 핀 형상: 구(머리) + 원뿔(꼬리) 을 라스(lathe) 프로필로 한 몸에 — 이음새 없이 매끈
function pinGeometry() {
  const pts = [];
  const R = 1.0, tipY = -2.05;
  // 위 반구 → 옆 → 아래로 갈수록 좁아지는 꼬리(부드러운 S 곡선)
  for (let i = 0; i <= 28; i++) { const a = Math.PI * 0.5 - (i / 28) * Math.PI * 0.62; pts.push(new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R)); }
  const last = pts[pts.length - 1];
  for (let i = 1; i <= 22; i++) { const t = i / 22; const y = last.y + (tipY - last.y) * t; const r = last.x * Math.pow(1 - t, 0.78) * (1 - 0.05 * t); pts.push(new THREE.Vector2(Math.max(0.001, r), y)); }
  pts.push(new THREE.Vector2(0, tipY - 0.01));
  pts.reverse(); // Lathe는 아래→위 순서여야 바깥 방향 법선(위→아래면 안팎이 뒤집혀 외곽선 셸이 본체를 덮음)
  const g = new THREE.LatheGeometry(pts, 96); g.computeVertexNormals(); return g;
}
const geo = pinGeometry();
const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.04, clearcoat: 0.75, clearcoatRoughness: 0.18, sheen: 0.15, sheenColor: 0xffffff }));
scene.add(body);
// 앞면 오목 원판(글리프 자리) — 본체보다 살짝 어둡게 눌린 느낌
const dimple = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 }));
dimple.position.set(0, 0.08, 0.95); scene.add(dimple);
const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 16, 96), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 0.8 }));
rimRing.position.set(0, 0.08, 0.955); scene.add(rimRing);
// 흰 테두리(핀 외곽선) — 지도 위에서 분리감
const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xfdfaf4, side: THREE.BackSide }));
outline.scale.set(1.075, 1.06, 1.075); scene.add(outline);
// 🟤 클러스터 받침(퍽) — 짧은 원기둥에 모따기, 위에서 35° 내려다본 시점. 뭉치 숫자·검증비율 링은 CSS가 그 위에 얹는다.
const puckGroup = new THREE.Group();
{
  const prof = [];
  const R = 1.0, h = 0.34, bev = 0.12;
  prof.push(new THREE.Vector2(0, -h)); prof.push(new THREE.Vector2(R - bev, -h));
  for (let i = 1; i <= 8; i++) { const a = -Math.PI/2 + (i/8) * (Math.PI/2); prof.push(new THREE.Vector2(R - bev + Math.cos(a) * bev, -h + bev + Math.sin(a) * bev)); }
  prof.push(new THREE.Vector2(R, h - bev));
  for (let i = 1; i <= 8; i++) { const a = (i/8) * (Math.PI/2); prof.push(new THREE.Vector2(R - bev + Math.cos(a) * bev, h - bev + Math.sin(a) * bev)); }
  prof.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(prof, 128); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0x5a3a22, roughness: 0.38, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
  puckGroup.add(m);
  const rimW = new THREE.Mesh(new THREE.TorusGeometry(R - 0.02, 0.05, 16, 128), new THREE.MeshPhysicalMaterial({ color: 0xfdfaf4, roughness: 0.3, clearcoat: 0.7 }));
  rimW.rotation.x = Math.PI / 2; rimW.position.y = h - 0.02; puckGroup.add(rimW);
  puckGroup.visible = false; scene.add(puckGroup);
}
const pinMeshes = [body, dimple, rimRing, outline];
window.renderPuck = (hex, tilt = 1.12) => {
  pinMeshes.forEach((m) => (m.visible = false)); puckGroup.visible = true;
  puckGroup.children[0].material.color.set(hex);
  const sz = Math.min(${W}, ${H}); renderer.setSize(sz, sz, false); cam.aspect = 1; cam.updateProjectionMatrix();
  cam.position.set(0, Math.sin(tilt) * 6.2, Math.cos(tilt) * 6.2); cam.lookAt(0, 0, 0);
  renderer.render(scene, cam);
  const url = canvas.toDataURL("image/png");
  pinMeshes.forEach((m) => (m.visible = true)); puckGroup.visible = false;
  renderer.setSize(${W}, ${H}, false); cam.aspect = ${W}/${H}; cam.updateProjectionMatrix(); cam.position.set(0, 0.9, 7.2); cam.lookAt(0, -0.25, 0);
  return url;
};
window.renderVariant = (hex) => {
  const c = new THREE.Color(hex);
  body.material.color.copy(c);
  const dark = c.clone().multiplyScalar(0.86); dimple.material.color.copy(dark);
  rimRing.material.color.copy(c.clone().lerp(new THREE.Color(0xffffff), 0.55));
  renderer.render(scene, cam);
  return canvas.toDataURL("image/png");
};
window.__ready = true;
</script></body></html>`;

const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--allow-file-access-from-files"] });
const p = await b.newPage();
const THREE_DIR = THREE_FILE.replace(/\/[^/]+$/, "/");
await p.route("https://local.pins/**", (route) => { const f = new URL(route.request().url()).pathname.replace(/^\//, ""); try { route.fulfill({ status: 200, contentType: "application/javascript", body: readFileSync(THREE_DIR + f, "utf8") }); } catch { route.fulfill({ status: 404, body: "" }); } }); // three.module.js → ./three.core.js 등 상대 import까지 공급
p.on("pageerror", (e) => console.error("PAGEERR", e.message));
p.on("console", (m) => console.error("CONSOLE[" + m.type() + "]", m.text().slice(0, 200)));
p.on("requestfailed", (r) => console.error("REQFAIL", r.url(), r.failure()?.errorText));
await p.setContent(html, { waitUntil: "load" });
try { await p.waitForFunction(() => window.__ready === true, null, { timeout: 20000 }); } catch { console.error("stage:", await p.evaluate(() => window.__stage)); process.exit(1); }
let total = 0;
for (const [name, hex] of Object.entries(VARIANTS)) {
  const dataUrl = await p.evaluate((h) => window.renderVariant(h), hex);
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(`${OUT}pin-${name}.png`, buf);
  total += buf.length;
  console.log(`pin-${name}.png ${(buf.length / 1024).toFixed(1)}KB`);
}
for (const [name, hex] of Object.entries({ puck: "#5a3a22", "puck-match": "#b8722c" })) {
  const dataUrl = await p.evaluate((h) => window.renderPuck(h), hex);
  const buf = Buffer.from(dataUrl.split(",")[1], "base64");
  writeFileSync(`${OUT}${name}.png`, buf); total += buf.length;
  console.log(`${name}.png ${(buf.length / 1024).toFixed(1)}KB`);
}
console.log(`total ${(total / 1024).toFixed(1)}KB → ${OUT}`);
await b.close();
