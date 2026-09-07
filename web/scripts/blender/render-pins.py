# 🎨 Blender 헤드리스 렌더 — 지도 핀 6종 + 클러스터 받침(퍽) 2종 → public/pins/*.png (알파, 여백 없이 타이트)
#   실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/render-pins.py -- <out_dir> [samples]
#   Cycles(CPU)·투명 필름·디노이즈. 카메라를 대상에 딱 맞게 잡아 PNG 투명 여백을 최소화(CSS 크기 = 이미지 크기 규약).
#   비용 0(로컬 렌더·정적 파일). Blender 5.x LTS 기준.
import bpy, sys, math, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.path.dirname(__file__), "../../public/pins")
SAMPLES = int(argv[1]) if len(argv) > 1 else 96
os.makedirs(OUT, exist_ok=True)

PIN_COLORS = {"verified": "#5f7355", "ref": "#9c6b3f", "cand": "#a8927a", "feat": "#e3a52f", "mine": "#d6336c", "focus": "#b5703c"}
PUCK_COLORS = {"puck": "#5a3a22", "puck-match": "#b8722c"}
CREAM = (0.992, 0.980, 0.957)

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_rgb(h):
    h = h.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)

# ---------- scene reset ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
try:
    scene.render.engine = "CYCLES"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.device = "CPU"
except Exception:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.compression = 60
scene.view_settings.view_transform = "Standard"  # 색이 CSS 팔레트와 일치하도록(Filmic/AgX 톤 변형 금지)
scene.view_settings.look = "None"

# world: 옅은 크림 환경광(반사에 부드럽게 비침)
world = bpy.data.worlds.new("W"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.96, 0.92, 0.84, 1); bg.inputs[1].default_value = 0.10

def area_light(name, loc, energy, size, color=(1, 1, 1), target=(0, 0, 0)):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = energy; ld.size = size; ld.color = color
    lo = bpy.data.objects.new(name, ld); scene.collection.objects.link(lo); lo.location = loc
    d = Vector(target) - Vector(loc); lo.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return lo

area_light("key", (-2.4, -3.8, 3.8), 260, 0.7, (1.0, 0.96, 0.9))    # 좌상 앞 키
area_light("fill", (3.4, -3.0, 0.3), 40, 2.5, (0.9, 0.93, 1.0))     # 우측 필
area_light("rim", (1.2, 3.2, 3.0), 300, 1.2, (1, 1, 1))              # 뒤 위 림(윤곽)

def make_material(name, rgba, rough=0.35, coat=0.45, coat_rough=0.04):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = rgba
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = 0.0
    for k, v in (("Coat Weight", coat), ("Coat Roughness", coat_rough), ("Specular IOR Level", 0.45)):
        if k in p.inputs: p.inputs[k].default_value = v
    return m

def lathe(name, profile, steps=128):
    """profile: [(r, z)] 아래→위. 회전체 메시(부드러운 셰이딩)."""
    verts, faces = [], []
    n = len(profile)
    for i in range(steps):
        a = 2 * math.pi * i / steps
        for (r, z) in profile:
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for i in range(steps):
        i2 = (i + 1) % steps
        for j in range(n - 1):
            a, b, c, d = i * n + j, i2 * n + j, i2 * n + j + 1, i * n + j + 1
            faces.append((a, b, c, d))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    for poly in me.polygons: poly.use_smooth = True
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    # 중심축 정점 겹침 제거(원뿔 꼭짓점)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.remove_doubles(threshold=1e-4); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)
    return ob

def pin_profile():
    pts = []
    R, tip = 1.0, -2.05
    head = []
    for i in range(29):
        a = math.pi / 2 - (i / 28) * math.pi * 0.62
        head.append((math.cos(a) * R, math.sin(a) * R))
    last = head[-1]
    tail = []
    for i in range(1, 23):
        t = i / 22; z = last[1] + (tip - last[1]) * t
        r = last[0] * ((1 - t) ** 0.78) * (1 - 0.05 * t)
        tail.append((max(0.0, r), z))
    prof = [(0.0, tip - 0.01)] + list(reversed(tail)) + list(reversed(head))  # 아래(꼭짓점) → 위(정수리)
    return prof

def puck_profile():
    R, h, bev = 1.0, 0.34, 0.12
    prof = [(0.0, -h), (R - bev, -h)]
    for i in range(1, 9):
        a = -math.pi / 2 + (i / 8) * (math.pi / 2); prof.append((R - bev + math.cos(a) * bev, -h + bev + math.sin(a) * bev))
    prof.append((R, h - bev))
    for i in range(1, 9):
        a = (i / 8) * (math.pi / 2); prof.append((R - bev + math.cos(a) * bev, h - bev + math.sin(a) * bev))
    prof.append((0.0, h))
    return prof

# ---------- camera ----------
cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 75; cam_data.sensor_width = 36
cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam

def aim(cam, loc, target):
    cam.location = loc
    d = Vector(target) - Vector(loc); cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

def render(path, w, h):
    scene.render.resolution_x = w; scene.render.resolution_y = h; scene.render.resolution_percentage = 100
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

