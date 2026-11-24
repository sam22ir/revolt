#!/usr/bin/env python3
"""Draws the UI frames and buttons (art/kit/*.svg): simple camp-made borders (lashed poles, thin iron, stitching) and game buttons.

Run: python3 apps/godot/tools/ui/build_frames.py, then `godot --headless --import`. One SVG px is one viewport px.
A frame is square: four `c` px corners and edges whose `t` px middle repeats (FrameBox tiles it), so nothing in it is ever stretched.
Every frame is the same seen in a mirror, because Arabic mirrors the screens. The centres are empty: FrameBox fills them.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "icons"))
import build_icons as bi  # noqa: E402
from build_icons import INK, Icon, circ, ell, pol, poly, rect  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "art" / "kit"
class Frame(Icon):
    def __init__(self, name, size, height=None):
        super().__init__(name)
        self.w, self.h = size, height or size

    def alpha(self, colour, x1, y1, x2, y2, a0, a1):
        i = self.uid()
        self.defs.append(f'<linearGradient id="{i}" gradientUnits="userSpaceOnUse" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"><stop offset="0" stop-color="{colour}" stop-opacity="{a0}"/><stop offset="1" stop-color="{colour}" stop-opacity="{a1}"/></linearGradient>')
        return f"url(#{i})"

    def glow(self, colour, cx, cy, r, a0, a1):
        i = self.uid()
        self.defs.append(f'<radialGradient id="{i}" gradientUnits="userSpaceOnUse" cx="{cx}" cy="{cy}" r="{r}"><stop offset="0" stop-color="{colour}" stop-opacity="{a0}"/><stop offset="1" stop-color="{colour}" stop-opacity="{a1}"/></radialGradient>')
        return f"url(#{i})"

    def write(self):
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}"><defs>{"".join(self.defs)}</defs>{"".join(self.body)}</svg>\n'
        (OUT / f"{self.name}.svg").write_text(svg)

    def side(self, k):
        """The transform that takes the top edge to side k (top, right, bottom, left) of the square."""
        return f"rotate({k * 90} {self.w / 2} {self.w / 2})"

    def mitre(self, a, b, k, colours):
        """The bar between a and b px from side k's outer edge, cut at 45 degrees at both ends."""
        s = self.w
        self.shape(poly([(a, a), (s - a, a), (s - b, b), (b, b)]), self.lin(colours, 0, a, 0, b), "", 0, False, self.side(k))

    def bars(self, spec, r=0):
        """The dark outline of a frame, (width, "ink") from the edge in. Returns how deep it goes."""
        at = 0
        for width, _ in spec:
            for k in range(4):
                self.mitre(at, at + width, k, [INK, INK])
            at += width
        return at

    def inner_shadow(self, at, depth, a=.6):
        s = self.w
        for k in range(4):
            g = self.alpha("#000000", 0, at, 0, at + depth, a if k != 2 else a * .7, 0)
            self.fill(poly([(at, at), (s - at, at), (s - at - depth, at + depth), (at + depth, at + depth)]), g, 1, self.side(k))

    def edge_line(self, at, colours, w, op=1.0):
        s = self.w
        for k in range(4):
            self.line(f"M{at} {at}H{s - at}", colours[k], w, op, self.side(k))


