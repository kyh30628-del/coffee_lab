# 🏙️ Blender Cycles — 지도 고도화 2차 질감(2026-09-11, CEO "여섯 개 다 한번에")
#   ① 건물 파사드+지붕 5종(저층 벽돌·빌라·콘크리트 오피스·커튼월·유리 타워) — fill-extrusion-pattern은 벽·지붕에
#      **같은 이미지**가 깔리므로, 위에서 보면 옥상(실외기·물탱크·난간)이고 옆에서 보면 창문 띠로 읽히게 설계한다.
#   ② 지표 5종(park·garden·wood·forest·meadow) — 수관 밀도·산책로·화단으로 구분(landcover subclass 기준).
#   ③ 다리 상판 1종 + 도로 3종(간선 아스팔트·일반 아스팔트·골목 콘크리트) — line-pattern용 **가로 스트립**(길이 방향 반복).
#   ④ POI 아이콘 4종(지하철·버스·공원·주차) — 핀과 같은 세라믹 톤, 알파 배경.
#   실행(MCP): DCN_OUT/DCN_SAMPLES 전역을 넣고 execute_code로 exec. ⚠️ read_factory_settings 금지(서버 죽음).
import bpy, sys, os, math

_argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = globals().get("DCN_OUT") or (_argv[0] if _argv else os.getcwd())
SAMPLES = int(globals().get("DCN_SAMPLES") or (_argv[1] if len(_argv) > 1 else 64))
os.makedirs(OUT, exist_ok=True)

def srgb_to_linear(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def col(h, a=1.0):
    h = h.lstrip("#"); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), a)

old = bpy.data.scenes.get("DCN_TEX2")
if old: bpy.data.scenes.remove(old)
S = bpy.data.scenes.new("DCN_TEX2")
S.render.engine = "CYCLES"; S.cycles.samples = SAMPLES; S.cycles.use_denoising = True; S.cycles.device = "CPU"
S.render.resolution_percentage = 100
S.render.image_settings.file_format = "PNG"; S.render.image_settings.compression = 60
S.view_settings.view_transform = "Standard"; S.view_settings.look = "None"
W = bpy.data.worlds.new("DCN_W2"); S.world = W; W.use_nodes = True
W.node_tree.nodes["Background"].inputs[0].default_value = (0.95, 0.96, 0.98, 1); W.node_tree.nodes["Background"].inputs[1].default_value = 0.5

def link(ob): S.collection.objects.link(ob); return ob
cam = link(bpy.data.objects.new("DCN2_cam", bpy.data.cameras.new("DCN2_cam")))
cam.data.type = "ORTHO"; cam.location = (0, 0, 8); cam.rotation_euler = (0, 0, 0); S.camera = cam
sun = link(bpy.data.objects.new("DCN2_sun", bpy.data.lights.new("DCN2_sun", "SUN")))
sun.data.energy = 3.2; sun.data.angle = math.radians(6); sun.rotation_euler = (math.radians(50), 0, math.radians(-35))
sun2 = link(bpy.data.objects.new("DCN2_sun2", bpy.data.lights.new("DCN2_sun2", "SUN")))
sun2.data.energy = 0.8; sun2.data.angle = math.radians(25); sun2.rotation_euler = (math.radians(35), 0, math.radians(140))

