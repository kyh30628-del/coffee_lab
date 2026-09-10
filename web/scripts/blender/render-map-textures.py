# 🌊🏔️ Blender Cycles — 지도 지표 질감 9종 렌더 (물 4 · 지표 5) → <out>/*.png (128px, 후처리에서 이음새 제거)
#   실행(헤드리스): /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/render-map-textures.py -- <out_dir> [samples]
#   실행(MCP):      Blender GUI의 blender_mcp 서버(9876)에 execute_code로 이 파일을 exec — DCN_OUT/DCN_SAMPLES 전역을 먼저 넣는다.
#                   ⚠️ MCP 경로에서는 절대 read_factory_settings를 부르지 않는다(서버 소켓이 죽는다 — 2026-09-10 실측).
#                   대신 전용 씬 "DCN_TEX"를 만들어 렌더하고 끝나면 지운다(작업 중인 GUI 씬 무손상).
#
# 설계(깊이·고도 표현 — 타일에 실제 수심/고도값은 없으니 "종류"를 깊이로 읽는다):
#   물: 바다(가장 깊음·남청·잔물결 약·글린트 작음) > 호수(잔잔·중간 청) > 강(밝은 청·흐름결 뚜렷) > 연못(얕음·청록·바닥 모래 비침)
#       → Principled BSDF 물 재질 + 절차 노이즈 범프 + 태양광 글린트. 연못만 투과(Transmission)로 바닥면을 비춘다.
#   지표: 숲(수관 돔 Voronoi) · 풀(미세 노이즈) · 모래(고운 입자) · 습지(풀+청록 물결) · 얼음(Voronoi 균열)
#   색은 지도 크림 톤(#fdfaf4)과 어울리는 저채도. 뷰 변환 Standard(톤매핑으로 팔레트가 틀어지지 않게).
import bpy, sys, os, math

# ---------- 입력 ----------
_argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = globals().get("DCN_OUT") or (_argv[0] if _argv else os.path.join(os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd(), "../../.blender-out/map"))
SAMPLES = int(globals().get("DCN_SAMPLES") or (_argv[1] if len(_argv) > 1 else 48))
SIZE = int(globals().get("DCN_SIZE") or 128)
os.makedirs(OUT, exist_ok=True)

def srgb_to_linear(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def col(h, a=1.0):
    h = h.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)

# ---------- 전용 씬(기존 씬 무손상) ----------
old = bpy.data.scenes.get("DCN_TEX")
if old: bpy.data.scenes.remove(old)
S = bpy.data.scenes.new("DCN_TEX")
S.render.engine = "CYCLES"
S.cycles.samples = SAMPLES; S.cycles.use_denoising = True; S.cycles.device = "CPU"
S.render.resolution_x = S.render.resolution_y = SIZE; S.render.resolution_percentage = 100
S.render.film_transparent = False
S.render.image_settings.file_format = "PNG"; S.render.image_settings.color_mode = "RGB"; S.render.image_settings.compression = 60
S.view_settings.view_transform = "Standard"; S.view_settings.look = "None"
W = bpy.data.worlds.new("DCN_W"); S.world = W; W.use_nodes = True
W.node_tree.nodes["Background"].inputs[0].default_value = (0.95, 0.96, 0.98, 1); W.node_tree.nodes["Background"].inputs[1].default_value = 0.45

def link(ob): S.collection.objects.link(ob); return ob
cam = link(bpy.data.objects.new("DCN_cam", bpy.data.cameras.new("DCN_cam")))
cam.data.type = "ORTHO"; cam.data.ortho_scale = 2.0; cam.location = (0, 0, 6); cam.rotation_euler = (0, 0, 0); S.camera = cam
sun = link(bpy.data.objects.new("DCN_sun", bpy.data.lights.new("DCN_sun", "SUN")))
sun.data.energy = 3.4; sun.data.angle = math.radians(5); sun.rotation_euler = (math.radians(52), 0, math.radians(-35))  # 좌상단 저각 → 물 글린트·수관 음영
sun2 = link(bpy.data.objects.new("DCN_sun2", bpy.data.lights.new("DCN_sun2", "SUN")))
sun2.data.energy = 0.9; sun2.data.angle = math.radians(20); sun2.rotation_euler = (math.radians(35), 0, math.radians(140))  # 반대편 보조광

