#!/usr/bin/env python3
# 🎨 Blender 렌더 후처리 — 크림 외곽선(알파 팽창) + 투명 여백 제거(타이트 크롭) → public/pins/
#   실행: python3 scripts/blender/postprocess-pins.py <blender_out_dir> [public/pins]
#   CSS 규약: 이미지 = 대상에 딱 맞는 bbox(핀 머리 중심·퍽 윗면 비율을 CSS 퍼센트로 쓰므로 여백이 있으면 링/글리프가 어긋난다 — WebKit 실측 사고).
import sys, os, json
from PIL import Image, ImageFilter, ImageChops

SRC = sys.argv[1]
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "../../public/pins")
os.makedirs(DST, exist_ok=True)
CREAM = (253, 250, 244)
OUTLINE_PX = 4  # 176px 렌더 기준(표시 40px → 약 1px)

def outline(im: Image.Image) -> Image.Image:
    a = im.getchannel("A")
    grown = a.filter(ImageFilter.MaxFilter(OUTLINE_PX * 2 + 1)).filter(ImageFilter.GaussianBlur(0.6))
    base = Image.new("RGBA", im.size, CREAM + (0,)); base.putalpha(grown)
    out = Image.alpha_composite(base, im)
    return out

meta = {}
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".png"): continue
    im = Image.open(os.path.join(SRC, f)).convert("RGBA")
    is_puck = f.startswith("puck")
    if not is_puck: im = outline(im)
    bbox = im.getbbox(); im = im.crop(bbox)
    im.save(os.path.join(DST, f), optimize=True)
    meta[f] = {"w": im.width, "h": im.height, "ratio": round(im.height / im.width, 4), "bytes": os.path.getsize(os.path.join(DST, f))}
    print(f, im.size, meta[f]["bytes"] // 1024, "KB")
with open(os.path.join(DST, "meta.json"), "w") as fh: json.dump(meta, fh, ensure_ascii=False, indent=1)
print("DONE", DST)
