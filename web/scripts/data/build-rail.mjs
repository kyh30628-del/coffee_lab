#!/usr/bin/env node
// 🚇 전국 철도 데이터 생성 — 도시철도·광역전철·일반/고속철도를 빠짐없이.
//
// 왜 만들었나(2026-09-12 CEO 지적 "수인선이 왜 없어"): public/data/stations.json은 6월에 손으로 만든
//   서울 중심 16개 노선(557역)짜리였고, 강원→충청→부산·경남→대구·경북을 여는 동안 한 번도 같이 안 고쳤다.
//   수인분당·경의중앙·공항철도는 물론 부산·대구·광주·대전 도시철도와 기차역 전부가 없었다.
// 출처: OpenStreetMap(Overpass) — 우리 지도 타일(OpenMapTiles)과 같은 원본이라 선로와 역이 정확히 겹친다. ODbL, 지도에 출처 표기 있음.
// 실행: node scripts/data/build-rail.mjs <overpass_dump_dir>   (덤프는 fetch-rail.sh가 받는다)
import fs from 'node:fs';
import path from 'node:path';

const SRC = process.argv[2];
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '../../public/data');
const load = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8')).elements || [];

// ── 노선 이름 정규화 ────────────────────────────────────────────────────────────
// OSM은 방향별로 관계가 나뉘어 있다("경의·중앙선: 문산 → 용문"). 방향 꼬리를 떼어 한 노선으로 묶는다.
const canon = (t) => {
  let n = (t['name:ko'] || t.name || t.ref || '').trim();
  n = n.replace(/\s*[:：].*$/, '').replace(/\s*\(.*\)\s*$/, '');            // ": A → B", "(부산역 행)"
  n = n.replace(/\s*(내선|외선)순환\s*$/, '');                                // 순환선 방향
  n = n.replace(/^KTX\s+(.+)$/, '$1 KTX').replace(/\s+/g, ' ').trim();       // "KTX 경부선" → "경부선 KTX"
  return n;
};
// 역 뱃지에 쓸 짧은 이름. 서울 N호선은 기존 규약("N호선")을 유지해 화면이 안 바뀐다.
const shortRef = (name, t) => {
  const net = t['network:ko'] || t.network || '';
  let m;
  if ((m = name.match(/^서울 (?:지하철|경전철) (\d+)호선/))) return `${m[1]}호선${/지선/.test(name) ? '지선' : ''}`;
  if ((m = name.match(/^(부산|대구|광주|대전|인천) 도시철도 (\d+)호선/))) return `${m[1]}${m[2]}`;
  if ((m = name.match(/(?:^|\s)(\d+)호선/)) && /수도권|서울/.test(net)) return `${m[1]}호선${/지선/.test(name) ? '지선' : ''}`;
  const FIX = {
    // 같은 노선이 OSM에 여러 이름으로 있다 — 하나로 접는다(분당선은 2020년 수인선과 직결·통합됐다).
    '수인·분당선': '수인분당', '수인분당선': '수인분당', '분당선': '수인분당', '수인선': '수인분당',
    '경의·중앙선': '경의중앙', '경의중앙선': '경의중앙', '경의선': '경의중앙', '중앙선 광역전철': '경의중앙',
    '인천국제공항철도': '공항철도', '공항철도': '공항철도', '인천국제공항선': '공항철도', '인천공항 자기부상철도': '자기부상',
    '용인경전철': '용인', '용인 경전철': '용인', '월미바다열차': '월미',
    '김포 골드라인': '김포', '부산김해경전철': '김해', '의정부경전철': '의정부', '용인경전철': '용인',
    '인천 도시철도 1호선': '인천1', '인천 도시철도 2호선': '인천2', '서울 경전철 신림선': '신림',
    '우이신설선': '우이신설', '서울 경전철 우이신설선': '우이신설', '동해선 광역전철': '동해선',
  };
  if (FIX[name]) return FIX[name];
  if (t.ref && /^(GTX)/.test(t.ref)) return t.ref;
  // 일반·고속철도: "경부선 KTX" → "경부선"(같은 선로를 여러 열차가 공유하므로 선로 이름으로 묶는다)
  //   ⚠️ '호선'이 통째로 잡히던 버그(2026-09-12): 수도권 전철 N호선이 전부 '호선' 하나로 뭉쳐 209역이 됐다.
  const line = name.replace(/\d+호선/g, '').match(/([가-힣]{2,}선)/);
  if (line && line[1] !== '호선') return line[1];
  return name.slice(0, 6);
};
// 도시철도/광역전철이 아닌 '열차 종별' 관계는 선로 이름으로 접는다(KTX·ITX·무궁화가 같은 선로를 공유).
const isIntercity = (t) => t.route === 'train' && t.service !== 'commuter';

