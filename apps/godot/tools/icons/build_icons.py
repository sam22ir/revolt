#!/usr/bin/env python3
"""Draws the HUD icon set (art/icons/*.svg): full-colour, hand-designed shapes lit from the top left, on a 256 px grid.

Run from anywhere: python3 apps/godot/tools/icons/build_icons.py, then `godot --headless --import`.
Only what Godot's SVG renderer (ThorVG) draws is used: paths, gradients, clip paths; no filters, patterns, text or CSS.
Every icon has a bold silhouette with a dark outline, so it still reads at 20 mockup px, and fine detail inside it for the large
sizes. Content rules (docs/design/design-system.md section 7): no faces, no flags or emblems of real organisations.
"""
import math
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "art" / "icons"
INK = "#1a1109"
LINE = "#3a2412"

BRASS = ["#fff3c4", "#ecc873", "#b98538", "#6d431a"]
GOLD = ["#fff8d2", "#fbd765", "#d8962a", "#8a5212"]
STEEL = ["#fbfaf4", "#c3c4c0", "#83868a", "#454a52"]
IRON = ["#a9a9a6", "#70716f", "#474848", "#262729"]
WOOD = ["#dba367", "#b0713a", "#7c4822", "#4a2812"]
DARKWOOD = ["#a96c3c", "#7f4a25", "#573017", "#331a0b"]
PAPER = ["#fff6dc", "#f0dcae", "#d6b67c", "#a07c48"]
TERRA = ["#ee9a6a", "#cc6a3d", "#9c4424", "#642713"]
WHITE = ["#fffdf5", "#efe4cd", "#cdb894", "#8f7855"]
OLIVE = ["#b4ba76", "#818b46", "#565f2c", "#33391a"]
OCHRE = ["#f3cd80", "#d39b43", "#9c6a26", "#5e3c13"]
COPPER = ["#ffd0a8", "#dc8a55", "#a0532a", "#5c2a12"]
WAX = ["#ee7a5c", "#c13a28", "#8a2118", "#54100c"]
TEAL = ["#8fc0ba", "#4f8a88", "#2b5a5e", "#153539"]
SKIN = ["#d9a273", "#b27a4d", "#875634", "#553320"]
GREY = ["#e6dfd0", "#bdb29c", "#8b7f69", "#544a3a"]


class Icon:
    def __init__(self, name):
        self.name, self.defs, self.backs, self.body, self.n = name, [], [], [], 0
        self.layers, self.layer_tf = [], ""
        self.rng = random.Random(name)

    def uid(self):
        self.n += 1
        return f"g{self.n}"

    def _stops(self, colours):
        last = len(colours) - 1
        return "".join(f'<stop offset="{i / last:.3g}" stop-color="{c}"/>' for i, c in enumerate(colours))

    def lin(self, colours, x1, y1, x2, y2):
        i = self.uid()
        self.defs.append(f'<linearGradient id="{i}" gradientUnits="userSpaceOnUse" x1="{x1:.4g}" y1="{y1:.4g}" x2="{x2:.4g}" y2="{y2:.4g}">{self._stops(colours)}</linearGradient>')
        return f"url(#{i})"

    def rad(self, colours, cx, cy, r):
        i = self.uid()
        self.defs.append(f'<radialGradient id="{i}" gradientUnits="userSpaceOnUse" cx="{cx:.4g}" cy="{cy:.4g}" r="{r:.4g}">{self._stops(colours)}</radialGradient>')
        return f"url(#{i})"

    def clip(self, d, tf=""):
        i = self.uid()
        t = f' transform="{tf}"' if tf else ""
        self.defs.append(f'<clipPath id="{i}"><path d="{d}"{t}/></clipPath>')
        return i

    def shape(self, d, fill, line=LINE, lw=2.5, back=True, tf="", bw=15):
        t = f' transform="{tf}"' if tf else ""
        if back:
            self.backs.append(f'<path d="{d}"{t} stroke-width="{bw}"/>')
        s = f' stroke="{line}" stroke-width="{lw}" stroke-linejoin="round"' if lw else ""
        self.body.append(f'<path d="{d}" fill="{fill}"{s}{t}/>')

    def line(self, d, colour, w, op=1.0, tf="", clip=None, back=False, bw=12):
        t = f' transform="{tf}"' if tf else ""
        o = f' stroke-opacity="{op}"' if op < 1 else ""
        p = f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"{o}{t}/>'
        if back:
            self.backs.append(f'<path d="{d}" fill="none" stroke-width="{w + bw}"{t}/>')
        self.body.append(f'<g clip-path="url(#{clip})">{p}</g>' if clip else p)

    def fill(self, d, colour, op=1.0, tf="", clip=None):
        t = f' transform="{tf}"' if tf else ""
        o = f' fill-opacity="{op}"' if op < 1 else ""
        p = f'<path d="{d}" fill="{colour}"{o}{t}/>'
        self.body.append(f'<g clip-path="url(#{clip})">{p}</g>' if clip else p)

    def rivet(self, x, y, r=4.5, colours=BRASS, tf=""):
        self.shape(circ(x, y, r), self.rad(colours, x - r * .35, y - r * .4, r * 1.5), INK, 1.6, False, tf)
        self.fill(circ(x - r * .3, y - r * .35, r * .3), "#fff", .85, tf)

    def grain(self, x0, y0, x1, y1, n, colour, op=.45, clip=None, tf="", wob=3, horizontal=True):
        """Wavy wood-grain strokes inside a box."""
        for _ in range(n):
            r = self.rng
            if horizontal:
                y = r.uniform(y0, y1)
                a = r.uniform(x0, x0 + (x1 - x0) * .5)
                b = a + r.uniform(.25, .6) * (x1 - x0)
                m = (a + b) / 2
                d = f"M{a:.1f} {y:.1f}Q{m:.1f} {y + r.uniform(-wob, wob):.1f} {b:.1f} {y + r.uniform(-wob / 2, wob / 2):.1f}"
            else:
                x = r.uniform(x0, x1)
                a = r.uniform(y0, y0 + (y1 - y0) * .5)
                b = a + r.uniform(.25, .6) * (y1 - y0)
                d = f"M{x:.1f} {a:.1f}Q{x + r.uniform(-wob, wob):.1f} {(a + b) / 2:.1f} {x + r.uniform(-wob / 2, wob / 2):.1f} {b:.1f}"
            self.line(d, colour, round(r.uniform(1.1, 2.4), 1), op, tf, clip)

    def layer(self, tf=""):
        """Starts a new layer: what comes next has its own dark outline, over everything drawn so far, and is moved by `tf`."""
        self.layers.append((self.backs, self.body, self.layer_tf))
        self.backs, self.body, self.layer_tf = [], [], tf

    def save(self, scale=1.0, dx=0, dy=0, round_clip=False, cut_to=""):
        """Writes the icon, drawn at `scale` about the middle and moved by (dx, dy), cut to a circle with `round_clip` or to a path."""
        cut_to = circ(128, 128, 126) if round_clip else cut_to
        cut = f' clip-path="url(#{self.clip(cut_to)})"' if cut_to else ""
        self.layer()
        art = "".join((f'<g transform="{tf}">' if tf else "") + f'<g fill="{INK}" stroke="{INK}" stroke-linejoin="round" stroke-linecap="round">{"".join(backs)}</g>{"".join(body)}' + ("</g>" if tf else "") for backs, body, tf in self.layers)
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><defs>{"".join(self.defs)}</defs><g{cut}><g transform="translate({128 * (1 - scale) + dx:.2f} {128 * (1 - scale) + dy:.2f}) scale({scale})">{art}</g></g></svg>\n'
        (OUT / f"{self.name}.svg").write_text(svg)


def circ(x, y, r):
    return ell(x, y, r, r)


def ell(x, y, rx, ry):
    return f"M{x - rx:.2f} {y:.2f}a{rx:.2f} {ry:.2f} 0 1 0 {2 * rx:.2f} 0a{rx:.2f} {ry:.2f} 0 1 0 {-2 * rx:.2f} 0z"


def rect(x, y, w, h, r=0):
    if not r:
        return f"M{x:.1f} {y:.1f}h{w:.1f}v{h:.1f}h{-w:.1f}z"
    return f"M{x + r:.1f} {y:.1f}h{w - 2 * r:.1f}a{r} {r} 0 0 1 {r} {r}v{h - 2 * r:.1f}a{r} {r} 0 0 1 {-r} {r}h{-(w - 2 * r):.1f}a{r} {r} 0 0 1 {-r} {-r}v{-(h - 2 * r):.1f}a{r} {r} 0 0 1 {r} {-r}z"


def poly(pts):
    return "M" + "L".join(f"{x:.2f} {y:.2f}" for x, y in pts) + "z"


def pol(cx, cy, r, deg):
    a = math.radians(deg)
    return cx + r * math.cos(a), cy + r * math.sin(a)


def ring(cx, cy, r0, r1):
    return circ(cx, cy, r1) + f"M{cx - r0:.2f} {cy:.2f}a{r0:.2f} {r0:.2f} 0 1 1 {2 * r0:.2f} 0a{r0:.2f} {r0:.2f} 0 1 1 {-2 * r0:.2f} 0z"


