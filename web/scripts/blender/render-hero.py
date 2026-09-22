# 📓 랜딩 히어로 **한 장면** 재렌더(2026-09-21 CEO "잔 주변 자국 거슬려, 한 장면으로 다시") — 호두나무 테이블·펼친 노트·커피잔·원두·만년필.
#   실행: Blender -b --python scripts/blender/render-hero.py -- <out_dir> [samples] [scale%]
#   산출: hero.png(1400×1680) · quad.json(오른쪽 페이지 4모서리·잔 액면 중심의 이미지 비율 좌표 → app/page.tsx HERO_PAGE/HERO_CUP)
#        · pen-top.png(167×1382, 글 쓰는 펜 오버레이 public/note/pen.webp용, 촉 끝 비율 포함)
#   페이지 텍스처는 PIL로 생성(2100×2900: 제목·줄·여백선) — 손글씨 오버레이 규격(첫 줄 560/2900·간격 170/2900)과 동일.
import bpy, bmesh, sys, math, os, json, random, subprocess
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "/tmp/hero"; SAMPLES = int(argv[1]) if len(argv) > 1 else 128; SCALE = int(argv[2]) if len(argv) > 2 else 100
os.makedirs(OUT, exist_ok=True)

# ───────── 페이지 텍스처(PIL, 별도 프로세스 — Blender 파이썬엔 PIL이 없다) ─────────
PAGE_TEX = os.path.join(OUT, "page.png"); PAGE_TEX_L = os.path.join(OUT, "page-left.png")
subprocess.run(["/usr/bin/python3", "-c", r'''
import sys
from PIL import Image, ImageDraw, ImageFont
W, H = 2100, 2900
def page(path, title, ring=False):
    # 2026-09-22 CEO("밋밋하다·실감나게"): 종이 결(미세 잡티)·가장자리 살짝 누런 톤·잉크 번짐 없는 얇은 줄·연한 커피 자국(왼쪽 페이지)
    import random; rnd = random.Random(7)
    im = Image.new("RGB", (W, H), (247, 241, 229)); px = im.load()
    for _ in range(90000):                                    # 종이 섬유 잡티
        x, y = rnd.randrange(W), rnd.randrange(H); v = rnd.randint(-9, 6); r, g, b = px[x, y]; px[x, y] = (max(0, min(255, r + v)), max(0, min(255, g + v)), max(0, min(255, b + v - 1)))
    d = ImageDraw.Draw(im, "RGBA")
    for i in range(14):                                       # 가장자리 누런 기운(바깥으로 갈수록)
        d.rectangle((i * 6, i * 6, W - 1 - i * 6, H - 1 - i * 6), outline=(200, 170, 120, 5 + (14 - i)), width=6)
    for y in range(560, H - 120, 170):
        d.line((150, y, W - 90, y), fill=(150, 160, 186, 245), width=4)                                # 줄(파랑기 회색) — 조명에 씻겨 안 보이던 것을 진하게(09-22)
        d.line((150, y + 3, W - 90, y + 3), fill=(178, 186, 204, 40), width=1)                          # 인쇄 번짐 한 줄
    d.line((300, 360, 300, H - 100), fill=(214, 120, 110, 235), width=3)                                # 여백선(붉은)
    if ring:                                                  # 잔 자국 — 두 겹 얇은 고리(커피색)
        cx, cy, R = 1500, 2300, 235
        for k, (rr, a) in enumerate([(R, 34), (R - 10, 18), (R + 8, 12)]):
            d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=(120, 78, 44, a), width=9 - k * 2)
        d.arc((cx - R - 2, cy - R - 2, cx + R + 2, cy + R + 2), 200, 330, fill=(120, 78, 44, 60), width=14)
    if title:
        f = ImageFont.truetype("/System/Library/Fonts/Supplemental/AppleMyungjo.ttf", 190)
        d.text((330, 200), title, font=f, fill=(58, 44, 34))
        f2 = ImageFont.truetype("/System/Library/Fonts/Supplemental/AppleGothic.ttf", 50)
        d.text((338, 420), "D O N G N E   C O F F E E   N O T E   ·   2 0 2 6", font=f2, fill=(150, 138, 122))
    im.save(path)
page(sys.argv[1], ""); page(sys.argv[2], "", ring=True)   # 2026-09-22: 제목은 굽지 않는다(머리글은 HTML) · 왼쪽 페이지엔 잔 자국
''', PAGE_TEX, PAGE_TEX_L], check=True)

