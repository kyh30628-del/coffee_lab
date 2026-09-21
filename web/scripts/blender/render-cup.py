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
tex = knt.nodes.new("ShaderNodeTexNoise"); tex.inputs["Scale"].default_value = 55.0; tex.inputs["Detail"].default_value = 6.0; tex.inputs["Roughness"].default_value = 0.55; tex.inputs["Distortion"].default_value = 1.6  # 크레마 무늬: 촘촘한 점 → 흐르는 결(타이거)  # 크레마 얼룩(타이거 스트라이프)이 보이는 크기
tex2 = knt.nodes.new("ShaderNodeTexNoise"); tex2.inputs["Scale"].default_value = 16.0; tex2.inputs["Detail"].default_value = 3.0
vor = knt.nodes.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 300.0
ramp = knt.nodes.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].position = 0.30; ramp.color_ramp.elements[0].color = (0.16, 0.07, 0.025, 1)
ramp.color_ramp.elements[1].position = 0.72; ramp.color_ramp.elements[1].color = (0.72, 0.47, 0.21, 1)
e = ramp.color_ramp.elements.new(0.50); e.color = (0.44, 0.24, 0.09, 1)
mixn = knt.nodes.new("ShaderNodeMath"); mixn.operation = "MULTIPLY_ADD"; mixn.inputs[1].default_value = 0.55; mixn.inputs[2].default_value = 0.0
knt.links.new(tex.outputs["Fac"], mixn.inputs[0]); knt.links.new(tex2.outputs["Fac"], mixn.inputs[2])
grad_tc = knt.nodes.new("ShaderNodeTexCoord"); grad_len = knt.nodes.new("ShaderNodeVectorMath"); grad_len.operation = "LENGTH"
knt.links.new(grad_tc.outputs["Object"], grad_len.inputs[0])
edge = knt.nodes.new("ShaderNodeMapRange"); edge.inputs["From Min"].default_value = 0.024; edge.inputs["From Max"].default_value = 0.035; edge.inputs["To Min"].default_value = 0.0; edge.inputs["To Max"].default_value = -0.28
knt.links.new(grad_len.outputs["Value"], edge.inputs["Value"])
addn = knt.nodes.new("ShaderNodeMath"); addn.operation = "ADD"; knt.links.new(mixn.outputs[0], addn.inputs[0]); knt.links.new(edge.outputs["Result"], addn.inputs[1])
knt.links.new(addn.outputs[0], ramp.inputs["Fac"]); knt.links.new(ramp.outputs["Color"], kb.inputs["Base Color"])
bump = knt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.18; bump.inputs["Distance"].default_value = 0.0006
bump2 = knt.nodes.new("ShaderNodeBump"); bump2.inputs["Strength"].default_value = 0.10; bump2.inputs["Distance"].default_value = 0.0004
knt.links.new(vor.outputs["Distance"], bump.inputs["Height"]); knt.links.new(tex.outputs["Fac"], bump2.inputs["Height"]); knt.links.new(bump.outputs["Normal"], bump2.inputs["Normal"])
knt.links.new(bump2.outputs["Normal"], kb.inputs["Normal"])
setin(kb, "Roughness", 0.30); setin(kb, "Coat Weight", 0.35); setin(kb, "Coat Roughness", 0.12); setin(kb, "Subsurface Weight", 0.15); setin(kb, "Subsurface Radius", (0.003, 0.0015, 0.0008))
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
light("key", "AREA", (-0.35, -0.25, 0.55), 5, 0.30)
light("fill", "AREA", (0.45, -0.30, 0.30), 1.2, 0.5, (0.95, 0.93, 0.95))
light("top", "AREA", (0.05, 0.10, 0.70), 2, 0.9)
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
