# ☕ 히어로 소품 재렌더(2026-09-21) — 원두 3방향 + 만년필. 잔(render-cup.py)과 같은 카메라 시점·조명, 투명 필름·섀도 캐처.
#   실행: Blender -b --python scripts/blender/render-props.py -- <out_dir> [samples]
import bpy, bmesh, sys, math, os, random
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/props"; SAMPLES = int(argv[1]) if len(argv) > 1 else 128
os.makedirs(OUT, exist_ok=True)

def fresh(res=(600, 600)):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
    sc.render.film_transparent = True; sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
    vts = [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items]
    sc.view_settings.view_transform = "AgX" if "AgX" in vts else "Standard"; sc.view_settings.look = "None"; sc.view_settings.exposure = -1.2
    w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.18, 0.11, 0.07, 1); w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.15
    bpy.ops.mesh.primitive_plane_add(size=2.0, location=(0, 0, 0)); bpy.context.object.is_shadow_catcher = True
    return sc

def light(name, loc, energy, size, target, color=(1, 0.93, 0.82)):
    d = bpy.data.lights.new(name, "AREA"); d.energy = energy; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o); o.location = loc
    tr = o.constraints.new("TRACK_TO"); tr.target = target; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"

def camera(sc, target, dist, lens=55, el=38, az=-18, dz=0.0):
    # 원두(6mm)가 기본 clip 0.1m에 잘려 빈 렌더가 나왔다 → clip_start 1mm
    cd = bpy.data.cameras.new("cam"); cd.lens = lens; cd.clip_start = 0.001; cam = bpy.data.objects.new("cam", cd); bpy.context.collection.objects.link(cam); sc.camera = cam
    e, a = math.radians(el), math.radians(az)
    cam.location = (dist * math.cos(e) * math.sin(a), -dist * math.cos(e) * math.cos(a), dist * math.sin(e) + dz)
    tr = cam.constraints.new("TRACK_TO"); tr.target = target; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"