# ───────── 장면 ─────────
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1400, 1680, SCALE
sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGB"
vts = [i.identifier for i in sc.view_settings.bl_rna.properties["view_transform"].enum_items]
sc.view_settings.view_transform = "AgX" if "AgX" in vts else "Standard"; sc.view_settings.look = "None"; sc.view_settings.exposure = -1.0
w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.20, 0.13, 0.08, 1); w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.35

def mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; return m, m.node_tree, m.node_tree.nodes["Principled BSDF"]
def setin(b, k, v):
    if k in b.inputs: b.inputs[k].default_value = v
def smooth(ob, sub=2):
    for p in ob.data.polygons: p.use_smooth = True
    if sub: m = ob.modifiers.new("sub", "SUBSURF"); m.levels = min(2, sub); m.render_levels = sub
def lathe(name, profile, steps=96, sub=3):
    bm = bmesh.new(); vs = [bm.verts.new((r, 0.0, z)) for r, z in profile]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); smooth(ob, sub); return ob
def box(name, size, loc, m):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); ob = bpy.context.object; ob.name = name; ob.scale = size; ob.data.materials.append(m)
    bev = ob.modifiers.new("bev", "BEVEL"); bev.width = 0.0015; bev.segments = 3; return ob

# ── 테이블: 호두나무(늘인 노이즈 결) ──
bpy.ops.mesh.primitive_plane_add(size=3.0, location=(0, 0.2, 0)); table = bpy.context.object; table.name = "table"
wm, wnt, wb = mat("walnut")
tc = wnt.nodes.new("ShaderNodeTexCoord"); mp = wnt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (2.2, 26.0, 1.0); mp.inputs["Rotation"].default_value = (0, 0, math.radians(4))
wnt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
nz = wnt.nodes.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 1.6; nz.inputs["Detail"].default_value = 6.0; nz.inputs["Roughness"].default_value = 0.55; nz.inputs["Distortion"].default_value = 0.9
wnt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
wave = wnt.nodes.new("ShaderNodeTexWave"); wave.wave_type = "BANDS"; wave.bands_direction = "Y"; wave.inputs["Scale"].default_value = 3.2; wave.inputs["Distortion"].default_value = 4.5; wave.inputs["Detail"].default_value = 3.0
wnt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
mixw = wnt.nodes.new("ShaderNodeMath"); mixw.operation = "MULTIPLY_ADD"; mixw.inputs[1].default_value = 0.55; wnt.links.new(wave.outputs["Fac"], mixw.inputs[0]); wnt.links.new(nz.outputs["Fac"], mixw.inputs[2])
wr = wnt.nodes.new("ShaderNodeValToRGB"); wr.color_ramp.elements[0].position = 0.25; wr.color_ramp.elements[0].color = (0.055, 0.030, 0.018, 1)
wr.color_ramp.elements[1].position = 0.95; wr.color_ramp.elements[1].color = (0.26, 0.15, 0.085, 1); e = wr.color_ramp.elements.new(0.6); e.color = (0.15, 0.085, 0.045, 1)
wnt.links.new(mixw.outputs[0], wr.inputs["Fac"]); wnt.links.new(wr.outputs["Color"], wb.inputs["Base Color"])
wbump = wnt.nodes.new("ShaderNodeBump"); wbump.inputs["Strength"].default_value = 0.08; wbump.inputs["Distance"].default_value = 0.0005; wnt.links.new(mixw.outputs[0], wbump.inputs["Height"]); wnt.links.new(wbump.outputs["Normal"], wb.inputs["Normal"])
setin(wb, "Roughness", 0.38); setin(wb, "Coat Weight", 0.35); setin(wb, "Coat Roughness", 0.25)
table.data.materials.append(wm)

