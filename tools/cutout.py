"""
Cut a photo out of its background and save it as the hero portrait.

    python tools/cutout.py "C:\\path\\to\\photo.jpg"            -> assets/portrait.webp
    python tools/cutout.py photo.jpg --out assets/other.webp

Needs rembg (pip install "rembg[cpu]" pillow). The first run downloads the
isnet-general-use model (~170 MB) into ~/.u2net.
"""
import argparse
from pathlib import Path

from PIL import Image, ImageFilter
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parent.parent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("photo")
    ap.add_argument("--out", default=str(ROOT / "assets" / "portrait.webp"))
    ap.add_argument("--model", default="isnet-general-use")
    args = ap.parse_args()

    src = Image.open(args.photo).convert("RGB")
    cut = remove(src, session=new_session(args.model), post_process_mask=True)

    # pull the matte in by a pixel so background colour (grass, sky) bleeding into
    # the edge drops out, then soften it so it doesn't look scissor-cut
    alpha = cut.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    cut.putalpha(alpha)

    # decontaminate: any pixel that isn't fully opaque sits on the edge, where the
    # old background's colour (green grass, blue sky) leaks in. Blend those toward
    # their own grey so no tint survives when the photo is shown in colour.
    import numpy as np
    px = np.asarray(cut, dtype=np.float32)
    a = px[..., 3:4] / 255.0
    edge = np.clip((0.98 - a) / 0.98, 0, 1)            # 0 when opaque, ~1 when nearly clear
    grey = (px[..., :3] * [0.299, 0.587, 0.114]).sum(-1, keepdims=True)
    px[..., :3] = px[..., :3] * (1 - edge) + grey * edge
    cut = Image.fromarray(px.astype(np.uint8), "RGBA")

    # trim to the subject; the site anchors the image bottom-centre
    bbox = alpha.point(lambda v: 255 if v > 12 else 0).getbbox()
    cut = cut.crop(bbox)
    cut.thumbnail((1200, 1600), Image.LANCZOS)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    cut.save(out, "WEBP", quality=90, method=6)
    print("wrote", out, cut.size)


if __name__ == "__main__":
    main()