def principled(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; return m, m.node_tree, m.node_tree.nodes["Principled BSDF"]
def setin(b, k, v):
    if k in b.inputs: b.inputs[k].default_value = v

def rig(sc, target, dist):
    light("key", (-0.30, -0.22, 0.50), 4.5, 0.30, target); light("fill", (0.40, -0.28, 0.28), 1.0, 0.5, target, (0.95, 0.93, 0.95)); light("top", (0.05, 0.10, 0.65), 1.8, 0.9, target)
    camera(sc, target, dist)

# ── 원두: 타원체 + 윗면 가운데 홈(크리즈) + 표면 미세 요철 ──
def bean(rot_z, seed):
    sc = fresh((500, 500))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=0.006); ob = bpy.context.object; ob.name = "bean"
    ob.scale = (1.0, 0.66, 0.52)
    bm = bmesh.new(); bm.from_mesh(ob.data)
    rnd = random.Random(seed)
    for v in bm.verts:
        x, y, z = v.co
        if z > 0 and abs(y) < 0.0013:  # 윗면 세로 홈 — 좁고 깊게(1차는 초콜릿 캔디처럼 뭉툭)
            f = 1.0 - abs(y) / 0.0013; v.co.z -= 0.0030 * (f ** 0.7)
        v.co.x *= 1.0 + 0.02 * math.sin(z * 900 + seed); v.co += v.normal * (rnd.random() - 0.5) * 0.00006
    bm.to_mesh(ob.data); bm.free()
    for p in ob.data.polygons: p.use_smooth = True
    m = ob.modifiers.new("sub", "SUBSURF"); m.levels = 2; m.render_levels = 2
    ob.rotation_euler = (math.radians(6), math.radians(-4), math.radians(rot_z)); ob.location.z = 0.0031
    mat, nt, b = principled("bean")
    n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 900.0; n.inputs["Detail"].default_value = 6.0
    ramp = nt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = (0.055, 0.022, 0.008, 1); ramp.color_ramp.elements[1].color = (0.20, 0.095, 0.035, 1)  # 로스팅 진한 갈색(합성본에서 밀가루 반죽처럼 보임 → 한 단계 더 어둡게)
    nt.links.new(n.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.30; bump.inputs["Distance"].default_value = 0.0002
    nt.links.new(n.outputs["Fac"], bump.inputs["Height"]); nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    setin(b, "Roughness", 0.5); setin(b, "Coat Weight", 0.3); setin(b, "Coat Roughness", 0.15)  # 기름진 원두 광택
    ob.data.materials.append(mat)
    rig(sc, ob, 0.075)
    sc.render.filepath = os.path.join(OUT, f"bean{seed}.png"); bpy.ops.render.render(write_still=True); print("RENDERED", sc.render.filepath)

# ── 만년필: 캡(청색 래커)·몸통·금장 링·클립·펜촉. 길이 13.5cm. 바닥에 눕힘, 화면에서 좌상→우하 대각으로 보이도록 회전 ──
def pen():
    sc = fresh((1400, 900))
    L = 0.135; R = 0.0046  # 히어로 펜 굵기 실측(≈길이의 6%)에 맞춤
    parts = []
    def cyl(name, r, length, x0, mat):
        bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=r, depth=length, location=(x0 + length / 2, 0, R), rotation=(0, math.radians(90), 0))
        o = bpy.context.object; o.name = name; o.data.materials.append(mat)
        for p in o.data.polygons: p.use_smooth = True
        parts.append(o); return o
    lac, nt, b = principled("lacquer"); setin(b, "Base Color", (0.13, 0.17, 0.34, 1)); setin(b, "Roughness", 0.18); setin(b, "Coat Weight", 1.0); setin(b, "Coat Roughness", 0.04)
    gold, nt2, b2 = principled("gold"); setin(b2, "Base Color", (0.85, 0.62, 0.25, 1)); setin(b2, "Metallic", 1.0); setin(b2, "Roughness", 0.22)
    cyl("cap", R * 1.06, L * 0.42, 0.0, lac); cyl("capring", R * 1.10, 0.004, L * 0.42 - 0.004, gold)
    cyl("body", R, L * 0.40, L * 0.42, lac); cyl("grip", R * 0.88, L * 0.10, L * 0.82, gold)
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=R * 0.7, radius2=0.0006, depth=L * 0.08, location=(L * 0.92 + L * 0.04, 0, R), rotation=(0, math.radians(90), 0))
    nib = bpy.context.object; nib.name = "nib"; nib.data.materials.append(gold); parts.append(nib)
    for p in nib.data.polygons: p.use_smooth = True
    bpy.ops.mesh.primitive_cube_add(size=1, location=(L * 0.08, 0, R * 2.05)); clip = bpy.context.object; clip.scale = (L * 0.14, R * 0.35, R * 0.22); clip.data.materials.append(gold); parts.append(clip)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=R * 1.06, location=(0, 0, R)); capend = bpy.context.object; capend.scale = (0.6, 1, 1); capend.data.materials.append(lac); parts.append(capend)
    for p in capend.data.polygons: p.use_smooth = True
    # 부품을 한 피벗(펜 중앙)에 붙여 **통째로** 돌린다 — 각 부품을 따로 돌리면 제자리에서 흩어진다(1차 렌더 실사고)
    pivot = bpy.data.objects.new("pivot", None); bpy.context.collection.objects.link(pivot); pivot.location = (L * 0.5, 0, 0)
    for o in parts: o.parent = pivot; o.matrix_parent_inverse = pivot.matrix_world.inverted()
    pivot.rotation_euler.z = 0.0  # 수평 렌더 → composite-props.py에서 2D 회전(-36°)
    ctr = bpy.data.objects.new("ctr", None); bpy.context.collection.objects.link(ctr); ctr.location = (L * 0.5, 0, R)
    rig(sc, ctr, 0.46); sc.camera.data.lens = 55
    sc.render.filepath = os.path.join(OUT, "pen.png"); bpy.ops.render.render(write_still=True); print("RENDERED", sc.render.filepath)

ONLY = argv[2] if len(argv) > 2 else "all"
if ONLY in ("all", "beans"):
    for i, rz in enumerate([20, 75, -40]): bean(rz, i + 1)
if ONLY in ("all", "pen"): pen()
