# ☕ 원두·펜 합성(2026-09-21) — composite-cup.py가 만든 hero(잔 합성본)에 원두 5알·만년필을 얹는다.
#   실행: python3 scripts/blender/composite-props.py <props_dir> <in hero.webp> <out hero.webp>
#   원칙(v8 실사고): 나무결 덮개는 자국이 남는다 → 덮개 없이 **옛 소품 자리에 25% 더 크게 얹어 덮는다**.
#   위치는 원본 700×840 축소본 실측(×2). 렌더의 그림자(반투명)는 크기·중심 계산에서 빼고(불투명 부분 기준) 붙일 땐 함께 붙인다.
import sys, os, math
from PIL import Image
props, src_p, out_p = sys.argv[1:4]
hero = Image.open(src_p).convert("RGB")
def opaque_bbox(im): return im.getchannel("A").point(lambda a: 255 if a > 200 else 0).getbbox()
def place(im, center, width, rot=0.0):
    """im(RGBA)의 불투명 부분 폭이 width가 되게 축소, rot(도, 시계방향 양수)로 돌린 뒤 불투명 중심을 center에 맞춰 붙인다."""
    if rot: im = im.rotate(-rot, expand=True, resample=Image.BICUBIC)
    ob = opaque_bbox(im); ow = ob[2] - ob[0]
    sc = width / ow
    im = im.resize((max(1, int(im.size[0] * sc)), max(1, int(im.size[1] * sc))), Image.LANCZOS)
    ob = opaque_bbox(im); ocx, ocy = (ob[0] + ob[2]) / 2, (ob[1] + ob[3]) / 2
    hero.paste(im, (int(center[0] - ocx), int(center[1] - ocy)), im)
beans = {k: Image.open(os.path.join(props, f"{k}.png")).convert("RGBA") for k in ("bean1", "bean2", "bean3")}
# (중심, 폭, 렌더, 회전) — 옛 원두 중심·폭 실측 ×1.25
for c, w, k, r in [((170, 314), 105, "bean1", 8), ((1070, 416), 118, "bean2", -10), ((1120, 352), 84, "bean3", 25), ((1386, 394), 80, "bean1", -30), ((1230, 1480), 105, "bean2", 15)]:
    place(beans[k], c, w, r)
# 펜: 렌더는 카메라 방위 탓에 위로 ≈18° 기울어 있음(캡 왼쪽 아래 → 촉 오른쪽 위). 옛 펜은 좌상 (690,1310) → 우하 (1080,1600) = 36.6°, 길이 486.
pen = Image.open(os.path.join(props, "pen.png")).convert("RGBA")
ob = opaque_bbox(pen); cur = math.degrees(math.atan2(-(ob[3] - ob[1]) * 0.55, ob[2] - ob[0]))  # 현재 기울기(대략)
target = 36.6
pen_rot = target - cur  # 시계방향으로 돌릴 각
pen_r = pen.rotate(-pen_rot, expand=True, resample=Image.BICUBIC)
ob = opaque_bbox(pen_r); ow = ob[2] - ob[0]; sc = 420 / ow  # 옛 펜 가로 폭 390 → 8% 크게
pen_r = pen_r.resize((int(pen_r.size[0] * sc), int(pen_r.size[1] * sc)), Image.LANCZOS)
ob = opaque_bbox(pen_r); ocx, ocy = (ob[0] + ob[2]) / 2, (ob[1] + ob[3]) / 2
hero.paste(pen_r, (int(885 - ocx), int(1455 - ocy)), pen_r)
hero.save(out_p, "WEBP", quality=82, method=6)
print("saved", out_p, "pen_rot", round(pen_rot, 1))
