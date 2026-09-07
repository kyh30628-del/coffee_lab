// 📱 기기 매트릭스 검증 — WebKit(아이폰/아이패드 Safari 엔진)·Chromium(안드로이드) 에뮬레이션으로 지도 핵심 플로우 실행
// 실행: node scripts/qa/device-matrix.mjs [https://dongnecoffeenote.com|http://localhost:3100] [iPhone13-Safari,...]
//   Playwright(chromium·webkit)는 ~/game-project/node_modules 것을 빌려 쓴다(커피 프로젝트 의존성·빌드 불변). 로컬 대상일 땐 /api/*를 운영 API로 프록시(로컬 Neon 미접촉).
import { createRequire } from 'node:module';
const { chromium, webkit, devices } = createRequire('/Users/wangwida/game-project/package.json')('playwright');
const out = '/private/tmp/claude-501/-Users-wangwida/9a58c62a-6d3c-4b68-9965-05b8ed577a27/scratchpad';
const PROD = 'https://dongnecoffeenote.com';
const BASE = process.argv[2] || 'http://localhost:3111';
const ONLY = (process.argv[3]||'').split(',').filter(Boolean);
const MATRIX0 = [
  { name: 'iPhone13-Safari', engine: 'webkit', dev: devices['iPhone 13'] },
  { name: 'iPhone15ProMax-Safari', engine: 'webkit', dev: devices['iPhone 15 Pro Max'] },
  { name: 'iPadMini-Safari', engine: 'webkit', dev: devices['iPad Mini'] },
  { name: 'Pixel7-Chrome', engine: 'chromium', dev: devices['Pixel 7'] },
  { name: 'GalaxyS9-Chrome', engine: 'chromium', dev: devices['Galaxy S9+'] },
  { name: 'MacSafari-1440', engine: 'webkit', dev: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
];
const MATRIX = ONLY.length ? MATRIX0.filter(m => ONLY.includes(m.name)) : MATRIX0;
const results = [];
for (const m of MATRIX) {
  const errs = [];
  const launcher = m.engine === 'webkit' ? webkit : chromium;
  const b = await launcher.launch(m.engine === 'chromium' ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } : {});
  const ctx = await b.newContext({ ...m.dev, locale: 'ko-KR' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 160)));
  p.on('console', c => { if (c.type() === 'error' && !/405|Failed to load resource|could not be loaded|styleimagemissing/.test(c.text())) errs.push('CONSOLE ' + c.text().slice(0, 160)); });
  if (BASE.includes('localhost')) await p.route('**/api/**', async route => { const u = new URL(route.request().url()); try { const r = await fetch(PROD + u.pathname + u.search, { method: route.request().method(), headers: { accept: 'application/json', 'content-type': 'application/json' }, body: route.request().method() === 'POST' ? (route.request().postData() || '{}') : undefined }); await route.fulfill({ status: r.status, body: Buffer.from(await r.arrayBuffer()), headers: { 'content-type': r.headers.get('content-type') || 'application/json' } }); } catch { await route.fulfill({ status: 500, body: '{}' }); } });
  const dismiss = () => p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('다시 보지 않기')); if (b) b.click(); });
  const st = () => p.evaluate(() => { const ml = window.__ml; let canvasOk = false; try { const c = document.querySelector('.maplibregl-canvas'); canvasOk = !!c && c.width > 0; } catch {} return { ml: !!ml, styleLoaded: !!(ml && ml.isStyleLoaded && ml.isStyleLoaded()), canvasOk, pins: document.querySelectorAll('.dcn-pin:not(.dcn-pin-mini)').length, clusters: document.querySelectorAll('.dcn-cluster').length, region: document.querySelectorAll('.dcn-region-pin').length, z: ml ? +(ml.getZoom() + 1).toFixed(1) : null, pitch: ml ? +ml.getPitch().toFixed(0) : null, sel: document.querySelector('.dcn-sel .dcn-lbl')?.textContent || null, mapErr: /지도를 그릴 수 없는/.test(document.body.innerText), mapH: document.querySelector('.maplibregl-canvas')?.getBoundingClientRect().height | 0, vh: window.innerHeight }; });
  const r = { name: m.name, engine: m.engine, steps: {} };
  try {
    await p.goto(BASE + '/?sido=%EC%84%9C%EC%9A%B8&tab=map', { waitUntil: 'load', timeout: 120000 });
    await p.waitForTimeout(7000); await dismiss(); await p.waitForTimeout(1000);
    r.steps.load = await st();
    await p.screenshot({ path: `${out}/DEV-${m.name}-1.png` });
    // 서울 → 마포구(지역핀) → 첫 동 → 카페 레벨
    await p.evaluate(() => { const e = [...document.querySelectorAll('.dcn-region-pin')].find(x => x.textContent.includes('마포구')); e && e.closest('.dcn-mk').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await p.waitForTimeout(2500); await dismiss();
    await p.evaluate(() => { const e = document.querySelector('.dcn-region-pin'); e && e.closest('.dcn-mk').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await p.waitForTimeout(3500); await dismiss();
    r.steps.cafeLevel = await st();
    await p.screenshot({ path: `${out}/DEV-${m.name}-2.png` });
    // 화면 안 핀을 진짜 터치/클릭
    const mobile = !!m.dev.isMobile;
    // 후보 = 화면 안 + 그 지점의 최상위 요소가 '그 핀'인 것(뭉치·라벨에 덮인 핀은 제외 — Mac Safari 실측에서 뭉치가 덮은 핀을 눌러 오탐)
    const findCand = () => p.evaluate(() => [...document.querySelectorAll('.dcn-pin:not(.dcn-pin-mini) .dcn-pin-body')].map(e => { const b = e.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height * 0.4; const h = document.elementFromPoint(x, y); return h && e.contains(h) ? [x, y] : null; }).filter(c => c && c[1] > 130 && c[1] < window.innerHeight * 0.42 && c[0] > 90 && c[0] < window.innerWidth - 90)[0] || null);
    let cand = await findCand();
    if (!cand) { // 화면 안에 단독 핀이 없으면 뭉치를 탭해 줌인 후 다시
      const cc = await p.evaluate(() => [...document.querySelectorAll('.dcn-cluster-body')].map(e => { const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }).filter(([x, y]) => y > 130 && y < window.innerHeight * 0.42 && x > 90 && x < window.innerWidth - 90)[0] || null);
      if (cc) { if (mobile && m.dev.hasTouch) await p.touchscreen.tap(cc[0], cc[1]); else await p.mouse.click(cc[0], cc[1]); await p.waitForTimeout(2500); await dismiss(); r.steps.clusterTap = { cc, ...(await st()) }; cand = await findCand(); }
    }
    if (cand) { if (mobile && m.dev.hasTouch) await p.touchscreen.tap(cand[0], cand[1]); else await p.mouse.click(cand[0], cand[1]); await p.waitForTimeout(1800); }
    if (cand && !(await st()).sel) { if (mobile && m.dev.hasTouch) await p.touchscreen.tap(cand[0], cand[1]); else await p.mouse.click(cand[0], cand[1]); await p.waitForTimeout(1500); r.steps.retry = { tap2: (await st()).sel }; if (!r.steps.retry.tap2) { await p.mouse.click(cand[0], cand[1]); await p.waitForTimeout(1500); r.steps.retry.mouse = (await st()).sel; } }
    if (cand) r.steps.hit = await p.evaluate(([x,y]) => { const el = document.elementFromPoint(x,y); return el ? (el.tagName + '.' + String(el.className).slice(0,40) + (el.closest('.dcn-mk') ? ' IN-MK' : ' NOT-MK')) : null; }, cand);
    r.steps.afterTap = { cand, ...(await st()), panel: /길찾기/.test(await p.evaluate(() => document.body.innerText)) };
    await p.screenshot({ path: `${out}/DEV-${m.name}-3.png` });
  } catch (e) { r.error = e.message.slice(0, 200); }
  r.errs = errs.slice(0, 5);
  results.push(r);
  console.log(JSON.stringify(r));
  await b.close();
}
console.log('SUMMARY');
for (const r of results) { const a = r.steps.afterTap || {}; console.log(`${r.name.padEnd(24)} load:${r.steps.load?.ml && r.steps.load?.canvasOk ? 'OK' : 'FAIL'} cafe:${r.steps.cafeLevel?.pins ?? '-'}p/${r.steps.cafeLevel?.clusters ?? '-'}c z${r.steps.cafeLevel?.z} pitch${r.steps.cafeLevel?.pitch} tap:${a.sel ? 'SEL' : 'none'} panel:${a.panel} errs:${r.errs.length}${r.error ? ' ERROR:' + r.error : ''} cand:${JSON.stringify(a.cand)} clusterTap:${r.steps.clusterTap ? 'z'+r.steps.clusterTap.z : '-'} hit:${r.steps.hit} retry:${JSON.stringify(r.steps.retry)}`); if (r.errs.length) console.log('   ', r.errs.join(' || ')); }