def plane(name, z=0.0, size=2.0):
    me = bpy.data.meshes.new(name); s = size / 2
    me.from_pydata([(-s, -s, z), (s, -s, z), (s, s, z), (-s, s, z)], [], [(0, 1, 2, 3)]); me.update()
    return link(bpy.data.objects.new(name, me))

# ---------- 노드 헬퍼 ----------
def new_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes["Principled BSDF"]; return m, nt, p
def tex_coord(nt):
    tc = nt.nodes.new("ShaderNodeTexCoord"); mp = nt.nodes.new("ShaderNodeMapping")
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"]); return mp
def noise(nt, vec, scale, detail=4.0, rough=0.5, distortion=0.0):
    n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = scale; n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    if "Distortion" in n.inputs: n.inputs["Distortion"].default_value = distortion
    nt.links.new(vec, n.inputs["Vector"]); return n
def voronoi(nt, vec, scale, feature="F1", smooth=0.0):
    v = nt.nodes.new("ShaderNodeTexVoronoi"); v.inputs["Scale"].default_value = scale
    try: v.feature = "SMOOTH_F1" if smooth > 0 else feature
    except Exception: pass
    if smooth > 0 and "Smoothness" in v.inputs: v.inputs["Smoothness"].default_value = smooth
    nt.links.new(vec, v.inputs["Vector"]); return v
def wave(nt, vec, scale, distortion=1.0, detail=2.0, bands="BANDS", direction="X"):
    w = nt.nodes.new("ShaderNodeTexWave"); w.wave_type = bands; w.inputs["Scale"].default_value = scale
    w.inputs["Distortion"].default_value = distortion; w.inputs["Detail"].default_value = detail
    try: w.bands_direction = direction
    except Exception: pass
    nt.links.new(vec, w.inputs["Vector"]); return w
def bump(nt, height_out, strength, distance=0.08):
    b = nt.nodes.new("ShaderNodeBump"); b.inputs["Strength"].default_value = strength; b.inputs["Distance"].default_value = distance
    nt.links.new(height_out, b.inputs["Height"]); return b
def ramp(nt, fac_out, stops):
    r = nt.nodes.new("ShaderNodeValToRGB"); cr = r.color_ramp
    while len(cr.elements) > 1: cr.elements.remove(cr.elements[-1])
    cr.elements[0].position = stops[0][0]; cr.elements[0].color = stops[0][1]
    for pos, c in stops[1:]:
        e = cr.elements.new(pos); e.color = c
    nt.links.new(fac_out, r.inputs["Fac"]); return r
def mix_rgb(nt, a, b, fac):
    m = nt.nodes.new("ShaderNodeMix"); m.data_type = "RGBA"; m.blend_type = "MIX"
    nt.links.new(fac, m.inputs["Factor"]); nt.links.new(a, m.inputs[6]); nt.links.new(b, m.inputs[7]); return m
def add_math(nt, op, a, b=None, val=None):
    m = nt.nodes.new("ShaderNodeMath"); m.operation = op
    nt.links.new(a, m.inputs[0])
    if b is not None: nt.links.new(b, m.inputs[1])
    elif val is not None: m.inputs[1].default_value = val
    return m