def faceted_star(ic, cx, cy, R, r, light, mid, dark, lw=2.2, back=True):
    pts = [pol(cx, cy, R if i % 2 == 0 else r, -90 + i * 36) for i in range(10)]
    if back:
        ic.backs.append(f'<path d="{poly(pts)}" stroke-width="15"/>')
    for i in range(10):
        a, b = pts[i], pts[(i + 1) % 10]
        ang = math.degrees(math.atan2((a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cx))
        lit = math.cos(math.radians(ang + 125)) * .55 + (.45 if i % 2 else -.45)
        c = light if lit > .25 else (dark if lit < -.3 else mid)
        ic.shape(poly([(cx, cy), a, b]), ic.lin(c, cx, cy, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), LINE, 1.4, False)
    ic.line(poly(pts), LINE, lw)
    for i in range(0, 10, 2):
        x, y = pts[i]
        ic.line(f"M{cx + (x - cx) * .35:.1f} {cy + (y - cy) * .35:.1f}L{cx + (x - cx) * .9:.1f} {cy + (y - cy) * .9:.1f}", "#fff6cf", 1.6, .75)


# ---------------------------------------------------------------- resources

def food():
    ic = Icon("food")

    def stalk(deg, length, curve):
        tf = f"rotate({deg} 128 176)"
        top = 176 - length
        ic.line(f"M128 178Q{128 + curve} {176 - length * .4:.1f} 128 {top + 14:.1f}", "#8f611d", 7, 1, tf, None, True, 10)
        ic.line(f"M127 178Q{127 + curve} {176 - length * .4:.1f} 127 {top + 14:.1f}", "#e7bd5b", 3, 1, tf)
        # Awns, then the paired grains from the bottom up, then the tip.
        for k in range(6):
            y = top + 10 + k * 13
            for s in (-1, 1):
                ic.line(f"M{128 + s * 8} {y:.1f}Q{128 + s * 17} {y - 20:.1f} {128 + s * 19} {y - 36:.1f}", "#f4d98a", 1.8, .95, tf)
        for k in range(5, -1, -1):
            y = top + 16 + k * 13
            w = 11 - abs(k - 2.5) * .8
            for s in (-1, 1):
                d = f"M128 {y + 11:.1f}C{128 + s * w * 1.7:.1f} {y + 9:.1f} {128 + s * w * 1.6:.1f} {y - 8:.1f} {128 + s * w * .8:.1f} {y - 15:.1f}C{128 + s * 1:.1f} {y - 9:.1f} 128 {y:.1f} 128 {y + 11:.1f}z"
                ic.shape(d, ic.lin(GOLD if s < 0 else OCHRE, 128 - w * 1.6, y - 14, 128 + w * 1.6, y + 10), "#6d4310", 1.5, True, tf, 9)
                ic.line(f"M{128 + s * 3} {y + 6:.1f}Q{128 + s * w * .9:.1f} {y:.1f} {128 + s * w * .8:.1f} {y - 11:.1f}", "#8f5d16", 1.2, .8, tf)
                ic.line(f"M{128 + s * w * .95:.1f} {y + 2:.1f}Q{128 + s * w * 1.25:.1f} {y - 4:.1f} {128 + s * w * .95:.1f} {y - 10:.1f}", "#fffbe0", 1.3, .8, tf)
        d = f"M128 {top + 12:.1f}C{119} {top + 4:.1f} 121 {top - 8:.1f} 128 {top - 16:.1f}C135 {top - 8:.1f} 137 {top + 4:.1f} 128 {top + 12:.1f}z"
        ic.shape(d, ic.lin(GOLD, 120, top - 14, 136, top + 10), "#6d4310", 1.5, True, tf, 9)
        ic.line(f"M128 {top - 14:.1f}V{top + 8:.1f}", "#8f5d16", 1.2, .8, tf)

    # Leaves behind, cut stalk ends below the tie.
    for s in (-1, 1):
        d = f"M{128} 176C{128 + s * 34} 160 {128 + s * 66} 168 {128 + s * 86} 198C{128 + s * 60} 190 {128 + s * 36} 192 128 184z"
        ic.shape(d, ic.lin(OLIVE, 128 + s * 10, 160, 128 + s * 80, 200), LINE, 2)
        ic.line(f"M{128 + s * 8} 178Q{128 + s * 46} 170 {128 + s * 78} 192", "#dbe0a0", 1.8, .8)
    for x in (-34, -23, -12, 0, 12, 23, 34):
        d = f"M{128 + x * .25 - 4:.1f} 180L{128 + x - 5} 240L{128 + x + 6} 241L{128 + x * .25 + 4:.1f} 180z"
        ic.shape(d, ic.lin(OCHRE, 128 + x - 6, 0, 128 + x + 7, 0), "#6d4310", 1.5)
        ic.line(f"M{128 + x * .25:.1f} 190L{128 + x:.1f} 234", "#ffe9a8", 1.4, .7)
        ic.shape(ell(128 + x + .5, 240, 5.5, 2.6), "#fbe3a0", "#6d4310", 1.2, False)
    for deg, ln, cv in ((-42, 128, -6), (42, 128, 6), (-21, 146, -4), (21, 146, 4), (0, 154, 0)):
        stalk(deg, ln, cv)
    # Rope tie: three twisted turns and a knot.
    for k in range(3):
        y = 172 + k * 10
        w = 23 - abs(k - 1) * 2
        ic.shape(rect(128 - w, y, 2 * w, 10, 5), ic.lin(WHITE, 0, y, 0, y + 10), LINE, 2)
        for x in range(int(128 - w + 5), int(128 + w - 3), 7):
            ic.line(f"M{x} {y + 8}L{x + 4} {y + 2}", "#7d6240", 1.6, .9)
    ic.shape(ell(141, 187, 10, 9), ic.rad(WHITE, 138, 183, 13), LINE, 2)
    ic.line("M135 190Q141 180 147 186M137 183Q143 190 148 189", "#7d6240", 1.6)
    ic.line("M147 194Q156 206 152 218M140 196Q142 208 136 216", "#dac79c", 5, 1, "", None, True, 8)
    ic.save(.9, 0, 6)


def materiel():
    ic = Icon("materiel")
    # Dark inside of the crate, then the cartridges standing in it, then the front.
    ic.shape("M36 128L62 98H194L220 128z", ic.lin(["#2b1a0d", "#0e0804"], 0, 98, 0, 128), LINE, 2.5)

    def cartridge(x, top, w, h):
        base, sh = top + h, top + h * .34
        case = f"M{x - w} {base}V{sh + 14:.1f}L{x - w * .62:.1f} {sh:.1f}V{sh - 8:.1f}H{x + w * .62:.1f}V{sh:.1f}L{x + w} {sh + 14:.1f}V{base}z"
        tip = f"M{x - w * .62:.1f} {sh - 8:.1f}C{x - w * .62:.1f} {top + h * .14:.1f} {x - w * .3:.1f} {top + 4} {x} {top}C{x + w * .3:.1f} {top + 4} {x + w * .62:.1f} {top + h * .14:.1f} {x + w * .62:.1f} {sh - 8:.1f}z"
        ic.shape(tip, ic.lin([COPPER[1], COPPER[0], COPPER[1], COPPER[2], COPPER[3]], x - w * .6, 0, x + w * .6, 0), LINE, 2)
        ic.shape(case, ic.lin([BRASS[2], BRASS[0], BRASS[1], BRASS[2], BRASS[3]], x - w, 0, x + w, 0), LINE, 2)
        ic.line(f"M{x - w * .6:.1f} {sh:.1f}H{x + w * .6:.1f}", "#5c3812", 1.8, .9)
        ic.line(f"M{x - w * .9:.1f} {sh + 15:.1f}H{x + w * .9:.1f}", "#5c3812", 1.2, .6)
        ic.line(f"M{x - w * .45:.1f} {sh + 20:.1f}V{base - 8}", "#fffbe6", 3, .85)
        ic.line(f"M{x - w * .2:.1f} {top + 12}Q{x - w * .34:.1f} {top + h * .18:.1f} {x - w * .34:.1f} {sh - 12:.1f}", "#fff3e4", 2.4, .85)

    for x, top, w, h in ((74, 46, 13, 100), (182, 50, 13, 98), (101, 28, 14, 120), (156, 32, 14, 116), (128, 14, 15, 134)):
        cartridge(x, top, w, h)
    # Front: three planks.
    front = rect(32, 126, 192, 108, 4)
    ic.shape(front, ic.lin(WOOD, 0, 126, 0, 234), LINE, 3)
    for k in range(3):
        y = 126 + k * 36
        d = rect(33, y + 1, 190, 34, 3)
        c = ic.clip(d)
        ic.fill(d, ic.lin([WOOD[0], WOOD[1], WOOD[2]], 0, y, 0, y + 36))
        ic.grain(36, y + 4, 222, y + 32, 13, "#4a2812", .5, c)
        ic.grain(36, y + 4, 222, y + 32, 5, "#f1c48c", .5, c)
        ic.line(f"M36 {y + 3}H220", "#f6cf9b", 2, .7)
        ic.line(f"M33 {y + 35}H223", "#2b1508", 3, .9)
        kx = 92 + k * 34
        ic.line(ell(kx, y + 18, 8, 5), "#4a2812", 1.6, .7)
        ic.line(ell(kx, y + 18, 4, 2.4), "#3a1e0c", 1.6, .8)
        for x in (72, 184):
            ic.rivet(x, y + 18, 3, IRON)
    # Top lip with light, iron corner straps, rope handle.
    ic.shape(rect(26, 118, 204, 18, 4), ic.lin([WOOD[0], WOOD[1], WOOD[3]], 0, 118, 0, 136), LINE, 2.5)
    ic.line("M32 122H224", "#ffdcae", 2.4, .8)
    for x in (30, 198):
        ic.shape(rect(x, 116, 28, 120, 3), ic.lin(IRON, x, 116, x + 28, 236), INK, 2.5)
        ic.line(f"M{x + 4} 121V231", "#d9d8d2", 2, .7)
        for y in (128, 152, 188, 222):
            ic.rivet(x + 14, y, 5, STEEL)
    ic.line("M98 166C98 208 158 208 158 166", "#8c6b3c", 10, 1, "", None, False)
    ic.line("M98 166C98 208 158 208 158 166", "#e2c58c", 6)
    for a in range(0, 11):
        t = a / 10
        x = 98 * (1 - t) ** 3 + 3 * 98 * t * (1 - t) ** 2 + 3 * 158 * t * t * (1 - t) + 158 * t ** 3
        y = 166 * (1 - t) ** 3 + 3 * 208 * t * (1 - t) ** 2 + 3 * 208 * t * t * (1 - t) + 166 * t ** 3
        ic.line(f"M{x - 2:.1f} {y + 3:.1f}L{x + 2:.1f} {y - 3:.1f}", "#6b4c22", 1.8, .9)
    for x in (98, 158):
        ic.shape(circ(x, 164, 9), ic.rad(IRON, x - 3, 161, 12), INK, 2, False)
        ic.fill(circ(x, 164, 4), "#15100b")
    ic.save()


def coin_face(ic, cx, cy, r, back=True):
    ic.shape(circ(cx + 5, cy + 5, r), "#7a4710", LINE, 2, back)
    ic.shape(circ(cx, cy, r), ic.rad(["#fff6c8", "#f5cb57", "#c98b26", "#8a5414"], cx - r * .4, cy - r * .45, r * 1.7), LINE, 2.5, back)
    for i in range(64):
        a = i * 360 / 64
        (x0, y0), (x1, y1) = pol(cx, cy, r * .92, a), pol(cx, cy, r * .985, a)
        ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#7a4a10", 1.5, .7)
    ic.line(circ(cx, cy, r * .88), "#7a4a10", 2.2, .9)
    ic.line(circ(cx - .8, cy - .8, r * .85), "#fff5c4", 1.6, .9)
    for i in range(32):
        x, y = pol(cx, cy, r * .76, i * 360 / 32)
        ic.fill(circ(x + .7, y + .7, r * .035), "#6d400d", .9)
        ic.fill(circ(x, y, r * .032), "#fff3bd")
    ic.shape(circ(cx, cy, r * .66), ic.rad(["#d79b33", "#e9b94b", "#f8db7c"], cx - r * .25, cy - r * .25, r * .95), "#8a5614", 2, False)
    for i in range(8):
        tf = f"rotate({i * 45} {cx} {cy})"
        d = f"M{cx} {cy - r * .1:.1f}C{cx - r * .19:.1f} {cy - r * .26:.1f} {cx - r * .13:.1f} {cy - r * .46:.1f} {cx} {cy - r * .57:.1f}C{cx + r * .13:.1f} {cy - r * .46:.1f} {cx + r * .19:.1f} {cy - r * .26:.1f} {cx} {cy - r * .1:.1f}z"
        ic.shape(d, ic.lin(["#fff2b8", "#e0a53a"], cx - r * .15, cy - r * .5, cx + r * .15, cy - r * .1), "#7a4a10", 1.6, False, tf)
        ic.line(f"M{cx} {cy - r * .2:.1f}V{cy - r * .48:.1f}", "#8a5614", 1.4, .8, tf)
    ic.shape(circ(cx, cy, r * .14), ic.rad(GOLD, cx - 4, cy - 4, r * .22), "#7a4a10", 1.8, False)
    x0, y0 = pol(cx, cy, r * .81, 200)
    x1, y1 = pol(cx, cy, r * .81, 285)
    ic.line(f"M{x0:.1f} {y0:.1f}A{r * .81:.1f} {r * .81:.1f} 0 0 1 {x1:.1f} {y1:.1f}", "#fffdf0", 4, .75)


def funds():
    ic = Icon("funds")

    def stack(cx, base, n, rx, ry, h):
        for k in range(n):
            y = base - k * h
            jx = cx + ic.rng.uniform(-3, 3)
            side = f"M{jx - rx:.1f} {y - h:.1f}V{y:.1f}a{rx} {ry} 0 0 0 {2 * rx} 0V{y - h:.1f}z"
            ic.shape(side, ic.lin(["#a86c1c", "#ffe9a0", "#e2a83e", "#a66a1a", "#6b3f0c"], jx - rx, 0, jx + rx, 0), LINE, 2)
            for i in range(1, 22):
                a = math.pi * i / 22
                x = jx - rx * math.cos(a)
                yy = y + ry * math.sin(a)
                ic.line(f"M{x:.1f} {yy - h + 3:.1f}V{yy - 2:.1f}", "#6b3f0c", 1.5, .65)
            ic.shape(ell(jx, y - h, rx, ry), ic.lin(["#fff4c0", "#f0c453", "#c08425"], jx - rx, y - h - ry, jx + rx, y - h + ry), LINE, 2)
            ic.line(ell(jx, y - h, rx * .8, ry * .78), "#8a5614", 1.6, .8)
        ic.fill(ell(cx, base - n * h + .5, rx * .4, ry * .38), "#fff2b4", .8)

    stack(74, 216, 6, 46, 15, 16)
    stack(182, 220, 2, 48, 15, 16)
    coin_face(ic, 152, 110, 78)
    ic.save()


def person(ic, cx, top, s, cloth, wrap, hood=True):
    """A cloaked figure from the chest up, the face left as plain shade."""
    w = 62 * s
    by = top + 150 * s
    body = f"M{cx - w:.1f} {by:.1f}C{cx - w:.1f} {top + 86 * s:.1f} {cx - w * .62:.1f} {top + 72 * s:.1f} {cx - 18 * s:.1f} {top + 64 * s:.1f}H{cx + 18 * s:.1f}C{cx + w * .62:.1f} {top + 72 * s:.1f} {cx + w:.1f} {top + 86 * s:.1f} {cx + w:.1f} {by:.1f}z"
    ic.shape(body, ic.lin(cloth, cx - w * .7, top + 60 * s, cx + w * .9, by), LINE, 2.5)
    c = ic.clip(body)
    for k, x in enumerate((-.72, -.48, -.24, .26, .5, .74)):
        ic.line(f"M{cx + x * w * .45:.1f} {top + 76 * s:.1f}Q{cx + x * w * 1.05:.1f} {top + 110 * s:.1f} {cx + x * w:.1f} {by:.1f}", cloth[3], 3.2 * s, .6, "", c)
        ic.line(f"M{cx + x * w * .45 - 3 * s:.1f} {top + 78 * s:.1f}Q{cx + x * w * 1.05 - 4 * s:.1f} {top + 110 * s:.1f} {cx + x * w - 4 * s:.1f} {by:.1f}", cloth[0], 1.8 * s, .65, "", c)
    # Shirt opening with embroidery.
    ic.shape(f"M{cx - 13 * s:.1f} {top + 66 * s:.1f}L{cx} {top + 120 * s:.1f}L{cx + 13 * s:.1f} {top + 66 * s:.1f}z", ic.lin(WHITE, cx, top + 60 * s, cx, top + 120 * s), LINE, 2, False)
    for k in range(4):
        ic.fill(circ(cx, top + (80 + k * 9) * s, 1.8 * s), cloth[2])
    ic.line(f"M{cx - 16 * s:.1f} {top + 66 * s:.1f}L{cx} {top + 126 * s:.1f}L{cx + 16 * s:.1f} {top + 66 * s:.1f}", OCHRE[0], 2.2 * s, .9)
    # Head in shade.
    ic.shape(f"M{cx - 25 * s:.1f} {top + 28 * s:.1f}C{cx - 25 * s:.1f} {top + 56 * s:.1f} {cx - 14 * s:.1f} {top + 74 * s:.1f} {cx} {top + 74 * s:.1f}C{cx + 14 * s:.1f} {top + 74 * s:.1f} {cx + 25 * s:.1f} {top + 56 * s:.1f} {cx + 25 * s:.1f} {top + 28 * s:.1f}z", ic.lin([SKIN[2], SKIN[1], SKIN[2], SKIN[3]], cx - 25 * s, top + 30 * s, cx + 25 * s, top + 60 * s), LINE, 2)
    ic.fill(f"M{cx - 25 * s:.1f} {top + 26 * s:.1f}H{cx + 25 * s:.1f}V{top + 42 * s:.1f}Q{cx} {top + 52 * s:.1f} {cx - 25 * s:.1f} {top + 42 * s:.1f}z", "#2a160b", .55)
    # Wrapped headcloth.
    wrap_d = f"M{cx - 33 * s:.1f} {top + 34 * s:.1f}C{cx - 38 * s:.1f} {top + 4 * s:.1f} {cx - 18 * s:.1f} {top - 8 * s:.1f} {cx} {top - 8 * s:.1f}C{cx + 20 * s:.1f} {top - 8 * s:.1f} {cx + 38 * s:.1f} {top + 4 * s:.1f} {cx + 33 * s:.1f} {top + 34 * s:.1f}Q{cx} {top + 22 * s:.1f} {cx - 33 * s:.1f} {top + 34 * s:.1f}z"
    ic.shape(wrap_d, ic.lin(wrap, cx - 30 * s, top - 6 * s, cx + 30 * s, top + 36 * s), LINE, 2.5)
    for k in range(5):
        y = top + (2 + k * 6) * s
        ic.line(f"M{cx - (30 + k) * s:.1f} {y + 4 * s:.1f}Q{cx - 4 * s:.1f} {y - 10 * s + k * 2:.1f} {cx + (27 + k) * s:.1f} {y - 2 * s + k:.1f}", wrap[3], 2 * s, .6)
        ic.line(f"M{cx - (28 + k) * s:.1f} {y + 1.5 * s:.1f}Q{cx - 6 * s:.1f} {y - 12 * s + k * 2:.1f} {cx + 10 * s:.1f} {y - 8 * s + k * 2:.1f}", "#fff", 1.6 * s, .55)
    # Scarf round the neck.
    ic.shape(f"M{cx - 30 * s:.1f} {top + 62 * s:.1f}C{cx - 16 * s:.1f} {top + 80 * s:.1f} {cx + 16 * s:.1f} {top + 80 * s:.1f} {cx + 30 * s:.1f} {top + 62 * s:.1f}C{cx + 34 * s:.1f} {top + 78 * s:.1f} {cx + 18 * s:.1f} {top + 92 * s:.1f} {cx} {top + 92 * s:.1f}C{cx - 18 * s:.1f} {top + 92 * s:.1f} {cx - 34 * s:.1f} {top + 78 * s:.1f} {cx - 30 * s:.1f} {top + 62 * s:.1f}z", ic.lin(wrap, cx - 30 * s, top + 60 * s, cx + 30 * s, top + 92 * s), LINE, 2, False)
    ic.line(f"M{cx - 27 * s:.1f} {top + 72 * s:.1f}Q{cx} {top + 92 * s:.1f} {cx + 27 * s:.1f} {top + 72 * s:.1f}", wrap[3], 2 * s, .6)


def support():
    ic = Icon("support")
    person(ic, 62, 58, .88, OLIVE, GREY)
    person(ic, 194, 58, .88, OCHRE, WHITE)
    person(ic, 128, 48, 1.22, TERRA, WHITE)
    # Cut flat at the bottom by a brass band.
    ic.shape(rect(8, 224, 240, 18, 7), ic.lin(BRASS, 0, 224, 0, 242), LINE, 2.5)
    ic.line("M16 229H240", "#fff6d0", 2, .8)
    for x in range(22, 240, 21):
        ic.rivet(x, 234, 3.6)
    ic.save(.97, 0, -4)


# ---------------------------------------------------------------- navigation

def heroes():
    ic = Icon("heroes")
    # Laurel: two branches of leaves, under the star.
    for s in (-1, 1):
        ic.line(f"M{128 + s * 10} 238C{128 + s * 92} 222 {128 + s * 122} 150 {128 + s * 98} 62", "#4b5424", 6, 1, "", None, True, 8)
        for k in range(9):
            t = .08 + k / 9
            p0, p1, p2, p3 = (128 + s * 10, 238), (128 + s * 92, 222), (128 + s * 122, 150), (128 + s * 98, 62)
            x = p0[0] * (1 - t) ** 3 + 3 * p1[0] * t * (1 - t) ** 2 + 3 * p2[0] * t * t * (1 - t) + p3[0] * t ** 3
            y = p0[1] * (1 - t) ** 3 + 3 * p1[1] * t * (1 - t) ** 2 + 3 * p2[1] * t * t * (1 - t) + p3[1] * t ** 3
            ang = s * (112 - k * 18)
            for side, pal in ((-1, OLIVE), (1, ["#d3d795", "#9ba356", "#6a7335", "#3d4520"])):
                tf = f"translate({x:.1f} {y:.1f}) rotate({ang + side * 38:.1f})"
                ic.shape("M0 2C-11 -8 -9 -26 0 -37C9 -26 11 -8 0 2z", ic.lin(pal, -9, -30, 9, 0), LINE, 1.6, True, tf, 8)
                ic.line("M0 -2V-31M0 -10L-5 -16M0 -10L5 -16M0 -18L-5 -24M0 -18L5 -24", "#39411c", 1.2, .75, tf)
    faceted_star(ic, 128, 120, 102, 44, ["#fff9d8", "#ffdf7a"], ["#f6c955", "#d99a30"], ["#b4721f", "#7d470f"], 3)
    ic.shape(circ(128, 122, 36), ic.lin(BRASS, 100, 92, 156, 152), LINE, 2.5, False)
    for i in range(24):
        x, y = pol(128, 122, 31, i * 15)
        ic.fill(circ(x, y, 1.9), "#fff4c2")
    ic.shape(circ(128, 122, 26), ic.rad(TEAL, 118, 110, 42), INK, 2.2, False)
    faceted_star(ic, 128, 123, 20, 8.6, ["#fff9d8", "#ffe08a"], ["#f4c650", "#dca034"], ["#c08126", "#93591a"], 1.4, False)
    ic.line("M106 112A24 24 0 0 1 128 99", "#fff", 3.4, .6)
    for i in range(5):
        x, y = pol(128, 120, 98, -90 + i * 72)
        ic.rivet(x, y, 8, GOLD)
    ic.save(.9, 0, 2)


def alliance():
    ic = Icon("alliance")
    outer = "M128 10C158 30 194 38 226 38C230 124 208 198 128 246C48 198 26 124 30 38C62 38 98 30 128 10z"
    inner = "M128 36C154 52 182 60 205 61C206 130 186 184 128 220C70 184 50 130 51 61C74 60 102 52 128 36z"
    ic.shape(outer, ic.lin(BRASS, 50, 20, 200, 230), LINE, 3)
    ic.line("M128 18C157 36 190 44 219 45C221 122 200 190 128 236", "#57330f", 2, .7)
    ic.line("M128 18C99 36 66 44 37 45C35 122 56 190 128 236", "#fff6cc", 2.4, .9)
    c = ic.clip(inner)
    ic.shape(inner, ic.lin(TEAL, 60, 40, 200, 220), INK, 3, False)
    ic.fill("M128 36C154 52 182 60 205 61C206 130 186 184 128 220z", "#061517", .34)
    # Hammered field and engraved scrolls.
    for k in range(80):
        x, y = ic.rng.uniform(50, 206), ic.rng.uniform(40, 220)
        ic.line(f"M{x:.1f} {y:.1f}q3 -2 6 0", "#c9ece6" if k % 2 else "#0c2528", 1.5, .35, "", c)
    for s in (-1, 1):
        ic.line(f"M{128 + s * 10} 206C{128 + s * 44} 188 {128 + s * 62} 160 {128 + s * 66} 130C{128 + s * 70} 112 {128 + s * 50} 110 {128 + s * 52} 124C{128 + s * 54} 134 {128 + s * 64} 132 {128 + s * 62} 124", "#f2c873", 3.4, .95, "", c)
        ic.line(f"M{128 + s * 68} 72C{128 + s * 50} 70 {128 + s * 40} 78 {128 + s * 46} 86C{128 + s * 52} 92 {128 + s * 60} 86 {128 + s * 54} 80", "#f2c873", 3, .95, "", c)
    ic.line("M62 74C62 128 80 172 122 204", "#d9f1f0", 2, .45)
    for pts in ((128, 24), (70, 45), (186, 45), (40, 60), (216, 60), (42, 104), (214, 104), (54, 150), (202, 150), (78, 192), (178, 192), (128, 232)):
        ic.rivet(pts[0], pts[1], 5.4)
    faceted_star(ic, 128, 122, 60, 25, ["#fff9d8", "#ffe08a"], ["#f4c650", "#d8992f"], ["#b37420", "#7a4510"], 2.6, False)
    ic.shape(circ(128, 123, 13), ic.rad(GOLD, 122, 117, 20), LINE, 2, False)
    ic.fill(circ(124, 119, 4), "#fffbe6", .9)
    ic.save()


def map_icon():
    ic = Icon("map")
    panels = [[(14, 54), (72, 30), (72, 208), (14, 232)], [(72, 30), (128, 54), (128, 232), (72, 208)], [(128, 54), (184, 30), (184, 208), (128, 232)], [(184, 30), (242, 54), (242, 232), (184, 208)]]
    shades = [PAPER[:3], [PAPER[1], PAPER[2], "#bd9a60"], PAPER[:3], [PAPER[1], PAPER[2], "#bd9a60"]]
    for p, sh in zip(panels, shades):
        ic.shape(poly(p), ic.lin(sh, p[0][0], 0, p[1][0], 0), "#7a5a2e", 2.5)
    whole = poly([(14, 54), (72, 30), (128, 54), (184, 30), (242, 54), (242, 232), (184, 208), (128, 232), (72, 208), (14, 232)])
    c = ic.clip(whole)
    # Stains, grid, contour hills, river, trees, route and target.
    for x, y, r in ((40, 190, 34), (214, 80, 30), (110, 70, 24)):
        ic.fill(circ(x, y, r), "#a5763a", .16, "", c)
    for x in (43, 100, 156, 213):
        ic.line(f"M{x} 30V236", "#9a7a48", 1.1, .5, "", c)
    for y in (88, 128, 168):
        ic.line(f"M14 {y + 12}L72 {y - 12}L128 {y + 12}L184 {y - 12}L242 {y + 12}", "#9a7a48", 1.1, .5, "", c)
    for cx, cy, sx, sy in ((60, 92, 1, .8), (196, 150, 1.05, .85)):
        for k in range(5):
            r = 38 - k * 7.4
            ic.line(f"M{cx - r * sx:.1f} {cy:.1f}C{cx - r * sx:.1f} {cy - r * sy * 1.2:.1f} {cx + r * sx * .4:.1f} {cy - r * sy * 1.25:.1f} {cx + r * sx:.1f} {cy - r * sy * .2:.1f}C{cx + r * sx * 1.05:.1f} {cy + r * sy:.1f} {cx - r * sx * .6:.1f} {cy + r * sy * 1.1:.1f} {cx - r * sx:.1f} {cy:.1f}z", "#8a5a28", 2, .85, "", c)
    ic.line("M96 24C88 70 132 86 122 126C112 164 152 170 146 240", "#33606b", 9, .9, "", c)
    ic.line("M96 24C88 70 132 86 122 126C112 164 152 170 146 240", "#7fb0b2", 5, 1, "", c)
    ic.line("M95 30C88 70 131 86 121 126", "#d5ecea", 1.6, .9, "", c)
    for x, y in ((34, 150), (48, 160), (30, 168), (166, 64), (182, 72), (168, 82), (206, 200), (222, 194)):
        ic.line(f"M{x} {y}v7", "#4a3214", 2.4)
        ic.shape(f"M{x} {y - 15}L{x + 8} {y + 1}H{x - 8}z", ic.lin(OLIVE, x - 8, y - 14, x + 8, y), "#2c3314", 1.4, False)
    for (x0, y0), (x1, y1) in (((36, 206), (54, 196)), ((62, 190), (80, 180)), ((90, 176), (106, 162)), ((132, 142), (148, 126)), ((156, 118), (172, 106)), ((182, 100), (196, 92))):
        ic.line(f"M{x0} {y0}L{x1} {y1}", "#7d1f14", 5.5)
    ic.line("M200 74L224 98M224 74L200 98", "#4f0f0a", 12)
    ic.line("M200 74L224 98M224 74L200 98", "#d0402a", 7)
    ic.line("M202 75L222 95", "#ff9b80", 2, .8)
    ic.shape(circ(30, 210, 9), ic.rad(WAX, 27, 207, 13), INK, 2, False)
    # Compass rose.
    cx, cy = 96, 120
    ic.line(circ(cx, cy, 19), "#6b451a", 1.8, .9)
    for i in range(8):
        a, b, d = pol(cx, cy, 24 if i % 2 == 0 else 14, -90 + i * 45), pol(cx, cy, 5.5, -67.5 + i * 45), pol(cx, cy, 5.5, -112.5 + i * 45)
        ic.shape(poly([(cx, cy), a, b]), "#3a2412", "#3a2412", .8, False)
        ic.shape(poly([(cx, cy), a, d]), "#f6e3b4", "#3a2412", .8, False)
    ic.fill(circ(cx, cy, 2.6), "#c13a28")
    # Creases and worn edges.
    for x, y0, y1, l in ((72, 30, 208, "#fffbe8"), (128, 54, 232, "#6d4d22"), (184, 30, 208, "#fffbe8")):
        ic.line(f"M{x} {y0 + 3}V{y1 - 3}", l, 2.6, .8)
    ic.line("M17 58L72 35L128 59L184 35L239 58", "#fffdf2", 2.4, .8)
    for x, y in ((14, 110), (14, 176), (242, 120), (242, 190), (100, 219), (212, 219), (44, 219)):
        ic.fill(f"M{x - 5} {y}L{x} {y - 5}L{x + 5} {y}L{x} {y + 5}z", INK)
    ic.save()


def base():
    ic = Icon("base")
    # Stone footing and ground.
    ic.shape("M10 222C40 208 216 208 246 222L238 240H18z", ic.lin(["#d0a670", "#9a7040", "#5f4020"], 0, 210, 0, 240), LINE, 2.5)
    # Chimney.
    ic.shape(rect(172, 34, 28, 62), ic.lin(WHITE, 172, 0, 200, 0), LINE, 2.5)
    ic.shape(rect(167, 26, 38, 13, 3), ic.lin(TERRA, 0, 26, 0, 39), LINE, 2.5)
    # Walls: lit front, shaded gable side.
    front = "M42 112H160V222H42z"
    side = "M160 112L192 92L222 116V216L160 222z"
    ic.shape(front, ic.lin([WHITE[0], WHITE[1], WHITE[2]], 42, 110, 160, 222), LINE, 2.5)
    ic.shape(side, ic.lin([WHITE[2], "#a98f66", WHITE[3]], 160, 100, 222, 220), LINE, 2.5)
    cf, cs = ic.clip(front), ic.clip(side)
    # Patches of bare stone and plaster cracks.
    for x, y in ((46, 190), (62, 203), (46, 212), (80, 212), (136, 196), (148, 208), (130, 212), (52, 126), (146, 124)):
        ic.shape(rect(x, y, 17, 9, 3), ic.lin(OCHRE[:3], x, y, x + 17, y + 9), "#7a5a2e", 1.3, False)
    for x, y in ((166, 196), (180, 206), (196, 198), (206, 186), (170, 150), (204, 136)):
        ic.shape(rect(x, y, 14, 8, 3), ic.lin(OCHRE[1:], x, y, x + 14, y + 8), "#4f3818", 1.3, False)
    ic.line("M72 120l5 12l-4 9l6 10M140 150l-6 8l3 10", "#8f7855", 1.5, .8, "", cf)
    for k in range(34):
        x, y = ic.rng.uniform(44, 158), ic.rng.uniform(114, 220)
        ic.line(f"M{x:.1f} {y:.1f}h{ic.rng.uniform(3, 8):.1f}", "#a8906a", 1.2, .4, "", cf)
    # Roof of rounded tiles, row by row.
    roof = "M22 118L66 44H190L172 118z"
    ic.shape(roof, ic.lin(TERRA, 60, 44, 120, 124), LINE, 3)
    ic.shape("M172 118L190 44L236 118L222 124L192 88z", ic.lin([TERRA[2], TERRA[3], "#3f160a"], 180, 50, 230, 124), LINE, 3)
    cr = ic.clip(roof)
    for row in range(6):
        y = 48 + row * 12.6
        t = row / 6
        x0, x1 = 66 - 44 * t - 6, 190 - 18 * t + 6
        n = 11
        step = (x1 - x0) / n
        for i in range(n + 1):
            x = x0 + i * step + (step / 2 if row % 2 else 0)
            col = ic.rng.choice([TERRA, TERRA, ["#f4ab7c", "#d97a4b", "#a64c2a", "#6a2a14"], ["#d98555", "#b85a33", "#86391d", "#54200f"]])
            d = f"M{x:.1f} {y:.1f}h{step:.1f}v9a{step / 2:.1f} 5 0 0 1 {-step:.1f} 0z"
            p = f'<path d="{d}" fill="{ic.lin(col[:3], x, y, x + step, y + 13)}" stroke="#4f1c0c" stroke-width="1.3"/>'
            ic.body.append(f'<g clip-path="url(#{cr})">{p}</g>')
            ic.line(f"M{x + 2.4:.1f} {y + 3:.1f}v6", "#ffd2b0", 1.5, .55, "", cr)
    for k in range(5):
        ic.line(f"M{194 + k * 8.5:.1f} {58 + k * 14}L{182 + k * 3:.1f} {106 + k * 1.5:.1f}", "#2f0f06", 2, .55)
    # Ridge.
    for i in range(9):
        x = 60 + i * 14.4
        ic.shape(rect(x, 37, 17, 13, 6), ic.lin(TERRA, x, 37, x, 50), "#4f1c0c", 1.8)
        ic.line(f"M{x + 4} 41h8", "#ffd9bb", 1.6, .7)
    # Beam ends under the eave.
    for x in range(48, 158, 18):
        ic.shape(circ(x, 122, 5), ic.rad(WOOD, x - 2, 120, 7), LINE, 1.6, False)
        ic.fill(circ(x, 122, 1.6), "#4a2812")
    ic.fill("M30 118H170V126H30z", "#1a1109", .3)
    # Door with planks, arch stones, studs.
    door = "M82 222V166C82 138 126 138 126 166V222z"
    for i in range(9):
        a = 180 + i * 22.5
        x, y = pol(104, 166, 29, a)
        ic.shape(poly([pol(104, 166, 22, a - 10), pol(104, 166, 34, a - 10), pol(104, 166, 34, a + 10), pol(104, 166, 22, a + 10)]), ic.lin(OCHRE[:3], x - 6, y - 6, x + 6, y + 6), "#5e3c13", 1.6, False)
    ic.shape(door, ic.lin(DARKWOOD, 82, 140, 126, 222), LINE, 2.5, False)
    cd = ic.clip(door)
    for x in (93, 104, 115):
        ic.line(f"M{x} 140V222", "#1f0f05", 2, .9, "", cd)
    ic.grain(84, 146, 124, 220, 16, "#d49a62", .4, cd, "", 2, False)
    for y in (172, 204):
        ic.shape(rect(83, y, 42, 6), ic.lin(IRON, 0, y, 0, y + 6), INK, 1.4, False)
        for x in (88, 98, 110, 120):
            ic.fill(circ(x, y + 3, 1.6), "#d9d8d2")
    ic.line(circ(118, 190, 3.6), BRASS[1], 2)
    # Windows: shuttered front, small barred side.
    ic.shape(rect(50, 144, 22, 30, 2), "#20140b", LINE, 2, False)
    for x in (50, 62):
        ic.shape(rect(x, 144, 10, 30), ic.lin(["#7fa3a0", "#4f7674", "#2e4a4a"], x, 0, x + 10, 0), INK, 1.4, False)
        for y in range(148, 172, 5):
            ic.line(f"M{x + 2} {y}h6", "#cfe6e2", 1.3, .7)
    ic.shape(rect(136, 146, 16, 22, 2), "#20140b", LINE, 2, False)
    ic.line("M141 147V167M147 147V167M137 157H151", BRASS[2], 1.8)
    ic.shape("M184 138L200 136V164L184 167z", "#17100a", LINE, 2, False)
    ic.line("M189 138V166M195 137V165M184 152L200 150", BRASS[2], 1.8)
    # Jar, sacks, steps, vine.
    ic.shape("M140 222C130 210 136 196 143 193V188H157V193C164 196 170 210 160 222z", ic.lin(COPPER, 134, 190, 166, 222), LINE, 2)
    ic.line("M139 206Q150 210 161 206M141 200Q150 203 159 200", "#4f240e", 1.6, .8)
    ic.line("M142 200Q139 208 143 216", "#ffe0c6", 2, .8)
    ic.shape("M28 224C24 204 34 200 44 202C56 200 62 210 58 224z", ic.lin(PAPER, 28, 200, 60, 224), LINE, 2)
    ic.line("M36 206Q44 212 52 206M40 203V197L46 197V203", "#7a5a2e", 1.8)
    ic.shape(rect(76, 218, 56, 9, 2), ic.lin(GREY, 0, 218, 0, 227), LINE, 1.8, False)
    ic.shape(rect(70, 226, 68, 10, 2), ic.lin(GREY, 0, 226, 0, 236), LINE, 1.8, False)
    for x, y in ((214, 120), (218, 132), (212, 142), (219, 152), (213, 162), (218, 174), (212, 184)):
        ic.shape(f"M{x} {y}c6 -8 14 -4 13 4c-5 6 -11 4 -13 -4z", ic.lin(OLIVE, x, y - 5, x + 12, y + 6), "#2c3314", 1.3)
    ic.save()


def reports():
    ic = Icon("reports")
    # Back sheet, front sheet with torn foot, folded corner.
    ic.shape("M62 22L216 38L202 232L48 216z", ic.lin([PAPER[2], PAPER[3], "#7d5f35"], 60, 20, 210, 230), LINE, 2.5)
    for k in range(6):
        ic.line(f"M{200 - k} {70 + k * 26}l10 1", "#6d4f28", 1.6, .6)
    sheet = "M34 18H166L206 58V222L194 230L180 222L164 231L148 223L130 232L112 224L96 232L78 223L62 231L48 222L34 229z"
    ic.shape(sheet, ic.lin(PAPER[:3], 40, 20, 200, 232), LINE, 2.5)
    c = ic.clip(sheet)
    for x, y, r in ((60, 200, 30), (190, 120, 26), (70, 60, 18)):
        ic.fill(circ(x, y, r), "#a5763a", .13, "", c)
    for _ in range(40):
        x, y = ic.rng.uniform(36, 200), ic.rng.uniform(30, 224)
        ic.line(f"M{x:.1f} {y:.1f}h{ic.rng.uniform(2, 7):.1f}", "#b8945a", 1, .4, "", c)
    ic.line("M38 22V222", "#fffdf2", 2.4, .9)
    ic.shape("M166 18L206 58H174Q166 58 166 50z", ic.lin([PAPER[0], PAPER[2], PAPER[3]], 168, 30, 196, 58), "#7a5a2e", 2.2, False)
    # Headline rule, a drawn column of handwriting, a small sketch map.
    ic.line("M52 46H146", "#3a2412", 9)
    ic.line("M52 60H118", "#3a2412", 4, .8)
    ic.line("M50 74H190M50 78H190", "#8a5a28", 1.6, .8)

    def scrawl(x0, x1, y):
        d, x = f"M{x0} {y}", x0
        while x < x1 - 8:
            w = ic.rng.uniform(5, 9)
            d += f"q{w / 4:.1f} {-ic.rng.uniform(5, 9):.1f} {w / 2:.1f} 0t{w / 2:.1f} 0"
            x += w
            if ic.rng.random() < .22:
                d += "m6 0"
                x += 6
        ic.line(d, "#44311c", 2.6, .95)

    for y in (94, 110, 126, 142):
        scrawl(50, 120, y)
    for y in (164, 181, 198):
        scrawl(50, 148, y)
    ic.shape(rect(130, 86, 62, 62, 2), "#f7e6bd", "#6b451a", 2, False)
    for r in (22, 15, 8):
        ic.line(f"M{156 - r} {118}C{156 - r} {118 - r} {160 + r * .6:.1f} {116 - r} {160 + r * .8:.1f} {116}C{160 + r * .8:.1f} {118 + r * .9:.1f} {156 - r * .8:.1f} {120 + r} {156 - r} 118z", "#8a5a28", 1.8, .9)
    ic.line("M134 144L148 130M154 126L164 116M170 110L180 100", "#a82c1c", 3)
    ic.line("M180 92l8 8M188 92l-8 8", "#c13a28", 3.4)
    # Wax seal with ribbons.
    for s in (-1, 1):
        ic.shape(f"M{176 + s * 4} 196L{176 + s * 26} 244L{176 + s * 12} 238L{176 + s * 4} 250z", ic.lin(WAX, 160, 196, 200, 250), INK, 2)
        ic.line(f"M{176 + s * 6} 204L{176 + s * 17} 236", "#ffb09a", 1.8, .7)
    blob = "M" + "L".join(f"{pol(176, 190, 33 + (3.4 if i % 3 == 0 else -1.6 if i % 3 == 1 else 1), i * 15)[0]:.1f} {pol(176, 190, 33 + (3.4 if i % 3 == 0 else -1.6 if i % 3 == 1 else 1), i * 15)[1]:.1f}" for i in range(24)) + "z"
    ic.shape(blob, ic.rad(WAX, 164, 176, 52), INK, 2.5)
    ic.line(circ(176, 190, 24), "#4d0d09", 3, .9)
    ic.line(circ(175, 189, 24), "#ff9d86", 1.5, .8)
    for i in range(8):
        tf = f"rotate({i * 45} 176 190)"
        ic.shape("M176 188C169 182 170 174 176 170C182 174 183 182 176 188z", ic.lin(["#f58a6c", "#a02a1c"], 170, 170, 182, 188), "#4d0d09", 1.4, False, tf)
    ic.shape(circ(176, 190, 5), ic.rad(WAX, 174, 188, 7), "#4d0d09", 1.4, False)
    ic.line("M150 178A28 28 0 0 1 166 163", "#ffd2c4", 3.6, .8)
    ic.save()


def settings():
    ic = Icon("settings")
    cx, cy, teeth = 128, 128, 10

    def gear(r0, r1, off=0):
        pts = []
        for i in range(teeth):
            a = i * 360 / teeth
            for da, r in ((-13, r0), (-8.4, r1), (8.4, r1), (13, r0)):
                pts.append(pol(cx + off, cy + off, r, a + da - 90))
        return poly(pts)

    ic.shape(gear(88, 114, 5), "#4a2a0c", INK, 3)
    ic.shape(gear(88, 114), ic.lin(BRASS, 50, 40, 206, 220), LINE, 3)
    for i in range(teeth):
        tf = f"rotate({i * 360 / teeth} {cx} {cy})"
        ic.line(f"M{cx - 13} {cy - 109}H{cx + 13}", "#fff8d6", 3, .8, tf)
        ic.line(f"M{cx - 15} {cy - 107}L{cx - 19} {cy - 90}", "#fff3c0", 2, .65, tf)
        ic.line(f"M{cx + 15} {cy - 107}L{cx + 19} {cy - 90}", "#57330f", 2.4, .8, tf)
        ic.line(f"M{cx - 8} {cy - 100}h16M{cx - 8} {cy - 95}h16", "#7a4c18", 1.4, .6, tf)
    ic.shape(circ(cx, cy, 86), ic.lin([BRASS[3], BRASS[2], BRASS[1]], 60, 60, 200, 200), LINE, 2.5, False)
    ic.shape(circ(cx, cy, 80), ic.lin(BRASS, 70, 60, 190, 200), LINE, 2, False)
    for i in range(10):
        ic.rivet(*pol(cx, cy, 72, i * 36 - 72), 5.2)
    # Window ring with five spokes.
    ic.shape(circ(cx, cy, 62), "#1c120a", INK, 2.5, False)
    for i in range(5):
        tf = f"rotate({i * 72} {cx} {cy})"
        d = f"M{cx - 9} {cy - 22}L{cx - 14} {cy - 64}H{cx + 14}L{cx + 9} {cy - 22}z"
        ic.shape(d, ic.lin(BRASS, cx - 14, 0, cx + 14, 0), LINE, 2, False, tf)
        ic.line(f"M{cx - 6} {cy - 26}L{cx - 9} {cy - 60}", "#fff6cc", 2, .8, tf)
        ic.line(f"M{cx} {cy - 32}V{cy - 54}", "#6d431a", 3, .7, tf)
    ic.line(circ(cx, cy, 62), "#5c3812", 3)
    ic.line(f"M{cx - 44} {cy + 44}A62 62 0 0 0 {cx + 44} {cy + 44}", "#f2cf80", 2.4, .9)
    # Hub: steel bearing with a slotted bolt.
    ic.shape(circ(cx, cy, 36), ic.lin(BRASS, 100, 96, 156, 160), LINE, 2.5, False)
    ic.shape(circ(cx, cy, 29), ic.lin(IRON, 104, 104, 152, 152), INK, 2, False)
    for i in range(12):
        x, y = pol(cx, cy, 24, i * 30)
        ic.shape(circ(x, y, 4.4), ic.rad(STEEL, x - 1.4, y - 1.6, 6), INK, 1.2, False)
    ic.shape(poly([pol(cx, cy, 18, i * 60 + 12) for i in range(6)]), ic.lin(STEEL, 112, 112, 146, 146), INK, 2.2, False)
    ic.shape(circ(cx, cy, 12), ic.rad(STEEL, 123, 122, 18), INK, 1.6, False)
    ic.line("M119 133L137 123", "#2a2c30", 4.4)
    ic.line("M120 135L138 125", "#fff", 1.4, .8)
    # Scratches and worn edge.
    for _ in range(26):
        a, r = ic.rng.uniform(0, 360), ic.rng.uniform(66, 84)
        x, y = pol(cx, cy, r, a)
        ic.line(f"M{x:.1f} {y:.1f}l{ic.rng.uniform(-6, 6):.1f} {ic.rng.uniform(-4, 4):.1f}", ic.rng.choice(["#fff6cc", "#5c3812"]), 1.1, .5)
    ic.line("M58 92A80 80 0 0 1 112 50", "#fffbe6", 4, .6)
    ic.save(.97, -2, -2)


# ---------------------------------------------------------------- actions

def upgrade():
    ic = Icon("upgrade")
    # Two ingot bars, then the faceted arrow.
    for y, w, pal in ((214, 62, STEEL), (184, 54, BRASS)):
        d = f"M{128 - w} {y}L{128 - w + 9} {y - 16}H{128 + w - 9}L{128 + w} {y}V{y + 14}H{128 - w}z"
        ic.shape(d, ic.lin(pal, 128 - w, y - 14, 128 + w, y + 14), LINE, 2.5)
        ic.fill(f"M{128 - w + 3} {y - 1}L{128 - w + 11} {y - 14}H{128 + w - 11}L{128 + w - 3} {y - 1}z", pal[0], .75)
        ic.line(f"M{128 - w} {y}H{128 + w}", LINE, 2, .8)
        ic.line(f"M{128 - w + 12} {y + 5}H{128 + w - 12}", pal[0], 1.8, .8)
        for x in range(int(128 - w + 14), int(128 + w - 8), 14):
            ic.line(f"M{x} {y + 9}h6", pal[3], 1.8, .7)
    out = [(128, 8), (236, 112), (236, 124), (174, 124), (174, 164), (82, 164), (82, 124), (20, 124), (20, 112)]
    inn = [(128, 34), (204, 106), (158, 106), (158, 148), (98, 148), (98, 106), (52, 106)]
    ic.shape(poly(out), ic.lin(GOLD, 60, 10, 190, 170), LINE, 3)
    # Bevel facets: lit left, dark right and below.
    for pts, pal in (([(128, 8), (20, 112), (20, 124), (52, 106), (128, 34)], ["#fffbe0", "#ffdf7a"]), ([(128, 8), (236, 112), (236, 124), (204, 106), (128, 34)], ["#e0a236", "#9a5f14"]),
                     ([(20, 124), (82, 124), (98, 106), (52, 106)], ["#b87822", "#7d4a0e"]), ([(236, 124), (174, 124), (158, 106), (204, 106)], ["#8f5a14", "#633808"]),
                     ([(82, 124), (82, 164), (98, 148), (98, 106)], ["#ffeeae", "#f2c24e"]), ([(174, 124), (174, 164), (158, 148), (158, 106)], ["#b87822", "#7d4a0e"]), ([(82, 164), (174, 164), (158, 148), (98, 148)], ["#8f5a14", "#633808"])):
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        ic.shape(poly(pts), ic.lin(pal, min(xs), min(ys), max(xs), max(ys)), "#5c380c", 1.6, False)
    ic.shape(poly(inn), ic.lin(["#fff0b0", "#f7cb55", "#dc9c30"], 70, 40, 180, 150), "#5c380c", 2.2, False)
    c = ic.clip(poly(inn))
    for k in range(4):
        y = 64 + k * 26
        ic.line(f"M{128 - 46} {y + 34}L128 {y - 8}L{128 + 46} {y + 34}", "#93590f", 8, .85, "", c)
        ic.line(f"M{128 - 46} {y + 37}L128 {y - 5}L{128 + 46} {y + 37}", "#fffbe4", 2, .8, "", c)
    for _ in range(26):
        x, y = ic.rng.uniform(60, 190), ic.rng.uniform(44, 146)
        ic.line(f"M{x:.1f} {y:.1f}l{ic.rng.uniform(4, 10):.1f} {ic.rng.uniform(-3, 3):.1f}", ic.rng.choice(["#fffbe4", "#a0671a"]), 1.1, .45, "", c)
    for x, y in ((128, 24), (42, 110), (214, 110), (91, 156), (165, 156)):
        ic.rivet(x, y, 6, BRASS)
    ic.line("M34 104L120 22", "#fffef2", 3, .8)
    ic.save()


def info():
    ic = Icon("info")
    cx = cy = 128
    ic.shape(circ(cx + 3, cy + 4, 112), "#4a2a0c", INK, 3)
    ic.shape(circ(cx, cy, 112), ic.lin(BRASS, 50, 40, 206, 220), LINE, 3)
    for i in range(72):
        (x0, y0), (x1, y1) = pol(cx, cy, 105, i * 5), pol(cx, cy, 111, i * 5)
        ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#57330f", 1.5, .65)
    ic.line(circ(cx, cy, 102), "#57330f", 2.2, .9)
    ic.line(circ(cx - 1, cy - 1, 100), "#fff6cc", 1.6, .9)
    # Rope border.
    for i in range(48):
        tf = f"rotate({i * 7.5} {cx} {cy})"
        ic.shape(f"M{cx - 7} {cy - 98}q8 -1 12 12q-8 2 -12 -12z", ic.lin(GOLD, cx - 6, cy - 98, cx + 6, cy - 84), "#57330f", 1.2, False, tf)
    ic.shape(circ(cx, cy, 82), ic.lin([BRASS[3], BRASS[2], BRASS[0]], 70, 70, 190, 190), LINE, 2.2, False)
    ic.shape(circ(cx, cy, 76), ic.rad(["#4f6f74", "#2f4a50", "#182a2f", "#0c1518"], 108, 100, 110), INK, 2.2, False)
    c = ic.clip(circ(cx, cy, 75))
    for i in range(36):
        tf = f"rotate({i * 10} {cx} {cy})"
        ic.line(f"M{cx} {cy - 30}V{cy - 74}", "#9cc2c4", 1.1, .22, tf, c)
    for r in (34, 50, 64):
        ic.line(circ(cx, cy, r), "#9cc2c4", 1.1, .25)
    # The i: bevelled, with serifs.
    i_d = "M102 112H140V176H154V192H102V176H114V128H102z"
    ic.shape(i_d, "#0c0704", "#0c0704", 8, False)
    ic.shape(i_d, ic.lin(GOLD, 100, 110, 156, 194), "#5c380c", 2, False)
    ic.line("M106 116H136M118 130V178M106 180H114", "#fffbe4", 3, .85)
    ic.line("M136 120V180H150V188H106", "#8a5212", 2.6, .8)
    ic.shape(circ(128, 82, 19), "#0c0704", "#0c0704", 6, False)
    ic.shape(circ(128, 82, 18), ic.rad(GOLD, 121, 74, 27), "#5c380c", 2, False)
    ic.fill(ell(122, 75, 6, 4), "#fffef0", .9)
    ic.line("M66 106A66 66 0 0 1 112 64", "#d9f1f0", 4, .5)
    for a in (45, 135, 225, 315):
        ic.rivet(*pol(cx, cy, 91, a), 7, GOLD)
    ic.save()


def rifle(ic, tf):
    """A bolt-action rifle lying along x, muzzle to the right, centred on the origin."""
    stock = "M-128 8C-128 -4 -118 -8 -104 -9L-66 -13C-56 -14 -50 -9 -42 -9H70V5H-34C-44 6 -48 14 -58 13C-66 12 -74 10 -82 14L-116 30C-124 32 -128 28 -128 20z"
    ic.shape(rect(66, -9, 64, 8, 2), ic.lin(STEEL, 0, -9, 0, -1), INK, 2, True, tf, 13)
    ic.shape(stock, ic.lin(WOOD, 0, -14, 0, 28), LINE, 2.4, True, tf, 13)
    ic.grain(-122, -6, 60, 8, 14, "#4a2812", .55, None, tf, 2)
    ic.line("M-118 -4L-66 -9C-56 -10 -50 -5 -42 -5H62", "#f7cfa0", 2, .8, tf)
    ic.shape("M-128 6V22C-126 30 -122 31 -118 29L-116 4z", ic.lin(IRON, -128, 0, -116, 0), INK, 1.8, False, tf)
    for x in (-8, 34, 66):
        ic.shape(rect(x, -13, 9, 20, 2), ic.lin(STEEL, x, 0, x + 9, 0), INK, 1.8, False, tf)
        ic.line(f"M{x + 2.4} -10V4", "#fff", 1.4, .8, tf)
    ic.shape(rect(-50, -17, 46, 11, 3), ic.lin(STEEL, 0, -17, 0, -6), INK, 2, True, tf, 11)
    ic.line("M-46 -14H-9", "#fff", 1.6, .8, tf)
    ic.line("M-40 -9h10M-26 -9h6", "#2a2c30", 1.8, .9, tf)
    ic.line("M-46 -12L-54 -2", "#8d9094", 5, 1, tf, None, True, 8)
    ic.shape(circ(-55, 0, 5.4), ic.rad(STEEL, -57, -2, 8), INK, 1.8, True, tf, 9)
    ic.shape(rect(-2, -20, 10, 8, 1), ic.lin(IRON, 0, -20, 0, -12), INK, 1.6, True, tf, 8)
    ic.shape("M118 -9V-18L124 -9z", "#6d7074", INK, 1.6, True, tf, 8)
    ic.line("M70 -7H126", "#fff", 1.5, .75, tf)
    ic.line("M-46 10C-46 22 -28 22 -26 7", "#8d9094", 3.6, 1, tf, None, True, 7)
    ic.line("M-36 8q3 6 -1 9", "#3a3d42", 2.6, 1, tf)
    ic.line("M-96 22C-50 44 20 34 36 8", "#4f2f16", 7, 1, tf, None, True, 7)
    ic.line("M-96 21C-50 43 20 33 36 7", "#a86f3d", 3.4, 1, tf)


def train():
    ic = Icon("train")
    cx = cy = 128
    # Straw target: rings, weave, bullet holes.
    ic.shape(circ(cx, cy, 100), ic.lin(WOOD, 60, 40, 200, 220), LINE, 3)
    for i in range(60):
        (x0, y0), (x1, y1) = pol(cx, cy, 92, i * 6), pol(cx, cy, 99, i * 6 + 3)
        ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#f1c48c" if i % 2 else "#4a2812", 2, .7)
    for r, pal in ((90, PAPER[:3]), (72, TERRA[:3]), (54, PAPER[:3]), (36, TERRA[:3]), (18, GOLD[:3])):
        ic.shape(circ(cx, cy, r), ic.lin(pal, cx - r, cy - r, cx + r, cy + r), "#5e2f16", 2, False)
    c = ic.clip(circ(cx, cy, 90))
    for k in range(-9, 10):
        ic.line(f"M{cx + k * 10 - 20} 30L{cx + k * 10 + 20} 226", "#5e3c13", 1, .22, "", c)
        ic.line(f"M{cx + k * 10 + 20} 30L{cx + k * 10 - 20} 226", "#5e3c13", 1, .22, "", c)
    ic.line("M62 100A72 72 0 0 1 104 60", "#fffdf2", 4, .5)
    for x, y in ((128, 50), (88, 92), (170, 84), (150, 200), (96, 190), (204, 132)):
        ic.fill(circ(x, y, 6.5), "#2a160b")
        ic.line(f"M{x - 6} {y - 6}l-4 -4M{x + 6} {y - 5}l5 -3M{x - 2} {y + 7}l-2 5", "#2a160b", 1.8, .8)
        ic.line(f"M{x - 5} {y + 3}A6 6 0 0 0 {x + 5} {y + 3}", "#fff3d4", 1.6, .8)
    rifle(ic, "translate(128 138) rotate(-44) scale(1.16)")
    rifle(ic, "translate(128 138) scale(-1 1) rotate(-44) scale(1.16)")
    ic.save(.93, 0, -5)


def hammer():
    ic = Icon("hammer")
    tf = "rotate(42 128 128)"
    handle = "M116 70H140C142 130 145 190 147 244C147 252 109 252 109 244C111 190 114 130 116 70z"
    ic.shape(handle, ic.lin([WOOD[1], WOOD[0], WOOD[1], WOOD[2], WOOD[3]], 110, 0, 146, 0), LINE, 2.5, True, tf)
    ic.grain(114, 92, 142, 196, 22, "#4a2812", .6, None, tf, 2, False)
    ic.grain(116, 92, 130, 196, 8, "#ffddb0", .55, None, tf, 2, False)
    # Leather wrap on the grip.
    for k in range(6):
        y = 186 + k * 9
        ic.shape(f"M{110} {y + 3}L{146} {y - 3}V{y + 6}L110 {y + 12}z", ic.lin(["#8a5a34", "#5c3518", "#2f1909"], 110, 0, 146, 0), INK, 1.5, False, tf)
        ic.line(f"M114 {y + 5}L134 {y + 1.6}", "#d9a272", 1.5, .7, tf)
    ic.shape(rect(105, 238, 46, 12, 5), ic.lin(BRASS, 105, 238, 151, 250), LINE, 2, True, tf)
    # Head: flat striking face on the left, peen on the right.
    head = "M34 24H62L72 30H164C196 30 218 38 232 52C218 66 196 78 168 80H72L62 86H34C28 86 26 80 26 74V36C26 30 28 24 34 24z"
    ic.shape(head, ic.lin(STEEL, 0, 22, 0, 88), INK, 3, True, tf)
    ic.fill("M34 24H62L72 30H164C190 30 208 35 221 43C190 40 100 42 26 46V36C26 30 28 24 34 24z", "#fff", .55, tf)
    ic.fill("M72 80L62 86H34C28 86 26 80 26 74V66C90 76 180 74 226 58C212 70 192 79 168 80z", "#23262b", .5, tf)
    ic.line("M62 24V86M72 30V80", "#34373c", 2.4, .9, tf)
    ic.line("M65 26V84", "#fff", 1.6, .8, tf)
    ic.shape("M34 24H44V86H34C28 86 26 80 26 74V36C26 30 28 24 34 24z", ic.lin(["#fff", "#a7a9aa", "#5b5f66"], 26, 24, 44, 86), INK, 2, False, tf)
    for y in (34, 44, 54, 64, 74):
        ic.line(f"M30 {y}h9", "#4b4f56", 1.5, .7, tf)
    ic.shape(rect(106, 22, 44, 66, 5), ic.lin(IRON, 106, 22, 150, 88), INK, 2.5, True, tf)
    ic.line("M110 28H146M110 82H146", "#e8e6de", 2, .7, tf)
    for x, y in ((117, 40), (139, 40), (117, 70), (139, 70)):
        ic.rivet(x, y, 5.2, BRASS, tf)
    ic.shape(poly([(128, 46), (138, 55), (128, 64), (118, 55)]), ic.lin(GOLD, 118, 46, 138, 64), LINE, 1.6, False, tf)
    for _ in range(26):
        x, y = ic.rng.choice([ic.rng.uniform(74, 102), ic.rng.uniform(154, 208)]), ic.rng.uniform(36, 74)
        ic.line(f"M{x:.1f} {y:.1f}l{ic.rng.uniform(3, 10):.1f} {ic.rng.uniform(-4, 4):.1f}", ic.rng.choice(["#fff", "#34373c"]), 1.2, .55, tf)
    ic.save(.84, -8, 10)


def builders():
    ic = Icon("builders")
    # Shovel, then pickaxe across it.
    tf = "rotate(45 128 128)"
    ic.shape("M119 20H137V168H119z", ic.lin([WOOD[1], WOOD[0], WOOD[1], WOOD[3]], 119, 0, 137, 0), LINE, 2.5, True, tf)
    ic.grain(121, 34, 135, 160, 16, "#4a2812", .6, None, tf, 1.5, False)
    ic.shape("M102 6H154V24H140C138 18 118 18 116 24H102z", ic.lin(DARKWOOD, 102, 6, 154, 24), LINE, 2.4, True, tf)
    ic.line("M106 10H150", "#e0a878", 2, .8, tf)
    blade = "M92 166H164C168 200 160 236 128 250C96 236 88 200 92 166z"
    ic.shape(blade, ic.lin(STEEL, 92, 160, 164, 248), INK, 2.5, True, tf)
    ic.line("M98 172C97 200 104 226 126 240", "#fff", 3, .8, tf)
    ic.line("M128 176V226", "#4b4f56", 4, .8, tf)
    ic.line("M132 176V224", "#fff", 1.6, .8, tf)
    ic.fill("M128 250C160 236 168 200 164 166H148C152 200 148 230 128 250z", "#23262b", .35, tf)
    ic.shape("M114 146H142L146 172H110z", ic.lin(IRON, 110, 0, 146, 0), INK, 2, True, tf)
    for y in (154, 165):
        ic.rivet(128, y, 4, BRASS, tf)
    tf = "rotate(-45 128 128)"
    ic.shape("M118 44H138L140 250H116z", ic.lin([WOOD[1], WOOD[0], WOOD[1], WOOD[3]], 116, 0, 140, 0), LINE, 2.5, True, tf)
    ic.grain(120, 80, 136, 240, 20, "#4a2812", .6, None, tf, 1.5, False)
    for k in range(4):
        ic.shape(rect(115, 206 + k * 9, 26, 8, 2), ic.lin(["#8a5a34", "#3a2010"], 115, 0, 141, 0), INK, 1.4, False, tf)
    pick = "M4 92C40 48 88 34 128 34C168 34 216 48 252 92C214 70 172 64 152 64H104C84 64 42 70 4 92z"
    ic.shape(pick, ic.lin(STEEL, 0, 32, 0, 92), INK, 3, True, tf)
    ic.line("M28 72C60 50 96 42 128 42C160 42 190 48 216 62", "#fff", 3, .8, tf)
    ic.fill("M4 92C42 70 84 64 104 64H152C172 64 214 70 252 92C214 60 160 56 128 56C96 56 42 60 4 92z", "#23262b", .5, tf)
    ic.shape(rect(106, 26, 44, 46, 5), ic.lin(IRON, 106, 26, 150, 72), INK, 2.5, True, tf)
    ic.line("M111 31H145", "#e8e6de", 2, .7, tf)
    for x, y in ((117, 41), (139, 41), (117, 60), (139, 60)):
        ic.rivet(x, y, 4.6, BRASS, tf)
    ic.save(.96, 0, 2)


def power():
    ic = Icon("power")
    tf = "rotate(45 128 128)"
    # Blade: two bevels, fuller, engraving and nicks.
    blade = "M128 -42L150 -12V160H106V-12z"
    ic.shape(blade, ic.lin(STEEL, 106, 0, 150, 0), INK, 3, True, tf)
    ic.fill("M128 -42L106 -12V160H128z", ic.lin(["#ffffff", "#dcdcd6", "#b4b6b6"], 106, 0, 128, 0), 1, tf)
    ic.fill("M128 -42L150 -12V160H128z", ic.lin(["#8b8f95", "#6b7077", "#3d424a"], 128, 0, 150, 0), 1, tf)
    ic.shape("M123 0L128 -12L133 0V156H123z", ic.lin(["#4b4f56", "#9a9da0", "#e6e6e0"], 123, 0, 133, 0), "#34373c", 1.4, False, tf)
    ic.line("M110 -8V154", "#fff", 2, .9, tf)
    for k in range(5):
        y = 66 + k * 18
        ic.line(f"M113 {y}q5 -7 8 0q-3 6 -8 0M135 {y}q3 -7 8 0q-5 6 -8 0", "#c99a45", 1.8, .9, tf)
    for y, s in ((20, -1), (54, 1), (96, -1), (128, 1)):
        x = 128 + s * 22
        ic.fill(f"M{x} {y - 5}L{x - s * 5} {y}L{x} {y + 5}z", INK, 1, tf)
    # Guard with curled ends, leather-wrapped grip, jewelled pommel.
    guard = "M128 156C150 156 168 154 178 146C186 138 200 142 199 154C198 166 186 170 176 170C160 176 144 180 128 180C112 180 96 176 80 170C70 170 58 166 57 154C56 142 70 138 78 146C88 154 106 156 128 156z"
    ic.shape(guard, ic.lin(GOLD, 0, 140, 0, 180), LINE, 2.6, True, tf)
    ic.line("M84 154C100 162 156 162 172 154", "#fffbe0", 2.6, .85, tf)
    ic.line("M84 168C104 175 152 175 172 168", "#7a4710", 2.4, .8, tf)
    for x in (67, 189):
        ic.shape(circ(x, 154, 7), ic.rad(GOLD, x - 2, 151, 10), LINE, 1.8, False, tf)
    ic.shape(poly([(128, 158), (140, 168), (128, 178), (116, 168)]), ic.rad(WAX, 124, 164, 18), INK, 1.8, False, tf)
    grip = "M113 180H143C147 200 147 218 143 236H113C109 218 109 200 113 180z"
    ic.shape(grip, ic.lin(["#a26c40", "#6d4020", "#3a2010"], 110, 0, 146, 0), LINE, 2.4, True, tf)
    for k in range(7):
        y = 186 + k * 8
        ic.line(f"M111 {y + 3}L145 {y - 3}", "#22120a", 2.4, .9, tf)
        ic.line(f"M113 {y}L130 {y - 3}", "#d9a272", 1.5, .75, tf)
    for y in (180, 232):
        ic.shape(rect(109, y, 38, 8, 3), ic.lin(BRASS, 0, y, 0, y + 8), LINE, 1.8, True, tf)
    ic.shape(circ(128, 258, 22), ic.rad(GOLD, 120, 250, 32), LINE, 2.5, True, tf)
    ic.line(circ(128, 258, 15), "#7a4710", 2, .8, tf)
    ic.shape(circ(128, 258, 10), ic.rad(WAX, 124, 253, 15), INK, 1.8, False, tf)
    ic.fill(circ(124, 254, 3), "#fff", .85, tf)
    ic.save(.96, -2, 2)


def marches():
    ic = Icon("marches")
    # Pole with brass bands and a spear finial; a plain waving pennant, no emblem.
    cloth = "M62 34C96 16 120 56 154 40C184 28 208 40 238 30C226 52 214 70 206 88C216 108 228 126 240 146C210 154 186 142 156 154C122 168 96 134 62 152z"
    ic.shape(cloth, ic.lin(TERRA, 62, 20, 230, 160), LINE, 3)
    c = ic.clip(cloth)
    for x, op in ((98, .5), (150, .45), (196, .4)):
        ic.fill(f"M{x - 18} 10C{x - 6} 60 {x - 22} 110 {x - 8} 170H{x + 12}C{x - 2} 110 {x + 12} 60 {x + 2} 10z", "#4f1c0c", op, "", c)
        ic.fill(f"M{x + 8} 10C{x + 18} 60 {x + 4} 110 {x + 18} 170H{x + 28}C{x + 14} 110 {x + 28} 60 {x + 18} 10z", "#ffc9a0", op * .8, "", c)
    for k in range(34):
        y = 20 + k * 4.2
        ic.line(f"M62 {y:.1f}C96 {y - 18:.1f} 120 {y + 20:.1f} 154 {y + 6:.1f}C184 {y - 6:.1f} 208 {y + 4:.1f} 240 {y:.1f}", "#3f160a", 1, .22, "", c)
    ic.line("M62 46C96 28 120 68 154 52C184 40 200 50 226 44", "#f6d386", 5, 1, "", c)
    ic.line("M62 140C96 122 120 156 154 142C186 130 206 140 228 136", "#f6d386", 5, 1, "", c)
    ic.line("M62 46C96 28 120 68 154 52C184 40 200 50 226 44M62 140C96 122 120 156 154 142C186 130 206 140 228 136", "#7a4710", 1.4, .8, "", c)
    for k in range(5):
        x = 92 + k * 26
        y = 92 + 8 * math.sin(k * 1.3)
        ic.shape(poly([(x, y - 14), (x + 9, y), (x, y + 14), (x - 9, y)]), ic.lin(GOLD, x - 9, y - 12, x + 9, y + 12), "#5c2a12", 1.8, False)
        ic.line(f"M{x} {y - 7}V{y + 7}M{x - 4} {y}H{x + 4}", "#7a4710", 1.4, .8)
    for i in range(12):
        t = i / 11
        x0, y0 = 238 + (206 - 238) * min(1, t * 2) if t < .5 else 206 + (240 - 206) * (t * 2 - 1), 30 + t * 116
        ic.line(f"M{x0 - 4:.1f} {y0:.1f}l9 3", "#f6d386", 2.6, 1, "", None, True, 4)
    ic.shape(rect(42, 30, 18, 218, 5), ic.lin([WOOD[1], WOOD[0], WOOD[1], WOOD[3]], 42, 0, 60, 0), LINE, 2.5)
    ic.grain(45, 60, 58, 240, 18, "#4a2812", .6, None, "", 1.5, False)
    for y in (36, 94, 144, 198, 236):
        ic.shape(rect(39, y, 24, 12, 3), ic.lin(BRASS, 39, 0, 63, 0), LINE, 2)
        ic.line(f"M43 {y + 3}v6", "#fff6cc", 2, .8)
    for y in (50, 138):
        ic.line(f"M42 {y}L64 {y + 5}M42 {y + 5}L64 {y}", "#f0dcae", 3)
    ic.shape("M51 2C62 12 64 22 56 32H46C38 22 40 12 51 2z", ic.lin(GOLD, 40, 4, 62, 32), LINE, 2.2)
    ic.line("M51 8V30", "#fffbe0", 1.8, .8)
    ic.line("M62 50C76 62 70 82 80 96", "#e2c58c", 3.4, 1, "", None, True, 5)
    ic.shape("M75 94H86L89 116H72z", ic.lin(GOLD, 72, 94, 89, 116), LINE, 1.8)
    ic.line("M77 98L76 113M81 98V113M84 98L85 113", "#7a4710", 1.3, .8)
    ic.save(.95)


def wounded():
    ic = Icon("wounded")
    # A dressing strip across a roll of bandage.
    ic.shape(ell(84, 182, 62, 52), ic.rad(WHITE, 64, 160, 96), LINE, 2.5)
    for k in range(6):
        r = 1 - k * .16
        ic.line(ell(84, 182, 62 * r, 52 * r), "#8f7855", 2, .8)
        ic.line(f"M{84 - 56 * r:.1f} {176 - 4:.1f}A{62 * r:.1f} {52 * r:.1f} 0 0 1 {84:.1f} {182 - 50 * r:.1f}", "#fff", 1.8, .8)
    ic.fill(ell(84, 182, 7, 6), "#3a2a17")
    for i in range(40):
        a = i * 9
        (x0, y0), (x1, y1) = pol(0, 0, 1, a), pol(0, 0, .9, a)
        ic.line(f"M{84 + x0 * 60:.1f} {182 + y0 * 50:.1f}L{84 + x1 * 60:.1f} {182 + y1 * 50:.1f}", "#b39a6e", 1.2, .6)
    tf = "rotate(-42 140 112)"
    strip = rect(22, 74, 236, 76, 36)
    ic.shape(strip, ic.lin(["#ffe3bd", "#e8b983", "#c48a53", "#8f5a2e"], 0, 74, 0, 150), LINE, 3, True, tf)
    ic.line("M50 82H230", "#fff6e4", 4, .7, tf)
    ic.line("M50 143H230", "#6d3f1c", 3, .6, tf)
    for x in list(range(40, 92, 13)) + list(range(194, 248, 13)):
        for y in range(90, 144, 13):
            ic.fill(circ(x, y, 3.2), "#7a4a24", .9, tf)
            ic.fill(circ(x - .8, y + 1.2, 2), "#ffe9cf", .55, tf)
    pad = rect(96, 70, 88, 84, 6)
    ic.shape(pad, ic.lin(WHITE, 96, 70, 184, 154), LINE, 2.6, True, tf)
    for k in range(17):
        ic.line(f"M{99 + k * 5} 73V151", "#a8906a", 1, .55, tf)
        if k < 16:
            ic.line(f"M99 {74 + k * 5}H181", "#a8906a", 1, .55, tf)
    ic.fill("M122 112C118 92 138 88 146 96C162 92 166 112 158 122C156 136 134 138 128 128C122 126 120 120 122 112z", "#a82c1c", .85, tf)
    ic.fill("M132 112C130 102 142 98 148 106C156 108 152 122 144 122C136 124 132 118 132 112z", "#6d130c", .75, tf)
    ic.fill(circ(170, 98, 4), "#a82c1c", .75, tf)
    ic.fill(circ(112, 136, 3), "#a82c1c", .7, tf)
    ic.line("M100 75H180", "#fff", 3, .8, tf)
    for x in (96, 184):
        for y in range(76, 152, 9):
            ic.line(f"M{x - 4} {y}L{x + 4} {y + 4}", "#7d6240", 1.8, .9, tf)
    ic.save(.97)


# ---------------------------------------------------------------- people and arrows

def avatar():
    ic = Icon("avatar")
    # Bust in a field jacket, scarf and cap; the face is plain shade under the brim.
    body = "M14 256C14 190 50 166 96 156H160C206 166 242 190 242 256z"
    ic.shape(body, ic.lin(OLIVE, 40, 150, 220, 256), LINE, 3)
    c = ic.clip(body)
    for x, q in ((46, 30), (72, 62), (186, 196), (214, 228)):
        ic.line(f"M{x} 190Q{q} 220 {q} 256", "#33391a", 4, .6, "", c)
        ic.line(f"M{x - 5} 190Q{q - 6} 220 {q - 6} 256", "#d3d795", 2, .6, "", c)
    for _ in range(60):
        x, y = ic.rng.uniform(20, 236), ic.rng.uniform(168, 254)
        ic.line(f"M{x:.1f} {y:.1f}l3 -3", "#2b3115" if ic.rng.random() < .6 else "#c8ce8c", 1.1, .35, "", c)
    # Jacket front, buttons, pockets, cross strap.
    ic.line("M128 190V256", "#2b3115", 4, .9)
    ic.line("M124 192V256", "#d3d795", 1.6, .7)
    for y in (212, 240):
        ic.rivet(136, y, 5)
    for x in (58, 164):
        ic.shape(f"M{x} 218H{x + 36}V256H{x}z", ic.lin(OLIVE[:3], x, 218, x + 36, 256), "#33391a", 2, False)
        ic.shape(f"M{x - 2} 214H{x + 38}V226L{x + 18} 236L{x - 2} 226z", ic.lin(OLIVE[:3], x, 214, x, 236), "#33391a", 2, False)
        ic.rivet(x + 18, 228, 3.6)
    ic.line("M62 170L182 256", "#2b1508", 18, 1, "", c)
    ic.line("M62 170L182 256", "#7c4822", 13, 1, "", c)
    ic.line("M60 166L180 252", "#c98f58", 2, .9, "", c)
    for k in range(6):
        x, y = 72 + k * 18, 181 + k * 12.9
        ic.shape(rect(x - 6, y - 9, 11, 18, 2), ic.lin(BRASS, x - 6, 0, x + 6, 0), INK, 1.6, False, f"rotate(-52 {x:.1f} {y:.1f})")
    # Neck, head in shade, ears.
    ic.shape("M98 128H158V170Q128 190 98 170z", ic.lin([SKIN[2], SKIN[3]], 0, 128, 0, 176), LINE, 2, False)
    for x in (72, 184):
        ic.shape(ell(x, 104, 9, 15), ic.lin(SKIN, x - 9, 92, x + 9, 120), LINE, 2)
    ic.shape("M74 70C70 124 94 158 128 158C162 158 186 124 182 70z", ic.lin([SKIN[0], SKIN[1], SKIN[2], SKIN[3]], 80, 80, 180, 150), LINE, 2.5)
    ic.fill("M74 70H182C183 92 180 108 174 118C160 100 96 100 82 118C76 106 73 90 74 70z", "#1f0f06", .6)
    ic.fill("M128 158C162 158 186 124 182 70H160C164 118 150 146 128 158z", "#2a160b", .35)
    ic.line("M84 120C90 140 104 152 122 154", "#f2c59a", 2.4, .5)
    # Scarf wraps.
    ic.shape("M70 148C92 172 164 172 186 148C200 166 196 190 170 198C144 206 112 206 86 198C60 190 56 166 70 148z", ic.lin(WHITE, 70, 146, 180, 204), LINE, 2.6)
    for k in range(4):
        ic.line(f"M{70 - k * 1.5:.1f} {160 + k * 9}C{96} {180 + k * 8} {160} {180 + k * 8} {187 + k * 1.5:.1f} {158 + k * 9}", "#8f7855", 2.2, .75)
        ic.line(f"M{74 - k:.1f} {157 + k * 9}C{92} {172 + k * 8} {110} {176 + k * 8} {128} {176 + k * 8}", "#fff", 1.8, .8)
    ic.shape("M150 190C172 198 178 222 170 246C160 240 150 244 144 250C142 226 140 206 150 190z", ic.lin(WHITE, 144, 190, 178, 246), LINE, 2.4, False)
    ic.line("M156 200Q164 222 160 240M150 204Q154 224 150 242", "#8f7855", 1.8, .7)
    for x in range(146, 170, 5):
        ic.line(f"M{x} {246 - (x - 146) * .2:.1f}v7", "#cdb894", 1.8)
    # Field cap with brim, band and stitching.
    ic.shape("M66 74C58 30 92 8 128 8C164 8 198 30 190 74C164 60 92 60 66 74z", ic.lin(OLIVE, 72, 10, 190, 76), LINE, 2.6)
    ic.line("M128 10C122 28 122 46 126 62M92 20C84 36 82 52 84 64M164 20C172 36 174 52 172 64", "#33391a", 2.2, .7)
    ic.line("M98 18C112 12 128 12 142 15", "#e6ebb4", 4, .6)
    ic.shape("M64 76C92 56 164 56 192 76V60C164 42 92 42 64 60z", ic.lin([OLIVE[1], OLIVE[2], OLIVE[3]], 0, 46, 0, 76), LINE, 2.2, False)
    ic.line("M70 64C96 50 160 50 186 64", "#d3d795", 1.6, .8)
    for i in range(16):
        t = i / 15
        ic.line(f"M{72 + t * 112:.1f} {71 - 13 * math.sin(math.pi * t):.1f}h3", "#e6ebb4", 1.4, .8)
    ic.shape("M60 78C92 58 164 58 196 78C204 92 196 98 186 94C160 80 96 80 70 94C60 98 52 92 60 78z", ic.lin(["#8d965a", "#4c5528", "#272d12"], 0, 62, 0, 96), LINE, 2.6)
    ic.line("M66 78C96 64 160 64 190 78", "#d3d795", 2.2, .7)
    ic.line("M70 89C98 76 158 76 186 89", "#1c210c", 1.6, .7)
    # Fills a round frame.
    ic.save(.94, 0, 12, True)


def arrow(name, pts_out, pts_in, studs, lines):
    ic = Icon(name)
    ic.shape(poly(pts_out), ic.lin(BRASS, 50, 20, 200, 240), LINE, 3, True, "", 18)
    n = len(pts_out)
    for i in range(n):
        a, b = pts_out[i], pts_out[(i + 1) % n]
        c, d = pts_in[i], pts_in[(i + 1) % n]
        # A bevel facing the top left is lit.
        nx, ny = b[1] - a[1], -(b[0] - a[0])
        lit = -(nx * .6 + ny * .8) / math.hypot(nx, ny)
        pal = ["#fffbe0", "#ffe08a"] if lit > .3 else (["#c98f30", "#8a5a18"] if lit > -.45 else ["#7a4a12", "#4a2a08"])
        ic.shape(poly([a, b, d, c]), ic.lin(pal, a[0], a[1], d[0], d[1]), "#4a2a0c", 1.6, False)
    ic.shape(poly(pts_in), ic.lin(GOLD[:3], 70, 40, 180, 220), "#4a2a0c", 2, False)
    cl = ic.clip(poly(pts_in))
    for d in lines:
        ic.line(d, "#8a5212", 5, .85, "", cl)
        ic.line(d, "#fffbe0", 1.8, .85, "translate(2.5 2.5)", cl)
    for _ in range(34):
        x, y = ic.rng.uniform(50, 206), ic.rng.uniform(30, 226)
        ic.line(f"M{x:.1f} {y:.1f}l{ic.rng.uniform(-7, 7):.1f} {ic.rng.uniform(-5, 5):.1f}", ic.rng.choice(["#fffbe0", "#8a5a18"]), 1.2, .5, "", cl)
    for x, y in studs:
        ic.rivet(x, y, 8.5, BRASS)
    ic.save()


def back():
    out = [(26, 128), (148, 14), (182, 46), (118, 106), (234, 106), (234, 150), (118, 150), (182, 210), (148, 242)]
    inn = [(44, 128), (148, 32), (163, 46), (86, 118), (222, 118), (222, 138), (86, 138), (163, 210), (148, 224)]
    arrow("back", out, inn, [(60, 128), (148, 46), (148, 210), (208, 128)], ["M76 128L140 68", "M76 128L140 188", "M96 128H196"])


def chevron():
    out = [(84, 14), (200, 128), (84, 242), (48, 206), (126, 128), (48, 50)]
    inn = [(84, 34), (180, 128), (84, 222), (68, 206), (146, 128), (68, 50)]
    arrow("chevron", out, inn, [(84, 50), (166, 128), (84, 206)], ["M96 62L150 116", "M96 194L150 140"])


# ---------------------------------------------------------------- troops and small things

BLUE = ["#8fb6c0", "#4f7d8a", "#305561", "#16303a"]
RED = ["#d98a72", "#a84a36", "#7d2f20", "#42130b"]
MULE = ["#b58e69", "#8a6443", "#5f412a", "#392415"]


def medallion(ic, face):
    """The round wooden shield a troop stands on, like the round buttons; the troop goes on the next layer and may overlap its rim."""
    c = 128
    ic.shape(circ(c, c, 112), ic.lin(["#d9b484", "#8a6038", "#4a3018"], 0, 16, 0, 240), INK, 3)
    ic.line(circ(c, c, 106), "#3d2412", 2, .7)
    ic.line(f"M{c - 78} {c - 76}A109 109 0 0 1 {c + 78} {c - 76}", "#fff0cf", 4, .55)
    for i in range(24):
        a = i * 15 + 4
        (x0, y0), (x1, y1) = pol(c, c, 98, a), pol(c, c, 109, a + ic.rng.uniform(-2, 2))
        ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#3d2412", 1.6, .5)
    ic.shape(circ(c, c, 94), ic.rad([face[0], face[1], face[2], face[3]], 108, 96, 136), INK, 4, False)
    cl = ic.clip(circ(c, c, 92))
    for i in range(18):
        tf = f"rotate({i * 20} {c} {c})"
        ic.fill(f"M{c} {c}L{c - 8} 20H{c + 8}z", "#ffffff", .055, tf, cl)
    ic.fill("M36 168C80 152 176 152 220 168V232H36z", "#000000", .22, "", cl)
    ic.line("M40 110A90 90 0 0 1 108 40", "#ffffff", 4, .3)
    ic.layer()


def field_cap(ic, tf):
    """A soft cap, its crown up and its brim to the left, about 120 px wide round the origin."""
    ic.shape("M-44 10C-50 -28 -18 -44 14 -42C46 -40 62 -18 56 12C30 22 -20 22 -44 10z", ic.lin(OLIVE, -40, -40, 50, 20), LINE, 2.4, True, tf, 12)
    ic.line("M10 -41C0 -22 0 -8 4 8M-26 -30C-34 -16 -36 -4 -34 6M40 -30C46 -16 46 -6 44 8", "#33391a", 2, .7, tf)
    ic.line("M-20 -34C-4 -42 14 -42 28 -38", "#eef2c0", 3, .6, tf)
    ic.shape("M-46 6C-20 18 30 18 57 6V20C30 32 -20 32 -46 20z", ic.lin(OLIVE[1:], 0, 4, 0, 32), LINE, 2, True, tf, 10)
    for i in range(13):
        t = i / 12
        ic.line(f"M{-40 + t * 90:.1f} {16 + 8 * math.sin(math.pi * t):.1f}h3", "#e6ebb4", 1.3, .8, tf)
    ic.shape("M-46 12C-62 14 -78 22 -80 32C-66 38 -38 36 -20 27C-32 25 -42 21 -46 12z", ic.lin(["#8d965a", "#4c5528", "#272d12"], -70, 12, -30, 36), LINE, 2.2, True, tf, 10)
    ic.line("M-72 30C-60 25 -48 24 -38 25", "#d3d795", 1.8, .8, tf)
    ic.rivet(-40, 15, 3.6, BRASS, tf)


def troop_infantry():
    ic = Icon("troop_infantry")
    medallion(ic, OLIVE)
    rifle(ic, "translate(128 136) rotate(-40) scale(.98)")
    ic.layer()
    field_cap(ic, "translate(134 176) scale(.98)")
    ic.save()


def troop_scouts():
    ic = Icon("troop_scouts")
    medallion(ic, BLUE)
    ic.line("M62 106C50 60 96 34 128 46C160 34 206 60 194 106", "#4f2f16", 9, 1, "", None, True, 9)
    ic.line("M62 105C50 59 96 33 128 45C160 33 206 59 194 105", "#b07846", 4.4)
    ic.line("M62 103C52 60 96 36 128 46", "#e8bb8a", 1.4, .8)
    for k in (-1, 1):
        x = 128 + k * 40
        barrel = f"M{x - 22} 92L{x + 22} 92L{x + 36} 178C{x + 36} 198 {x - 36} 198 {x - 36} 178z"
        ic.shape(barrel, ic.lin(["#3f4426", "#8d965a", "#5c6535", "#2b3016"], x - 34, 0, x + 34, 0), LINE, 2.6)
        cl = ic.clip(barrel)
        for _ in range(70):
            px, py = ic.rng.uniform(x - 34, x + 34), ic.rng.uniform(100, 176)
            ic.line(f"M{px:.1f} {py:.1f}l2.4 2.4", "#1d210d" if ic.rng.random() < .6 else "#c8ce8c", 1.2, .4, "", cl)
        ic.shape(rect(x - 24, 76, 48, 20, 5), ic.lin(IRON, x - 24, 0, x + 24, 0), INK, 2.4)
        ic.line(f"M{x - 16} 79V93M{x - 8} 79V93M{x} 79V93M{x + 8} 79V93M{x + 16} 79V93", "#17140f", 1.8, .8)
        ic.shape(ell(x, 76, 22, 7), ic.lin(["#8fd0d0", "#1f4a50"], 0, 70, 0, 84), INK, 2.2)
        ic.shape(rect(x - 38, 160, 76, 14, 5), ic.lin(BRASS, 0, 160, 0, 174), LINE, 2.2)
        ic.line(f"M{x - 32} 163H{x + 32}", "#fff6d0", 1.6, .8)
        ic.shape(ell(x, 190, 37, 17), ic.lin(IRON, 0, 174, 0, 206), INK, 2.6)
        ic.shape(ell(x, 190, 29, 12.5), ic.rad(["#d5f4f2", "#5fa8ab", "#1d4a52", "#0a1e24"], x - 9, 185, 38), INK, 2, False)
        ic.fill(f"M{x - 20} 186C{x - 14} 180 {x - 2} 179 {x + 4} 181C{x - 6} 184 {x - 14} 188 {x - 18} 193z", "#ffffff", .75)
        ic.line(f"M{x - 20} 100L{x - 28} 154", "#e6ebb4", 3, .5)
    ic.shape(rect(110, 108, 36, 34, 6), ic.lin(IRON, 0, 108, 0, 142), INK, 2.6)
    ic.shape(circ(128, 104, 13), ic.lin(BRASS, 116, 92, 140, 116), LINE, 2.4)
    for i in range(16):
        (x0, y0), (x1, y1) = pol(128, 104, 9.5, i * 22.5), pol(128, 104, 12, i * 22.5)
        ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#5c3812", 1.6, .9)
    ic.rivet(128, 126, 5, STEEL)
    ic.save()


def troop_heavy():
    ic = Icon("troop_heavy")
    medallion(ic, RED)
    # Tripod, then the gun, the belt and its box.
    for d in ("M134 130L84 216", "M140 130L196 214", "M136 132L140 206"):
        ic.line(d, "#4a4d50", 10, 1, "", None, True, 10)
        ic.line(d, "#8b8f93", 4, .9, "translate(-2 -1)")
    for x, y in ((82, 218), (198, 216), (140, 208)):
        ic.shape(ell(x, y, 13, 6), ic.lin(IRON, x - 12, y - 6, x + 12, y + 6), INK, 2.2)
    ic.shape("M118 116H160L152 142H126z", ic.lin(IRON, 118, 116, 160, 142), INK, 2.4)
    ic.rivet(139, 129, 6, BRASS)
    tf = "rotate(-7 128 100)"
    ic.shape(rect(6, 92, 40, 12, 3), ic.lin(STEEL, 0, 92, 0, 104), INK, 2.2, True, tf)
    ic.shape(rect(2, 88, 10, 20, 3), ic.lin(IRON, 0, 88, 0, 108), INK, 2.2, True, tf)
    ic.shape(rect(40, 80, 88, 36, 9), ic.lin(STEEL, 0, 80, 0, 116), INK, 2.6, True, tf)
    for x in range(52, 124, 14):
        for y in (90, 104):
            ic.fill(ell(x, y, 4.4, 3.6), "#17181a", .95, tf)
            ic.line(f"M{x - 4} {y + 3}a4.4 3.6 0 0 0 8 0", "#f4f2ea", 1, .7, tf)
    ic.line("M46 84H122", "#ffffff", 2.2, .75, tf)
    ic.shape("M124 70H196L206 78V122H124z", ic.lin(IRON, 0, 70, 0, 122), INK, 2.8, True, tf)
    ic.line("M129 75H193", "#dcdad2", 2.2, .7, tf)
    for x, y in ((132, 114), (160, 114), (198, 114), (132, 80), (186, 80)):
        ic.rivet(x, y, 3.6, STEEL, tf)
    ic.shape(rect(142, 58, 26, 14, 2), ic.lin(STEEL, 0, 58, 0, 72), INK, 2, True, tf)
    ic.shape("M152 58V44L160 44V58z", ic.lin(STEEL, 152, 0, 160, 0), INK, 1.8, True, tf)
    ic.shape("M204 84H226C234 84 234 96 226 96H204zM204 104H226C234 104 234 116 226 116H204z", ic.lin(WOOD, 0, 84, 0, 116), LINE, 2.2, True, tf)
    for k in range(8):
        a = k / 7
        x, y = 168 + 30 * a * a, 120 + 62 * a
        ic.shape(rect(x - 13, y - 4, 22, 8, 2.5), ic.lin(BRASS, 0, y - 4, 0, y + 4), LINE, 1.6, True, "", 7)
        ic.shape(f"M{x - 13:.1f} {y - 3.5:.1f}L{x - 23:.1f} {y:.1f}L{x - 13:.1f} {y + 3.5:.1f}z", ic.lin(COPPER, 0, y - 4, 0, y + 4), LINE, 1.4, True, "", 6)
    ic.shape(rect(176, 178, 56, 42, 4), ic.lin(OLIVE, 176, 178, 232, 220), LINE, 2.6)
    ic.shape(rect(172, 172, 64, 12, 3), ic.lin(OLIVE, 0, 172, 0, 184), LINE, 2.2)
    ic.line("M180 190H228M180 208H228", "#33391a", 2.4, .7)
    ic.line("M178 175H230", "#eef2c0", 2, .7)
    ic.shape(rect(196, 188, 16, 12, 2), ic.lin(BRASS, 196, 188, 212, 200), LINE, 1.8, False)
    ic.save(.96, 0, 2)


def troop_porters():
    ic = Icon("troop_porters")
    medallion(ic, OCHRE)
    far = ["#6f5036", "#543a25", "#3d2917", "#25170b"]
    for x, w in ((98, 12), (184, 12)):
        ic.shape(f"M{x} 152L{x + 18} 152L{x + w} 214H{x}z", ic.lin(far, x, 150, x + 16, 214), LINE, 2)
        ic.shape(rect(x - 2, 210, 17, 12, 3), "#1d130a", INK, 1.6)
    ic.line("M204 136C220 140 222 162 216 182", "#3a2616", 8, 1, "", None, True, 8)
    ic.shape("M210 176C204 196 210 210 218 214C224 204 224 188 220 176z", ic.lin(far, 208, 176, 222, 214), LINE, 2)
    body = "M84 122C104 112 164 110 192 120C212 128 214 152 204 170C176 182 112 182 88 170C76 156 74 132 84 122z"
    ic.shape(body, ic.lin(MULE, 100, 112, 160, 182), LINE, 2.8)
    ic.fill("M90 168C116 180 174 180 204 168C196 154 110 156 90 168z", "#e3c8a4", .45)
    neck = "M100 126C92 108 82 92 70 82C58 82 40 96 28 110C20 120 24 132 36 132C48 130 58 124 66 128C70 146 80 160 94 166z"
    ic.shape(neck, ic.lin(MULE, 40, 84, 100, 160), LINE, 2.8)
    ic.shape("M40 100C30 106 20 116 24 126C28 134 40 132 46 128C52 118 50 106 40 100z", ic.lin(["#eedcc0", "#c9a981", "#8f6f4a"], 26, 100, 46, 132), LINE, 2, False)
    ic.fill(ell(31, 118, 3, 2.4), "#1d130a")
    ic.line("M28 127Q36 128 42 124", "#4a2f18", 1.8, .9)
    ic.shape(ell(60, 102, 4.6, 4.2), "#140b05", INK, 1.4, False)
    ic.fill(circ(58.6, 100.6, 1.5), "#fff")
    for d in ("M66 84C58 62 62 44 72 36C80 50 80 70 76 86z", "M78 86C80 66 90 52 100 50C102 66 96 82 88 92z"):
        ic.shape(d, ic.lin(MULE, 60, 40, 96, 90), LINE, 2.4)
    ic.line("M70 78C68 64 69 54 72 46M84 84C86 72 91 64 96 60", "#e8c4a4", 3, .7)
    ic.line("M78 84C92 98 100 114 104 130", "#2b1a0d", 8, .9)
    for k in range(7):
        ic.line(f"M{80 + k * 3.6:.1f} {86 + k * 6.6:.1f}l8 -3", "#1a0f07", 3, .8)
    for x in (112, 168):
        ic.shape(f"M{x} 160L{x + 22} 160L{x + 15} 218H{x + 2}z", ic.lin(MULE, x, 158, x + 22, 218), LINE, 2.4)
        ic.line(f"M{x + 5} 168L{x + 6} 212", "#e3c8a4", 2, .5)
        ic.shape(rect(x - 1, 214, 19, 12, 3), "#241609", INK, 1.8)
    # Halter, blanket, pannier, crate, roll and rope.
    ic.line("M46 94L52 128M34 108L50 112M66 90C78 100 84 112 84 126", "#8f2a1c", 5, 1)
    ic.line("M46 94L52 128M34 108L50 112M66 90C78 100 84 112 84 126", "#e88f72", 1.6, .8)
    ic.rivet(50, 112, 4)
    ic.shape("M108 108C130 102 164 102 184 108L190 150C164 158 128 158 104 150z", ic.lin(TERRA, 108, 104, 180, 156), LINE, 2.4)
    for y in (116, 128, 140):
        ic.line(f"M108 {y}C130 {y - 5} 164 {y - 5} 186 {y}", "#f3cd80", 2.4, .8)
    ic.shape(rect(116, 118, 60, 48, 8), ic.lin(["#e8d3a0", "#bd9a62", "#7d6036"], 116, 118, 176, 166), LINE, 2.6)
    c = ic.clip(rect(116, 118, 60, 48, 8))
    for k in range(9):
        ic.line(f"M{112 + k * 9} 114L{124 + k * 9} 170M{124 + k * 9} 114L{112 + k * 9} 170", "#5c4726", 1.3, .5, "", c)
    ic.line("M146 112V170M114 142H178", "#4f2f16", 5)
    ic.line("M145 112V170M114 141H178", "#b07846", 2)
    ic.shape(rect(114, 60, 62, 46, 4), ic.lin(WOOD, 114, 60, 176, 106), LINE, 2.8)
    ic.grain(118, 64, 172, 102, 16, "#4a2812", .5)
    ic.line("M114 76H176M114 91H176", "#2b1508", 2.2, .9)
    for x in (114, 164):
        ic.shape(rect(x, 58, 12, 50, 2), ic.lin(IRON, x, 0, x + 12, 0), INK, 2)
        for y in (66, 83, 100):
            ic.rivet(x + 6, y, 2.8, STEEL)
    ic.shape(rect(110, 42, 70, 20, 10), ic.lin(OLIVE, 0, 42, 0, 62), LINE, 2.4)
    ic.shape(ell(180, 52, 6, 10), ic.lin(OLIVE, 174, 42, 186, 62), LINE, 2)
    ic.line("M180 47a3 4.5 0 1 1 -2 8", "#33391a", 1.8)
    for x in (126, 160):
        ic.line(f"M{x} 42V62", "#e2c58c", 4.4)
        ic.line(f"M{x} 42V62", "#6b4c22", 1.2, .8)
    ic.save()


def clock():
    ic = Icon("clock")
    cx, cy = 128, 146
    ic.line("M108 26C108 4 148 4 148 26C148 40 108 40 108 26z", "#b98538", 9, 1, "", None, True, 10)
    ic.line("M109 24C110 8 146 8 147 24", "#fff0bd", 2.4, .9)
    ic.shape(rect(112, 36, 32, 22, 5), ic.lin(BRASS, 112, 0, 144, 0), LINE, 2.6)
    for x in range(117, 144, 5):
        ic.line(f"M{x} 39V55", "#5c3812", 1.8, .8)
    ic.shape(circ(cx, cy, 98), ic.lin(BRASS, 60, 60, 200, 236), LINE, 3)
    for i in range(60):
        (x0, y0), (x1, y1) = pol(cx, cy, 90, i * 6), pol(cx, cy, 96.5, i * 6)
        ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#6b4418", 1.6, .6)
    ic.line("M44 112A92 92 0 0 1 106 56", "#fffbe6", 5, .75)
    ic.shape(circ(cx, cy, 84), ic.lin([BRASS[3], BRASS[2], BRASS[0]], 70, 80, 190, 220), LINE, 2.4, False)
    ic.shape(circ(cx, cy, 77), ic.rad(["#fffbee", "#f6e6be", "#d9bd86"], 108, 118, 118), INK, 2.6, False)
    ic.line(circ(cx, cy, 70), "#7a5a2e", 1.8, .8)
    for i in range(60):
        big = i % 5 == 0
        (x0, y0), (x1, y1) = pol(cx, cy, 54 if i % 15 == 0 else (59 if big else 65), i * 6 - 90), pol(cx, cy, 69, i * 6 - 90)
        ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#2b1a0d", 6.5 if i % 15 == 0 else (4 if big else 1.4), .95)
    ic.line(circ(cx, cy + 30, 15), "#7a5a2e", 1.6, .8)
    for i in range(12):
        (x0, y0), (x1, y1) = pol(cx, cy + 30, 12, i * 30), pol(cx, cy + 30, 14.5, i * 30)
        ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#2b1a0d", 1.2, .9)
    ic.line(f"M{cx} {cy + 30}L{cx + 8} {cy + 22}", "#a82c1c", 2.2)
    for a, l, w in ((-60, 46, 11), (60, 64, 8)):
        x, y = pol(cx, cy, l, a - 90 + 0)
        ic.line(f"M{cx} {cy}L{x:.1f} {y:.1f}", "#1a1109", w)
        ic.line(f"M{cx} {cy}L{x:.1f} {y:.1f}", "#4b5a78", w - 5)
    ic.shape(circ(cx, cy, 9), ic.rad(GOLD, cx - 3, cy - 3, 13), LINE, 2, False)
    ic.fill("M70 112C84 88 108 78 130 78C112 90 92 112 84 140C76 134 70 124 70 112z", "#ffffff", .4)
    ic.save()


def lock():
    ic = Icon("lock")
    ic.line("M78 124V82C78 14 178 14 178 82V124", "#80858a", 24, 1, "", None, True, 15)
    ic.line("M72 122V82C72 8 178 6 184 78", "#f4f3ee", 4.5, .85)
    ic.line("M89 122V84C89 32 167 32 167 84V122", "#3d4148", 4, .8)
    body = "M44 116H212C222 116 228 122 228 132V198C228 226 206 246 180 246H76C50 246 28 226 28 198V132C28 122 34 116 44 116z"
    ic.shape(body, ic.lin(IRON, 40, 110, 216, 246), INK, 3.4)
    c = ic.clip(body)
    for _ in range(60):
        x, y = ic.rng.uniform(32, 224), ic.rng.uniform(120, 240)
        ic.line(f"M{x:.1f} {y:.1f}l{ic.rng.uniform(-9, 9):.1f} {ic.rng.uniform(-6, 6):.1f}", ic.rng.choice(["#d6d3c9", "#141516"]), 1.3, .4, "", c)
    for x, y, r in ((52, 214, 16), (206, 148, 13), (176, 232, 15)):
        ic.fill(ell(x, y, r, r * .7), "#8f5430", .45, "", c)
    ic.line("M40 126H216", "#e8e6de", 4, .7)
    ic.line("M46 138H210V196C210 216 196 230 176 230H80C60 230 46 216 46 196z", "#16171a", 3, .7)
    ic.line("M47.500 139.500H208", "#a9a9a6", 1.6, .8)
    for x, y in ((46, 132), (210, 132), (48, 200), (208, 200), (80, 234), (176, 234)):
        ic.rivet(x, y, 7, STEEL)
    ic.shape("M128 146C150 146 166 160 166 180C166 204 146 222 128 230C110 222 90 204 90 180C90 160 106 146 128 146z", ic.lin(BRASS, 94, 146, 162, 228), LINE, 2.8, False)
    ic.line("M100 176C100 162 112 153 126 152", "#fffbe2", 3, .85)
    for x, y in ((128, 154), (100, 182), (156, 182), (128, 221)):
        ic.rivet(x, y, 3.2, GOLD)
    ic.shape("M128 164A14 14 0 0 1 137 189L142 212H114L119 189A14 14 0 0 1 128 164z", "#0d0805", INK, 2, False)
    ic.line("M120 172A11 11 0 0 1 129 167", "#6b4418", 2, .9)
    ic.save()


def storage():
    ic = Icon("storage")
    # Barrel, sack, crate.
    ic.shape("M18 66C10 110 10 168 20 222H112C122 168 122 110 114 66z", ic.lin([WOOD[2], WOOD[0], WOOD[1], WOOD[2], WOOD[3]], 12, 0, 120, 0), LINE, 3)
    for k in range(1, 6):
        x0, x1 = 18 + k * 16, 20 + k * 15.4
        b = (k - 3) * 2.6
        ic.line(f"M{x0} 68C{x0 + b:.1f} 110 {x0 + b:.1f} 170 {x1:.0f} 221", "#3a1e0c", 2.2, .85)
    ic.grain(18, 80, 112, 214, 26, "#4a2812", .45, None, "", 2, False)
    for y in (84, 128, 172, 208):
        ic.shape(f"M12 {y}C40 {y + 9} 92 {y + 9} 120 {y}V{y + 14}C92 {y + 23} 40 {y + 23} 12 {y + 14}z", ic.lin(IRON, 12, 0, 120, 0), INK, 2.4)
        ic.line(f"M18 {y + 4}C42 {y + 11} 90 {y + 11} 112 {y + 4}", "#d9d8d2", 1.6, .6)
        for x in (30, 66, 102):
            ic.rivet(x, y + 12, 3, STEEL)
    ic.shape(ell(66, 66, 48, 15), ic.lin(WOOD, 20, 52, 110, 82), LINE, 2.8)
    ic.line(ell(66, 67, 40, 11), "#3a1e0c", 2, .8)
    for x in (46, 60, 74, 88):
        ic.line(f"M{x} 57V77", "#3a1e0c", 1.6, .6)
    ic.layer()
    ic.shape("M150 60C138 88 112 112 116 152C118 176 206 176 210 152C214 114 190 88 178 60z", ic.lin(PAPER, 118, 60, 206, 172), LINE, 2.8)
    c = ic.clip("M150 60C138 88 112 112 116 152C118 176 206 176 210 152C214 114 190 88 178 60z")
    for k in range(14):
        ic.line(f"M{112 + k * 8} 60V176", "#8a6a3c", 1.1, .35, "", c)
        ic.line(f"M110 {66 + k * 8}H214", "#8a6a3c", 1.1, .35, "", c)
    ic.line("M150 70C140 96 128 118 128 146M180 72C190 98 196 120 198 140", "#7a5a2e", 2.4, .6)
    ic.shape("M140 36C148 44 156 46 164 38C172 46 182 44 190 34C186 50 182 56 180 62H148C146 54 144 48 140 36z", ic.lin(PAPER, 140, 34, 190, 62), LINE, 2.4)
    ic.line("M144 60C154 66 174 66 184 60", "#8f2a1c", 7, 1, "", None, True, 6)
    ic.line("M145 59C155 64 173 64 183 59", "#e88f72", 2, .9)
    ic.shape("M152 100C140 108 140 128 152 138C148 124 148 112 152 100zM164 94C154 108 154 130 164 144C174 130 174 108 164 94zM176 100C188 108 188 128 176 138C180 124 180 112 176 100z", ic.lin(OCHRE, 140, 94, 190, 144), LINE, 1.6, False)
    ic.layer()
    ic.shape(rect(104, 148, 138, 92, 4), ic.lin(WOOD, 104, 148, 242, 240), LINE, 3)
    for k in range(3):
        y = 148 + k * 30.6
        ic.grain(108, y + 4, 238, y + 27, 9, "#4a2812", .5)
        ic.line(f"M106 {y + 2:.1f}H240", "#f6cf9b", 2, .6)
        if k:
            ic.line(f"M104 {y:.1f}H242", "#2b1508", 3, .9)
    ic.line("M116 232L230 156M116 156L230 232", "#7c4822", 15, 1)
    ic.line("M116 229L230 153M116 153L230 229", "#e3b987", 3, .6)
    ic.line("M116 240L230 164M116 164L230 240", "#2b1508", 2, .6)
    for x in (100, 224):
        ic.shape(rect(x, 144, 22, 100, 3), ic.lin(IRON, x, 144, x + 22, 244), INK, 2.6)
        for y in (156, 180, 206, 232):
            ic.rivet(x + 11, y, 4.4, STEEL)
    ic.rivet(173, 194, 7, BRASS)
    ic.save(.98)


# ---------------------------------------------------------------- settings

def music():
    """Two beamed notes in brass over a drum's edge of light."""
    ic = Icon("music")
    ic.shape("M92 58L214 26V74L92 106z", ic.lin(BRASS, 92, 30, 200, 106), LINE, 3)
    ic.line("M98 64L208 35", "#fffbe2", 3.4, .85)
    ic.line("M98 98L208 69", "#5e3b14", 2.4, .7)
    for x, y0, y1 in ((92, 60, 194), (196, 34, 168)):
        ic.shape(rect(x, y0, 18, y1 - y0, 4), ic.lin([BRASS[1], BRASS[0], BRASS[2], BRASS[3]], x, 0, x + 18, 0), LINE, 2.6)
        ic.line(f"M{x + 5} {y0 + 30}V{y1 - 6}", "#fffbe2", 2.4, .75)
    for x, y in ((70, 198), (174, 172)):
        tf = f"rotate(-18 {x} {y})"
        ic.shape(ell(x, y, 43, 31), ic.rad(GOLD, x - 14, y - 12, 62), LINE, 3, True, tf)
        ic.line(f"M{x - 28} {y - 8}A34 22 0 0 1 {x + 6} {y - 22}", "#fffef2", 5, .8, tf)
        ic.line(f"M{x - 24} {y + 18}A36 24 0 0 0 {x + 30} {y + 10}", "#6b3f0c", 3, .6, tf)
        for k in range(4):
            ic.line(f"M{x - 16 + k * 10} {y + 12 - k * 2}l6 5", "#8a5212", 1.6, .6, tf)
    for x, y in ((112, 78), (190, 57), (152, 67)):
        ic.rivet(x, y, 5, GOLD)
    ic.save()


def effects():
    """A field horn, its sound in three arcs."""
    ic = Icon("effects")
    for r, w in ((34, 9), (60, 10), (86, 11)):
        (x0, y0), (x1, y1) = pol(140, 128, r, -44), pol(140, 128, r, 44)
        d = f"M{x0:.1f} {y0:.1f}A{r} {r} 0 0 1 {x1:.1f} {y1:.1f}"
        ic.line(d, "#b98538", w, 1, "", None, True, 10)
        ic.line(d, "#ffe9a8", w * .4, .95, "translate(-1.5 -1.5)")
    ic.shape(rect(16, 92, 52, 72, 9), ic.lin(OLIVE, 16, 92, 68, 164), LINE, 3)
    ic.line("M24 99H60", "#eef2c0", 3.4, .7)
    for y in (112, 128, 144):
        ic.line(f"M26 {y}H58", "#33391a", 4, .8)
        ic.line(f"M26 {y + 2.4}H58", "#d3d795", 1.2, .6)
    ic.shape("M66 100C92 92 116 72 138 44C150 40 154 46 154 54V202C154 210 150 216 138 212C116 184 92 164 66 156z", ic.lin(BRASS, 70, 50, 140, 212), LINE, 3.2)
    ic.line("M76 104C100 96 122 76 142 52", "#fffbe2", 5, .85)
    ic.line("M76 152C100 160 122 180 142 204", "#5e3b14", 4, .65)
    for k in range(4):
        x = 84 + k * 15
        ic.line(f"M{x} {100 - k * 9}V{156 + k * 9}", "#7a4c18", 2, .55)
        ic.line(f"M{x + 2.4} {102 - k * 9}V{154 + k * 9}", "#fff3c4", 1.1, .5)
    ic.shape(ell(148, 128, 17, 84), ic.lin([BRASS[3], BRASS[1], BRASS[0]], 132, 60, 164, 200), LINE, 3)
    ic.shape(ell(148, 128, 10, 70), ic.rad(["#5a3a1c", "#2b1809", "#0d0603"], 146, 112, 74), INK, 2.4, False)
    for a in range(0, 360, 30):
        x, y = 148 + 13.4 * math.cos(math.radians(a)), 128 + 77 * math.sin(math.radians(a))
        ic.fill(circ(x, y, 2.3), "#fff6d0")
    ic.save(.96, 4, 0)


def language():
    """Two speech bubbles, one Latin and one Arabic letter."""
    ic = Icon("language")
    ic.shape("M40 20H146C162 20 172 30 172 46V112C172 128 162 138 146 138H92L58 172V138H40C24 138 14 128 14 112V46C14 30 24 20 40 20z", ic.lin(["#a9d0d8", "#5d8d99", "#3f6b78", "#223f49"], 20, 20, 160, 160), LINE, 3.4)
    ic.line("M34 29H150", "#e9fbff", 5, .7)
    ic.line("M60 128H148", "#16303a", 3, .4)
    ic.shape("M46 96L64 36H80L98 96H82L78.500 84H65.500L62 96zM68.500 71H75.500L72 56z", "#fff6df", "#16303a", 3, False)
    ic.layer()
    ic.shape("M112 98H216C232 98 242 108 242 124V186C242 202 232 212 216 212H200V244L164 212H112C96 212 86 202 86 186V124C86 108 96 98 112 98z", ic.lin(["#f3cd80", "#d39b43", "#ad7424", "#6d4512"], 92, 98, 232, 230), LINE, 3.4)
    ic.line("M106 107H222", "#fff3cf", 5, .75)
    ic.line("M110 202H220", "#5a380d", 3, .4)
    # An ain, drawn.
    ic.line("M184 126C168 116 148 122 148 136C148 146 162 150 182 146C154 148 142 162 144 176C148 198 178 198 192 188", "#4a2a0c", 17)
    ic.line("M184 126C168 116 148 122 148 136C148 146 162 150 182 146C154 148 142 162 144 176C148 198 178 198 192 188", "#fff6df", 11)
    ic.save()


def help_icon():
    """A lantern-lit signpost: a board with a question mark on a pole."""
    ic = Icon("help")
    ic.shape(rect(112, 120, 32, 124, 5), ic.lin([WOOD[1], WOOD[0], WOOD[1], WOOD[3]], 112, 0, 144, 0), LINE, 3)
    ic.grain(116, 150, 140, 238, 18, "#4a2812", .6, None, "", 2, False)
    ic.shape("M60 246C76 224 180 224 196 246z", ic.lin(["#a3774a", "#6b4a2a", "#3d2712"], 0, 226, 0, 246), LINE, 2.6)
    for x, y in ((92, 238), (120, 234), (158, 238)):
        ic.line(f"M{x} {y}q5 -5 10 0", "#d9b684", 2.4, .7)
    board = "M26 26C70 18 186 18 230 26C238 28 240 34 240 42V148C240 156 238 162 230 164C186 172 70 172 26 164C18 162 16 156 16 148V42C16 34 18 28 26 26z"
    ic.shape(board, ic.lin(WOOD, 20, 20, 230, 170), LINE, 3.6)
    c = ic.clip(board)
    for y in (64, 110, 146):
        ic.line(f"M16 {y}H240", "#2b1508", 3, .8, "", c)
        ic.line(f"M16 {y + 3}H240", "#f6cf9b", 1.6, .5, "", c)
    ic.grain(22, 26, 234, 164, 46, "#4a2812", .5, c)
    ic.line("M30 32C76 25 180 25 226 32", "#ffe2b4", 4, .75)
    for x in (34, 222):
        for y in (42, 148):
            ic.rivet(x, y, 8, STEEL)
    q = "M92 76C92 46 112 34 130 34C152 34 168 48 168 70C168 92 144 96 142 114H116C116 88 140 88 140 70C140 62 136 58 130 58C122 58 118 64 118 76z"
    ic.shape(q, "#1a1109", "#1a1109", 8, False)
    ic.shape(q, ic.lin(GOLD, 94, 36, 168, 116), "#5c380c", 2, False)
    ic.line("M97 72C98 50 114 40 130 40", "#fffbe2", 4, .9)
    ic.shape(circ(129, 138, 15), "#1a1109", "#1a1109", 6, False)
    ic.shape(circ(129, 138, 14), ic.rad(GOLD, 124, 132, 21), "#5c380c", 2, False)
    ic.fill(circ(124, 133, 4), "#fffef2", .9)
    ic.save()


def link():
    """Two chain links."""
    ic = Icon("link")

    def ring_at(tf, pal):
        d = rect(-34, -62, 68, 124, 34) + "M-12 -28V28A12 12 0 0 0 12 28V-28A12 12 0 0 0 -12 -28z"
        ic.backs.append(f'<path d="{rect(-34, -62, 68, 124, 34)}" transform="{tf}" fill="none" stroke-width="16"/>')
        ic.body.append(f'<path fill-rule="evenodd" d="{d}" transform="{tf}" fill="{ic.lin(pal, -34, -60, 34, 60)}" stroke="{INK}" stroke-width="3.4"/>')
        ic.line("M-27 -24A27 27 0 0 1 4 -55", "#ffffff", 5, .8, tf)
        ic.line("M27 22A27 27 0 0 1 -4 55", "#23262b", 4, .6, tf)
        for _ in range(16):
            y = ic.rng.uniform(-30, 30)
            x = ic.rng.choice([-23, 23]) + ic.rng.uniform(-6, 6)
            ic.line(f"M{x:.1f} {y:.1f}l{ic.rng.uniform(-3, 3):.1f} {ic.rng.uniform(3, 8):.1f}", ic.rng.choice(["#ffffff", "#2d3036"]), 1.4, .5, tf)

    ring_at("translate(92 164) rotate(45)", STEEL)
    ic.layer()
    ring_at("translate(164 92) rotate(45)", BRASS)
    ic.layer()
    ring_at("translate(128 128) rotate(45) scale(.72 .8)", STEEL)
    ic.save()


# ---------------------------------------------------------------- battle reports

def small_laurel(ic, spread=1.0):
    """Two branches of leaves round the middle, open at the top."""
    for s in (-1, 1):
        p = ((128 + s * 6, 214), (128 + s * 66 * spread, 206), (128 + s * 84 * spread, 150), (128 + s * 66 * spread, 82))
        ic.line(f"M{p[0][0]} {p[0][1]}C{p[1][0]} {p[1][1]} {p[2][0]} {p[2][1]} {p[3][0]} {p[3][1]}", "#4b5424", 6, 1, "", None, True, 8)
        for k in range(7):
            t = .1 + k / 7.2
            x, y = (sum(c * q[i] for c, q in zip(((1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3), p)) for i in (0, 1))
            for side, pal in ((-1, GOLD), (1, OCHRE)):
                tf = f"translate({x:.1f} {y:.1f}) rotate({s * (104 - k * 20) + side * 40:.1f}) scale(.86)"
                ic.shape("M0 2C-11 -8 -9 -26 0 -37C9 -26 11 -8 0 2z", ic.lin(pal, -9, -30, 9, 0), LINE, 1.8, True, tf, 9)
                ic.line("M0 -2V-30M0 -12L-5 -18M0 -12L5 -18", "#7a4710", 1.3, .7, tf)


def victory():
    ic = Icon("victory")
    medallion(ic, OLIVE)
    small_laurel(ic)
    ic.layer()
    faceted_star(ic, 128, 120, 58, 25, ["#fffbe2", "#ffe48c"], ["#f8cf5c", "#dfa236"], ["#b97722", "#84500f"], 2.8)
    ic.shape(circ(128, 121, 12), ic.rad(GOLD, 123, 116, 18), LINE, 2, False)
    ic.save()


def defeat():
    ic = Icon("defeat")
    medallion(ic, RED)
    d = "M128 46C148 60 174 66 196 66C198 126 184 178 128 214C72 178 58 126 60 66C82 66 108 60 128 46z"
    ic.shape(d, ic.lin(IRON, 70, 50, 186, 210), INK, 3.4)
    ic.line("M72 76C92 76 110 70 128 60", "#e8e6de", 4, .6)
    ic.shape("M128 72C142 82 160 86 178 87C178 130 166 168 128 194C90 168 78 130 78 87C96 86 114 82 128 72z", ic.lin(WOOD, 80, 74, 178, 194), LINE, 2.4, False)
    for x in (104, 128, 152):
        ic.line(f"M{x} 80V186", "#2b1508", 2.4, .7)
    for x, y in ((72, 78), (184, 78), (82, 150), (174, 150), (128, 202)):
        ic.rivet(x, y, 5, STEEL)
    crack = "M134 40L118 84L140 106L108 140L132 160L112 220"
    ic.line(crack, "#0d0805", 13)
    ic.line(crack, "#e9ded0", 1.6, .5, "translate(5 1)")
    ic.line("M118 84L96 92M140 106L166 100M108 140L88 146M132 160L152 168", "#0d0805", 5)
    ic.save()


def gone():
    """A cold campfire: whoever was here has left."""
    ic = Icon("gone")
    medallion(ic, ["#b9b09c", "#857c69", "#5b5344", "#2f2a21"])
    for x, y, w in ((118, 96, 20), (138, 66, 15), (122, 40, 10)):
        ic.line(f"M{x - w} {y}C{x - w} {y - 16} {x + w * .4:.0f} {y - 18} {x + w * .5:.0f} {y - 4}C{x + w * .6:.0f} {y + 8} {x + w * 1.6:.0f} {y + 2} {x + w * 1.5:.0f} {y - 14}", "#e8e0d0", 7, .55)
    ic.shape(ell(128, 182, 78, 30), ic.lin(["#4a4236", "#1f1a13"], 0, 152, 0, 212), INK, 2.6)
    for a, l in ((-28, 1), (24, -1), (4, 1)):
        tf = f"rotate({a} 128 164)"
        ic.shape(rect(66, 154, 124, 22, 9), ic.lin(["#6b5a48", "#3f3226", "#1d150e"], 0, 154, 0, 176), INK, 2.6, True, tf)
        ic.line("M78 160H176", "#a8937a", 2, .6, tf)
        ic.shape(ell(190, 165, 8, 11), ic.lin(["#b59a78", "#6b5139"], 182, 154, 198, 176), INK, 2, False, tf)
        ic.line(ell(190, 165, 4, 5.5), "#3f3226", 1.4, .8, tf)
    for i in range(11):
        a = math.pi * (i + .5) / 11
        x, y = 128 - 84 * math.cos(a), 184 + 32 * math.sin(a)
        ic.shape(ell(x, y, 15, 11), ic.rad(GREY, x - 4, y - 4, 20), INK, 2.2)
    ic.save()


def npc_patrol():
    ic = Icon("npc_patrol")
    medallion(ic, RED)
    rifle(ic, "translate(128 150) rotate(-38) scale(.92)")
    ic.layer()
    # A steel helmet, no badge on it.
    ic.shape("M62 148C60 92 90 58 130 58C170 58 198 92 196 148C176 158 82 158 62 148z", ic.lin(["#8d938a", "#5d645a", "#3b4139", "#20241f"], 70, 60, 190, 150), LINE, 3.2)
    ic.shape("M44 148C70 136 188 136 214 148C220 160 208 168 196 168C150 158 106 158 62 168C50 168 38 160 44 148z", ic.lin(["#737a70", "#434940", "#252923"], 0, 138, 0, 168), LINE, 3)
    ic.shape("M108 60C112 44 148 44 152 60L150 132H110z", ic.lin(["#7e857b", "#4c534a", "#333831"], 108, 0, 152, 0), LINE, 2.4)
    ic.line("M80 104C88 82 102 70 118 66", "#e6e8df", 6, .65)
    ic.line("M60 152C100 142 156 142 198 152", "#c9cdc2", 2.4, .6)
    for x in (86, 172):
        ic.rivet(x, 134, 5, STEEL)
    ic.line("M70 166C80 196 110 212 128 212C146 212 176 196 186 166", "#4f2f16", 7, 1, "", None, True, 7)
    ic.line("M72 168C84 196 110 208 128 208", "#a86f3d", 2.4, .9)
    ic.save()


def npc_convoy():
    """A covered lorry."""
    ic = Icon("npc_convoy")
    medallion(ic, RED)
    ic.fill(ell(128, 206, 92, 12), "#000000", .35)
    ic.shape("M100 64C100 54 224 54 224 64V160H100z", ic.lin(["#c9bd92", "#94895c", "#665d3a"], 100, 56, 224, 160), LINE, 3.2)
    for x in (128, 160, 192):
        ic.line(f"M{x} 60C{x - 4} 90 {x - 4} 130 {x} 158", "#4c4527", 3, .6)
        ic.line(f"M{x + 4} 60C{x} 90 {x} 130 {x + 4} 158", "#efe6c2", 1.6, .6)
    ic.line("M106 66C140 60 190 60 218 66", "#f6eed0", 4, .7)
    ic.line("M100 142H224", "#4c4527", 4, .6)
    ic.shape(rect(94, 156, 136, 26, 4), ic.lin(OLIVE, 0, 156, 0, 182), LINE, 2.8)
    for x in (112, 144, 176, 208):
        ic.line(f"M{x} 158V180", "#33391a", 3, .8)
    ic.shape("M30 122C32 116 38 114 44 114H60L72 78C74 74 78 72 82 72H104V186H26V140C26 132 28 126 30 122z", ic.lin(OLIVE, 26, 74, 104, 186), LINE, 3.2)
    ic.shape("M70 112L80 84H97V112z", ic.lin(["#d5eef0", "#7fb0b2", "#2f5a63"], 72, 84, 98, 112), INK, 2.4, False)
    ic.line("M76 106L84 88", "#ffffff", 3, .7)
    ic.line("M32 128H62M32 140H62M32 152H62", "#33391a", 3.4, .8)
    ic.line("M40 118H62", "#eef2c0", 3, .7)
    ic.rivet(38, 168, 8, GOLD)
    ic.shape(rect(20, 180, 90, 12, 4), ic.lin(IRON, 0, 180, 0, 192), INK, 2.4)
    for x in (64, 152, 204):
        ic.shape(circ(x, 194, 25), ic.rad(["#5a5a58", "#2c2c2b", "#121211"], x - 6, 188, 34), INK, 3)
        for i in range(14):
            (x0, y0), (x1, y1) = pol(x, 194, 20, i * 360 / 14), pol(x, 194, 24, i * 360 / 14)
            ic.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", "#0c0c0c", 2.6, .9)
        ic.shape(circ(x, 194, 12), ic.rad(STEEL, x - 4, 190, 17), INK, 2, False)
        for i in range(5):
            px, py = pol(x, 194, 7, i * 72)
            ic.fill(circ(px, py, 1.8), "#2c2e32")
    ic.save(.95, -2, 0)


def npc_outpost():
    """A stone blockhouse behind sandbags."""
    ic = Icon("npc_outpost")
    medallion(ic, RED)
    ic.shape("M70 92H186V206H70z", ic.lin(["#e3d3b0", "#b89f74", "#80694a"], 70, 92, 186, 206), LINE, 3.2)
    ic.fill("M150 92H186V206H150z", "#3a2412", .28)
    for y in range(6):
        for x in range(5):
            px, py = 72 + x * 24 + (12 if y % 2 else 0), 96 + y * 18
            if px < 176:
                ic.line(rect(px, py, 22, 15, 3), "#6b5436", 1.6, .55)
                ic.line(f"M{px + 3} {py + 3}h12", "#fff6df", 1.4, .5)
    for x in range(5):
        ic.shape(rect(58 + x * 29, 62, 22, 34, 2), ic.lin(["#efe0bd", "#c4ab7e", "#8c7450"], 58 + x * 29, 62, 80 + x * 29, 96), LINE, 2.8)
    ic.shape(rect(54, 88, 148, 14, 3), ic.lin(["#e8d6b0", "#9f8660"], 0, 88, 0, 102), LINE, 2.6)
    for x in (88, 148):
        ic.shape(rect(x, 122, 24, 34, 3), "#140c06", INK, 3, False)
        ic.line(f"M{x + 3} 125H{x + 21}", "#5a4326", 2.4, .9)
    ic.shape("M114 206V168C114 154 142 154 142 168V206z", ic.lin(DARKWOOD, 114, 156, 142, 206), LINE, 2.6, False)
    for y in (174, 194):
        ic.shape(rect(114, y, 28, 5), ic.lin(IRON, 0, y, 0, y + 5), INK, 1.4, False)
    ic.layer()
    for row, n, y in ((0, 6, 200), (1, 5, 184)):
        for k in range(n):
            if row and k == 2:
                continue
            x = 44 + k * 29 + row * 14
            ic.shape(rect(x, y, 32, 20, 9), ic.lin(["#dcc898", "#ab9160", "#6f5a35"], 0, y, 0, y + 20), LINE, 2.4)
            ic.line(f"M{x + 6} {y + 5}Q{x + 16} {y + 2} {x + 26} {y + 6}", "#f6e9c6", 2, .7)
    ic.save(.98, 0, -4)


def npc_fortified_line():
    """Wired stakes before a concrete wall with slits."""
    ic = Icon("npc_fortified_line")
    medallion(ic, RED)
    ic.shape("M28 104L52 82H204L228 104V176H28z", ic.lin(["#d6cdb8", "#9d937c", "#645b48"], 0, 82, 0, 176), LINE, 3.2)
    ic.line("M34 104H222", "#4b4434", 3, .7)
    ic.line("M56 88H200", "#fbf5e4", 3.4, .6)
    for x in (58, 112, 166):
        ic.shape(rect(x, 122, 34, 16, 2), "#120c07", INK, 3, False)
        ic.line(f"M{x + 3} 142H{x + 31}", "#efe7d2", 2, .6)
    for x in (48, 102, 156, 210):
        ic.line(f"M{x} 106V174", "#4b4434", 2.2, .6)
    ic.layer()
    for x in range(34, 240, 47):
        ic.shape(f"M{x - 7} 214L{x - 5} 138L{x} 128L{x + 5} 138L{x + 7} 214z", ic.lin([WOOD[0], WOOD[1], WOOD[3]], x - 7, 0, x + 7, 0), LINE, 2.6)
    for y in (150, 176, 200):
        ic.line(f"M22 {y}Q58 {y + 9} 81 {y}T128 {y}T175 {y}T234 {y}", INK, 7)
        ic.line(f"M22 {y - 1}Q58 {y + 8} 81 {y - 1}T128 {y - 1}T175 {y - 1}T234 {y - 1}", "#c9c4b8", 2.6)
        for k in range(8):
            x = 40 + k * 25
            ic.line(f"M{x - 7} {y - 6}l14 14M{x + 7} {y - 6}l-14 14", INK, 5)
            ic.line(f"M{x - 5} {y - 4}l10 10M{x + 5} {y - 4}l-10 10", "#e6e1d3", 1.8)
    ic.save(.97, 0, -2)


# ---------------------------------------------------------------- alliance

def chat():
    """Two speech bubbles with lines of writing."""
    ic = Icon("chat")
    ic.shape("M40 18H178C198 18 210 30 210 50V108C210 128 198 140 178 140H112L70 178V140H40C20 140 8 128 8 108V50C8 30 20 18 40 18z", ic.lin(["#fff6dc", "#f0dcae", "#d6b67c", "#a98a52"], 20, 18, 200, 160), LINE, 3.6)
    ic.line("M34 28H182", "#fffdf4", 5, .8)
    for y, x in ((56, 178), (80, 150), (104, 168)):
        ic.line(f"M38 {y}H{x}", "#6b4c22", 9, .85)
        ic.line(f"M38 {y + 3}H{x}", "#fffdf4", 2, .6)
    ic.layer()
    ic.shape("M108 112H220C238 112 248 122 248 140V188C248 206 238 216 220 216H206V248L168 216H108C90 216 80 206 80 188V140C80 122 90 112 108 112z", ic.lin(["#c9e088", "#8eae46", "#5f7c2c", "#34491a"], 86, 112, 240, 230), LINE, 3.6)
    ic.line("M102 121H226", "#f2fbd0", 5, .7)
    for x in (122, 164, 206):
        ic.shape(circ(x, 164, 13), ic.rad(["#fffdf0", "#f6ebc8", "#d0bd88"], x - 4, 159, 18), "#34491a", 3, False)
    ic.save()


def hourglass():
    """Sand running in a brass-capped hourglass."""
    ic = Icon("hourglass")
    for x in (62, 178):
        ic.shape(rect(x, 34, 16, 188, 6), ic.lin([WOOD[1], WOOD[0], WOOD[1], WOOD[3]], x, 0, x + 16, 0), LINE, 2.8)
        for y in (72, 128, 184):
            ic.shape(rect(x - 3, y - 6, 22, 12, 4), ic.lin(BRASS, 0, y - 6, 0, y + 6), LINE, 2, False)
    glass = "M86 44H170C170 88 150 106 138 122C134 126 134 130 138 134C150 150 170 168 170 212H86C86 168 106 150 118 134C122 130 122 126 118 122C106 106 86 88 86 44z"
    ic.shape(glass, ic.lin(["#eaf6f4", "#b9d6d4", "#7fa5a6"], 86, 44, 170, 212), LINE, 3)
    c = ic.clip(glass)
    ic.fill("M80 76H176V118H80z", ic.lin(GOLD[1:], 0, 76, 0, 120), 1, "", c)
    ic.fill("M80 76Q128 90 176 76V70H80z", "#b9d6d4", .9, "", c)
    ic.fill("M80 214V200Q104 184 128 168Q152 184 176 200V214z", ic.lin(GOLD, 0, 168, 0, 214), 1, "", c)
    ic.line("M128 118V172", "#f0b73e", 5, 1)
    for _ in range(46):
        x, y = ic.rng.uniform(88, 168), ic.rng.choice([ic.rng.uniform(86, 112), ic.rng.uniform(190, 212)])
        ic.fill(circ(x, y, 1.6), ic.rng.choice(["#fff3c4", "#8a5212"]), .8, "", c)
    ic.line("M98 56C98 82 108 98 118 110M98 204C98 182 106 164 114 152", "#ffffff", 6, .75)
    for y in (20, 206):
        ic.shape(rect(40, y, 176, 30, 10), ic.lin(BRASS, 0, y, 0, y + 30), LINE, 3.2)
        ic.line(f"M52 {y + 7}H204", "#fffbe2", 3.4, .85)
        ic.line(f"M52 {y + 23}H204", "#5e3b14", 2.4, .6)
        for x in (60, 94, 128, 162, 196):
            ic.rivet(x, y + 15, 4.6, GOLD)
    ic.save()


def offline():
    """A field mast whose signal is cut: its waves grey and a red bar across them."""
    ic = Icon("offline")
    for r, w in ((34, 9), (58, 10), (82, 11)):
        for s in (-1, 1):
            (x0, y0), (x1, y1) = (128 + s * r * .77, 84 - r * .64), (128 + s * r * .77, 84 + r * .64)
            d = f"M{x0:.1f} {y0:.1f}A{r} {r} 0 0 {1 if s > 0 else 0} {x1:.1f} {y1:.1f}"
            ic.line(d, "#1a1109", w + 7, 1, "", None, True)
            ic.line(d, "#8d8778", w)
            ic.line(d, "#d8d2c2", w * .3, .7)
    ic.shape("M118 92H138L170 236H86z", ic.lin(IRON, 90, 92, 168, 236), LINE, 3)
    c = ic.clip("M118 92H138L170 236H86z")
    for a, b, y0, y1 in ((122, 146, 118, 152), (134, 104, 118, 152), (108, 156, 152, 194), (150, 98, 152, 194), (96, 166, 194, 236), (160, 90, 194, 236)):
        ic.line(f"M{a} {y0}L{b} {y1}", "#262729", 8, 1, "", c)
        ic.line(f"M{a} {y0}L{b} {y1}", "#c9c9c4", 3, .8, "", c)
    for y, w in ((118, 15), (152, 23), (194, 32)):
        ic.shape(rect(128 - w, y - 4, w * 2, 8, 3), ic.lin(STEEL, 0, y - 4, 0, y + 4), LINE, 2, False)
    ic.shape(rect(70, 230, 116, 16, 5), ic.lin(WOOD, 0, 230, 0, 246), LINE, 2.6)
    ic.grain(74, 232, 182, 244, 8, "#4a2812", .5)
    ic.shape(circ(128, 84, 17), ic.rad(["#fff3c4", "#d8962a", "#8a5212"], 122, 78, 24), LINE, 3)
    ic.fill(circ(122, 78, 5), "#fff", .8)
    ic.layer()
    ic.line("M42 46L214 160", "#1a1109", 31, 1, "", None, True)
    ic.line("M42 46L214 160", "#54100c", 22)
    ic.line("M42 46L214 160", "#c13a28", 16)
    ic.line("M44 42L212 153", "#f3a08c", 3.6, .85)
    ic.save()


# ------------------------------------------------------------------ heroes
# A square portrait per hero id: a bust whose face is plain shade under the headwear, the role's tools, and a place behind. No faces,
# flags, insignia or relief emblems; a role, not a portrait of anyone.

BUST = "translate(25.6 50) scale(.8)"
DENIM = ["#9db4c4", "#5f7f96", "#3a566c", "#1f3344"]
BROWN = ["#cfa676", "#976c42", "#674526", "#3a2413"]
JUNGLE = ["#9fb86a", "#5f7f3c", "#3a5628", "#1e3317"]


def sky(ic, colours):
    ic.fill("M0 0H256V256H0z", ic.lin(colours, 0, 0, 0, 220))


def ridge(ic, pts, colours, light="#ffffff"):
    d = "M0 256L" + "L".join(f"{x} {y}" for x, y in pts) + "L256 256z"
    ic.fill(d, ic.lin(colours, 0, min(y for _, y in pts), 0, 256))
    for (x, y), (x2, y2) in zip(pts, pts[1:]):
        ic.line(f"M{x} {y}L{x2} {y2}", light, 2.4, .35 if y2 > y else .7)
        if y2 > y:
            for k in range(1, 4):
                ic.line(f"M{x + (x2 - x) * k / 4:.0f} {y + (y2 - y) * k / 4:.0f}l{-6 - k * 2} {16 + k * 7}", "#000000", 2, .18)


def leaves(ic, spots, colours, size=1.0):
    for x, y, a in spots:
        tf = f"translate({x} {y}) rotate({a}) scale({size})"
        ic.shape("M0 0C14 -18 40 -20 62 0C40 18 14 16 0 0z", ic.lin(colours, 0, -16, 0, 16), colours[3], 2, False, tf)
        ic.line("M4 0H56M18 0l8 -9M18 0l8 9M32 0l8 -8M32 0l8 8", "#eef5c8", 1.6, .5, tf)


def bust(ic, cloth, dark, light):
    """The jacket with its folds, pockets and buttons, and the neck and head, all in shade."""
    body = "M14 262C14 190 50 166 96 156H160C206 166 242 190 242 262z"
    ic.shape(body, ic.lin(cloth, 40, 150, 220, 256), LINE, 3)
    c = ic.clip(body)
    for x, q in ((46, 30), (72, 62), (186, 196), (214, 228)):
        ic.line(f"M{x} 190Q{q} 220 {q} 258", dark, 4, .6, "", c)
        ic.line(f"M{x - 5} 190Q{q - 6} 220 {q - 6} 258", light, 2, .6, "", c)
    for _ in range(70):
        x, y = ic.rng.uniform(20, 236), ic.rng.uniform(168, 254)
        ic.line(f"M{x:.1f} {y:.1f}l3 -3", dark if ic.rng.random() < .6 else light, 1.1, .35, "", c)
    ic.line("M60 178C76 166 92 162 104 160", light, 3.4, .6)
    ic.shape("M98 128H158V170Q128 190 98 170z", ic.lin([SKIN[2], SKIN[3]], 0, 128, 0, 176), LINE, 2, False)
    head(ic)
    return c


def head(ic):
    for x in (72, 184):
        ic.shape(ell(x, 104, 9, 15), ic.lin(SKIN, x - 9, 92, x + 9, 120), LINE, 2)
    ic.shape("M74 70C70 124 94 158 128 158C162 158 186 124 182 70z", ic.lin([SKIN[0], SKIN[1], SKIN[2], SKIN[3]], 80, 80, 180, 150), LINE, 2.5)
    ic.fill("M74 70H182C183 92 180 108 174 118C160 100 96 100 82 118C76 106 73 90 74 70z", "#1f0f06", .6)
    ic.fill("M128 158C162 158 186 124 182 70H160C164 118 150 146 128 158z", "#2a160b", .35)
    ic.line("M84 120C90 140 104 152 122 154", "#f2c59a", 2.4, .5)


def jacket_front(ic, cloth, dark, light):
    ic.line("M128 196V258", dark, 4, .9)
    ic.line("M124 196V258", light, 1.6, .7)
    for y in (212, 240):
        ic.rivet(136, y, 5)
    for x in (58, 164):
        ic.shape(f"M{x} 220H{x + 36}V258H{x}z", ic.lin(cloth[:3], x, 218, x + 36, 256), dark, 2, False)
        ic.shape(f"M{x - 2} 216H{x + 38}V228L{x + 18} 238L{x - 2} 228z", ic.lin(cloth[:3], x, 214, x, 236), dark, 2, False)
        ic.rivet(x + 18, 229, 3.6)


def neck_scarf(ic, colours):
    ic.shape("M66 146C92 172 164 172 190 146C204 166 200 192 172 200C144 208 112 208 84 200C56 192 52 166 66 146z", ic.lin(colours, 70, 146, 180, 204), LINE, 2.6)
    for k in range(4):
        ic.line(f"M{68 - k} {160 + k * 9}C96 {180 + k * 8} 160 {180 + k * 8} {188 + k} {158 + k * 9}", colours[3], 2.2, .75)
        ic.line(f"M{72 - k} {157 + k * 9}C92 {172 + k * 8} 110 {176 + k * 8} 128 {176 + k * 8}", "#fff", 1.8, .6)


def cap(ic, colours, dark):
    ic.shape("M66 74C58 30 92 8 128 8C164 8 198 30 190 74C164 60 92 60 66 74z", ic.lin(colours, 72, 10, 190, 76), LINE, 2.6)
    ic.line("M128 10C122 28 122 46 126 62M92 20C84 36 82 52 84 64M164 20C172 36 174 52 172 64", dark, 2.2, .7)
    ic.line("M98 18C112 12 128 12 142 15", "#ffffff", 4, .5)
    ic.shape("M62 78C92 58 164 58 194 78V62C164 44 92 44 62 62z", ic.lin(colours[1:], 0, 46, 0, 78), LINE, 2.2, False)
    ic.line("M68 68C96 52 160 52 188 68", "#ffffff", 1.6, .5)
    ic.shape("M54 88C80 62 176 62 202 88C176 78 80 78 54 88z", ic.lin(colours[1:], 0, 66, 0, 90), LINE, 2.4)


def flat_cap(ic, colours, dark):
    ic.shape("M48 62C44 26 88 6 132 8C176 8 214 30 208 62C186 72 70 72 48 62z", ic.lin(colours, 60, 8, 200, 70), LINE, 2.6)
    for x in range(64, 204, 14):
        ic.line(f"M{x} 64Q{(x + 128) / 2 + 4:.0f} 34 {(x + 384) / 4:.0f} 14", dark, 1.6, .45)
    for y in (30, 44, 56):
        ic.line(f"M58 {y + 4}Q128 {y - 10} 200 {y + 4}", dark, 1.4, .4)
    ic.line("M84 22C104 12 130 12 152 15", "#ffffff", 4, .45)
    ic.rivet(130, 11, 5, colours)
    ic.shape("M50 60C86 74 170 74 206 60C216 76 204 92 188 94C150 82 106 82 68 94C50 90 42 74 50 60z", ic.lin(colours[1:], 0, 60, 0, 94), LINE, 2.4)
    ic.line("M60 78C100 66 156 66 196 78", "#ffffff", 2, .4)


def wrap(ic, colours, dark):
    """A cloth wound round the head."""
    d = "M60 84C44 44 74 4 130 4C184 4 214 44 196 84C170 68 88 68 60 84z"
    ic.shape(d, ic.lin(colours, 60, 4, 200, 84), LINE, 2.6)
    c = ic.clip(d)
    for k in range(5):
        fold = f"M40 {78 - k * 15}C{90} {66 - k * 14} {160} {44 - k * 10} 220 {6 + k * 2}"
        ic.line(fold, dark, 3, .6, "", c)
        ic.line(fold, "#ffffff", 2, .5, "translate(0 -4)", c)
    ic.line("M60 60C110 68 160 70 204 62", dark, 3, .5, "", c)
    ic.shape("M176 66C196 58 208 66 206 78C200 92 184 90 176 80z", ic.lin(colours, 176, 60, 206, 90), LINE, 2.2, False)
    ic.line("M92 16C108 9 128 7 146 10", "#ffffff", 4, .6)


def hood(ic, colours, dark):
    """A wool hood open round the face, its edge rolled back."""
    inner = "M128 30C170 30 192 62 188 104C186 134 176 150 168 160L88 160C80 150 70 134 68 104C64 62 86 30 128 30z"
    ic.fill("M66 104C62 60 86 26 128 26C170 26 194 60 190 104C188 92 178 78 128 78C78 78 68 92 66 104z", "#1f0f06", .85)
    ic.shape("M128 -14C70 -8 40 48 46 112C48 146 60 168 78 190L90 168C80 150 70 134 68 104C64 62 86 30 128 30C170 30 192 62 188 104C186 134 176 150 166 168L178 190C196 168 208 146 210 112C216 48 186 -8 128 -14z", ic.lin(colours, 50, -10, 206, 200), LINE, 3)
    ic.line(inner.split("L")[0], dark, 6, .8)
    ic.line("M118 24C88 30 66 60 62 98C62 124 68 146 80 164", "#ffffff", 2.6, .5)
    for k in range(4):
        ic.line(f"M{108 - k * 11} {-6 + k * 9}C{76 - k * 6} {20 + k * 12} {60 - k * 3} {70 + k * 8} {58 - k} {124 + k * 8}", dark if k % 2 else "#fff3dc", 2.2, .45)
        ic.line(f"M{148 + k * 11} {-6 + k * 9}C{180 + k * 6} {20 + k * 12} {196 + k * 3} {70 + k * 8} {198 + k} {124 + k * 8}", dark, 2.4, .45)


def brim_hat(ic, colours, dark):
    """A soft broad-brimmed hat."""
    ic.shape("M20 84C40 58 92 62 128 62C164 62 216 58 236 84C216 100 170 92 128 92C86 92 40 100 20 84z", ic.lin(colours, 20, 60, 220, 100), LINE, 2.8)
    ic.line("M34 84C70 72 186 72 222 84", dark, 2, .5)
    ic.line("M44 74C70 66 100 66 120 66", "#ffffff", 2.6, .5)
    ic.shape("M70 72C62 22 88 2 128 2C168 2 194 22 186 72C160 82 96 82 70 72z", ic.lin(colours, 70, 0, 190, 80), LINE, 2.6)
    ic.line("M96 14C108 8 126 6 142 9", "#ffffff", 4, .5)
    ic.line("M106 6C100 24 100 40 102 56M152 6C158 24 158 40 156 56", dark, 2, .5)
    ic.shape("M69 58C96 72 160 72 187 58V74C160 86 96 86 69 74z", ic.lin(colours[2:], 0, 58, 0, 84), LINE, 2, False)


def binoculars(ic):
    """Hanging on the chest, strap and all."""
    ic.line("M84 168Q92 210 104 214M172 168Q164 210 152 214", "#2b1508", 7)
    ic.line("M84 168Q92 210 104 214M172 168Q164 210 152 214", "#8a5730", 3.4)
    for x in (88, 132):
        ic.shape(f"M{x + 6} 204H{x + 30}L{x + 38} 250H{x - 2}z", ic.lin(IRON, x, 204, x + 36, 250), LINE, 2.4)
        ic.shape(rect(x + 4, 198, 28, 10, 4), ic.lin(BRASS, x, 198, x + 30, 198), LINE, 2, False)
        ic.shape(ell(x + 18, 250, 20, 9), ic.lin(STEEL, x, 242, x, 260), LINE, 2, False)
        ic.fill(ell(x + 18, 250, 14, 6), TEAL[1])
        ic.line(f"M{x + 10} 210L{x + 6} 238", "#ffffff", 2.4, .5)
    ic.shape(rect(118, 214, 20, 14, 4), ic.lin(IRON, 0, 214, 0, 228), LINE, 2, False)


def crate(ic, x, y, w, h):
    ic.shape(rect(x, y, w, h, 3), ic.lin(WOOD, x, y, x + w, y + h), LINE, 2.4, False)
    for k in (1, 2):
        ic.line(f"M{x + 3} {y + h * k / 3:.0f}H{x + w - 3}", "#331a0b", 2, .6)
    ic.grain(x + 4, y + 4, x + w - 4, y + h - 4, 12, "#4a2812", .4)
    ic.line(f"M{x + 4} {y + 4}H{x + w - 4}", "#ffe2b4", 2, .6)
    for px in (x + 7, x + w - 7):
        ic.line(f"M{px} {y + 2}V{y + h - 2}", "#5e3c13", 6, .7)
        for py in (y + 8, y + h - 8):
            ic.rivet(px, py, 2.6, IRON)


def hero_save(ic):
    ic.save(cut_to=rect(2, 2, 252, 252, 30))


def hero_mountain_guide():
    ic = Icon("hero_mountain_guide")
    sky(ic, ["#f4c27a", "#e39a5c", "#8b6a58"])
    ic.fill(circ(196, 62, 26), ic.rad(["#fffbe0", "#ffe29a", "#f3b765"], 196, 62, 30), .95)
    ridge(ic, [(0, 120), (40, 74), (74, 112), (120, 56), (170, 118), (214, 90), (256, 130)], ["#9b7a68", "#6a5148"])
    ridge(ic, [(0, 170), (50, 128), (96, 172), (170, 140), (220, 164), (256, 138)], ["#6d5634", "#3f3320"], "#e8d29a")
    ic.layer()
    ic.line("M30 256L64 26", "#4a2812", 13, 1, "", None, True)
    ic.line("M30 256L64 26", "#a5713f", 9)
    ic.line("M28 250L62 30", "#e6bd86", 2.4, .8)
    ic.line("M60 40L70 18", "#a5713f", 10, 1, "", None, True)
    ic.layer(BUST)
    c = bust(ic, BROWN, "#3a2413", "#ecd0a2")
    for x in (60, 96, 160, 196):
        ic.line(f"M{x} 150L{x + (x - 128) * .35:.0f} 260", "#f3e2bf", 9, .75, "", c)
        ic.line(f"M{x + 8} 150L{x + 8 + (x - 120) * .35:.0f} 260", "#3a2413", 3, .6, "", c)
    neck_scarf(ic, WHITE)
    hood(ic, BROWN, "#3a2413")
    hero_save(ic)


def hero_dock_foreman():
    ic = Icon("hero_dock_foreman")
    sky(ic, ["#bcd3d8", "#e6dcc0", "#8fa4a4"])
    ic.fill("M0 150H256V256H0z", ic.lin(["#5f8a94", "#2f5560"], 0, 150, 0, 256))
    for y in range(158, 250, 11):
        ic.line(f"M{(y * 7) % 60} {y}h46M{(y * 5) % 90 + 120} {y + 4}h52", "#d7eef0", 2, .4)
    ic.shape("M150 150V128H244L232 156H162z", ic.lin(TERRA, 0, 128, 0, 156), LINE, 2, False)
    ic.shape("M180 128V106H216V128z", ic.lin(WHITE, 180, 0, 216, 0), LINE, 2, False)
    ic.shape("M190 106V84H204V106z", ic.lin(IRON, 190, 0, 204, 0), LINE, 2, False)
    ic.fill("M0 206H256V256H0z", ic.lin(GREY, 0, 206, 0, 256))
    ic.line("M0 207H256", "#fffdf5", 3, .7)
    crate(ic, -6, 164, 48, 46)
    crate(ic, 4, 122, 40, 42)
    crate(ic, 214, 176, 48, 40)
    ic.layer(BUST)
    bust(ic, DENIM, "#1f3344", "#cfe0ea")
    jacket_front(ic, DENIM, "#1f3344", "#cfe0ea")
    neck_scarf(ic, TERRA)
    flat_cap(ic, GREY, "#544a3a")
    ic.layer()
    ic.line("M212 256L188 196", "#4a2812", 16, 1, "", None, True)
    ic.line("M212 256L188 196", "#a5713f", 11)
    ic.line("M188 196c-6 -26 14 -46 34 -38c16 8 12 30 -4 28", "#22262b", 13, 1, "", None, True, 6)
    ic.line("M188 196c-6 -26 14 -46 34 -38c16 8 12 30 -4 28", "#b9babb", 8)
    ic.line("M188 186c-2 -18 12 -30 26 -26", "#ffffff", 2.4, .8)
    hero_save(ic)


def hero_iron_quartermaster():
    ic = Icon("hero_iron_quartermaster")
    sky(ic, ["#4a3524", "#6b4c30", "#3a2818"])
    for y in (66, 138):
        ic.shape(rect(0, y, 256, 12), ic.lin(WOOD, 0, y, 0, y + 12), LINE, 2, False)
    for x in (6, 52):
        crate(ic, x, 28, 42, 38)
    crate(ic, 200, 22, 48, 44)
    crate(ic, 0, 100, 48, 38)
    for x in (206, 234):
        ic.shape(rect(x - 12, 98, 26, 40, 8), ic.lin([TEAL[2], TEAL[0], TEAL[2], TEAL[3]], x - 12, 0, x + 14, 0), LINE, 2, False)
        ic.line(f"M{x - 12} 110h26M{x - 12} 128h26", "#c98f58", 3)
    ic.fill("M0 0H256V256H0z", ic.rad(["#ffd78a", "#8a5c30", "#1a0f07"], 128, 60, 170), .32)
    ic.layer(BUST)
    c = bust(ic, GREY, "#544a3a", "#fffdf5")
    apron = "M78 186H178C188 208 192 236 194 262H62C64 236 68 208 78 186z"
    ic.shape(apron, ic.lin(DARKWOOD, 70, 186, 190, 260), LINE, 2.6, False)
    ic.line("M82 192H174M70 256C72 232 76 208 82 194M186 256C184 232 180 208 174 194", "#e0a56e", 2.2, .7, "", c)
    ic.line("M84 188L104 160M172 188L152 160", "#2b1508", 11)
    ic.line("M84 188L104 160M172 188L152 160", "#8a5730", 7)
    for x in (84, 172):
        ic.rivet(x, 190, 6)
    ic.shape("M98 222H158V262H98z", ic.lin(DARKWOOD[:3], 98, 222, 158, 260), "#2b1508", 2.2, False)
    neck_scarf(ic, OCHRE)
    cap(ic, DENIM, "#1f3344")
    ic.layer()
    ic.line(circ(206, 206, 24), "#3a2412", 11)
    ic.line(circ(206, 206, 24), "#d8962a", 6)
    for a in (40, 90, 135):
        x, y = pol(206, 206, 24, a)
        tf = f"translate({x:.0f} {y:.0f}) rotate({a * .4 - 36:.0f})"
        ic.shape("M-5 0H5V26H16V34H10V40H16V46H-5z", ic.lin(STEEL, -5, 0, 14, 40), LINE, 2, True, tf, 8)
        ic.shape(circ(0, -2, 10), ic.lin(STEEL, -8, -10, 8, 8), LINE, 2, True, tf, 8)
        ic.fill(circ(0, -2, 4), "#3a2412", 1, tf)
    hero_save(ic)


def hero_hill_commander():
    ic = Icon("hero_hill_commander")
    sky(ic, ["#8fb0c4", "#e9d7a6", "#c79a5c"])
    for x, y, w in ((40, 40, 60), (186, 28, 74)):
        ic.fill(ell(x, y, w * .6, 9), "#fffaf0", .7)
        ic.fill(ell(x + 14, y - 8, w * .34, 9), "#fffaf0", .7)
    ridge(ic, [(0, 116), (54, 78), (110, 128), (190, 72), (256, 112)], ["#b0844a", "#7a5a30"], "#fff0c4")
    ridge(ic, [(0, 168), (70, 140), (140, 178), (206, 138), (256, 160)], ["#7c8a44", "#42502a"], "#e9f0b4")
    for x, y in ((8, 178), (40, 182), (-10, 200), (24, 204), (206, 176), (238, 180), (222, 200), (254, 204)):
        ic.shape(f"M{x - 20} {y}C{x - 22} {y - 18} {x + 22} {y - 18} {x + 20} {y}C{x + 20} {y + 10} {x - 20} {y + 10} {x - 20} {y}z", ic.lin(GREY, 0, y - 16, 0, y + 10), LINE, 2.2, False)
        ic.line(f"M{x - 13} {y - 5}Q{x} {y - 13} {x + 12} {y - 6}", "#ffffff", 2, .6)
        ic.line(f"M{x + 15} {y - 10}v14", "#544a3a", 2, .7)
    ic.layer(BUST)
    bust(ic, OLIVE, "#33391a", "#d3d795")
    jacket_front(ic, OLIVE, "#33391a", "#d3d795")
    neck_scarf(ic, GREY)
    wrap(ic, WHITE, "#8f7855")
    binoculars(ic)
    hero_save(ic)


def hero_trail_scout():
    ic = Icon("hero_trail_scout")
    sky(ic, ["#dfe9a8", "#8fae5c", "#33502a"])
    for x, w in ((22, 18), (70, 10), (198, 14), (236, 22)):
        ic.shape(f"M{x - w / 2} 256L{x - w * .35} 0H{x + w * .35}L{x + w / 2} 256z", ic.lin(DARKWOOD, x - w / 2, 0, x + w / 2, 0), "#1e3317", 2, False)
        ic.line(f"M{x - w * .2} 10V250", "#e0b684", 1.8, .4)
    ic.fill("M96 256C104 200 130 170 128 120C140 170 168 210 176 256z", "#e6d09a", .7)
    leaves(ic, [(-8, 30, 20), (20, 4, 50), (60, -4, 70), (262, 24, 158), (230, 2, 120), (200, -8, 100), (-6, 90, -10), (264, 100, 186)], JUNGLE)
    ic.layer(BUST)
    bust(ic, JUNGLE, "#1e3317", "#d9e8a8")
    jacket_front(ic, JUNGLE, "#1e3317", "#d9e8a8")
    neck_scarf(ic, BROWN)
    brim_hat(ic, OLIVE, "#33391a")
    leaves(ic, [(78, 62, -50), (104, 54, -75), (150, 56, -105), (172, 64, -135)], JUNGLE, .62)
    ic.layer()
    leaves(ic, [(-10, 226, -28), (8, 256, -50), (262, 230, 205), (246, 258, 232), (-12, 250, 0)], JUNGLE, 1.05)
    hero_save(ic)


def hero_field_medic():
    ic = Icon("hero_field_medic")
    sky(ic, ["#e9dcb4", "#cdb684", "#8f7a50"])
    ic.shape("M0 92L128 10L256 92V256H0z", ic.lin(["#f6ecd0", "#d9c596", "#a98f5c"], 40, 20, 220, 256), LINE, 2, False)
    for x in (32, 78, 178, 224):
        ic.line(f"M128 12L{x} 250", "#8f7855", 2.4, .5)
        ic.line(f"M128 12L{x + 5} 250", "#fffdf5", 2, .5)
    ic.fill("M0 92L128 10L256 92L256 108L128 28L0 108z", ic.lin(OLIVE, 0, 20, 0, 108))
    ic.line("M0 106L128 27L256 106", "#33391a", 3, .7)
    ic.layer(BUST)
    bust(ic, WHITE, "#8f7855", "#ffffff")
    jacket_front(ic, WHITE, "#8f7855", "#ffffff")
    neck_scarf(ic, TEAL)
    wrap(ic, TEAL, "#153539")
    ic.line("M60 170L206 262", "#2b1508", 18)
    ic.line("M60 170L206 262", "#8a5730", 13)
    ic.line("M58 166L204 257", "#dca66c", 2, .9)
    ic.layer()
    ic.shape(rect(152, 188, 88, 74, 10), ic.lin(WOOD, 152, 188, 240, 260), LINE, 2.6)
    ic.shape("M150 190H242V212Q196 238 150 212z", ic.lin(DARKWOOD[:3], 150, 190, 150, 236), LINE, 2.4, False)
    ic.line("M156 208Q196 232 236 208", "#ecb987", 2, .7)
    ic.rivet(196, 224, 6)
    for x, y in ((170, 178), (206, 174)):
        ic.shape(rect(x - 14, y - 20, 34, 30, 8), ic.lin(WHITE, x - 14, 0, x + 20, 0), LINE, 2.4)
        ic.shape(ell(x + 3, y - 20, 17, 7), ic.lin(WHITE, 0, y - 28, 0, y - 12), LINE, 2, False)
        ic.line(f"M{x - 6} {y - 20}a9 4 0 1 1 9 4a5 2.4 0 1 1 0 -5", "#8f7855", 2)
        ic.line(f"M{x - 12} {y - 6}h30M{x - 12} {y}h30", "#b8a47c", 1.6, .8)
    hero_save(ic)


def hero_porter_chief():
    ic = Icon("hero_porter_chief")
    sky(ic, ["#f3dca4", "#dba86a", "#7d7a5c"])
    ridge(ic, [(0, 112), (36, 70), (66, 108), (106, 64), (150, 112), (200, 76), (256, 116)], ["#7f9468", "#4f6a48"], "#eef5c8")
    ic.fill("M0 140C80 130 180 150 256 136V256H0z", ic.lin(["#a9c7b8", "#5f8f88", "#335c5a"], 0, 136, 0, 256))
    for y in range(150, 250, 12):
        ic.line(f"M{(y * 3) % 50} {y}q20 -5 40 0M{(y * 5) % 80 + 110} {y + 5}q24 -6 48 0", "#f2fbe8", 2.2, .5)
    ic.layer()
    ic.line("M8 182Q128 168 248 182", "#4a2812", 14, 1, "", None, True)
    ic.line("M8 182Q128 168 248 182", "#c98f4a", 9)
    ic.line("M12 178Q128 164 244 178", "#f3d093", 2.4, .9)
    for x in (26, 230):
        ic.line(f"M{x} 178L{x - 22} 210M{x} 178L{x + 22} 210", "#4a2812", 4.5)
        ic.line(f"M{x} 178L{x - 22} 210M{x} 178L{x + 22} 210", "#d9b27a", 2)
        ic.shape(f"M{x - 34} 206H{x + 34}L{x + 24} 262H{x - 24}z", ic.lin(OCHRE, x - 34, 198, x + 34, 252), LINE, 2.6)
        for k in range(4):
            ic.line(f"M{x - 31 + k * 2} {218 + k * 11}H{x + 31 - k * 2}", "#5e3c13", 2, .7)
        for k in range(-3, 4):
            ic.line(f"M{x + k * 9} 210L{x + k * 7} 260", "#5e3c13", 1.8, .6)
        ic.fill(f"M{x - 30} 208C{x - 20} 188 {x + 20} 188 {x + 30} 208z", ic.lin(WHITE, 0, 180, 0, 200))
        ic.line(f"M{x - 30} 208C{x - 20} 188 {x + 20} 188 {x + 30} 208", LINE, 2.4)
        ic.shape(rect(x - 36, 203, 72, 10, 5), ic.lin(OCHRE, 0, 195, 0, 205), LINE, 2, False)
    ic.layer(BUST)
    bust(ic, DARKWOOD, "#331a0b", "#e6b88a")
    jacket_front(ic, DARKWOOD, "#331a0b", "#e6b88a")
    neck_scarf(ic, OLIVE)
    wrap(ic, OCHRE, "#5e3c13")
    hero_save(ic)


def hero_column_commander():
    ic = Icon("hero_column_commander")
    sky(ic, ["#a9bcae", "#e3d49a", "#8f8a58"])
    ridge(ic, [(0, 100), (46, 60), (92, 104), (150, 50), (204, 100), (256, 72)], ["#6f8a5c", "#43603c"], "#eef5c8")
    ridge(ic, [(0, 150), (80, 126), (150, 152), (256, 122)], ["#57713a", "#2f4722"], "#dcecaa")
    ic.fill("M178 124C214 148 250 150 256 190V214C232 176 196 168 168 130z", "#d9bd84", .85)
    for x, y in ((190, 132), (206, 141), (222, 149), (238, 160), (250, 174)):
        ic.fill(f"M{x - 4} {y + 10}L{x - 3} {y}H{x + 3}L{x + 4} {y + 10}z", "#2f2415")
        ic.fill(ell(x, y - 2, 6, 3), "#5e4a24")
    ic.layer(BUST)
    bust(ic, OLIVE, "#33391a", "#d3d795")
    jacket_front(ic, OLIVE, "#33391a", "#d3d795")
    neck_scarf(ic, JUNGLE)
    cap(ic, OLIVE, "#33391a")
    binoculars(ic)
    ic.layer()
    ic.shape("M14 206L62 188L84 250L36 268z", ic.lin(PAPER, 14, 190, 84, 260), LINE, 2.4)
    ic.line("M30 214Q46 220 50 206T70 214M40 244Q52 232 62 240", "#7c4822", 2.6, .8)
    ic.line("M24 220L66 204M30 238L74 222", "#8f7855", 1.4, .6)
    ic.line("M18 206L61 190", "#ffffff", 2.4, .8)
    hero_save(ic)


def search_icon():
    """A brass magnifying glass over a scrap of map: the Find sheet's button."""
    ic = Icon("search")
    ic.shape("M40 70L150 52L176 150L66 170z", ic.lin(PAPER, 40, 60, 176, 160), LINE, 2.4)
    ic.line("M60 92Q86 100 98 86T140 92M70 130Q96 116 118 126T160 120", "#7c4822", 2.6, .7)
    ic.line("M44 72L148 55", "#ffffff", 2.4, .8)
    cx, cy, r = 112, 104, 58
    # The handle, wood with a brass collar, down to the right.
    ic.shape("M152 140L214 214Q222 226 210 232Q198 238 190 228L130 160z", "#0c0704", "#0c0704", 8, False)
    ic.shape("M152 140L214 214Q222 226 210 232Q198 238 190 228L130 160z", ic.lin(["#a0671a", "#6b3f12", "#3e230a"], 150, 150, 220, 230), LINE, 2.4)
    ic.line("M160 156L208 214", "#e2a860", 3, .6)
    ic.shape("M140 132L166 156L150 172L124 148z", ic.lin(GOLD, 124, 132, 166, 172), LINE, 2.2)
    # The rim and the glass.
    ic.shape(circ(cx + 3, cy + 4, r + 12), "#4a2a0c", INK, 3)
    ic.shape(circ(cx, cy, r + 12), ic.lin(BRASS, cx - r, cy - r, cx + r, cy + r), LINE, 3)
    ic.shape(circ(cx, cy, r), ic.rad(["#e8f3ef", "#b7d3cf", "#7fa6a4", "#4f7472"], cx - 18, cy - 20, r * 1.3), INK, 2.2, False)
    ic.line(f"M{cx - 38} {cy - 6}A40 40 0 0 1 {cx - 4} {cy - 40}", "#ffffff", 6, .75)
    for a in (45, 135, 225, 315):
        ic.rivet(*pol(cx, cy, r + 6, a), 5, GOLD)
    ic.save()


if __name__ == "__main__":
    for draw in (food, materiel, funds, support, heroes, alliance, map_icon, base, reports, settings, upgrade, info, train, hammer, builders, power, marches, wounded, avatar, back, chevron, clock, lock, storage, troop_infantry, troop_scouts, troop_heavy, troop_porters, music, effects, language, help_icon, link, search_icon,
                 victory, defeat, gone, npc_patrol, npc_convoy, npc_outpost, npc_fortified_line, chat, hourglass, offline,
               hero_mountain_guide, hero_dock_foreman, hero_iron_quartermaster, hero_hill_commander, hero_trail_scout, hero_field_medic, hero_porter_chief, hero_column_commander):
        draw()
    print(f"wrote {len(list(OUT.glob('*.svg')))} icons, {sum(f.stat().st_size for f in OUT.glob('*.svg')) // 1024} KB")