// ── 1) 노선 모으기 ─────────────────────────────────────────────────────────────
const lines = new Map(); // key=shortRef → { ref, name, color, type, segs:[[ [lat,lng], ... ]], stops:[[lat,lng]] }
for (const type of ['subway', 'light_rail', 'monorail', 'tram', 'train']) {
  for (const r of load(`geom-${type}.json`)) {
    const t = r.tags || {}; if (!t.route) continue;
    const name = canon(t); if (!name) continue;
    const key = shortRef(name, t); if (!key) continue;
    let L = lines.get(key);
    if (!L) lines.set(key, (L = { ref: key, name, color: t.colour || null, type: isIntercity(t) ? 'rail' : type, segs: [], stops: [], ways: new Set() }));
    if (!L.color && t.colour) L.color = t.colour;
    if (L.name.length > name.length) L.name = name;                  // 더 짧은(=대표) 이름 채택
    for (const m of r.members || []) {
      if (m.type === 'way' && m.geometry) { if (L.ways.has(m.ref)) continue; L.ways.add(m.ref); L.segs.push(m.geometry.map((g) => [g.lat, g.lon])); }
      else if (m.type === 'node' && m.lat != null && /^stop/.test(m.role || '')) L.stops.push([m.lat, m.lon]);
    }
  }
}

// ── 1-b) 물리 선로 — 국가철도 전 노선(경부선·중앙선·영동선·장항선·정선선…) ──────────────
//   왜 필요한가(2026-09-12 실측): KTX/ITX 같은 '열차 종별' 관계는 주요 정차역만 싣고, 중앙선·영동선처럼
//   관계가 아예 없는 선로도 있다. 그래서 강릉·안동·포항·군산 등 기차역 132곳이 노선 없이 떠 있었다.
//   railway=rail + usage=main|branch + name 이 국가철도 노선의 사실상 단일 원장이다(전국 118개).
const RAIL_COLOR = '#7b6a57';                                  // 일반철도 공통색(도시철도 노선색과 구분되는 흙빛)
{
  const byName = new Map();
  for (const w of load('track.json')) {
    const t = w.tags || {}; const n = (t['name:ko'] || t.name || '').trim();
    if (!n || !w.geometry) continue;
    (byName.get(n) || byName.set(n, []).get(n)).push(w.geometry.map((g) => [g.lat, g.lon]));
  }
  for (const [n, ways] of byName) {
    // 같은 노선이 관계(도시철도 이름)와 선로(철도 이름)로 두 번 들어오는 것만 접는다.
    //   분당선·수인선은 2020년 직결로 한 노선(수인분당)이 됐다 — 수원역에 셋이 다 붙던 중복을 없앤다.
    // 차량기지·화물·연결선은 여객 노선이 아니다(역 근처를 지나 프록시로 붙어 뱃지만 더럽힌다).
    if (/기지선|화물|삼각선|연결선|출발선|직결선|객차|제철선|비행장선|행암선|항선|대불선|부전선|대전선|망우선|용산선|오송선|부산신항|양산|북평선|온산선|괴동선|미전선/.test(n)) continue;
    const ALIAS = { '분당선': '수인분당', '수인선': '수인분당', '경부본선': '경부선', '경부제2선': '경부선',
      '인천국제공항선': '공항철도', '수도권광역급행철도에이선': 'GTX-A', '월미바다열차': '월미', '과천선': '4호선', '안산선': '4호선', '일산선': '3호선' };
    const key = ALIAS[n] || (n.replace(/선$/, '') + '선');        // 이름 그대로가 곧 노선
    let L = lines.get(key);
    if (!L) lines.set(key, (L = { ref: key, name: n, color: RAIL_COLOR, type: 'rail', segs: [], stops: [], ways: new Set() }));
    // 복선은 상·하행이 별개 way로 그려져 있다 — 150m 격자로 이미 덮인 구간은 버려 파일이 두 배가 되지 않게.
    const cov = new Set(); const cell = (p) => `${Math.round(p[0] / 0.0015)}_${Math.round(p[1] / 0.0015)}`;
    for (const g of ways.sort((a, b) => b.length - a.length)) {
      let fresh = 0; for (const p of g) if (!cov.has(cell(p))) fresh++;
      if (fresh < Math.max(2, g.length * 0.25)) continue;         // 새로 덮는 구간이 1/4 미만이면 나란한 복선
      for (const p of g) cov.add(cell(p));
      L.segs.push(g);
    }
  }
}