def mat(name, base, rough=0.8, coat=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = col(base) if isinstance(base, str) else base
    p.inputs["Roughness"].default_value = rough
    if coat and "Coat Weight" in p.inputs: p.inputs["Coat Weight"].default_value = coat
    return m

_objs = []
def box(name, size, loc, material, smooth=False):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.object; ob.name = name; ob.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    ob.data.materials.append(material); _objs.append(ob)
    # 씬 컬렉션으로 옮긴다(primitive_add는 활성 씬에 들어감)
    for c in list(ob.users_collection): c.objects.unlink(ob)
    S.collection.objects.link(ob); return ob
def cyl(name, r, h, loc, material, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc)
    ob = bpy.context.object; ob.name = name; ob.data.materials.append(material); _objs.append(ob)
    for c in list(ob.users_collection): c.objects.unlink(ob)
    S.collection.objects.link(ob); return ob
def plane(name, w, h, z, material):
    me = bpy.data.meshes.new(name); me.from_pydata([(-w/2, -h/2, z), (w/2, -h/2, z), (w/2, h/2, z), (-w/2, h/2, z)], [], [(0, 1, 2, 3)]); me.update()
    ob = link(bpy.data.objects.new(name, me)); ob.data.materials.append(material); _objs.append(ob); return ob
def clear():
    for ob in _objs:
        try: bpy.data.objects.remove(ob, do_unlink=True)
        except Exception: pass
    _objs.clear()
def render(path, w, h, ortho, transparent=False):
    S.render.resolution_x = w; S.render.resolution_y = h; cam.data.ortho_scale = ortho
    S.render.film_transparent = transparent; S.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    S.render.filepath = path; bpy.ops.render.render(write_still=True, scene="DCN_TEX2")
    return os.path.getsize(path)

results = []
import random
random.seed(7)

# ──────────────────────────────────────────────────────────────────────────────────────────
# ① 건물 파사드+지붕 5종 — 2×2 타일 위에서 내려다본 옥상 소품 + 벽면 창문 띠(한 이미지로 둘 다 읽히게)
#   패턴 타일 1장 = 건물 한 층·한 칸 격자. 옥상 소품은 격자 셀 안의 어두운 사각(실외기)·원통(물탱크)·난간선.
FACADES = {
    # name: (벽색, 창색, 창틀색, 옥상 소품 톤, 창 열×행, 창 크기비)
    "fac-brick":   ("#cdb4a0", "#5b6773", "#8d6b52", "#8a7c72", 2, 2, 0.60),   # 저층 벽돌(주택·근생)
    "fac-villa":   ("#e6dccb", "#6b7b8c", "#a08c74", "#9a938c", 2, 3, 0.62),   # 빌라·다세대(베이지)
    "fac-office":  ("#d5d1ca", "#5a6a7a", "#7d8188", "#8f9299", 3, 3, 0.56),   # 콘크리트 오피스
    "fac-curtain": ("#aab7c3", "#6b8aa6", "#7c8b98", "#8a97a3", 4, 4, 0.70),   # 커튼월
    "fac-glass":   ("#9fb3c4", "#7fa6c2", "#b8c8d6", "#93a2ae", 5, 5, 0.80),   # 유리 타워
}
for name, (wall, glass, frame, roof, cols, rows, wr) in FACADES.items():
    clear()
    plane("DCN2_wall", 2.2, 2.2, 0.0, mat(name + "-wall", wall, 0.85))
    cw, ch = 2.0 / cols, 2.0 / rows
    for r in range(rows):
        for c in range(cols):
            x = -1 + cw * (c + 0.5); y = -1 + ch * (r + 0.5)
            box(f"DCN2_f{r}{c}", (cw * wr, ch * 0.62, 0.02), (x, y, 0.01), mat(name + "-frame", frame, 0.6))
            box(f"DCN2_g{r}{c}", (cw * wr - 0.03, ch * 0.62 - 0.03, 0.03), (x, y, 0.015), mat(name + "-glass", glass, 0.15, 0.6))
    # 옥상 소품(위에서 보면 실외기·물탱크·난간, 옆에서 보면 창문 사이 어두운 점으로 무해)
    for i in range(random.randint(2, 4)):
        box(f"DCN2_ac{i}", (0.16, 0.12, 0.08), (random.uniform(-0.8, 0.8), random.uniform(-0.8, 0.8), 0.04), mat(name + "-ac", roof, 0.7))
    if name in ("fac-brick", "fac-villa"): cyl("DCN2_tank", 0.11, 0.14, (random.uniform(-0.6, 0.6), random.uniform(-0.6, 0.6), 0.07), mat(name + "-tank", "#a8b0b6", 0.4, 0.3))
    if name == "fac-glass": cyl("DCN2_heli", 0.28, 0.01, (0, 0, 0.005), mat(name + "-heli", "#8c98a4", 0.9))
    box("DCN2_ledge1", (2.0, 0.05, 0.05), (0, 0.98, 0.025), mat(name + "-ledge", frame, 0.7)); box("DCN2_ledge2", (2.0, 0.05, 0.05), (0, -0.98, 0.025), mat(name + "-ledge2", frame, 0.7))
    results.append((name, render(os.path.join(OUT, name + ".png"), 128, 128, 2.0)))

# ──────────────────────────────────────────────────────────────────────────────────────────
# ② 지표 5종(landcover subclass) — 위에서 본 수관(반구)·산책로·화단
def crowns(prefix, n, rmin, rmax, colors, zbase=0.0):
    for i in range(n):
        r = random.uniform(rmin, rmax); c = random.choice(colors)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=(random.uniform(-1.1, 1.1), random.uniform(-1.1, 1.1), zbase + r * 0.55))
        ob = bpy.context.object; ob.name = f"{prefix}{i}"; ob.data.materials.append(mat(f"{prefix}m{i}", c, 0.9)); _objs.append(ob)
        for cc in list(ob.users_collection): cc.objects.unlink(ob)
        S.collection.objects.link(ob)
        try: bpy.ops.object.shade_smooth()
        except Exception: pass