# ── 노트: 표지(적갈색) + 페이지 뭉치 2 + 윗장 텍스처 + 책갈피 리본 ──
PW, PH = 0.210, 0.290; TH = 0.012
cov, cnt, cb = mat("cover"); setin(cb, "Base Color", (0.40, 0.22, 0.16, 1)); setin(cb, "Roughness", 0.55)
box("cover", (PW * 2 + 0.014, PH + 0.012, 0.006), (0, PH / 2, 0.003), cov)
pap, pnt, pb = mat("paper"); setin(pb, "Base Color", (0.93, 0.90, 0.84, 1)); setin(pb, "Roughness", 0.9)
box("stackL", (PW - 0.002, PH - 0.002, TH), (-PW / 2 - 0.002, PH / 2, 0.006 + TH / 2), pap)
box("stackR", (PW - 0.002, PH - 0.002, TH), (PW / 2 + 0.002, PH / 2, 0.006 + TH / 2), pap)
def top_page(name, tex, x0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x0 + PW / 2, PH / 2, 0.006 + TH + 0.0003)); ob = bpy.context.object; ob.name = name; ob.scale = (PW, PH, 1)
    m, nt, b = mat(name + "_m"); img = nt.nodes.new("ShaderNodeTexImage"); img.image = bpy.data.images.load(tex); nt.links.new(img.outputs["Color"], b.inputs["Base Color"])
    setin(b, "Roughness", 0.92); setin(b, "Coat Weight", 0.0); ob.data.materials.append(m); return ob
pageR = top_page("pageR", PAGE_TEX, 0.002); pageL = top_page("pageL", PAGE_TEX_L, -PW - 0.002)
rib, rnt, rb = mat("ribbon"); setin(rb, "Base Color", (0.85, 0.42, 0.45, 1)); setin(rb, "Roughness", 0.6)
box("ribbon", (0.012, 0.09, 0.0008), (-PW * 0.55, -0.035, 0.0022), rib)

