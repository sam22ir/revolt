#!/usr/bin/env python3
"""Bakes the UI materials (art/kit/fill_*.webp): seamless tiles drawn at native scale behind the frames (FrameBox).

Run: python3 apps/godot/tools/ui/build_fills.py, then `godot --headless --import`. Needs Pillow only. Seeded, so the output is the same
every time. Everything wraps: the noise is made on a torus and the strokes are drawn at all nine offsets.
They are plain on purpose: the buttons and icons must be what stands out. Text sits on these; test_hud_theme.gd checks the contrast.
"""
import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps

OUT = Path(__file__).resolve().parents[2] / "art" / "kit"


def noise(rng, w, h, sx, sy=None):
    """Smooth seamless noise, one random cell per sx by sy px."""
    sy = sy or sx
    n, m = w // sx, h // sy
    small = Image.frombytes("L", (n, m), bytes(rng.randrange(256) for _ in range(n * m)))
    big = Image.new("L", (n * 3, m * 3))
    for x in range(3):
        for y in range(3):
            big.paste(small, (x * n, y * m))
    return big.resize((w * 3, h * 3), Image.BICUBIC).crop((w, h, 2 * w, 2 * h))


def fbm(rng, w, h, scales):
    out = None
    for k, s in enumerate(scales):
        n = noise(rng, w, h, *(s if isinstance(s, tuple) else (s,)))
        out = n if out is None else Image.blend(out, n, 1 / (k + 1.6))
    return ImageOps.autocontrast(out)


def emboss(height, d=1, gain=1.0):
    a, b = ImageChops.offset(height, d, d), ImageChops.offset(height, -d, -d)
    e = ImageChops.subtract(b, a, 1.0 / gain if gain else 1, 128) if gain == 1 else ImageChops.subtract(b, a, 1 / gain, 128)
    return e


def relief(img, height, d=1, gain=1.0):
    return ImageChops.overlay(img, emboss(height, d, gain).convert("RGB"))


def wrap_blur(img, r):
    w, h = img.size
    big = Image.new(img.mode, (w * 3, h * 3))
    for x in range(3):
        for y in range(3):
            big.paste(img, (x * w, y * h))
    return big.filter(ImageFilter.GaussianBlur(r)).crop((w, h, 2 * w, 2 * h))


def strokes(img, rng, n, length, angle, spread, colours, width=1):
    """Wrapped straight scratches, blended in by each colour's alpha."""
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        a, l = math.radians(rng.gauss(angle, spread)), rng.uniform(*length)
        c = rng.choice(colours)
        for ox in (-w, 0, w):
            for oy in (-h, 0, h):
                d.line((x + ox, y + oy, x + ox + l * math.cos(a), y + oy + l * math.sin(a)), fill=c, width=width)
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def dots(img, rng, n, r, colours):
    w, h = img.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for _ in range(n):
        x, y, rr, c = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(*r), rng.choice(colours)
        for ox in (-w, 0, w):
            for oy in (-h, 0, h):
                d.ellipse((x + ox - rr, y + oy - rr, x + ox + rr, y + oy + rr), fill=c)
    return Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")


def stain(img, rng, colour, amount, scales, low, high):
    w, h = img.size
    m = fbm(rng, w, h, scales).point(lambda v: 0 if v < low else (255 if v > high else int((v - low) * 255 / (high - low))))
    m = m.point(lambda v: int(v * amount))
    return Image.composite(Image.new("RGB", (w, h), colour), img, m)


def plain(seed, base, light, dark):
    """A calm, almost flat colour with wide soft clouds, so a big panel is not dead but nothing on it asks to be looked at."""
    rng = random.Random(seed)
    return ImageOps.colorize(fbm(rng, 512, 512, (256, 128)), dark, light, base)


def cloth():
    """The pages and sections."""
    return plain("cloth", "#392819", "#3b2a1b", "#372617")


def board():
    """The HUD bands and the big cards, a step lighter than the sections on them."""
    return plain("board", "#4b3522", "#4d3724", "#493320")


def raked():
    """The frontier's no-man's-land: pale sand raked along the fence, with one pair of wheel ruts. Wraps along x only."""
    rng = random.Random("raked")
    w, h = 512, 256
    img = ImageOps.colorize(fbm(rng, w, h, (128, 64, 16, 4)), "#a98b5c", "#d9c294", "#c2a673")
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for y0 in range(6, h - 4, 11):
        amp, ph = rng.uniform(.6, 1.8), rng.uniform(0, 6.28)
        pts = [(x, y0 + amp * math.sin(ph + 2 * math.pi * 3 * x / w)) for x in range(0, w + 8, 8)]
        d.line(pts, fill=(94, 70, 38, 120), width=3)
        d.line([(x, y - 3) for x, y in pts], fill=(250, 232, 190, 110), width=2)
    for y0 in (104, 160):
        d.rectangle((0, y0, w, y0 + 16), fill=(120, 94, 56, 120))
        for x in range(0, w, 16):
            d.line((x, y0 + 2, x + 8, y0 + 14), fill=(74, 54, 28, 150), width=3)
        d.line((0, y0, w, y0), fill=(70, 50, 26, 140), width=2)
    img = Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB")
    img = dots(img, rng, 130, (.8, 2.4), [(92, 70, 40, 130), (236, 216, 170, 130)])
    return relief(img, fbm(rng, w, h, (8, 4, 2)), 1, .25)


def main():
    for f, q in ((cloth, 95), (board, 95), (raked, 90)):
        img = f()
        path = (OUT.parent / "frontier" / "raked.webp") if f is raked else (OUT / f"fill_{f.__name__}.webp")
        img.save(path, quality=q, method=6)
        print(f.__name__, img.size, path.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