# ---------- 물 ----------
def water_material(name, base, deep, rough, bump_big, bump_fine, flow=False, transmission=0.0):
    m, nt, p = new_mat(name); mp = tex_coord(nt)
    p.inputs["Roughness"].default_value = rough; p.inputs["Metallic"].default_value = 0.0
    for k, v in (("Coat Weight", 0.7), ("Coat Roughness", 0.04), ("Specular IOR Level", 0.55), ("IOR", 1.333)):
        if k in p.inputs: p.inputs[k].default_value = v
    if transmission > 0 and "Transmission Weight" in p.inputs: p.inputs["Transmission Weight"].default_value = transmission
    # 🎨 깊이 얼룩: 아주 낮은 주파수 노이즈로 기본색↔짙은색을 섞는다(같은 물이라도 깊어 보이는 곳·얕아 보이는 곳).
    mott = noise(nt, mp.outputs["Vector"], 2.2, detail=2, rough=0.5)
    cr = ramp(nt, mott.outputs["Fac"], [(0.25, col(deep)), (0.75, col(base))])
    nt.links.new(cr.outputs["Color"], p.inputs["Base Color"])
    # 🌊 너울(저주파, 크게) + 잔물결(고주파). 강은 흐름 방향으로 늘린 노이즈 결(줄무늬 아님).
    big = noise(nt, mp.outputs["Vector"], 3.2, detail=6, rough=0.6, distortion=0.6)
    fine = noise(nt, mp.outputs["Vector"], 14, detail=3, rough=0.65)
    h1 = add_math(nt, "MULTIPLY", big.outputs["Fac"], val=bump_big)
    h2 = add_math(nt, "MULTIPLY", fine.outputs["Fac"], val=bump_fine)
    h = add_math(nt, "ADD", h1.outputs[0], h2.outputs[0])
    if flow:
        mp2 = tex_coord(nt); mp2.inputs["Scale"].default_value = (1.0, 5.0, 1.0)   # y로 5배 늘림 → 흐름 결
        st = noise(nt, mp2.outputs["Vector"], 6.0, detail=4, rough=0.55, distortion=0.8)
        h3 = add_math(nt, "MULTIPLY", st.outputs["Fac"], val=0.35)
        h = add_math(nt, "ADD", h.outputs[0], h3.outputs[0])
    b = bump(nt, h.outputs[0], 1.0, 0.10)
    nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    return m

WATER = {
    # name: (기본색, 짙은색(깊은 얼룩), roughness, 큰너울, 잔물결, 흐름결, 투과)
    "water-ocean": ("#3d6d9a", "#2b527c", 0.08, 0.95, 0.18, False, 0.0),   # 깊은 바다 — 남청, 큰 너울, 짙은 얼룩
    "water-lake":  ("#5b8fbc", "#477aa8", 0.11, 0.55, 0.16, False, 0.0),   # 호수 — 잔잔, 약한 얼룩
    "water-river": ("#7fb1d5", "#6aa0c8", 0.14, 0.30, 0.22, True,  0.0),   # 강 — 밝고 흐름결
    "water-pond":  ("#9ccbe0", "#86bcd4", 0.17, 0.18, 0.40, False, 0.55),  # 연못 — 얕아 바닥 비침, 잔물결 또렷
}

