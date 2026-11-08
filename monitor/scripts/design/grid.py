#!/usr/bin/env python3
"""Tile six screenshots into one 3x2 cohesion grid (JPEG) with thin gutters and captions.

    python scripts/design/grid.py <shots-dir> ../docs/screenshots/cohesion-grid.jpg
        [--state incident] [--size 1440x900] [--tile-width 960] [--quality 88]

Reads <view>-<state>-<size>.png for graph, overview, houses, map, tree and analytics
(the files shoot.mjs writes). A missing shot becomes a grey placeholder tile and the
script exits 1 after writing the grid. Needs Pillow.
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

VIEWS = [
    ("graph", "Main 3D"),
    ("overview", "Overview"),
    ("houses", "Houses"),
    ("map", "Live map"),
    ("tree", "Building view"),
    ("analytics", "Analytics"),
]

GUTTER = 12
CAPTION_H = 30
BG = (245, 245, 247)
INK = (29, 29, 31)
MUTED = (110, 110, 115)


def load_font(size):
    candidates = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shots_dir")
    ap.add_argument("out_file")
    ap.add_argument("--state", default="incident")
    ap.add_argument("--size", default="1440x900")
    ap.add_argument("--tile-width", type=int, default=960)
    ap.add_argument("--quality", type=int, default=88)
    a = ap.parse_args()

    w, h = (int(v) for v in a.size.lower().split("x"))
    tw = a.tile_width
    th = round(tw * h / w)
    cols, rows = 3, 2
    W = cols * tw + (cols + 1) * GUTTER
    H = rows * (th + CAPTION_H) + (rows + 1) * GUTTER
    grid = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(grid)
    font = load_font(15)
    small = load_font(13)

    missing = []
    for i, (view, label) in enumerate(VIEWS):
        c, r = i % cols, i // cols
        x = GUTTER + c * (tw + GUTTER)
        y = GUTTER + r * (th + CAPTION_H + GUTTER)
        name = f"{view}-{a.state}-{a.size}.png"
        path = os.path.join(a.shots_dir, name)
        draw.text((x + 2, y + 6), label, fill=INK, font=font)
        tag = f"?view={view} · {a.state} · {a.size}"
        tag_w = draw.textlength(tag, font=small)
        draw.text((x + tw - tag_w - 2, y + 8), tag, fill=MUTED, font=small)
        ty = y + CAPTION_H
        if os.path.exists(path):
            with Image.open(path) as im:
                tile = im.convert("RGB").resize((tw, th), Image.LANCZOS)
            grid.paste(tile, (x, ty))
            draw.rectangle([x - 1, ty - 1, x + tw, ty + th], outline=(210, 210, 215))
        else:
            missing.append(name)
            draw.rectangle([x, ty, x + tw - 1, ty + th - 1], fill=(232, 232, 237), outline=(210, 210, 215))
            msg = f"missing: {name}"
            draw.text((x + (tw - draw.textlength(msg, font=font)) / 2, ty + th / 2 - 8), msg, fill=MUTED, font=font)

    os.makedirs(os.path.dirname(os.path.abspath(a.out_file)), exist_ok=True)
    grid.save(a.out_file, "JPEG", quality=a.quality, optimize=True, progressive=True)
    print(f"wrote {a.out_file} ({W}x{H}, {len(VIEWS) - len(missing)}/{len(VIEWS)} tiles)")
    if missing:
        print("missing: " + ", ".join(missing), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
