// 🗺️ MapLibre GL 어댑터 — page.tsx의 지도 로직이 Leaflet API 모양(L.marker/layerGroup/polyline/circle, map.getZoom/getBounds/project/flyTo…)으로
//   짜여 있어, 그 표면만 그대로 흉내 내고 안은 MapLibre로 돌린다(2026-09-07 Leaflet 제거·3D 전환).
//   ⚠️ 줌 규약: 이 어댑터가 주고받는 줌은 전부 **Leaflet 기준(256px 타일)** 이다. MapLibre(512px 타일)는 같은 화면이 줌 1 작으므로
//      안에서 ±1 변환한다. page.tsx의 z≥13 같은 임계값·SIDO_CENTER 줌·딥링크 cz가 전부 그대로 유효하다.
import type maplibregl from "maplibre-gl";

export type LatLngTuple = [number, number];
type GL = typeof maplibregl;

export class LB {
  constructor(public s: number, public w: number, public n: number, public e: number) {}
  contains(p: LatLngTuple): boolean { return p[0] >= this.s && p[0] <= this.n && p[1] >= this.w && p[1] <= this.e; }
  pad(f: number): LB { const dh = (this.n - this.s) * f, dw = (this.e - this.w) * f; return new LB(this.s - dh, this.w - dw, this.n + dh, this.e + dw); }
  getSouth() { return this.s; } getNorth() { return this.n; } getWest() { return this.w; } getEast() { return this.e; }
  static of(pts: LatLngTuple[]): LB {
    let s = 90, n = -90, w = 180, e = -180;
    for (const [la, lo] of pts) { if (la < s) s = la; if (la > n) n = la; if (lo < w) w = lo; if (lo > e) e = lo; }
    return new LB(s, w, n, e);
  }
}

/** Leaflet의 map.project(latlng, zoom)과 동일한 절대 월드 픽셀(256px 타일 기준). 클러스터 셀이 팬에 흔들리지 않게 절대 좌표를 쓴다. */
export function worldPx(lat: number, lng: number, zLeaflet: number): { x: number; y: number } {
  const s = 256 * Math.pow(2, zLeaflet);
  const x = ((lng + 180) / 360) * s;
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((lat * Math.PI) / 180)));
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s;
  return { x, y };
}

const ZOFF = 1; // Leaflet 줌 = MapLibre 줌 + 1

type LineFeat = { kind: "line"; coords: [number, number][]; color: string; weight: number; opacity: number };
type CircleFeat = { kind: "circle"; lat: number; lng: number; radius: number; color: string; weight: number; fillColor: string; fillOpacity: number };
type Item = MarkerA | LayerGroupA | LineFeat | CircleFeat;

export class MarkerA {
  el: HTMLDivElement;
  mk: maplibregl.Marker;
  private popupHtml: string | null = null;
  private popup: maplibregl.Popup | null = null;
  private gl: GL;
  private ml: maplibregl.Map | null = null;
  constructor(gl: GL, latlng: LatLngTuple, opts: { html: string; zIndexOffset?: number; interactive?: boolean }) {
    this.gl = gl;
    const el = document.createElement("div");
    // 0×0 앵커 + overflow visible: 자식 HTML이 translate(-50%,-100%) 등으로 스스로 자리를 잡는다(Leaflet divIcon iconSize [0,0]과 동일 규약).
    el.className = "dcn-mk" + (opts.interactive === false ? " dcn-mk-static" : "");
    el.style.cssText = "width:0;height:0;overflow:visible;";
    // z순서: Leaflet zIndexOffset(-800~6000)을 200 기준 1/10로 압축 → 랜드마크 120 < 역 170 < 핀 200 < 뭉치 250 < 취향 300 < 우선 400 < 포커스 500 < 내카페 600.
    //   hover 800·선택 900(CSS), 지도 컨트롤 1000, 화면 오버레이 1100(React). 음수 오프셋도 캔버스 아래로 안 떨어진다.
    el.style.zIndex = String(Math.max(50, 200 + Math.round((opts.zIndexOffset ?? 0) / 10)));
    if (opts.interactive === false) el.style.pointerEvents = "none";
    el.innerHTML = opts.html;
    this.el = el;
    this.mk = new gl.Marker({ element: el, anchor: "center" }).setLngLat([latlng[1], latlng[0]]);
  }
  on(ev: string, fn: () => void): this {
    if (ev === "click") this.el.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return this;
  }
  bindPopup(html: string): this { this.popupHtml = html; return this; }
  openPopup(): void {
    if (!this.ml || !this.popupHtml) return;
    try {
      this.popup?.remove();
      this.popup = new this.gl.Popup({ closeButton: false, closeOnClick: true, offset: [0, -52], className: "dcn-popup" })
        .setLngLat(this.mk.getLngLat()).setHTML(this.popupHtml).addTo(this.ml);
    } catch {}
  }
  getElement(): HTMLElement { return this.el; }
  addTo(target: MapA | maplibregl.Map): this { const ml = target instanceof MapA ? target.ml : target; this.ml = ml; this.mk.addTo(ml); return this; }
  remove(): void { try { this.popup?.remove(); } catch {} this.popup = null; try { this.mk.remove(); } catch {} }
}

