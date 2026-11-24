#!/usr/bin/env python3
"""Bakes the UI materials (art/kit/fill_*.webp): seamless tiles drawn at native scale behind the frames (FrameBox).

Run: python3 apps/godot/tools/ui/build_fills.py, then `godot --headless --import`. Needs Pillow only. Seeded, so the output is the same
every time. Everything wraps: the noise is made on a torus and the strokes are drawn at all nine offsets.
Text sits on these, so they stay near the HUD's PANEL in brightness; test_kit.gd checks the contrast.
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


def leather():
    rng = random.Random("leather")
    w = h = 512
    # Pebbles: dark creases between rounded cells of two sizes.
    grain = ImageChops.multiply(noise(rng, w, h, 8), noise(rng, w, h, 4))
    grain = ImageOps.autocontrast(wrap_blur(grain, .8))
    img = ImageOps.colorize(fbm(rng, w, h, (128, 64, 32, 16)), "#22140b", "#42291a", "#302013")
    img = relief(img, grain, 1, .62)
    img = stain(img, rng, "#120b06", .6, (64, 16), 165, 240)
    img = stain(img, rng, "#4a3220", .35, (64, 16, 8), 180, 245)
    img = strokes(img, rng, 240, (6, 34), 20, 60, [(214, 170, 122, 22), (0, 0, 0, 70)])
    return img


def wood():
    """Four walnut planks, 128 px each, running down the screen, with nailed joints."""
    rng = random.Random("wood")
    w = h = 512
    pw = 128
    out = Image.new("RGB", (w, h))
    joints = [90, 350, 210, 440]
    for k in range(4):
        dark, mid, light = [("#150c06", "#2b1a0f", "#4a2f1c"), ("#120a05", "#25160c", "#402817"), ("#170d07", "#301d11", "#523520"), ("#130b06", "#281910", "#452b1a")][k]
        grain = fbm(rng, 512, h, ((16, 256), (8, 128), (4, 128), (2, 64))).crop((0, 0, pw, h))
        plank = ImageOps.colorize(grain, dark, light, mid)
        d = ImageDraw.Draw(plank, "RGBA")
        # Long grain lines that bend round knots; whole periods down the plank, so they wrap.
        knots = [(rng.uniform(28, 100), rng.uniform(0, h), rng.uniform(8, 15)) for _ in range(2)]
        for g in range(44):
            x0 = g * pw / 44 + rng.uniform(-2, 2)
            amp, ph, per = rng.uniform(1, 4), rng.uniform(0, 6.28), rng.choice((1, 2, 3))
            pts = []
            for y in range(-4, h + 8, 4):
                x = x0 + amp * math.sin(ph + per * 2 * math.pi * y / h)
                for kx, ky, kr in knots:
                    dy = (y - ky + h / 2) % h - h / 2
                    dx = x - kx
                    push = kr * 1.7 * math.exp(-(dy / (kr * 2.4)) ** 2) * math.exp(-(dx / (kr * 2.2)) ** 2)
                    x += push if dx >= 0 else -push
                pts.append((x, y))
            d.line(pts, fill=(10, 5, 2, rng.randrange(60, 150)) if g % 3 else (150, 104, 62, rng.randrange(26, 60)), width=1 if g % 5 else 2)
        for kx, ky, kr in knots:
            for oy in (-h, 0, h):
                for r in range(int(kr), 0, -2):
                    d.ellipse((kx - r * .75, ky + oy - r * 1.15, kx + r * .75, ky + oy + r * 1.15), fill=(16, 8, 3, 80), outline=(98, 62, 34, 70))
        # Worn edges and the gap.
        for x in range(9):
            a = int(150 * (1 - x / 9) ** 2)
            d.line((x, 0, x, h), fill=(0, 0, 0, a))
            d.line((pw - 1 - x, 0, pw - 1 - x, h), fill=(0, 0, 0, a))
        d.line((0, 0, 0, h), fill=(0, 0, 0, 255), width=3)
        d.line((4, 0, 4, h), fill=(176, 126, 80, 70))
        j = joints[k]
        d.line((0, j, pw, j), fill=(0, 0, 0, 240), width=4)
        d.line((2, j + 4, pw, j + 4), fill=(176, 126, 80, 80))
        for y in (j - 18, j + 20):
            for x in (24, pw - 24):
                d.ellipse((x - 6, y - 6, x + 6, y + 6), fill=(0, 0, 0, 190))
                d.ellipse((x - 5, y - 5, x + 4, y + 4), fill=(74, 66, 54, 255))
                d.ellipse((x - 4, y - 4, x, y), fill=(168, 152, 122, 200))
        out.paste(plank, (k * pw, 0))
    out = relief(out, out.convert("L"), 1, .5)
    out = stain(out, rng, "#0b0603", .5, (128, 64, 16), 165, 240)
    return ImageEnhance.Brightness(out).enhance(1.22)


def wood_h():
    """The planks lying across, for the HUD bands and the sheets."""
    return wood().transpose(Image.ROTATE_90)


def parchment():
    rng = random.Random("parchment")
    w = h = 512
    img = ImageOps.colorize(fbm(rng, w, h, (128, 64, 32, 8)), "#d9c192", "#f6ebcf", "#ead8b0")
    img = relief(img, fbm(rng, w, h, (4, 2)), 1, .18)
    img = stain(img, rng, "#b98d4e", .32, (128, 64, 16), 170, 240)
    img = strokes(img, rng, 420, (3, 14), 0, 90, [(130, 92, 46, 46), (255, 250, 235, 90)])
    img = dots(img, rng, 90, (.5, 1.6), [(110, 72, 30, 70)])
    return img


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
    for f, q in ((leather, 92), (wood, 92), (wood_h, 92), (parchment, 92), (raked, 90)):
        img = f()
        path = (OUT.parent / "frontier" / "raked.webp") if f is raked else (OUT / f"fill_{f.__name__}.webp")
        img.save(path, quality=q, method=6)
        print(f.__name__, img.size, path.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