LAND = {
    "lc-park":   dict(ground="#b9cf9f", crowns=(7, 0.10, 0.20, ["#5f8a4a", "#6f9a55", "#4f7a40"]), path=True,  beds=2),
    "lc-garden": dict(ground="#c7d8a6", crowns=(9, 0.06, 0.12, ["#7aa25c", "#8fb36b", "#d49ab0"]), path=True,  beds=5),
    "lc-wood":   dict(ground="#4d6e3c", crowns=(26, 0.11, 0.20, ["#3f6a33", "#4c7a3d", "#365d2c"]), path=False, beds=0),
    "lc-forest": dict(ground="#3b5a30", crowns=(34, 0.10, 0.18, ["#2f5228", "#3a6331", "#28471f"]), path=False, beds=0),
    "lc-meadow": dict(ground="#c9d99a", crowns=(3, 0.05, 0.09, ["#8fb36b"]), path=False, beds=0),
}
for name, cfg in LAND.items():
    clear()
    plane("DCN2_ground", 2.4, 2.4, 0.0, mat(name + "-g", cfg["ground"], 0.95))
    if cfg["path"]:
        box("DCN2_path", (2.4, 0.16, 0.01), (0, random.uniform(-0.5, 0.5), 0.005), mat(name + "-path", "#d9cdb1", 0.9))
    for i in range(cfg["beds"]):
        box(f"DCN2_bed{i}", (random.uniform(0.2, 0.4), random.uniform(0.15, 0.3), 0.02), (random.uniform(-0.9, 0.9), random.uniform(-0.9, 0.9), 0.01), mat(f"{name}-bed{i}", random.choice(["#d67f8c", "#e6b24f", "#a97cc0"]), 0.9))
    n, rmin, rmax, colors = cfg["crowns"]; crowns("DCN2_c", n, rmin, rmax, colors)
    results.append((name, render(os.path.join(OUT, name + ".png"), 128, 128, 2.0)))

# ──────────────────────────────────────────────────────────────────────────────────────────
# ③ 다리 상판 + 도로 3종 — line-pattern용 가로 스트립(512×128). 길이 방향(x)으로 반복, 폭(y)이 선 너비에 맞춰진다.
def strip(name, asphalt, lane=None, edge=None, railing=False, dashed=True):
    clear()
    plane("DCN2_road", 8.4, 2.2, 0.0, mat(name + "-a", asphalt, 0.95))
    if edge: box("DCN2_e1", (8.4, 0.10, 0.01), (0, 0.95, 0.005), mat(name + "-e1", edge, 0.8)); box("DCN2_e2", (8.4, 0.10, 0.01), (0, -0.95, 0.005), mat(name + "-e2", edge, 0.8))
    if lane:
        if dashed:
            for i in range(-4, 5): box(f"DCN2_l{i}", (0.55, 0.06, 0.01), (i * 1.0, 0, 0.006), mat(f"{name}-l{i}", lane, 0.8))
        else: box("DCN2_l", (8.4, 0.06, 0.01), (0, 0, 0.006), mat(name + "-l", lane, 0.8))
    if railing:
        for side in (1, -1):
            for i in range(-8, 9): cyl(f"DCN2_p{side}{i}", 0.035, 0.22, (i * 0.5, side * 1.0, 0.11), mat(f"{name}-p{side}{i}", "#8c96a0", 0.5, 0.2), verts=12)
            box(f"DCN2_rail{side}", (8.4, 0.04, 0.03), (0, side * 1.0, 0.23), mat(f"{name}-r{side}", "#9aa4ae", 0.4, 0.3))
    results.append((name, render(os.path.join(OUT, name + ".png"), 512, 128, 8.0)))