// ── 1-c) 마지막 정리 — 관계와 선로 양쪽에서 들어온 같은 노선을 하나로, 여객 아닌 노선은 제외 ──
{
  const MERGE = { '분당선': '수인분당', '수인선': '수인분당', '인천국제공항': '공항철도', '인천국제공항선': '공항철도',
                  '수도권 전철 분당선': '수인분당', '경부본선': '경부선', '경부제2선': '경부선' };
  const DROP = /^(가야선|비행장선|.*기지선|.*화물.*|.*삼각선)$/;
  for (const [k, L] of [...lines]) {
    if (DROP.test(k)) { lines.delete(k); continue; }
    const t = MERGE[k]; if (!t || t === k) continue;
    const T = lines.get(t);
    if (!T) { lines.delete(k); L.ref = t; lines.set(t, L); continue; }
    for (const sg of L.segs) if (!T.ways.has(sg)) T.segs.push(sg);
    T.stops.push(...L.stops); lines.delete(k);
  }
}

// ── 2) 역 모으기 ───────────────────────────────────────────────────────────────
const stations = [];
for (const e of load('ov-stations.json')) {
  const t = e.tags || {}; if (!/^(station|halt)$/.test(t.railway || '')) continue;
  if (t.disused === 'yes' || t.abandoned === 'yes' || t.construction || t.proposed) continue;
  if (/^(disused|abandoned|construction|proposed|razed)/.test(t.railway)) continue;
  const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
  if (lat == null || lng == null) continue;
  const n = (t['name:ko'] || t.name || '').replace(/역$/, '').trim();       // 마커가 "…역"을 붙여 그린다
  if (!n) continue;
  // 레일바이크·관광모노레일 승강장·전망대·폐역은 철도역이 아니다(OSM에 railway=halt로 섞여 있다).
  if (/승강장|매표소|레일파크|레일바이크|모노레일|전망대|선착장|폐역|하트해변|환선굴|종점/.test(n)) continue;
  stations.push({ n, lat, lng, c: [], r: [], _k: `${n}|${lat.toFixed(3)}` });
}

// ── 3) 역 ↔ 노선 연결 — 노선의 정차 노드(stop)에서 가장 가까운 역에 붙인다(200m) ──
//   OSM 노선은 역 노드가 아니라 선로 위 stop_position을 참조해서, id 대조로는 안 붙는다(실측 88/6787).
const R = 6371000, rad = (d) => (d * Math.PI) / 180;
const dist = (a, b, c, d) => { const x = rad(c - a), y = rad(d - b); const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const grid = new Map(); const gk = (la, lo) => `${Math.round(la * 100)}_${Math.round(lo * 100)}`;
stations.forEach((s, i) => { const k = gk(s.lat, s.lng); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
const near = (la, lo) => { const out = []; const a = Math.round(la * 100), b = Math.round(lo * 100);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const x of grid.get(`${a + i}_${b + j}`) || []) out.push(x); return out; };
let attached = 0, orphanStops = 0;
for (const [key, L] of lines) {
  for (const [la, lo] of L.stops) {
    let best = -1, bd = 200;
    for (const i of near(la, lo)) { const d = dist(la, lo, stations[i].lat, stations[i].lng); if (d < bd) { bd = d; best = i; } }
    if (best < 0) { orphanStops++; continue; }
    const s = stations[best];
    if (!s.r.includes(key)) { s.r.push(key); s.c.push(L.color || '#5a6b7a'); attached++; }
  }
}
// 선로 근접 부착 — ① 정차 노드가 없는 노선(구형 매핑) ② **일반·고속철도 전부**.
//   KTX/ITX 관계는 주요 정차역만 stop으로 싣는다 → 김천·남원·영월 등 231개 기차역이 통째로 빠졌다(2026-09-12 실측).
for (const [key, L] of lines) {
  if (L.stops.length && L.type !== 'rail') continue;
  for (const seg of L.segs) for (const [la, lo] of seg) {
    for (const i of near(la, lo)) {
      if (dist(la, lo, stations[i].lat, stations[i].lng) > 100) continue;
      const s = stations[i]; if (!s.r.includes(key)) { s.r.push(key); s.c.push(L.color || '#5a6b7a'); attached++; }
    }
  }
}

// ── 4) 폴리라인 단순화(Douglas–Peucker) — 화면은 z11+에서만 그리므로 30m 오차는 안 보인다 ──
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const sq = (p, a, b) => { let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) { const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; } }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2; };
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const st = [[0, pts.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let mi = -1, md = tol * tol;
    for (let k = i + 1; k < j; k++) { const d = sq(pts[k], pts[i], pts[j]); if (d > md) { md = d; mi = k; } }
    if (mi > 0) { keep[mi] = true; st.push([i, mi], [mi, j]); } }
  return pts.filter((_, i) => keep[i]);
}
// 조각난 way를 **끝점끼리 이어 붙여** 긴 폴리라인으로 만든다 — 이걸 먼저 해야 단순화가 실제로 먹는다.
//   (경부선은 way가 1,455개로 잘려 있어, 조각마다 점이 몇 개뿐이라 Douglas–Peucker가 지울 게 없었다.)
function chain(segs) {
  const key = (p) => `${p[0].toFixed(5)}_${p[1].toFixed(5)}`;
  const ends = new Map(); const used = new Array(segs.length).fill(false);
  segs.forEach((s, i) => { for (const k of [key(s[0]), key(s[s.length - 1])]) (ends.get(k) || ends.set(k, []).get(k)).push(i); });
  const take = (k, self) => (ends.get(k) || []).find((i) => i !== self && !used[i]);
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = true;
    let line = segs[i].slice();
    for (let dir = 0; dir < 2; dir++) {                       // 뒤로 한 번, 앞으로 한 번 이어 붙인다
      for (;;) {
        const tail = line[line.length - 1]; const j = take(key(tail), -1);
        if (j == null) break;
        used[j] = true;
        const sg = segs[j];
        line = line.concat(key(sg[0]) === key(tail) ? sg.slice(1) : sg.slice(0, -1).reverse());
      }
      line.reverse();
    }
    out.push(line);
  }
  return out;
}
const TOL_URBAN = 0.0004, TOL_RAIL = 0.002;  // 약 40m / 200m — 선은 z11+에서만 그려 육안 차이 없음(용량 우선)
const round5 = (v) => Math.round(v * 1e4) / 1e4;   // 약 11m — 선 좌표엔 충분
// 여객 역이 하나도 없는 화물·전용선(광양제철선·부산신항선·기지선 등 56개)은 뺀다 — 화면에 의미가 없고 용량만 먹는다.
const usedRefs = new Set(); for (const s of stations) for (const r of s.r) usedRefs.add(r);
const linesOut = [];
for (const [key, L] of lines) {
  if (!usedRefs.has(key)) continue;
  const segs = chain(L.segs).map((s) => dp(s, L.type === 'rail' ? TOL_RAIL : TOL_URBAN).map(([a, b]) => [round5(a), round5(b)])).filter((s) => s.length > 1);
  if (!segs.length) continue;
  linesOut.push({ ref: key, name: L.name, color: L.color || '#5a6b7a', type: L.type, segs });
}
// 같은 선로를 공유하는 열차 종별이 여러 번 들어오면 세그먼트가 중복된다 — 동일 세그먼트 제거.
for (const L of linesOut) { const seen = new Set(); L.segs = L.segs.filter((s) => { const k = s.length + ':' + s[0] + s[s.length - 1]; if (seen.has(k)) return false; seen.add(k); return true; }); }

