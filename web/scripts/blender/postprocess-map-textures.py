#!/usr/bin/env python3
# 🧵 지도 질감 후처리 — 렌더 타일을 **이음새 없이 반복**되게 만들고 public/map/ 에 저장 + meta.json
#   실행: python3 scripts/blender/postprocess-map-textures.py <blender_out_dir> [public/map]
#
# 왜: Blender 절차 노이즈는 주기적이지 않아 타일 경계에서 결이 끊긴다(지도에서 격자 무늬로 보임).
# 방법(고전 offset-blend): 이미지를 절반씩 굴려(roll) 원래 가장자리를 가운데로 보낸 뒤,
#   그 가운데 십자 이음선만 원본(그 자리에선 연속)으로 부드럽게 덮는다. 결과의 바깥 가장자리는
#   원본 중앙에서 온 것이라 좌↔우·상↔하가 정확히 이어진다. 거울 타일링(대칭 무늬가 생김)보다 자연스럽다.
import sys, os, json
from PIL import Image, ImageDraw, ImageFilter, ImageChops

SRC = sys.argv[1]
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../public/map")
os.makedirs(DST, exist_ok=True)

def seamless(im: Image.Image, band_ratio=0.18) -> Image.Image:
    im = im.convert("RGB"); w, h = im.size
    rolled = ImageChops.offset(im, w // 2, h // 2)               # 원래 가장자리 → 중앙 십자
    k = max(2, int(min(w, h) * band_ratio))
    mask = Image.new("L", (w, h), 0); d = ImageDraw.Draw(mask)
    d.rectangle([w // 2 - k // 2, 0, w // 2 + k // 2, h], fill=255)   # 세로 이음선
    d.rectangle([0, h // 2 - k // 2, w, h // 2 + k // 2], fill=255)   # 가로 이음선
    mask = mask.filter(ImageFilter.GaussianBlur(k * 0.45))
    return Image.composite(im, rolled, mask)                     # 이음선 자리만 원본으로 덮는다

def seam_score(im: Image.Image) -> float:
    """좌우/상하 가장자리 평균 색차(0~255). 작을수록 이음새가 안 보인다."""
    w, h = im.size; px = im.load(); tot = 0; n = 0
    for y in range(h):
        a, b = px[0, y], px[w - 1, y]; tot += sum(abs(a[i] - b[i]) for i in range(3)) / 3; n += 1
    for x in range(w):
        a, b = px[x, 0], px[x, h - 1]; tot += sum(abs(a[i] - b[i]) for i in range(3)) / 3; n += 1
    return tot / max(1, n)

meta = {}
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".png"): continue
    src = Image.open(os.path.join(SRC, f))
    before = seam_score(src.convert("RGB"))
    out = seamless(src)
    after = seam_score(out)
    out.save(os.path.join(DST, f), optimize=True)
    meta[f] = {"w": out.width, "h": out.height, "bytes": os.path.getsize(os.path.join(DST, f)), "seam_before": round(before, 1), "seam_after": round(after, 1)}
    print(f"{f:18s} {out.width}x{out.height} {meta[f]['bytes'] // 1024:3d}KB  이음새 {before:5.1f} → {after:5.1f}")
with open(os.path.join(DST, "meta.json"), "w") as fh: json.dump(meta, fh, ensure_ascii=False, indent=1)
print("DONE", DST)