# ── 커피잔·받침·커피(render-cup.py와 동일 재질) ──
R, H, T = 0.042, 0.062, 0.0045
CUP_AT = (0.29, 0.22)  # 노트 오른쪽 가장자리(0.219)+받침 반지름(0.078) 밖, 이미지 y≈0.3(데스크톱 띠 안)  # 데스크톱은 세로 이미지의 가운데 띠(y≈0.35~0.65)만 보인다 → 잔을 그 띠 안으로(카메라 쪽으로)  # 받침(반지름 7.8cm)이 노트 오른쪽 가장자리(x≈0.219)에 안 닿게 + 위쪽으로
cup = lathe("cup", [(R * 0.78, 0.0), (R * 0.80, 0.004), (R * 0.90, 0.012), (R, H * 0.55), (R * 1.02, H - 0.006), (R * 1.02, H), (R * 1.02 - T, H), (R * 0.985 - T, H - 0.010), (R * 0.92 - T, H * 0.45), (R * 0.80 - T, 0.012), (0.0, 0.0085)])
cer, cnt2, cb2 = mat("ceramic"); setin(cb2, "Base Color", (0.86, 0.83, 0.79, 1)); setin(cb2, "Roughness", 0.12); setin(cb2, "Coat Weight", 0.8); setin(cb2, "Coat Roughness", 0.05); setin(cb2, "Subsurface Weight", 0.08); setin(cb2, "Subsurface Radius", (0.006, 0.004, 0.003))
cup.data.materials.append(cer)
bpy.ops.mesh.primitive_torus_add(major_radius=0.019, minor_radius=0.0055, major_segments=64, minor_segments=24, location=(R * 1.02 + 0.012, 0, H * 0.52), rotation=(math.radians(90), 0, 0))
handle = bpy.context.object; handle.name = "handle"; handle.scale = (1.0, 1.25, 1.0); smooth(handle, 0); handle.data.materials.append(cer)
SR = 0.068  # 에스프레소 받침 13.6cm(15.6cm는 프레임 오른쪽에서 잘림)
saucer = lathe("saucer", [(SR, 0.0035), (SR * 0.98, 0.0), (SR * 0.55, 0.0), (SR * 0.50, 0.0005), (0.0, 0.0005), (0.0, 0.0028), (SR * 0.46, 0.0028), (SR * 0.60, 0.0055), (SR * 0.90, 0.0105), (SR, 0.0115)])
saucer.data.materials.append(cer)
LIQ_Z = 0.0028 + H - 0.009
coffee = lathe("coffee", [(R * 0.985 - T + 0.0004, LIQ_Z), (0.0, LIQ_Z)])
km, knt, kb = mat("coffee")
tcc = knt.nodes.new("ShaderNodeTexCoord"); flat = knt.nodes.new("ShaderNodeVectorMath"); flat.operation = "MULTIPLY"; flat.inputs[1].default_value = (1, 1, 0); knt.links.new(tcc.outputs["Object"], flat.inputs[0])
rad = knt.nodes.new("ShaderNodeVectorMath"); rad.operation = "LENGTH"; knt.links.new(flat.outputs["Vector"], rad.inputs[0])
ringw = knt.nodes.new("ShaderNodeMapRange"); ringw.inputs["From Min"].default_value = 0.0295; ringw.inputs["From Max"].default_value = 0.0352; knt.links.new(rad.outputs["Value"], ringw.inputs["Value"])
swirl = knt.nodes.new("ShaderNodeTexNoise"); swirl.inputs["Scale"].default_value = 14.0; swirl.inputs["Detail"].default_value = 3.0; swirl.inputs["Distortion"].default_value = 1.8
sw = knt.nodes.new("ShaderNodeMapRange"); sw.inputs["From Min"].default_value = 0.45; sw.inputs["From Max"].default_value = 0.80; sw.inputs["To Max"].default_value = 0.14; knt.links.new(swirl.outputs["Fac"], sw.inputs["Value"])
cf = knt.nodes.new("ShaderNodeMath"); cf.operation = "MAXIMUM"; knt.links.new(ringw.outputs["Result"], cf.inputs[0]); knt.links.new(sw.outputs["Result"], cf.inputs[1])
mixc = knt.nodes.new("ShaderNodeMix"); mixc.data_type = "RGBA"; mixc.inputs[6].default_value = (0.040, 0.018, 0.007, 1); mixc.inputs[7].default_value = (0.46, 0.27, 0.10, 1)
knt.links.new(cf.outputs[0], mixc.inputs[0]); knt.links.new(mixc.outputs[2], kb.inputs["Base Color"])
mixr = knt.nodes.new("ShaderNodeMapRange"); mixr.inputs["To Min"].default_value = 0.10; mixr.inputs["To Max"].default_value = 0.45; knt.links.new(cf.outputs[0], mixr.inputs["Value"]); knt.links.new(mixr.outputs["Result"], kb.inputs["Roughness"])
vor = knt.nodes.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 520.0
bub = knt.nodes.new("ShaderNodeMath"); bub.operation = "MULTIPLY"; knt.links.new(vor.outputs["Distance"], bub.inputs[0]); knt.links.new(ringw.outputs["Result"], bub.inputs[1])
kbump = knt.nodes.new("ShaderNodeBump"); kbump.inputs["Strength"].default_value = 0.25; kbump.inputs["Distance"].default_value = 0.0005; knt.links.new(bub.outputs[0], kbump.inputs["Height"]); knt.links.new(kbump.outputs["Normal"], kb.inputs["Normal"])
setin(kb, "Coat Weight", 0.6); setin(kb, "Coat Roughness", 0.03); setin(kb, "Specular IOR Level", 0.4)
coffee.data.materials.append(km)
for o in (cup, saucer, coffee):
    o.location.x += CUP_AT[0]; o.location.y += CUP_AT[1]
    if o is not saucer: o.location.z += 0.0028
