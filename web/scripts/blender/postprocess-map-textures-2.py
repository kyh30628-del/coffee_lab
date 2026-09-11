#!/usr/bin/env python3
# 🧵 2차 질감 후처리 — 종류별로 다르게 다룬다(2026-09-11).
#   fac-* / lc-*  : 정사각 반복 타일 → 양축 offset-blend(1차와 동일)
#   rd-*          : line-pattern 스트립(512×128) → **길이 방향(x)만** 이음새 제거(폭 방향은 선 너비에 맞춰 늘어나므로 반복 없음)
#   poi-*         : 알파 아이콘 → 이음새 처리 없음, 투명 여백 타이트 크롭 + 알파 가장자리 정리
#   실행: python3 scripts/blender/postprocess-map-textures-2.py <blender_out_dir> [public/map]
import sys, os, json
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SRC = sys.argv[1]
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../public/map")
os.makedirs(DST, exist_ok=True)

def seamless_xy(im, band_ratio=0.18):
    im = im.convert("RGB"); w, h = im.size
    rolled = ImageChops.offset(im, w // 2, h // 2); k = max(2, int(min(w, h) * band_ratio))
    mask = Image.new("L", (w, h), 0); d = ImageDraw.Draw(mask)
    d.rectangle([w // 2 - k // 2, 0, w // 2 + k // 2, h], fill=255); d.rectangle([0, h // 2 - k // 2, w, h // 2 + k // 2], fill=255)
    return Image.composite(im, rolled, mask.filter(ImageFilter.GaussianBlur(k * 0.45)))

def seamless_x(im, band_ratio=0.12):
    im = im.convert("RGB"); w, h = im.size
    rolled = ImageChops.offset(im, w // 2, 0); k = max(4, int(w * band_ratio))
    mask = Image.new("L", (w, h), 0); ImageDraw.Draw(mask).rectangle([w // 2 - k // 2, 0, w // 2 + k // 2, h], fill=255)
    return Image.composite(im, rolled, mask.filter(ImageFilter.GaussianBlur(k * 0.4)))

# 🎨 도로 스트립은 지도의 기존 강조색과 같은 톤으로(원본 렌더는 중립 베이지) — 큰길=앰버(#e6a23c)·2차로=연앰버(#f3d9a4). 평균색이 목표색이 되도록 채널별 스케일(차선·연석 명암은 유지).
TINT = {"rd-major": (230, 162, 60), "rd-street": (243, 217, 164)}
def tint(im, target):
    im = im.convert("RGB"); mean = im.resize((1, 1), Image.BOX).getpixel((0, 0))
    return Image.merge("RGB", [im.getchannel(i).point(lambda v, s=target[i] / max(1, mean[i]): min(255, int(v * s))) for i in range(3)])

def seam_x(im):
    im = im.convert("RGB"); w, h = im.size; px = im.load(); tot = 0
    for y in range(h): a, b = px[0, y], px[w - 1, y]; tot += sum(abs(a[i] - b[i]) for i in range(3)) / 3
    return tot / h

def icon(im):
    im = im.convert("RGBA"); a = im.getchannel("A")
    bbox = a.getbbox(); im = im.crop(bbox)
    # 알파 가장자리 미세 정리(반투명 헤일로 제거) — 지도 위에서 테두리가 지저분해지는 걸 막는다
    a2 = im.getchannel("A").point(lambda v: 0 if v < 24 else v); im.putalpha(a2)
    # 정사각으로 패딩(아이콘 정렬 일관)
    s = max(im.size); sq = Image.new("RGBA", (s, s), (0, 0, 0, 0)); sq.paste(im, ((s - im.width) // 2, (s - im.height) // 2)); return sq

meta = {}
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".png"): continue
    src = Image.open(os.path.join(SRC, f)); name = f[:-4]
    if name.startswith("poi-"):
        out = icon(src); note = "icon"
    elif name.startswith("fac-"):
        # 파사드는 렌더 자체가 격자에 맞춰 주기적이라 offset-blend를 걸면 소품이 겹쳐 번진다(실측) → 원본 그대로
        out = src.convert("RGB"); note = "raw(periodic)"
    elif name.startswith("rd-"):
        if name in TINT: src = tint(src, TINT[name])
        b = seam_x(src); out = seamless_x(src); note = f"seamX {b:.1f}→{seam_x(out):.1f}" + (" tint" if name in TINT else "")
    else:
        out = seamless_xy(src); note = "seamXY"
    out.save(os.path.join(DST, f), optimize=True)
    meta[f] = {"w": out.width, "h": out.height, "bytes": os.path.getsize(os.path.join(DST, f)), "kind": note.split()[0]}
    print(f"{f:18s} {out.width}x{out.height} {meta[f]['bytes'] // 1024:3d}KB  {note}")
mp = os.path.join(DST, "meta.json")
old = json.load(open(mp)) if os.path.exists(mp) else {}
old.update(meta); json.dump(old, open(mp, "w"), ensure_ascii=False, indent=1)
print("DONE", DST)
