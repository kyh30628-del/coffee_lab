# ☕ 랜딩 히어로의 커피잔 재렌더(2026-09-21, CEO "크레마·커피를 실감나게") — 원본 hero 장면 파일이 남아 있지 않아
#   잔·받침·커피(크레마)만 같은 시점으로 다시 렌더해 hero.webp에 합성한다(scripts/blender/composite-cup.py).
#   실행: /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/blender/render-cup.py -- <out.png> [samples]
#   Cycles(CPU)·투명 필름·섀도 캐처(접지 그림자 포함). 비용 0(로컬).
import bpy, bmesh, sys, math, os
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/cup.png"
SAMPLES = int(argv[1]) if len(argv) > 1 else 256

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
sc.render.film_transparent = True
sc.render.resolution_x = 1000; sc.render.resolution_y = 1000; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
vts = [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items]
sc.view_settings.view_transform = "AgX" if "AgX" in vts else ("Filmic" if "Filmic" in vts else "Standard")  # 하이라이트 클리핑 방지(1차 렌더가 전부 흰색으로 날아감)
sc.view_settings.look = "None"; sc.view_settings.exposure = -1.2  # 2차 렌더도 잔이 하얗게 날아가 대비 0 → 노출 -1.2

def lathe(name, profile, steps=96):
    """profile: [(r, z), ...] 위→아래 순서. z축 회전체."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    m = ob.modifiers.new("sub", "SUBSURF"); m.levels = 2; m.render_levels = 3
    return ob

def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]; return m, nt, bsdf
def setin(bsdf, key, val):
    if key in bsdf.inputs: bsdf.inputs[key].default_value = val

# ── 잔(도자기): 살짝 벌어진 원통 + 두께 있는 림 + 안쪽 벽 + 바닥 ──
R, H, T = 0.042, 0.062, 0.0045   # 반지름 4.2cm · 높이 6.2cm · 두께
cup = lathe("cup", [
    (R * 0.78, 0.0), (R * 0.80, 0.004), (R * 0.90, 0.012), (R, H * 0.55), (R * 1.02, H - 0.006), (R * 1.02, H),  # 바깥
    (R * 1.02 - T, H), (R * 0.985 - T, H - 0.010), (R * 0.92 - T, H * 0.45), (R * 0.80 - T, 0.012), (0.0, 0.0085),  # 안쪽·바닥
])
cm, cnt, cb = mat("ceramic"); setin(cb, "Base Color", (0.86, 0.83, 0.79, 1)); setin(cb, "Roughness", 0.12)
setin(cb, "Coat Weight", 0.8); setin(cb, "Coat Roughness", 0.05); setin(cb, "Subsurface Weight", 0.08); setin(cb, "Subsurface Radius", (0.006, 0.004, 0.003)); setin(cb, "IOR", 1.5)
cup.data.materials.append(cm)
# 손잡이: 토러스 조각 — 잔 오른쪽에 붙임
bpy.ops.mesh.primitive_torus_add(major_radius=0.019, minor_radius=0.0055, major_segments=64, minor_segments=24, location=(R * 1.02 + 0.012, 0, H * 0.52), rotation=(math.radians(90), 0, 0))
handle = bpy.context.object; handle.name = "handle"; handle.scale = (1.0, 1.25, 1.0)
for p in handle.data.polygons: p.use_smooth = True
handle.data.materials.append(cm)
# ── 받침 ──
SR = 0.078
saucer = lathe("saucer", [(SR, 0.0035), (SR * 0.98, 0.0), (SR * 0.55, 0.0), (SR * 0.50, 0.0005), (0.0, 0.0005),
                          (0.0, 0.0028), (SR * 0.46, 0.0028), (SR * 0.60, 0.0055), (SR * 0.90, 0.0105), (SR, 0.0115)])
saucer.data.materials.append(cm)
cup.location.z = 0.0028; handle.location.z += 0.0028
# ── 커피 + 크레마 ──
LIQ_Z = 0.0028 + H - 0.009
coffee = lathe("coffee", [(R * 0.985 - T + 0.0004, LIQ_Z), (0.0, LIQ_Z)], steps=96)
km, knt, kb = mat("crema")
# ☕ 2026-09-21 2차(CEO "내용물이 커피 아닌 것 같다"): 전면 얼룩 크레마 → **어둡고 반짝이는 커피 표면** + 벽 쪽 얇은 황금 크레마 링 + 기포.
#   커피로 읽히는 건 색보다 '검고 젖은 반사'다. 액체는 거울에 가깝게(roughness 0.06·coat 1), 크레마는 가장자리 링에만 두텁고 가운데는 옅은 소용돌이.
tc = knt.nodes.new("ShaderNodeTexCoord"); flat = knt.nodes.new("ShaderNodeVectorMath"); flat.operation = "MULTIPLY"; flat.inputs[1].default_value = (1, 1, 0)
knt.links.new(tc.outputs["Object"], flat.inputs[0]); rad = knt.nodes.new("ShaderNodeVectorMath"); rad.operation = "LENGTH"; knt.links.new(flat.outputs["Vector"], rad.inputs[0])  # XY 반지름(z 섞이면 전면 크레마 — 4차 실사고)
ringw = knt.nodes.new("ShaderNodeMapRange"); ringw.inputs["From Min"].default_value = 0.0295; ringw.inputs["From Max"].default_value = 0.0352  # 벽 쪽 얇은 크레마·기포 링(≈5mm); ringw.inputs["To Min"].default_value = 0.0; ringw.inputs["To Max"].default_value = 1.0
knt.links.new(rad.outputs["Value"], ringw.inputs["Value"])
swirl = knt.nodes.new("ShaderNodeTexNoise"); swirl.inputs["Scale"].default_value = 14.0; swirl.inputs["Detail"].default_value = 3.0; swirl.inputs["Roughness"].default_value = 0.5; swirl.inputs["Distortion"].default_value = 1.8
sw = knt.nodes.new("ShaderNodeMapRange"); sw.inputs["From Min"].default_value = 0.45; sw.inputs["From Max"].default_value = 0.80; sw.inputs["To Min"].default_value = 0.0; sw.inputs["To Max"].default_value = 0.14  # 가운데는 옅은 소용돌이만
knt.links.new(swirl.outputs["Fac"], sw.inputs["Value"])
cremaF = knt.nodes.new("ShaderNodeMath"); cremaF.operation = "MAXIMUM"; knt.links.new(ringw.outputs["Result"], cremaF.inputs[0]); knt.links.new(sw.outputs["Result"], cremaF.inputs[1])
mixc = knt.nodes.new("ShaderNodeMix"); mixc.data_type = "RGBA"; mixc.inputs[6].default_value = (0.040, 0.018, 0.007, 1); mixc.inputs[7].default_value = (0.46, 0.27, 0.10, 1)
knt.links.new(cremaF.outputs[0], mixc.inputs[0]); knt.links.new(mixc.outputs[2], kb.inputs["Base Color"])
mixr = knt.nodes.new("ShaderNodeMapRange"); mixr.inputs["From Min"].default_value = 0.0; mixr.inputs["From Max"].default_value = 1.0; mixr.inputs["To Min"].default_value = 0.10; mixr.inputs["To Max"].default_value = 0.45
knt.links.new(cremaF.outputs[0], mixr.inputs["Value"]); knt.links.new(mixr.outputs["Result"], kb.inputs["Roughness"])
vor = knt.nodes.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 520.0
bub = knt.nodes.new("ShaderNodeMath"); bub.operation = "MULTIPLY"; knt.links.new(vor.outputs["Distance"], bub.inputs[0]); knt.links.new(ringw.outputs["Result"], bub.inputs[1])
bump = knt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.25; bump.inputs["Distance"].default_value = 0.0005
knt.links.new(bub.outputs[0], bump.inputs["Height"]); knt.links.new(bump.outputs["Normal"], kb.inputs["Normal"])
setin(kb, "Coat Weight", 0.6); setin(kb, "Coat Roughness", 0.03); setin(kb, "Specular IOR Level", 0.4)  # 3차: 코트 1.0+큰 조명이 표면 전체를 살구색 반사로 덮어 라떼처럼 보였다 → 반사는 뚜렷한 하이라이트 한 점만
coffee.data.materials.append(km)
# 크레마 가장자리의 얇은 어두운 링(잔 벽 접촉선) — 액체 표면 가장자리에 살짝 오목한 메니스커스
ring = lathe("meniscus", [(R * 0.985 - T + 0.0004, LIQ_Z + 0.0012), (R * 0.985 - T - 0.0015, LIQ_Z)], steps=96)
ring.data.materials.append(km)
# ── 바닥: 섀도 캐처(접지 그림자만 남긴다) ──
bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, 0)); ground = bpy.context.object; ground.is_shadow_catcher = True
# ── 조명: 히어로와 같은 왼쪽 위 따뜻한 키 + 오른쪽 약한 필 + 위쪽 넓은 소프트 ──
def light(name, kind, loc, energy, size=0.3, color=(1, 0.93, 0.82)):
    d = bpy.data.lights.new(name, kind); d.energy = energy; d.color = color
    if kind == "AREA": d.size = size
    o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o); o.location = loc
    tr = o.constraints.new("TRACK_TO"); tr.target = cup; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"; return o
light("key", "AREA", (-0.35, -0.25, 0.55), 5, 0.22)
light("fill", "AREA", (0.45, -0.30, 0.30), 1.2, 0.5, (0.95, 0.93, 0.95))
light("top", "AREA", (0.05, 0.10, 0.70), 2, 0.9)
light("window", "AREA", (-0.12, 0.30, 0.80), 2.0, 0.22, (1, 1, 1))  # 커피 표면에 비치는 창 하이라이트
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True; w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.18, 0.11, 0.07, 1); w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.15
# ── 카메라: 히어로와 같은 내려다보는 시점(앞·약간 왼쪽에서 약 38°) ──
cam_d = bpy.data.cameras.new("cam"); cam_d.lens = 55; cam = bpy.data.objects.new("cam", cam_d); bpy.context.collection.objects.link(cam); sc.camera = cam
el, az, dist = math.radians(38), math.radians(-18), 0.36
cam.location = (dist * math.cos(el) * math.sin(az), -dist * math.cos(el) * math.cos(az), dist * math.sin(el) + 0.02)
tr = cam.constraints.new("TRACK_TO"); tr.target = cup; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"
cup_ctr = bpy.data.objects.new("ctr", None); bpy.context.collection.objects.link(cup_ctr); cup_ctr.location = (0.004, 0, 0.03); tr.target = cup_ctr
sc.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print("RENDERED", OUT)