# 🔴 손잡이는 자기 원점(잔 오른쪽)에서 회전하면 제자리에서만 돈다(hero7 실사고: 여전히 오른쪽 프레임에 걸림).
#   잔 중심을 축으로 **위치를 옮겨** 붙인다. θ=120° = 뒤·왼쪽(잔과 노트 사이 위쪽, 프레임 안·노트와 안 겹침: x_min≈0.238>0.219)
HANDLE_TH = math.radians(120); HD = R * 1.02 + 0.012
handle.location = (CUP_AT[0] + HD * math.cos(HANDLE_TH), CUP_AT[1] + HD * math.sin(HANDLE_TH), H * 0.52 + 0.0028)
handle.rotation_euler = (math.radians(90), 0, HANDLE_TH)

# ── 원두 5알 ──
bmat, bnt, bb = mat("bean")
bn = bnt.nodes.new("ShaderNodeTexNoise"); bn.inputs["Scale"].default_value = 900.0; bn.inputs["Detail"].default_value = 6.0
br = bnt.nodes.new("ShaderNodeValToRGB"); br.color_ramp.elements[0].color = (0.055, 0.022, 0.008, 1); br.color_ramp.elements[1].color = (0.20, 0.095, 0.035, 1)
bnt.links.new(bn.outputs["Fac"], br.inputs["Fac"]); bnt.links.new(br.outputs["Color"], bb.inputs["Base Color"])
bbump = bnt.nodes.new("ShaderNodeBump"); bbump.inputs["Strength"].default_value = 0.30; bbump.inputs["Distance"].default_value = 0.0002; bnt.links.new(bn.outputs["Fac"], bbump.inputs["Height"]); bnt.links.new(bbump.outputs["Normal"], bb.inputs["Normal"])
setin(bb, "Roughness", 0.5); setin(bb, "Coat Weight", 0.3); setin(bb, "Coat Roughness", 0.15)
def bean(loc, rz, seed):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=64, radius=0.0105); ob = bpy.context.object; ob.name = f"bean{seed}"  # 카메라가 노트에 가까워 멀리 있는 원두가 작아짐 → 크게; ob.scale = (1.0, 0.66, 0.52)
    bm = bmesh.new(); bm.from_mesh(ob.data); rnd = random.Random(seed)
    for v in bm.verts:
        x, y, z = v.co
        if z > 0 and abs(y) < 0.0013: f = 1.0 - abs(y) / 0.0013; v.co.z -= 0.0030 * (f ** 0.7)
        v.co += v.normal * (rnd.random() - 0.5) * 0.00006
    bm.to_mesh(ob.data); bm.free(); smooth(ob, 2)
    ob.rotation_euler = (math.radians(6), math.radians(-4), math.radians(rz)); ob.location = (loc[0], loc[1], 0.0031); ob.data.materials.append(bmat)
for i, (loc, rz) in enumerate([((0.00, 0.36), 20), ((0.31, 0.37), 75), ((-0.29, 0.29), 110), ((0.36, 0.05), -40), ((-0.27, -0.03), 15)]): bean(loc, rz, i + 1)  # 전부 프레임 안·노트 밖(09-22)