strip("rd-bridge",   "#b9b3aa", lane="#ece6d8", edge="#8d8781", railing=True)
strip("rd-major",    "#c9bfb0", lane="#f3e6c2", edge="#a89f92")         # 간선(웜 앰버 톤 아스팔트 + 점선)
strip("rd-street",   "#d8d1c4", lane=None, edge="#b7ae9f")               # 일반 도로
strip("rd-alley",    "#e2dccf", lane=None, edge=None, dashed=False)      # 골목 콘크리트

# ──────────────────────────────────────────────────────────────────────────────────────────
# ④ POI 아이콘 4종 — 세라믹 원판 위 픽토그램(단순 기하), 알파. 핀과 같은 톤(크림 배경·짙은 갈색 기호).
def icon(name, build):
    clear()
    cyl("DCN2_disc", 1.0, 0.16, (0, 0, 0.08), mat(name + "-disc", "#fdfaf4", 0.35, 0.5))
    build()
    results.append((name, render(os.path.join(OUT, name + ".png"), 96, 96, 2.3, transparent=True)))
ink = lambda n: mat(n, "#4a3526", 0.6)
def i_subway():
    cyl("DCN2_ring", 0.62, 0.20, (0, 0, 0.18), ink("s-ring")); cyl("DCN2_hole", 0.42, 0.24, (0, 0, 0.18), mat("s-hole", "#fdfaf4", 0.35))
    box("DCN2_bar", (0.9, 0.16, 0.10), (0, 0, 0.30), ink("s-bar"))
def i_bus():
    box("DCN2_body", (1.25, 0.80, 0.22), (0, 0.08, 0.27), ink("b-body"))
    box("DCN2_win1", (0.42, 0.30, 0.06), (-0.28, 0.20, 0.37), mat("b-win1", "#fdfaf4", 0.3)); box("DCN2_win2", (0.42, 0.30, 0.06), (0.28, 0.20, 0.37), mat("b-win2", "#fdfaf4", 0.3))
    cyl("DCN2_w1", 0.15, 0.14, (-0.40, -0.40, 0.23), ink("b-w1")); cyl("DCN2_w2", 0.15, 0.14, (0.40, -0.40, 0.23), ink("b-w2"))
def i_park():
    cyl("DCN2_trunk", 0.09, 0.5, (0, -0.25, 0.4), ink("p-trunk"))
    for i, (r, z) in enumerate([(0.55, 0.55), (0.42, 0.85), (0.28, 1.1)]):
        bpy.ops.mesh.primitive_cone_add(vertices=32, radius1=r, depth=0.45, location=(0, 0.05, z)); ob = bpy.context.object; ob.name = f"DCN2_cone{i}"; ob.data.materials.append(mat(f"p-c{i}", "#5f7355", 0.8)); _objs.append(ob)
        for c in list(ob.users_collection): c.objects.unlink(ob)
        S.collection.objects.link(ob)
def i_parking():
    box("DCN2_P1", (0.24, 1.20, 0.14), (-0.34, -0.08, 0.23), ink("pk-1"))                      # 세로 획
    cyl("DCN2_Pring", 0.40, 0.14, (0.04, 0.30, 0.23), ink("pk-2")); cyl("DCN2_Phole", 0.18, 0.18, (0.06, 0.30, 0.23), mat("pk-hole", "#fdfaf4", 0.35))  # 고리
icon("poi-subway", i_subway); icon("poi-bus", i_bus); icon("poi-park", i_park); icon("poi-parking", i_parking)

clear()
try:
    bpy.data.scenes.remove(S)
    for ob in ("DCN2_cam", "DCN2_sun", "DCN2_sun2"):
        o = bpy.data.objects.get(ob)
        if o: bpy.data.objects.remove(o, do_unlink=True)
except Exception as e: print("cleanup:", e)
print("DCN_RESULT", results)