/** Leaflet layerGroup 흉내. 루트 그룹(addTo(map))이 마커 DOM과 GeoJSON 소스(선·원)를 실제로 소유한다. */
export class LayerGroupA {
  items: Item[];
  private map: MapA | null = null;
  private lines: LineFeat[] = [];
  private circles: CircleFeat[] = [];
  private markers: MarkerA[] = [];
  constructor(items: Item[] = []) { this.items = items; }
  addTo(map: MapA): this { this.map = map; map.ensureOverlaySources(); return this; }
  addLayer(item: Item): this {
    if (!this.map) { this.items.push(item); return this; }
    this.collect(item);
    this.flushShapes();
    return this;
  }
  private collect(item: Item) {
    if (item instanceof MarkerA) { item.addTo(this.map!); this.markers.push(item); return; }
    if (item instanceof LayerGroupA) { for (const it of item.items) this.collect(it); return; }
    if (item.kind === "line") this.lines.push(item); else this.circles.push(item);
  }
  private flushShapes() {
    const map = this.map!;
    map.setOverlayData("dcn-lines", {
      type: "FeatureCollection",
      features: this.lines.map((l) => ({ type: "Feature", properties: { color: l.color, weight: l.weight, opacity: l.opacity }, geometry: { type: "LineString", coordinates: l.coords } })),
    });
    map.setOverlayData("dcn-shapes", {
      type: "FeatureCollection",
      features: this.circles.map((c) => ({ type: "Feature", properties: { color: c.color, weight: c.weight, fill: c.fillColor, fillOpacity: c.fillOpacity }, geometry: { type: "Polygon", coordinates: [circlePoly(c.lat, c.lng, c.radius)] } })),
    });
  }
  clearLayers(): void {
    for (const m of this.markers) m.remove();
    this.markers = []; this.lines = []; this.circles = [];
    if (this.map) this.flushShapes();
  }
}

function circlePoly(lat: number, lng: number, radiusM: number, n = 48): [number, number][] {
  const out: [number, number][] = [];
  const dLat = radiusM / 111320, dLng = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; out.push([lng + Math.cos(a) * dLng, lat + Math.sin(a) * dLat]); }
  return out;
}