# ── 만년필(세련된 시가형): 검정 래커 + 금장. 오른쪽 페이지 아래에 36° 대각으로 눕힘 ──
def build_pen():
    L = 0.138; Rb = 0.0062
    lac, lnt, lb = mat("lacquer"); setin(lb, "Base Color", (0.010, 0.010, 0.012, 1)); setin(lb, "Roughness", 0.12); setin(lb, "Coat Weight", 1.0); setin(lb, "Coat Roughness", 0.03)
    gold, gnt, gb = mat("gold"); setin(gb, "Base Color", (0.93, 0.70, 0.30, 1)); setin(gb, "Metallic", 1.0); setin(gb, "Roughness", 0.18)
    # 캡+몸통을 하나의 회전체(시가형: 양끝이 부드럽게 좁아짐). 축 = z → 나중에 x축으로 눕힘
    prof = [(0.0, 0.0), (Rb * 0.55, 0.0), (Rb * 0.92, 0.010), (Rb, 0.030), (Rb, L * 0.44), (Rb * 0.98, L * 0.44 + 0.002), (Rb * 0.98, L * 0.80), (Rb * 0.90, L * 0.88), (Rb * 0.62, L * 0.93), (0.0, L * 0.93)]
    body = lathe("penbody", prof, steps=96, sub=2); body.data.materials.append(lac)
    ring = lathe("penring", [(Rb * 0.98, L * 0.44 - 0.004), (Rb * 1.05, L * 0.44 - 0.003), (Rb * 1.05, L * 0.44 + 0.004), (Rb * 0.98, L * 0.44 + 0.005)], steps=96, sub=1); ring.data.materials.append(gold)
    fin = lathe("penfinial", [(0.0, L * 0.93), (Rb * 0.62, L * 0.93), (Rb * 0.55, L * 0.945), (Rb * 0.30, L * 0.96), (0.0, L * 0.965)], steps=64, sub=2); fin.data.materials.append(gold)
    nib = lathe("pennib", [(0.0, 0.0), (Rb * 0.55, 0.0), (Rb * 0.42, -0.010), (Rb * 0.12, -0.020), (0.0, -0.0205)], steps=64, sub=2); nib.data.materials.append(gold); nib.scale = (1.0, 0.55, 1.0)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(Rb * 1.15, 0, L * 0.72)); clip = bpy.context.object; clip.name = "penclip"; clip.scale = (Rb * 0.45, Rb * 0.55, L * 0.30); clip.data.materials.append(gold)
    bev = clip.modifiers.new("bev", "BEVEL"); bev.width = 0.0006; bev.segments = 4
    parts = [body, ring, fin, nib, clip]
    piv = bpy.data.objects.new("penpivot", None); bpy.context.collection.objects.link(piv)
    for o in parts: o.parent = piv; o.hide_render = True  # 장면에선 숨김(CEO: 펜은 글 쓰는 펜 하나만)
    return piv, L, Rb
pen_piv, PEN_L, PEN_R = build_pen()
# 눕히기: z축 → 테이블 위, 촉이 오른쪽 아래(카메라 쪽)로. 페이지 위(z = 0.006+TH)에 놓는다.
pen_piv.hide_render = True; pen_piv.rotation_euler = (0, math.radians(90), math.radians(54))  # 촉이 오른쪽 아래(카메라 쪽)로 — 프리뷰에선 반대로 누워 캡이 프레임 밖
pen_piv.location = (0.192, 0.012, 0.006 + TH + PEN_R)  # 페이지 오른쪽 아래 구석(손글씨 줄과 안 겹치게 — 오버레이 글은 페이지 폭 거의 전부를 쓴다)

# ── 디저트: 작은 접시 위 마카롱 3개(딸기·피스타치오·초콜릿) — 노트 오른쪽·잔 아래, 어디와도 안 겹치게 ──
PLATE_AT = (0.20, 0.41); PR = 0.055  # 노트 위쪽(y>0.30)·잔 왼쪽 — 어디와도 안 겹침
plate = lathe("plate", [(PR, 0.006), (PR * 0.97, 0.0025), (PR * 0.60, 0.0), (0.0, 0.0), (0.0, 0.0015), (PR * 0.58, 0.0015), (PR * 0.92, 0.0045), (PR, 0.007)])
plate.data.materials.append(cer); plate.location = (PLATE_AT[0], PLATE_AT[1], 0)
def macaron(name, loc, rz, tilt, shell_rgb, fill_rgb):
    mr = 0.020  # 지름 4cm
    shm, snt, sb = mat(name + "_shell"); setin(sb, "Base Color", (*shell_rgb, 1)); setin(sb, "Roughness", 0.62); setin(sb, "Subsurface Weight", 0.35); setin(sb, "Subsurface Radius", (0.004, 0.003, 0.002))
    sn = snt.nodes.new("ShaderNodeTexNoise"); sn.inputs["Scale"].default_value = 1400.0; sn.inputs["Detail"].default_value = 5.0
    sbump = snt.nodes.new("ShaderNodeBump"); sbump.inputs["Strength"].default_value = 0.25; sbump.inputs["Distance"].default_value = 0.00012; snt.links.new(sn.outputs["Fac"], sbump.inputs["Height"]); snt.links.new(sbump.outputs["Normal"], sb.inputs["Normal"])
    fm, fnt, fb = mat(name + "_fill"); setin(fb, "Base Color", (*fill_rgb, 1)); setin(fb, "Roughness", 0.45); setin(fb, "Subsurface Weight", 0.3)
    piv = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(piv)
    parts = []
    for sign, z0 in ((1, 0.0105), (-1, 0.0095)):   # 위 껍질(볼록 위) · 아래 껍질(볼록 아래)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=mr, location=(0, 0, z0)); sh = bpy.context.object; sh.scale = (1, 1, 0.42 * sign if sign > 0 else 0.42); sh.name = name + ("_top" if sign > 0 else "_bot")
        if sign < 0: sh.rotation_euler.x = math.radians(180)
        smooth(sh, 1); sh.data.materials.append(shm); parts.append(sh)
        bpy.ops.mesh.primitive_torus_add(major_radius=mr * 0.86, minor_radius=mr * 0.13, major_segments=64, minor_segments=16, location=(0, 0, z0 + (-0.0045 if sign > 0 else 0.0045)))  # 발(피에)
        ft = bpy.context.object; smooth(ft, 0); ft.data.materials.append(shm); parts.append(ft)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=mr * 0.82, depth=0.006, location=(0, 0, 0.010)); fl = bpy.context.object; smooth(fl, 0); fl.data.materials.append(fm); parts.append(fl)
    for o in parts: o.parent = piv
    piv.location = (loc[0], loc[1], 0.007 + (0.0 if tilt == 0 else 0.004)); piv.rotation_euler = (math.radians(tilt), 0, math.radians(rz))