# ---------- 지표 ----------
def land_material(kind):
    m, nt, p = new_mat("land-" + kind); mp = tex_coord(nt)
    p.inputs["Roughness"].default_value = 0.85
    if kind == "wood":
        v = voronoi(nt, mp.outputs["Vector"], 7.5, smooth=0.35)      # 수관 돔
        n = noise(nt, mp.outputs["Vector"], 22, detail=3)
        r = ramp(nt, v.outputs["Distance"], [(0.0, col("#7fa35f")), (0.5, col("#587f43")), (1.0, col("#33532b"))])
        nt.links.new(r.outputs["Color"], p.inputs["Base Color"])
        inv = add_math(nt, "SUBTRACT", n.outputs["Fac"], b=v.outputs["Distance"])
        b = bump(nt, inv.outputs[0], 0.9, 0.12); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    elif kind == "grass":
        n = noise(nt, mp.outputs["Vector"], 30, detail=4, rough=0.7)
        r = ramp(nt, n.outputs["Fac"], [(0.0, col("#a0bd80")), (1.0, col("#cfe0aa"))])
        nt.links.new(r.outputs["Color"], p.inputs["Base Color"])
        b = bump(nt, n.outputs["Fac"], 0.45, 0.06); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    elif kind == "sand":
        n = noise(nt, mp.outputs["Vector"], 42, detail=5, rough=0.8)
        r = ramp(nt, n.outputs["Fac"], [(0.0, col("#e2d6b4")), (1.0, col("#f2e9cf"))])
        nt.links.new(r.outputs["Color"], p.inputs["Base Color"])
        b = bump(nt, n.outputs["Fac"], 0.2, 0.03); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    elif kind == "wetland":
        n = noise(nt, mp.outputs["Vector"], 24, detail=4, rough=0.65)
        pools = noise(nt, mp.outputs["Vector"], 3.0, detail=3, rough=0.5, distortion=1.2)   # 불규칙 물웅덩이
        grass = ramp(nt, n.outputs["Fac"], [(0.0, col("#9bb98a")), (1.0, col("#b9cf9f"))])
        watr = ramp(nt, n.outputs["Fac"], [(0.0, col("#7fb0c4")), (1.0, col("#a3c9d6"))])
        thr = ramp(nt, pools.outputs["Fac"], [(0.52, (0, 0, 0, 1)), (0.60, (1, 1, 1, 1))])      # 부드러운 경계
        mx = mix_rgb(nt, grass.outputs["Color"], watr.outputs["Color"], thr.outputs["Color"])
        nt.links.new(mx.outputs[2], p.inputs["Base Color"])
        b = bump(nt, n.outputs["Fac"], 0.3, 0.05); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
        p.inputs["Roughness"].default_value = 0.55
    elif kind == "ice":
        v = voronoi(nt, mp.outputs["Vector"], 3.2, feature="DISTANCE_TO_EDGE")
        r = ramp(nt, v.outputs["Distance"], [(0.0, col("#c5dde9")), (0.05, col("#eef5f9")), (1.0, col("#f7fbfd"))])
        nt.links.new(r.outputs["Color"], p.inputs["Base Color"])
        p.inputs["Roughness"].default_value = 0.25
        for k, val in (("Coat Weight", 0.5), ("Coat Roughness", 0.08)):
            if k in p.inputs: p.inputs[k].default_value = val
        b = bump(nt, v.outputs["Distance"], 0.5, 0.05); nt.links.new(b.outputs["Normal"], p.inputs["Normal"])
    return m

# ---------- 렌더 ----------
def render(path):
    S.render.filepath = path
    bpy.ops.render.render(write_still=True, scene="DCN_TEX")

results = []
surface = plane("DCN_surface", 0.0, 12.0)
floor = plane("DCN_floor", -0.22, 12.0)   # 연못 바닥(투과 시에만 보임)
fm, fnt, fp = new_mat("DCN_floor"); fmp = tex_coord(fnt)
fn = noise(fnt, fmp.outputs["Vector"], 26, detail=4)
fr = ramp(fnt, fn.outputs["Fac"], [(0.0, col("#b9a97f")), (1.0, col("#d9cca6"))]); fnt.links.new(fr.outputs["Color"], fp.inputs["Base Color"])
fp.inputs["Roughness"].default_value = 0.9
floor.data.materials.append(fm)

for name, (base, deep, rough, bb, bf, flow, trans) in WATER.items():
    surface.data.materials.clear(); surface.data.materials.append(water_material(name, base, deep, rough, bb, bf, flow, trans))
    floor.hide_render = (trans <= 0)
    out = os.path.join(OUT, name + ".png"); render(out); results.append((name, os.path.getsize(out)))

floor.hide_render = True
for kind in ("wood", "grass", "sand", "wetland", "ice"):
    surface.data.materials.clear(); surface.data.materials.append(land_material(kind))
    out = os.path.join(OUT, "land-" + kind + ".png"); render(out); results.append(("land-" + kind, os.path.getsize(out)))

# ---------- 정리(GUI 씬 무손상) ----------
try:
    bpy.data.scenes.remove(S)
    for ob in ("DCN_cam", "DCN_sun", "DCN_sun2", "DCN_surface", "DCN_floor"):
        o = bpy.data.objects.get(ob)
        if o: bpy.data.objects.remove(o, do_unlink=True)
except Exception as e:
    print("cleanup:", e)
print("DCN_RESULT", results)