# ---------- pin ----------
pin = lathe("pin", pin_profile())
pin_mat = make_material("pin", (1, 1, 1, 1)); pin.data.materials.append(pin_mat)
# 흰 외곽선: Cycles 셸 방식은 반투명 헤이즈가 생겨(실측) 폐기 → 후처리(scripts/blender/postprocess-pins.py, 알파 팽창)로 그린다. 셸은 렌더 제외.
shell = lathe("shell", pin_profile()); shell.scale = (1.045, 1.045, 1.04); shell.hide_render = True
shell_mat = bpy.data.materials.new("shell"); shell_mat.use_nodes = True
nt = shell_mat.node_tree
# Cycles는 재질 패널의 backface culling을 무시한다 → 노드로 직접: 카메라 쪽 면(Backfacing=0)은 투명, 먼 쪽 면만 크림 발광 → 본체 뒤로 외곽선만 남는다.
em = nt.nodes.new("ShaderNodeEmission"); em.inputs[0].default_value = (*CREAM, 1); em.inputs[1].default_value = 1.0
tr = nt.nodes.new("ShaderNodeBsdfTransparent")
geo = nt.nodes.new("ShaderNodeNewGeometry")
mix = nt.nodes.new("ShaderNodeMixShader")
nt.links.new(geo.outputs["Backfacing"], mix.inputs[0])
nt.links.new(tr.outputs[0], mix.inputs[1])   # fac 0(앞면) → 투명
nt.links.new(em.outputs[0], mix.inputs[2])   # fac 1(뒷면) → 크림
nt.links.new(mix.outputs[0], nt.nodes["Material Output"].inputs[0])
shell_mat.blend_method = "BLEND" if hasattr(shell_mat, "blend_method") else None
shell.data.materials.append(shell_mat)
# 앞면 오목 원판 + 림 링(글리프 자리)
bpy.ops.mesh.primitive_circle_add(vertices=64, radius=0.62, fill_type="NGON", location=(0, -0.95, 0.08), rotation=(math.pi / 2, 0, 0))
dimple = bpy.context.active_object; dimple.name = "dimple"; dimple_mat = make_material("dimple", (1, 1, 1, 1), rough=0.6, coat=0.0); dimple.data.materials.append(dimple_mat)
bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.035, major_segments=96, minor_segments=16, location=(0, -0.955, 0.08), rotation=(math.pi / 2, 0, 0))
ring = bpy.context.active_object; ring.name = "ring"; ring_mat = make_material("ring", (1, 1, 1, 1), rough=0.25, coat=0.8); ring.data.materials.append(ring_mat)
for o in (dimple, ring):
    for poly in o.data.polygons: poly.use_smooth = True

# 🔎 진단 모드(DIAG_MARK=1): 잔 아이콘이 들어갈 자리(오목 원판=마젠타, 테두리 링=시안)를 발광색으로 칠해 렌더 →
#    후처리(크롭)까지 거친 뒤 픽셀로 재면 CSS 퍼센트를 눈대중 없이 정확히 계산할 수 있다.
import os as _os
if _os.environ.get("DIAG_MARK"):
    def _emit(mat, rgb):
        nt = mat.node_tree
        for n in list(nt.nodes):
            if n.type != "OUTPUT_MATERIAL": nt.nodes.remove(n)
        em = nt.nodes.new("ShaderNodeEmission"); em.inputs[0].default_value = (*rgb, 1); em.inputs[1].default_value = 1.0
        nt.links.new(em.outputs[0], nt.nodes["Material Output"].inputs[0])
    _emit(dimple_mat, (1, 0, 1)); _emit(ring_mat, (0, 1, 1))

# 카메라: 정면 살짝 위(고도 ~7°) — 프레임을 핀에 타이트하게(투명 여백 최소)
aim(cam, (0, -7.4, 1.5), (0, 0, -0.45))
cam_data.lens = 82

def _set_base(mat, rgba):
    n = mat.node_tree.nodes.get("Principled BSDF")
    if n is not None: n.inputs["Base Color"].default_value = rgba  # 진단 모드에선 발광으로 바꿔놔서 없을 수 있다

def set_pin_color(hexc):
    rgba = hex_rgb(hexc)
    _set_base(pin_mat, rgba)
    _set_base(dimple_mat, tuple(c * 0.82 for c in rgba[:3]) + (1.0,))
    _set_base(ring_mat, tuple(c * 0.45 + 0.55 for c in rgba[:3]) + (1.0,))

pin_objs = (pin, shell, dimple, ring)
import os as _os
if _os.environ.get("DIAG_NOSHELL"): shell.hide_render = True
if _os.environ.get("DIAG_NOCOAT"):
    for m in (pin_mat, dimple_mat, ring_mat): m.node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 0.0
if _os.environ.get("DIAG_ONE"): PIN_COLORS = {"verified": PIN_COLORS["verified"]}; PUCK_COLORS = {}
for name, hexc in PIN_COLORS.items():
    set_pin_color(hexc)
    render(os.path.join(OUT, f"pin-{name}.png"), 176, 232)
    print("RENDERED", f"pin-{name}.png")

# ---------- puck ----------
for o in pin_objs: o.hide_render = True
puck = lathe("puck", puck_profile())
puck_mat = make_material("puck", (1, 1, 1, 1), rough=0.38, coat=0.6, coat_rough=0.25); puck.data.materials.append(puck_mat)
bpy.ops.mesh.primitive_torus_add(major_radius=0.98, minor_radius=0.05, major_segments=128, minor_segments=16, location=(0, 0, 0.32))
prim = bpy.context.active_object; prim.name = "puck-rim"; prim_mat = make_material("puck-rim", (*CREAM, 1), rough=0.3, coat=0.7); prim.data.materials.append(prim_mat)
for poly in prim.data.polygons: poly.use_smooth = True
tilt = 1.12  # 위에서 64° 내려다봄(윗면 타원 세로비 ≈ 0.90)
aim(cam, (0, -math.cos(tilt) * 6.4, math.sin(tilt) * 6.4), (0, 0, 0.0))
cam_data.lens = 80
for name, hexc in PUCK_COLORS.items():
    puck_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hex_rgb(hexc)
    render(os.path.join(OUT, f"{name}.png"), 176, 176)
    print("RENDERED", f"{name}.png")
print("DONE", OUT)