def motif(f, c, t, y, period, kind, size):
    """Stitches along each edge, `period` px apart, aligned to the tile."""
    s = f.w
    for k in range(4):
        tf = f.side(k)
        for i in range(s // period):
            x = period / 2 + i * period
            if x < size * 4.5 or x > s - size * 4.5:
                continue
            f.line(f"M{x - period * .28:.1f} {y + 1.6}H{x + period * .28:.1f}", "#0a0502", size * 1.5, .9, tf)
            f.line(f"M{x - period * .28:.1f} {y}H{x + period * .28:.1f}", "#b8915c", size, 1, tf)
            f.line(f"M{x - period * .2:.1f} {y - size * .3:.1f}H{x + period * .1:.1f}", "#ead2a0", size * .35, .9, tf)


def corner(f, draw):
    """Draws the top-left corner, then its mirror images in the other three (flipped, not rotated, so the light stays above)."""
    s = f.w
    for tf in ("", f"translate({s} 0) scale(-1 1)", f"translate(0 {s}) scale(1 -1)", f"translate({s} {s}) scale(-1 -1)"):
        draw(tf)


# ------------------------------------------------------------------ frames
# Simple on purpose: rough camp poles lashed with rope round the big panels, a thin blackened-iron rim on the small ones, plain stitched
# leather for sections. No gold, no ornament.

IRONS = (["#a19a8d", "#6f6a60"], ["#6f6a60", "#4a463f"], ["#4a463f", "#2b2824"], ["#6f6a60", "#4a463f"])
IRON_HI = ("#d8d1c1", "#9b9486", "#6a655b", "#9b9486")
NAIL = ["#c9c2b3", "#8a8478", "#4f4b44", "#2a2723"]
SAND = "#e6cf9c"
POLE = ["#b98a58", "#946539", "#6b4423", "#3d2412"]
ROPE = ["#f0dfb4", "#cdb381", "#94794a", "#5c4726"]


def iron(f, at, width):
    """A plain iron bar on every side, lit from above."""
    for k in range(4):
        f.mitre(at, at + width, k, IRONS[k])
    f.edge_line(at + 1.1, IRON_HI, 1.1, .75)
    return at + width


def nail(f, x, y, r, tf=""):
    f.rivet(x, y, r, NAIL, tf)


def pole(f, k, c, t, y, r):
    """One rough pole along side k, its middle the same in every tile: bark lines run the whole way, knots and cuts stay inside."""
    s = f.w
    tf = f.side(k)
    lit = [["#dcb585", "#b98a58", "#8a5d33", "#4a2c15"], ["#b98a58", "#946539", "#6b4423", "#3d2412"], ["#946539", "#754b28", "#54341a", "#2f1b0c"], ["#b98a58", "#946539", "#6b4423", "#3d2412"]][k]
    f.fill(rect(3, y - r - 3, s - 6, 2 * r + 6, 7), INK, 1, tf)
    f.shape(rect(6, y - r, s - 12, 2 * r, 5), f.lin(lit, 0, y - r, 0, y + r), "", 0, False, tf)
    for i, (dy, col, w, op) in enumerate(((-.72, "#ffe6bf", 1.6, .7), (-.38, "#4a2c15", 1.3, .6), (-.1, "#e3bd8a", 1, .4), (.16, "#3d2412", 1.5, .6), (.46, "#2f1b0c", 1.3, .6), (.74, "#1d0f06", 1.8, .6))):
        f.line(f"M8 {y + dy * r:.1f}H{s - 8}", col, w, op, tf)
    f.rng.seed(f"{f.name}-pole")
    for _ in range(9):
        x = c + f.rng.uniform(6, t - 26)
        yy = y + f.rng.uniform(-.7, .7) * r
        f.line(f"M{x:.1f} {yy:.1f}q{f.rng.uniform(6, 10):.1f} {f.rng.uniform(-2.4, 2.4):.1f} {f.rng.uniform(13, 18):.1f} 0", "#2f1b0c", 1.5, .75, tf)
    x = c + t * .62
    f.line(ell(x, y - r * .1, 6.5, r * .42), "#2f1b0c", 1.8, .85, tf)
    f.fill(ell(x, y - r * .1, 3.4, r * .22), "#2f1b0c", .85, tf)
    f.line(ell(x + .4, y - r * .1, 9.5, r * .62), "#e3bd8a", 1, .35, tf)


def band():
    """The HUD header and nav bar: one iron strap with a nail every so often."""
    c, t = 40, 96
    f = Frame("frame_band", 2 * c + t)
    at = iron(f, 3, 8)
    f.bars([(3, "ink")])
    for k in range(4):
        f.mitre(at, at + 2.5, k, [INK, INK])
    f.inner_shadow(at + 2.5, 20, .6)
    for k in range(4):
        nail(f, c + t / 2, 7, 3.4, f.side(k))

    def strap(tf):
        f.shape("M2.5 2.5H38V13.5H19C15.5 13.5 13.5 15.5 13.5 19V38H2.5z", f.lin(["#7d776b", "#4a463f"], 0, 0, 30, 30), INK, 2.2, False, tf)
        f.line("M5 35V5H35", "#bdb6a6", 1.2, .7, tf)
        for x, y in ((8, 8), (30, 8), (8, 30)):
            nail(f, x, y, 3.2, tf)

    corner(f, strap)
    f.write()


def sheet():
    """The big cards and the pages: four rough poles lashed with rope where they cross."""
    c, t = 72, 96
    f = Frame("frame_sheet", 2 * c + t)
    f.inner_shadow(26, 30, .66)
    for k in (1, 3):
        pole(f, k, c, t, 17, 10)
    for k in (0, 2):
        pole(f, k, c, t, 17, 10)

    def lash(tf):
        # Turns along each pole, then the cross over the joint, and a loose end.
        for x in (40, 49):
            f.fill(rect(x - 1.5, 3, 10, 28, 4), INK, 1, tf)
            f.shape(rect(x, 4.5, 7, 25, 3.5), f.lin(ROPE, 0, 4, 0, 30), "", 0, False, tf)
            for y in (8, 14, 20, 26):
                f.line(f"M{x + 1} {y + 2}l5 -3.5", "#5c4726", 1.2, .9, tf)
        for y in (40, 49):
            f.fill(rect(3, y - 1.5, 28, 10, 4), INK, 1, tf)
            f.shape(rect(4.5, y, 25, 7, 3.5), f.lin(ROPE, 4, 0, 30, 0), "", 0, False, tf)
            for x in (8, 14, 20, 26):
                f.line(f"M{x - 2} {y + 6}l3.5 -5", "#5c4726", 1.2, .9, tf)
        for d in ("M7 31L31 7", "M2 24L24 2", "M12 36L36 12"):
            f.line(d, INK, 9.5, 1, tf)
            f.line(d, "#cdb381", 6.4, 1, tf)
            f.line(d, "#f3e6c2", 1.6, .8, f"{tf} translate(-1.4 -1.4)")
        for a in range(0, 24, 5):
            f.line(f"M{8 + a} {29 - a}l3.6 1.2", "#5c4726", 1.2, .9, tf)
        f.line("M8 8L30 30", INK, 9.5, 1, tf)
        f.line("M8 8L30 30", "#dcc593", 6.4, 1, tf)
        f.line("M9.5 7L29 26.5", "#fbf1d4", 1.6, .8, tf)
        for a in range(0, 22, 5):
            f.line(f"M{10 + a} {7.5 + a}l-.6 4.4", "#5c4726", 1.2, .9, tf)
        f.line("M30 30Q39 33 38 43", INK, 6, 1, tf)
        f.line("M30 30Q39 33 38 43", "#cdb381", 3.4, 1, tf)
        f.line("M36.5 42l-1 5M38.5 43l.6 5M40 42l2 4", "#cdb381", 1.5, 1, tf)

    corner(f, lash)
    f.write()


def card():
    """A leather section: a worn edge and a row of stitches, nothing else."""
    c, t = 48, 48
    f = Frame("frame_card", 2 * c + t)
    s = f.w
    for k in range(4):
        f.mitre(0, 3, k, [INK, INK])
        f.mitre(3, 5.5, k, [["#6b4a30", "#4c331f"], ["#4c331f", "#38240f"], ["#38240f", "#2a1a0b"], ["#4c331f", "#38240f"]][k])
    f.inner_shadow(5.5, 14, .42)
    motif(f, c, t, 14, 16, "stitch", 2.6)
    f.write()


def plate(name, warm=False):
    """A small iron-rimmed plaque; `warm` has a pale sand rim, for one that invites a tap."""
    c, t = 26, 32
    f = Frame(name, 2 * c + t)
    f.bars([(2.5, "ink")])
    if warm:
        for k in range(4):
            f.mitre(2.5, 6.5, k, [[SAND, "#cdb27a"], ["#cdb27a", "#a98c55"], ["#a98c55", "#84693a"], ["#cdb27a", "#a98c55"]][k])
        at = 6.5
    else:
        at = iron(f, 2.5, 4)
    for k in range(4):
        f.mitre(at, at + 2, k, [INK, INK])
    f.inner_shadow(at + 2, 12, .55)
    corner(f, lambda tf: nail(f, 12.5, 12.5, 2.6, tf))
    f.write()


def paper():
    """A sheet of paper pinned down: a dark worn edge and a nail in each corner."""
    c, t = 34, 48
    f = Frame("frame_paper", 2 * c + t)
    f.bars([(2.5, "ink")])
    for k in range(4):
        f.mitre(2.5, 5, k, ["#8a6a3c", "#b9965f"])
    s = f.w
    for k in range(4):
        g = f.alpha("#6b4a20", 0, 5, 0, 24, .5, 0)
        f.fill(poly([(5, 5), (s - 5, 5), (s - 24, 24), (24, 24)]), g, 1, f.side(k))

    def pin(tf):
        f.fill(ell(16, 18, 7, 5.5), "#3d2a12", .4, tf)
        nail(f, 15, 15, 5, tf)

    corner(f, pin)
    f.write()


def inset():
    """A recess: text fields and progress tracks."""
    c, t = 22, 32
    f = Frame("frame_inset", 2 * c + t)
    f.bars([(2, "ink")])
    iron(f, 2, 2.5)
    for k in range(4):
        f.mitre(4.5, 6, k, [INK, INK])
    f.inner_shadow(6, 15, .85)
    f.write()


def portrait():
    """A picture frame, drawn over the picture's edge."""
    c, t = 34, 32
    f = Frame("frame_portrait", 2 * c + t)
    f.bars([(2.5, "ink")])
    iron(f, 2.5, 6)
    for k in range(4):
        f.mitre(8.5, 10.5, k, [INK, INK])
    f.inner_shadow(10.5, 10, .55)
    corner(f, lambda tf: nail(f, 7.5, 7.5, 3, tf))
    f.write()


def tile(name, on):
    """A troop tile; chosen, a pale rim and a warm light inside."""
    c, t = 34, 32
    f = Frame(name, 2 * c + t)
    f.bars([(2.5, "ink")])
    s = f.w
    if on:
        for k in range(4):
            f.mitre(2.5, 8.5, k, [["#fff3cf", SAND], [SAND, "#cdb27a"], ["#cdb27a", "#a98c55"], [SAND, "#cdb27a"]][k])
            f.mitre(8.5, 10.5, k, [INK, INK])
            g = f.alpha("#ffd98a", 0, 10.5, 0, 36, .4, 0)
            f.fill(poly([(10.5, 10.5), (s - 10.5, 10.5), (s - 34, 34), (34, 34)]), g, 1, f.side(k))
    else:
        iron(f, 2.5, 3.5)
        for k in range(4):
            f.mitre(6, 8, k, [INK, INK])
        f.inner_shadow(8, 14, .6)
    f.write()


def rounded(name, w, h, r, rim, fill):
    """A rounded piece with its own fill and a thin rim."""
    f = Frame(name, w, h)
    f.fill(rect(0, 0, w, h, r), INK)
    f.shape(rect(2, 2, w - 4, h - 4, r - 1.5), f.lin(rim, 0, 0, 0, h), "", 0, False)
    f.fill(rect(4.5, 4.5, w - 9, h - 9, r - 4), INK)
    f.shape(rect(6, 6, w - 12, h - 12, r - 5.5), f.lin(fill, 0, 6, 0, h - 6), "", 0, False)
    f.line(f"M{r} 3.2H{w - r}", "#d8d1c1", 1.1, .6)
    f.write()


# ------------------------------------------------------------------ buttons
# Game buttons: a fat outline, a domed face with a shine, and a lip under it that the face sinks into when pressed.

KINDS = {
    "green": (["#8eae46", "#6a8a32", "#527026"], ["#c9e088", "#3c551a"], ["#34491a", "#1f2d0e"]),
    "wood": (["#9c7448", "#775431", "#5f4126"], ["#d9b484", "#452d18"], ["#3d2815", "#25170b"]),
    "blue": (["#5d8d99", "#3f6b78", "#305561"], ["#a9d0d8", "#223f49"], ["#1f3a43", "#12242b"]),
    "red": (["#c0604a", "#9a3f2d", "#7d2f20"], ["#f0a590", "#5c2015"], ["#551d13", "#34100a"]),
    "amber": (["#d49a42", "#ad7424", "#8f5f1c"], ["#ffe2a4", "#7a4f15"], ["#6d4512", "#432a09"]),
    "grey": (["#716a5f", "#5c564c", "#4d483f"], ["#8f887a", "#3a362f"], ["#34302a", "#201d19"]),
}


def button(kind, down):
    """96 x 104, nine-slice 32 at the sides and the top and 38 at the foot (the lip)."""
    face, edge, lip = KINDS[kind]
    w, h = 96, 104
    f = Frame(f"btn_{kind}{'_down' if down else ''}", w, h)
    sink = 9 if down else 0
    depth = 5 if down else 14
    top, foot = 3 + sink, h - 3 - depth
    f.fill(rect(0, sink, w, h - sink, 22), INK)
    f.shape(rect(3.5, top + 10, w - 7, h - 3.5 - top - 10, 19), f.lin(lip, 0, foot - 10, 0, h - 3), "", 0, False)
    f.line(f"M22 {h - 5.5}H{w - 22}", edge[0], 1.2, .25)
    f.fill(rect(3, top, w - 6, foot - top + 2.5, 19), INK)
    f.shape(rect(3.5, top + .5, w - 7, foot - top - 1, 18.5), f.lin([edge[0], face[1], edge[1]], 0, top, 0, foot), "", 0, False)
    f.shape(rect(6.5, top + 4, w - 13, foot - top - 8, 16), f.lin(face, 0, top, 0, foot), "", 0, False)
    if kind != "grey":
        # The shine: a soft upper half and one bright line.
        f.fill(rect(9, top + 6, w - 18, (foot - top) * .36, 13), f.alpha("#ffffff", 0, top + 5, 0, top + (foot - top) * .46, .12 if down else .26, 0))
        f.line(f"M22 {top + 8}H{w - 22}", "#ffffff", 2.2, .2 if down else .45)
        f.line(f"M22 {foot - 7}H{w - 22}", "#000000", 2, .18)
    f.write()


def round_button(name, kind, down, s=256):
    """A round game button, its face a little dished so a coloured icon reads on it."""
    face, edge, lip = KINDS[kind]
    f = Frame(f"{name}{'_down' if down else ''}", s)
    k = s / 256
    cx = 128 * k
    sink = 10 * k if down else 0
    r = 116 * k
    cy = 119 * k + sink
    f.fill(circ(cx, cx + 4 * k, 123 * k), "#000000", .35)
    f.fill(circ(cx, 131 * k, 122 * k), INK)
    f.shape(circ(cx, 131 * k, 117 * k), f.lin(lip, 0, 128 * k, 0, 250 * k), "", 0, False)
    f.fill(circ(cx, cy, r + 3 * k), INK)
    f.shape(circ(cx, cy, r), f.lin([edge[0], face[1], edge[1]], 0, cy - r, 0, cy + r), "", 0, False)
    f.shape(circ(cx, cy, r - 8 * k), f.lin(face, 0, cy - r, 0, cy + r), "", 0, False)
    f.fill(circ(cx, cy, r - 24 * k), "#000000", .26)
    f.shape(circ(cx, cy + 2 * k, r - 27 * k), f.rad([face[1], face[2], lip[0]], cx, cy + 34 * k, 108 * k), "", 0, False)
    f.line(f"M{cx - 70 * k:.1f} {cy - 78 * k:.1f}A{104 * k:.1f} {104 * k:.1f} 0 0 1 {cx + 70 * k:.1f} {cy - 78 * k:.1f}", "#ffffff", 7 * k, .2 if down else .42)
    f.line(f"M{cx - 58 * k:.1f} {cy + 84 * k:.1f}A{102 * k:.1f} {102 * k:.1f} 0 0 0 {cx + 58 * k:.1f} {cy + 84 * k:.1f}", "#000000", 5 * k, .2)
    f.write()


def progress():
    """The bar's fill (nine-slice 6, tiled across): an amber rod with soft stripes."""
    f = Frame("progress_fill", 48, 32)
    f.shape(rect(0, 0, 48, 32, 4), f.lin(["#f3cd80", "#dba046", "#b87a28", "#8a5618"], 0, 0, 0, 32), "", 0, False)
    for x in range(0, 48, 16):
        f.fill(f"M{x} 32L{x + 8} 0H{x + 16}L{x + 8} 32z", "#fff3cf", .16)
    f.fill(rect(0, 3, 48, 6, 2), "#ffffff", .35)
    f.write()


def engraving():
    """The page backdrop's faint engraving: contour hills, a survey grid and a compass rose, in one ink (1024 px)."""
    s = 1024
    f = Frame("engraving", s)
    ink = "#e8c98a"
    for k in range(1, 8):
        f.line(f"M{k * 128} 0V{s}M0 {k * 128}H{s}", ink, 1, .22)
        for j in range(1, 8):
            f.line(f"M{k * 128 - 7} {j * 128}h14M{k * 128} {j * 128 - 7}v14", ink, 1.6, .5)
    for cx, cy, rr, sd in ((210, 250, 190, 1), (820, 190, 150, 2), (190, 800, 170, 3), (850, 800, 190, 4), (540, 70, 90, 5), (540, 960, 80, 6)):
        ph = [f.rng.uniform(0, 6.28) for _ in range(4)]
        for n in range(8):
            r0 = rr * (1 - n / 8.5)
            pts = []
            for i in range(73):
                a = i * math.tau / 72
                r = r0 * (1 + .12 * math.sin(2 * a + ph[0]) + .07 * math.sin(3 * a + ph[1] + n * .12) + .035 * math.sin(7 * a + ph[2]))
                pts.append((cx + r * math.cos(a), cy + r * .8 * math.sin(a)))
            f.line(poly(pts), ink, 2 if n % 3 == 0 else 1.1, .55 if n % 3 == 0 else .38)
    c = s / 2
    for r, w in ((214, 3), (204, 1.2), (150, 1.4), (70, 2.4)):
        f.line(circ(c, c, r), ink, w, .75)
    for i in range(120):
        a = i * 3
        (x0, y0), (x1, y1) = pol(c, c, 204, a), pol(c, c, 196 if i % 5 else 184, a)
        f.line(f"M{x0:.1f} {y0:.1f}L{x1:.1f} {y1:.1f}", ink, 1.4, .7)
    for i in range(16):
        big = i % 4 == 0
        half = i % 2 == 0
        R = 182 if big else (140 if half else 96)
        a = i * 22.5 - 90
        tip, l, r = pol(c, c, R, a), pol(c, c, 40 if half else 60, a - 11.25), pol(c, c, 40 if half else 60, a + 11.25)
        f.fill(poly([(c, c), l, tip]), ink, .5)
        f.line(poly([(c, c), r, tip]), ink, 1.6, .75)
    f.line(circ(c, c, 22), ink, 2, .8)
    f.write()


def main():
    for old in OUT.glob("*.svg"):
        old.unlink()
    band(); sheet(); card(); plate("frame_plate"); plate("frame_plate_warm", True); paper(); inset(); portrait()
    tile("frame_tile", False); tile("frame_tile_on", True)
    dark = ["#150c06", "#26180d", "#352215"]
    rim = ["#a19a8d", "#6f6a60", "#3c3832"]
    rounded("pill", 96, 80, 38, rim, dark)
    rounded("frame_cell", 88, 88, 20, rim, dark)
    rounded("tag", 56, 56, 14, rim, dark)
    for kind in KINDS:
        for down in (False, True):
            button(kind, down)
    for down in (False, True):
        round_button("round", "wood", down)
        round_button("round_big", "green", down, 384)
        round_button("round_red", "red", down)
    progress(); engraving()
    print(f"{len(list(OUT.glob('*.svg')))} pieces, {sum(p.stat().st_size for p in OUT.glob('*.svg')) // 1024} KB")


if __name__ == "__main__":
    main()