export class MapA {
  ml: maplibregl.Map;
  gl: GL;
  dragging: { disable: () => void; enable: () => void };
  private overlayReady = false;
  private pendingData: Record<string, any> = {};
  constructor(gl: GL, ml: maplibregl.Map) {
    this.gl = gl; this.ml = ml;
    this.dragging = { disable: () => { try { ml.dragPan.disable(); } catch {} }, enable: () => { try { ml.dragPan.enable(); } catch {} } };
  }
  getZoom(): number { return this.ml.getZoom() + ZOFF; }
  getBounds(): LB { const b = this.ml.getBounds(); return new LB(b.getSouth(), b.getWest(), b.getNorth(), b.getEast()); }
  project(latlng: LatLngTuple, zLeaflet: number) { return worldPx(latlng[0], latlng[1], zLeaflet); }
  setView(latlng: LatLngTuple, z: number, opts?: { animate?: boolean }): void {
    const o = { center: [latlng[1], latlng[0]] as [number, number], zoom: z - ZOFF };
    if (opts?.animate) this.ml.easeTo({ ...o, duration: 500, essential: true }); else this.ml.jumpTo(o);
  }
  flyTo(latlng: LatLngTuple, z: number, opts?: { duration?: number }): void {
    this.ml.easeTo({ center: [latlng[1], latlng[0]], zoom: z - ZOFF, duration: Math.round((opts?.duration ?? 0.45) * 1000), essential: true });
  }
  flyToBounds(b: LB, opts?: { padding?: [number, number]; maxZoom?: number; duration?: number }): void {
    const [px, py] = opts?.padding ?? [40, 40];
    try {
      this.ml.fitBounds([[b.w, b.s], [b.e, b.n]], { padding: { top: py, bottom: py, left: px, right: px }, maxZoom: (opts?.maxZoom ?? 18) - ZOFF, duration: Math.round((opts?.duration ?? 0.45) * 1000), essential: true });
    } catch {}
  }
  on(ev: string, fn: () => void): void { this.ml.on(ev as any, fn); }
  off(ev: string, fn: () => void): void { this.ml.off(ev as any, fn); }
  invalidateSize(): void { try { this.ml.resize(); } catch {} }
  remove(): void { try { this.ml.remove(); } catch {} }
  /** 선·원 오버레이 소스/레이어(스타일 로드 후 1회). 심볼(라벨)보다 아래·건물보다 위에 둔다. */
  ensureOverlaySources(): void {
    const ml = this.ml;
    const add = () => {
      if (this.overlayReady) return;
      try {
        if (!ml.getSource("dcn-lines")) ml.addSource("dcn-lines", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (!ml.getSource("dcn-shapes")) ml.addSource("dcn-shapes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        const before = firstSymbolLayer(ml);
        if (!ml.getLayer("dcn-shapes-fill")) ml.addLayer({ id: "dcn-shapes-fill", type: "fill", source: "dcn-shapes", paint: { "fill-color": ["get", "fill"], "fill-opacity": ["get", "fillOpacity"] } }, before);
        if (!ml.getLayer("dcn-shapes-line")) ml.addLayer({ id: "dcn-shapes-line", type: "line", source: "dcn-shapes", paint: { "line-color": ["get", "color"], "line-width": ["get", "weight"] } }, before);
        if (!ml.getLayer("dcn-lines-casing")) ml.addLayer({ id: "dcn-lines-casing", type: "line", source: "dcn-lines", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#ffffff", "line-width": ["+", ["get", "weight"], 2.5], "line-opacity": 0.7 } }, before);
        if (!ml.getLayer("dcn-lines-color")) ml.addLayer({ id: "dcn-lines-color", type: "line", source: "dcn-lines", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["get", "weight"], "line-opacity": ["get", "opacity"] } }, before);
        this.overlayReady = true;
        for (const [id, data] of Object.entries(this.pendingData)) { try { (ml.getSource(id) as any)?.setData(data); } catch {} }
        this.pendingData = {};
      } catch {}
    };
    if (ml.isStyleLoaded()) add(); else ml.once("load", add);
  }
  setOverlayData(id: string, data: any): void {
    if (!this.overlayReady) { this.pendingData[id] = data; return; }
    try { (this.ml.getSource(id) as any)?.setData(data); } catch {}
  }
}

function firstSymbolLayer(ml: maplibregl.Map): string | undefined {
  try { for (const ly of ml.getStyle().layers || []) if (ly.type === "symbol") return ly.id; } catch {}
  return undefined;
}

/** page.tsx가 `L.xxx`로 부르던 팩토리 묶음 */
export function makeL(gl: GL) {
  return {
    marker: (latlng: LatLngTuple, opts: { icon?: { html: string; [k: string]: any }; zIndexOffset?: number; interactive?: boolean; [k: string]: any }) =>
      new MarkerA(gl, latlng, { html: opts.icon?.html ?? "", zIndexOffset: opts.zIndexOffset, interactive: opts.interactive }),
    divIcon: (o: { html: string; className?: string; iconSize?: [number, number] }) => o,
    layerGroup: (items: Item[] = []) => new LayerGroupA(items),
    polyline: (seg: LatLngTuple[], o: { color: string; weight: number; opacity?: number; [k: string]: any }): LineFeat =>
      ({ kind: "line", coords: seg.map(([la, lo]) => [lo, la] as [number, number]), color: o.color, weight: o.weight, opacity: o.opacity ?? 1 }),
    circle: (latlng: LatLngTuple, o: { radius: number; color: string; weight: number; fillColor: string; fillOpacity: number; [k: string]: any }): CircleFeat =>
      ({ kind: "circle", lat: latlng[0], lng: latlng[1], radius: o.radius, color: o.color, weight: o.weight, fillColor: o.fillColor, fillOpacity: o.fillOpacity }),
    latLngBounds: (a: LatLngTuple[] | LatLngTuple, b?: LatLngTuple) => Array.isArray(a[0]) ? LB.of(a as LatLngTuple[]) : LB.of([a as LatLngTuple, b as LatLngTuple]),
    canvas: (_o?: any) => null,
  };
}
export type LFactory = ReturnType<typeof makeL>;
