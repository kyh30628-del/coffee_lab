// 🔍 지도 화면 전수 스캔 — 줌·기울기·지역을 바꿔가며 운영 화면을 찍는다(3D 고도화 포인트 분석용).
import { createRequire } from 'node:module';
const { chromium } = createRequire('/Users/wangwida/game-project/node_modules/playwright/package.json'.replace('/node_modules/playwright/package.json','/package.json'))('playwright');
const out = '/private/tmp/claude-501/-Users-wangwida/9a58c62a-6d3c-4b68-9965-05b8ed577a27/scratchpad';
const BASE = process.argv[2] || 'https://dongnecoffeenote.com';
const TAG = process.argv[3] || 'SCAN';
const PROD = 'https://dongnecoffeenote.com';
const VIEWS = [
  { name: 'S1-nation-flat',      lat: 36.5,  lng: 127.9, z: 6.3,  pitch: 0,  bearing: 0 },
  { name: 'S2-seoul-metro',      lat: 37.55, lng: 126.98, z: 10.5, pitch: 38, bearing: -15 },
  { name: 'S3-gangnam-hood',     lat: 37.5205, lng: 127.0230, z: 14.6, pitch: 52, bearing: 20 },
  { name: 'S4-yeonnam-alley',    lat: 37.5623, lng: 126.9250, z: 16.8, pitch: 55, bearing: -30 },
  { name: 'S5-max-zoom',         lat: 37.5623, lng: 126.9250, z: 18.0, pitch: 60, bearing: 45 },
  { name: 'S6-hangang-bridge',   lat: 37.5185, lng: 126.9420, z: 15.2, pitch: 58, bearing: 100 },
  { name: 'S7-busan-coast',      lat: 35.1587, lng: 129.1604, z: 13.8, pitch: 50, bearing: -60 },
  { name: 'S8-seorak-3d',        lat: 38.12,  lng: 128.46, z: 11.2, pitch: 62, bearing: -30 },
  { name: 'S9-seoulforest-park', lat: 37.5445, lng: 127.0375, z: 16.2, pitch: 50, bearing: 15 },
];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ko-KR' })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
// 로컬 대상일 땐 /api/*를 운영 API로 프록시(로컬 Neon 미접촉) — device-matrix.mjs와 같은 규약
if (BASE.includes('localhost')) await p.route('**/api/**', async route => { const u = new URL(route.request().url()); try { const r = await fetch(PROD + u.pathname + u.search, { method: route.request().method(), headers: { accept: 'application/json', 'content-type': 'application/json' }, body: route.request().method() === 'POST' ? (route.request().postData() || '{}') : undefined }); await route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type') || 'application/json' } }); } catch { await route.fulfill({ status: 500, body: '{}' }); } });
await p.goto(BASE + '/?sido=%EC%84%9C%EC%9A%B8&tab=map', { waitUntil: 'load', timeout: 120000 }); await p.waitForTimeout(6000);
await p.evaluate(() => { const bt = [...document.querySelectorAll('button')].find(x => x.textContent.includes('다시 보지 않기')); if (bt) bt.click(); });
await p.evaluate(() => { window.__missing = []; window.__ml.on('styleimagemissing', e => window.__missing.push(e.id)); });
for (const v of VIEWS) {
  for (let i = 0; i < 4; i++) { await p.evaluate(v => window.__ml.jumpTo({ center: [v.lng, v.lat], zoom: v.z, pitch: v.pitch, bearing: v.bearing }), v); await p.waitForTimeout(3500); const c = await p.evaluate(() => { const c = window.__ml.getCenter(); return [c.lng, c.lat]; }); if (Math.abs(c[0]-v.lng)<0.02 && Math.abs(c[1]-v.lat)<0.02) break; }
  await p.waitForTimeout(7000);
  await p.evaluate(() => { const bt = [...document.querySelectorAll('button')].find(x => x.textContent.includes('다시 보지 않기')); if (bt) bt.click(); }); // 공지 모달이 늦게 뜨면 여기서 닫는다
  await p.waitForTimeout(500);
  await p.evaluate(() => new Promise(r => { const ml = window.__ml; if (ml.loaded && ml.loaded() && !ml.isMoving()) return r(); ml.once('idle', r); setTimeout(r, 8000); }));
  await p.screenshot({ path: `${out}/${TAG}-${v.name}.png` });
  const info = await p.evaluate(() => { const ml = window.__ml; const st = ml.getStyle(); const vis = id => { const l = ml.getLayer(id); return l ? (ml.getLayoutProperty(id, 'visibility') || 'visible') : '-'; };
    return { z: +ml.getZoom().toFixed(1), pitch: ml.getPitch(), terrain: !!ml.getTerrain(), ext: st.layers.filter(l => l.type === 'fill-extrusion' && (ml.getLayoutProperty(l.id,'visibility')||'visible')==='visible').map(l=>l.id).join(','), relief: vis('dcn-color-relief'), hill: vis('dcn-hillshade'), pins: document.querySelectorAll('.dcn-pin').length, clusters: document.querySelectorAll('.dcn-cluster-body').length,
      tex: ['dcn-fac-villa','dcn-lc-forest','dcn-rd-major','dcn-poi-subway'].filter(i => ml.hasImage(i)).length + '/4', roadTex: st.layers.filter(l => l.id.startsWith('dcn-tex-')).length,
      fac: JSON.stringify(ml.getPaintProperty('building-3d', 'fill-extrusion-pattern') || '').slice(44, 90), wood: JSON.stringify(ml.getPaintProperty('landcover_wood', 'fill-pattern') || '').slice(0, 40),
      poi: JSON.stringify(ml.getLayoutProperty('poi_r1', 'icon-image') || '').slice(0, 30), sky: !!ml.getSky?.(), missing: [...new Set(window.__missing || [])].slice(0, 6).join(',') }; });
  console.log(v.name, JSON.stringify(info));
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