macaron("mac_straw", (PLATE_AT[0] - 0.016, PLATE_AT[1] + 0.012, 0), 15, 0, (0.93, 0.55, 0.62), (0.98, 0.90, 0.88))
macaron("mac_pist", (PLATE_AT[0] + 0.020, PLATE_AT[1] + 0.006, 0), -30, 0, (0.72, 0.80, 0.50), (0.93, 0.95, 0.80))
macaron("mac_choc", (PLATE_AT[0] + 0.002, PLATE_AT[1] - 0.022, 0), 40, 28, (0.33, 0.20, 0.12), (0.55, 0.36, 0.22))  # 하나는 기대어 놓음

# ── 조명·카메라 ──
def light(name, loc, energy, size, target, color=(1, 0.93, 0.82)):
    d = bpy.data.lights.new(name, "AREA"); d.energy = energy; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o); o.location = loc
    tr = o.constraints.new("TRACK_TO"); tr.target = target; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"
aim = bpy.data.objects.new("aim", None); bpy.context.collection.objects.link(aim); aim.location = (0.06, 0.16, 0.0)
light("key", (-0.9, -0.6, 1.4), 55, 1.2, aim); light("fill", (1.1, -0.7, 0.9), 12, 1.6, aim, (0.95, 0.93, 0.95)); light("rim", (0.2, 1.4, 1.2), 22, 1.0, aim)
light("window", (-0.05, 0.42, 0.62), 3.0, 0.14, aim, (1, 1, 1))  # 커피 표면 창 하이라이트(작게)  # 1차 프리뷰 전면 백화 → 1/8
cd = bpy.data.cameras.new("cam"); cd.lens = 42; cd.clip_start = 0.01; cam = bpy.data.objects.new("cam", cd); bpy.context.collection.objects.link(cam); sc.camera = cam
CAM = json.loads(os.environ.get("HERO_CAM", "null")) or {"loc": [0.0565, -0.435, 0.6175], "aim": [0.05, 0.15, 0.0], "lens": 37}  # 09-22 스윕: 노트 전체(표지 왼쪽 끝 x≈0.04)·잔(우측 0.91)·접시(y 0.30)·원두 전부 프레임 안, 데스크톱 띠(0.23~0.77) 안  # 09-22 CEO "노트 줄여서 전부 안 잘리게": 카메라 1.4배 뒤로  # 09-21 스윕 확정: 옛 히어로 페이지 사각형(0.22,0.30)-(0.71,0.30)-(0.77,0.83)-(0.105,0.82)에 근접
cam.location = tuple(CAM["loc"]); cd.lens = CAM["lens"]; aim.location = tuple(CAM["aim"])
tr = cam.constraints.new("TRACK_TO"); tr.target = aim; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"
bpy.context.view_layer.update()