// 남은 역 구제 — 300m 안에서 가장 가까운 선로의 노선에 붙인다. 그래도 없으면 회색 '철도' 뱃지로 **남긴다**(CEO: 빠짐없이).
{
  const segIdx = [];
  for (const [key, L] of lines) for (const seg of L.segs) for (const p of seg) segIdx.push([p[0], p[1], key, L.color]);
  for (const s of stations) {
    if (s.r.length) continue;
    let bk = null, bc = null, bd = 700;
    for (const [la, lo, key, col] of segIdx) {
      if (Math.abs(la - s.lat) > 0.008 || Math.abs(lo - s.lng) > 0.010) continue;
      const d = dist(la, lo, s.lat, s.lng); if (d < bd) { bd = d; bk = key; bc = col; }
    }
    if (bk) { s.r.push(bk); s.c.push(bc || '#5a6b7a'); attached++; }
    else { s.r.push('철도'); s.c.push('#6b7684'); }
  }
}
const stationsOut = stations
  .map((s) => ({ n: s.n, lat: Math.round(s.lat * 1e5) / 1e5, lng: Math.round(s.lng * 1e5) / 1e5, c: s.c, r: s.r }))
  .sort((a, b) => (b.r.length - a.r.length) || a.n.localeCompare(b.n));  // 환승역 먼저(화면 상한 20개일 때 큰 역이 남게)

fs.writeFileSync(path.join(OUT, 'stations.json'), JSON.stringify(stationsOut));
fs.writeFileSync(path.join(OUT, 'lines.json'), JSON.stringify(linesOut.map((l) => ({ ref: l.ref, color: l.color, segs: l.segs }))));
fs.writeFileSync(path.join(OUT, 'rail-lines.meta.json'), JSON.stringify(linesOut.map((l) => ({ ref: l.ref, name: l.name, type: l.type, color: l.color, segs: l.segs.length, pts: l.segs.reduce((a, s) => a + s.length, 0) })), null, 1));

const kb = (f) => Math.round(fs.statSync(path.join(OUT, f)).size / 1024);
console.log(`노선 ${linesOut.length}개 · 역 ${stationsOut.length}개(노선 미연결 제외 ${stations.length - stationsOut.length}) · 정차점 미매칭 ${orphanStops}`);
console.log(`stations.json ${kb('stations.json')}KB · lines.json ${kb('lines.json')}KB`);
