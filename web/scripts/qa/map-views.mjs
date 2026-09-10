// 🗺️ 지도 시각 비교용 스크린샷 — 바다·산(강릉), 호수(춘천 의암호), 강(한강 여의도) 3뷰. 전/후 비교에 쓴다.
// 실행: node scripts/qa/map-views.mjs <base-url> <tag>   (Playwright는 ~/game-project 것을 빌린다)
import { createRequire } from 'node:module';
const { chromium } = createRequire('/Users/wangwida/game-project/package.json')('playwright');
const out = '/private/tmp/claude-501/-Users-wangwida/9a58c62a-6d3c-4b68-9965-05b8ed577a27/scratchpad';
const BASE = process.argv[2] || 'https://dongnecoffeenote.com';
const TAG = process.argv[3] || 'before';
const VIEWS = [
  { name: 'gangneung-sea-mtn', lat: 37.79, lng: 128.85, z: 11.2, pitch: 45, bearing: -20 },
  { name: 'chuncheon-lake',    lat: 37.87, lng: 127.70, z: 12.0, pitch: 40, bearing: 0 },
  { name: 'hangang-river',     lat: 37.53, lng: 126.93, z: 13.0, pitch: 40, bearing: 10 },
  { name: 'seorak-peaks',      lat: 38.12, lng: 128.46, z: 10.6, pitch: 50, bearing: -30 },
];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'ko-KR' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
if (BASE.includes('localhost')) await p.route('**/api/**', async route => { const u = new URL(route.request().url()); try { const r = await fetch('https://dongnecoffeenote.com' + u.pathname + u.search); route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || 'application/json' }, body: Buffer.from(await r.arrayBuffer()) }); } catch { route.abort(); } });
await p.goto(BASE + '/?sido=%EC%84%9C%EC%9A%B8&tab=map', { waitUntil: 'load', timeout: 120000 });
await p.waitForTimeout(6000);
await p.evaluate(() => { const bt = [...document.querySelectorAll('button')].find(x => x.textContent.includes('다시 보지 않기')); if (bt) bt.click(); });
for (const v of VIEWS) {
  // 앱의 지역 맞춤(fitBounds)이 뒤늦게 덮어쓰는 경합 → 중심이 맞을 때까지 최대 4번 다시 점프
  for (let i = 0; i < 4; i++) {
    await p.evaluate(v => { const ml = window.__ml; ml.jumpTo({ center: [v.lng, v.lat], zoom: v.z, pitch: v.pitch, bearing: v.bearing }); }, v);
    await p.waitForTimeout(4000);
    const c = await p.evaluate(() => { const c = window.__ml.getCenter(); return [c.lng, c.lat]; });
    if (Math.abs(c[0] - v.lng) < 0.02 && Math.abs(c[1] - v.lat) < 0.02) break;
  }
  await p.waitForTimeout(6000);
  await p.evaluate(() => new Promise(r => { const ml = window.__ml; if (ml.loaded && ml.loaded() && !ml.isMoving()) return r(); ml.once('idle', r); setTimeout(r, 8000); }));
  await p.screenshot({ path: `${out}/MAP-${TAG}-${v.name}.png` });
  const info = await p.evaluate(() => { const ml = window.__ml; const st = ml.getStyle(); return { z: +ml.getZoom().toFixed(2), terrain: !!ml.getTerrain(), relief: !!ml.getLayer('dcn-color-relief'), hill: !!ml.getLayer('dcn-hillshade'), imgs: (ml.listImages ? ml.listImages() : []).filter(i => i.startsWith('dcn-')).length, layers: st.layers.length }; });
  console.log(v.name, JSON.stringify(info));
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