# ── 좌표 산출: 오른쪽 페이지 4모서리(TL,TR,BR,BL: 먼 쪽이 위)·잔 액면 중심 ──
def proj(p):
    v = world_to_camera_view(sc, cam, Vector(p)); return [round(v.x, 5), round(1 - v.y, 5)]
zp = 0.006 + TH + 0.0003; x0 = 0.002
quad = [proj((x0, PH, zp)), proj((x0 + PW, PH, zp)), proj((x0 + PW, 0, zp)), proj((x0, 0, zp))]
cupc = proj((CUP_AT[0], CUP_AT[1], 0.0028 + LIQ_Z))
json.dump({"HERO_PAGE": quad, "HERO_CUP": cupc}, open(os.path.join(OUT, "quad.json"), "w"))
print("QUAD", json.dumps({"HERO_PAGE": quad, "HERO_CUP": cupc, "PLATE": proj((PLATE_AT[0], PLATE_AT[1], 0.01)), "CUP_R": proj((CUP_AT[0] + SR, CUP_AT[1], 0.0)), "CUP_TOP": proj((CUP_AT[0], CUP_AT[1] + SR, 0.0)), "NB_BL": proj((-PW - 0.009, -0.006, zp)), "NB_TL": proj((-PW - 0.009, PH + 0.006, zp)), "HANDLE": proj((CUP_AT[0] + 0.078 * math.cos(HANDLE_TH), CUP_AT[1] + 0.078 * math.sin(HANDLE_TH), 0.035))}))
sc.render.filepath = os.path.join(OUT, "hero.png"); bpy.ops.render.render(write_still=True); print("RENDERED", sc.render.filepath)

# ───────── 글 쓰는 펜 오버레이(public/note/pen.webp 규격 167×1382, 투명, 촉이 아래) ─────────
#   같은 펜 모델을 정수직 위에서 본다. 촉 끝 비율(PEN_TIP)은 알파 채널로 실측해 quad.json에 함께 적는다.
for o in list(bpy.data.objects):
    if o.name not in ("penbody", "penring", "penfinial", "pennib", "penclip", "penpivot"): bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.data.objects:
    if o.name.startswith("pen"): o.hide_render = False
pen_piv.rotation_euler = (0, 0, 0); pen_piv.location = (0, 0, 0)  # 축 z: 촉(-z)이 아래, 캡 피니얼이 위
sc2 = bpy.context.scene; sc2.render.film_transparent = True; sc2.render.image_settings.color_mode = "RGBA"
sc2.render.resolution_x, sc2.render.resolution_y, sc2.render.resolution_percentage = 167, 1382, 100
sc2.cycles.samples = max(64, SAMPLES)
cd2 = bpy.data.cameras.new("cam2"); cd2.type = "ORTHO"; cd2.ortho_scale = 0.175; cd2.clip_start = 0.01; cam2 = bpy.data.objects.new("cam2", cd2); bpy.context.collection.objects.link(cam2); sc2.camera = cam2
cam2.location = (0.5, 0, PEN_L * 0.46); cam2.rotation_euler = (math.radians(90), 0, math.radians(90))  # +x에서 -x를 본다(펜 축 z가 화면 세로)
# 조명: 위(+z 방향은 화면 위쪽)·앞(+x)에서
for name, loc in (("k2", (0.5, -0.4, 0.5)), ("f2", (0.5, 0.4, 0.2))):
    d = bpy.data.lights.new(name, "AREA"); d.energy = 25 if name == "k2" else 8; d.size = 0.6; o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o); o.location = loc
    tr = o.constraints.new("TRACK_TO"); tr.target = pen_piv; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"
w2 = bpy.data.worlds.new("w2"); sc2.world = w2; w2.use_nodes = True; w2.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.3
sc2.render.filepath = os.path.join(OUT, "pen-top.png"); bpy.ops.render.render(write_still=True); print("RENDERED", sc2.render.filepath)
