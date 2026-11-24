#!/usr/bin/env python3
"""Draws the UI frames (art/kit/*.svg) in the icons' style: engraved brass with a dark outline over walnut, leather and parchment.

Run: python3 apps/godot/tools/ui/build_frames.py, then `godot --headless --import`. One SVG px is one viewport px.
A frame is square: four `c` px corners and edges whose `t` px middle repeats (FrameBox tiles it), so nothing in it is ever stretched.
Every frame is the same seen in a mirror, because Arabic mirrors the screens. The centres are empty: FrameBox fills them.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "icons"))
import build_icons as bi  # noqa: E402
from build_icons import BRASS, COPPER, GOLD, INK, IRON, LINE, OLIVE, TEAL, WAX, WOOD, Icon, circ, ell, pol, poly, rect  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "art" / "kit"
# One brass per side: lit from above, the same on the left and the right.
SIDES = (["#fff3c4", "#f0cd7a", "#c08c3c"], ["#e3bb69", "#b98538", "#8d5f22"], ["#b98538", "#8d5f22", "#5e3b14"], ["#e3bb69", "#b98538", "#8d5f22"])


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
        """Concentric bars from the outside in: (width, "ink" | "lit" | "sunk" | colour). Returns how deep they go."""
        at = 0
        for width, kind in spec:
            for k in range(4):
                c = SIDES[k]
                cols = {"ink": [INK, INK], "lit": c, "sunk": ["#140c06", "#2a1a0d"], "low": [c[1], c[2]]}.get(kind) or [kind, kind]
                self.mitre(at, at + width, k, cols)
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


HI = ("#fffbe2", "#fbe3a2", "#d9ad5c", "#fbe3a2")
LO = ("#7a5220", "#4f3210", "#2e1b08", "#4f3210")


def motif(f, c, t, y, period, kind, size):
    """Repeats a small engraving along each edge's middle and its corners, `period` px apart, aligned to the tile."""
    s = f.w
    n = s // period
    for k in range(4):
        tf = f.side(k)
        for i in range(n):
            x = period / 2 + i * period
            if x < size * 1.6 or x > s - size * 1.6:
                continue
            if kind == "diamond":
                f.shape(poly([(x, y - size), (x + size * 1.5, y), (x, y + size), (x - size * 1.5, y)]), f.lin(GOLD[:3], x - size, y - size, x + size, y + size), INK, 1.2, False, tf)
                f.line(f"M{x - size:.1f} {y}L{x} {y - size * .6:.1f}", "#fffbe2", 1.1, .9, tf)
                for d in (-1, 1):
                    f.fill(circ(x + d * period / 2, y, size * .36), GOLD[1], 1, tf)
            elif kind == "rope":
                f.shape(f"M{x - period * .62:.1f} {y + size}C{x - period * .5:.1f} {y - size * .6:.1f} {x - period * .1:.1f} {y - size:.1f} {x + period * .62:.1f} {y - size}C{x + period * .5:.1f} {y + size * .6:.1f} {x + period * .1:.1f} {y + size:.1f} {x - period * .62:.1f} {y + size}z", f.lin(SIDES[k], 0, y - size, 0, y + size), LINE, 1.1, False, tf)
            elif kind == "stitch":
                f.line(f"M{x - period * .28:.1f} {y + 1.6}H{x + period * .28:.1f}", "#0a0502", size * 1.5, .9, tf)
                f.line(f"M{x - period * .28:.1f} {y}H{x + period * .28:.1f}", "#c9a066", size, 1, tf)
                f.line(f"M{x - period * .2:.1f} {y - size * .3:.1f}H{x + period * .1:.1f}", "#f3dcae", size * .35, .9, tf)
                f.fill(circ(x - period / 2, y + .6, size * .5), "#0a0502", .85, tf)
            elif kind == "bead":
                f.shape(circ(x, y, size), f.rad(GOLD, x - size * .35, y - size * .4, size * 1.6), LINE, 1, False, tf)


def corner(f, draw):
    """Draws the top-left corner, then its mirror images in the other three (flipped, not rotated, so the light stays above)."""
    s = f.w
    for tf in ("", f"translate({s} 0) scale(-1 1)", f"translate(0 {s}) scale(1 -1)", f"translate({s} {s}) scale(-1 -1)"):
        draw(tf)


def scroll(f, tf, pts, w, colour, hi):
    f.line(pts, INK, w + 2.6, .9, tf)
    f.line(pts, colour, w, 1, tf)
    f.line(pts, hi, max(1, w * .35), .9, tf)


# ------------------------------------------------------------------ frames

def band():
    """The HUD header and nav bar: a brass rail with an engraved diamond channel and square riveted corners."""
    c, t = 60, 96
    f = Frame("frame_band", 2 * c + t)
    at = f.bars([(3, "ink"), (4, "lit"), (1.5, "ink"), (9, "sunk"), (1.5, "ink"), (3, "lit"), (2, "ink")])
    f.edge_line(4, HI, 1.6, .9)
    f.inner_shadow(at, 22, .62)
    motif(f, c, t, 13, 24, "diamond", 3.4)

    def plate(tf):
        d = "M2 2H50L54 12L46 20H34C26 20 20 26 20 34V46L12 54L2 50z"
        f.shape(d, f.lin(BRASS, 0, 0, 50, 50), INK, 2.6, False, tf)
        f.line("M6 45V6H45", "#fffbe2", 1.8, .9, tf)
        f.line("M12 48L17 43V33C17 24 24 17 33 17H43L48 12", "#5e3b14", 1.6, .9, tf)
        scroll(f, tf, "M10 38C10 22 22 10 38 10", 2.4, "#7a5220", "#fff0c0")
        f.rivet(14, 14, 6.2, GOLD, tf)
        f.rivet(43, 11, 2.8, GOLD, tf)
        f.rivet(11, 43, 2.8, GOLD, tf)

    corner(f, plate)
    f.write()


def sheet():
    """The big cards and the pages: a rope-edged brass frame with scrollwork corner plates."""
    c, t = 138, 96
    f = Frame("frame_sheet", 2 * c + t)
    at = f.bars([(3, "ink"), (5, "lit"), (1.5, "ink"), (10, "sunk"), (1.5, "ink"), (3.5, "lit"), (2, "ink")])
    f.edge_line(4.4, HI, 1.8, .9)
    motif(f, c, t, 14.5, 16, "rope", 4.2)
    f.inner_shadow(at, 34, .68)

    def plate(tf):
        d = "M2 2H128C134 8 132 18 124 22C112 24 108 30 98 30C84 30 80 38 68 36C56 34 46 44 48 56C50 66 40 70 38 80C36 92 30 100 30 108C28 118 24 122 22 128C16 134 8 134 2 128z"
        f.shape("M4 8H128C134 14 132 22 124 26C112 28 108 34 98 34C86 34 80 42 70 40C60 40 50 48 52 58C52 68 44 72 42 82C40 94 34 102 34 110C32 120 28 126 24 130C18 136 10 136 4 130z", "#000000", "", 0, False, tf)
        f.shape(d, f.lin(BRASS, 4, 0, 90, 100), INK, 3, False, tf)
        f.line("M7 124V7H124", "#fffbe2", 2.2, .95, tf)
        f.line("M122 17C110 20 106 25 96 25C84 25 78 33 68 31C54 29 42 42 43 56C44 64 35 69 33 79C31 90 25 98 25 108C23 116 20 119 18 123", "#4f3210", 2, .85, tf)
        # Engraved leaves and curls.
        scroll(f, tf, "M20 112C12 70 20 30 62 20C88 14 104 12 118 12", 3, "#6b4418", "#ffeebd")
        scroll(f, tf, "M30 52C36 40 48 34 58 34C50 26 34 30 28 42C24 52 30 60 36 54C38 50 36 46 33 48", 2.2, "#6b4418", "#ffeebd")
        for x, y, a in ((78, 24, 8), (94, 20, 6), (108, 17, 4), (24, 78, 82), (20, 94, 84), (17, 108, 86)):
            t2 = f"{tf} translate({x} {y}) rotate({a})"
            f.shape("M-9 0C-4 -7 5 -7 10 0C5 5 -4 5 -9 0z", f.lin(GOLD[:3], -8, -5, 8, 5), LINE, 1.2, False, t2)
            f.line("M-6 0H7", "#7a4710", 1, .8, t2)
        # A jewel of wax red with a beaded collar at the corner, rivets at the tips.
        for i in range(14):
            x, y = pol(26, 26, 15.5, i * 360 / 14)
            f.shape(circ(x, y, 2.5), f.rad(GOLD, x - .8, y - .9, 3.6), LINE, .9, False, tf)
        f.shape(circ(26, 26, 12.5), f.lin([BRASS[3], BRASS[1]], 16, 16, 36, 36), INK, 2, False, tf)
        f.shape(circ(26, 26, 9), f.rad(TEAL, 23, 22, 14), INK, 1.6, False, tf)
        f.line("M20 24A7 7 0 0 1 26 18.6", "#e8fbf8", 2, .8, tf)
        f.rivet(119, 10, 3.6, GOLD, tf)
        f.rivet(10, 119, 3.6, GOLD, tf)

    corner(f, plate)
    f.write()


def card():
    """A leather patch: a dark rim, a brass hairline, a row of stitches and small brass corner guards."""
    c, t = 48, 48
    f = Frame("frame_card", 2 * c + t)
    at = f.bars([(2.5, "ink"), (2.5, "low"), (2, "ink")])
    f.edge_line(3, HI, .9, .7)
    f.inner_shadow(at, 16, .5)
    motif(f, c, t, 14, 16, "stitch", 2.6)

    def guard(tf):
        f.shape("M1 1H38C40 8 34 14 28 14C18 14 14 18 14 28C14 34 8 40 1 38z", f.lin(BRASS, 0, 0, 34, 34), INK, 2.2, False, tf)
        f.line("M4.5 34V4.5H34", "#fffbe2", 1.5, .9, tf)
        f.line("M10 34C11 20 20 11 34 10", "#5e3b14", 1.3, .85, tf)
        f.rivet(10.5, 10.5, 4, GOLD, tf)

    corner(f, guard)
    f.write()


def plate(name, gold_rim=False):
    """A small brass-rimmed plaque: the player chip, the pills, title bars, plates over the painting."""
    c, t = 26, 32
    f = Frame(name, 2 * c + t)
    rim = [(2.5, "ink"), (5.5, "lit"), (2, "ink")] if gold_rim else [(2.5, "ink"), (4, "lit"), (2, "ink")]
    at = f.bars(rim)
    f.edge_line(3.6, HI, 1.3, .9)
    f.inner_shadow(at, 12, .6)
    if gold_rim:
        f.edge_line(5.4, ("#fff6c8",) * 4, 2.2, .95)
        motif(f, c, t, at + 4.6, 8, "bead", 1.5)

    def notch(tf):
        f.shape("M1.5 1.5H24C24 13 13 24 1.5 24z", f.lin(GOLD if gold_rim else BRASS, 0, 0, 22, 22), INK, 2, False, tf)
        f.line("M4.6 19V4.6H19", "#fffbe2", 1.3, .9, tf)
        f.rivet(9.4, 9.4, 3.7, GOLD, tf)

    corner(f, notch)
    f.write()


def button():
    """A bronze button: a raised double bevel with a beaded groove and cut corners."""
    c, t = 30, 32
    f = Frame("frame_button", 2 * c + t)
    at = f.bars([(2.5, "ink"), (5, "lit"), (2, "ink"), (2.5, "low"), (1.5, "ink")])
    f.edge_line(4, HI, 1.6, .95)
    f.edge_line(10.6, HI, .9, .6)
    f.inner_shadow(at, 12, .5)

    def cut(tf):
        f.shape("M1.5 1.5H28L24 10C16 12 12 16 10 24L1.5 28z", f.lin(BRASS, 0, 0, 26, 26), INK, 2, False, tf)
        f.line("M4.8 22V4.8H22", "#fffbe2", 1.4, .95, tf)
        f.line("M9 22C11 15 15 11 22 9", "#5e3b14", 1.2, .85, tf)
        f.rivet(8.8, 8.8, 3.4, GOLD, tf)

    corner(f, cut)
    f.write()


def gold_button():
    """The one main button's frame, over hammered gold: a dark bronze rim, an engraved inner line and leaf corners."""
    c, t = 44, 48
    f = Frame("frame_gold", 2 * c + t)
    at = f.bars([(3, "ink"), (5, "low"), (2, "ink")])
    f.edge_line(4.4, HI, 1.5, .9)
    s = f.w
    # A pillow bevel over the gold: lit above, shaded below.
    for k, (col, a) in enumerate((("#fffdf0", .75), ("#7a4a08", .22), ("#6b3f04", .5), ("#7a4a08", .22))):
        g = f.alpha(col, 0, at, 0, at + 15, a, 0)
        f.fill(poly([(at, at), (s - at, at), (s - at - 15, at + 15), (at + 15, at + 15)]), g, 1, f.side(k))
    f.edge_line(20, ("#8a5a14",) * 4, 1.8, .8)
    f.edge_line(22, ("#fff8d6",) * 4, 1.2, .8)
    motif(f, c, t, 20.5, 48, "diamond", 3)

    def leaf(tf):
        f.shape("M2 2H40C38 10 32 12 26 16C20 18 18 20 16 26C12 32 10 38 2 40z", f.lin(BRASS, 0, 0, 38, 38), INK, 2.4, False, tf)
        f.line("M5.5 34V5.5H34", "#fffbe2", 1.7, .95, tf)
        scroll(f, tf, "M10 32C11 20 20 11 32 10", 1.8, "#6b4418", "#ffeebd")
        f.rivet(12, 12, 5, WAX, tf)

    corner(f, leaf)
    f.write()


def inset():
    """A recess: text fields, progress tracks, portraits."""
    c, t = 22, 32
    f = Frame("frame_inset", 2 * c + t)
    at = f.bars([(1.5, "ink"), (2.5, "low"), (2, "ink")])
    f.edge_line(2.6, HI, .9, .8)
    f.inner_shadow(at, 15, .85)

    def tick(tf):
        f.shape("M1 1H17L1 17z", f.lin(BRASS, 0, 0, 14, 14), INK, 1.6, False, tf)
        f.fill(circ(5.6, 5.6, 1.9), "#fffbe2", .95, tf)

    corner(f, tick)
    f.write()


def portrait():
    """A picture frame, drawn over the picture's edge."""
    c, t = 34, 32
    f = Frame("frame_portrait", 2 * c + t)
    at = f.bars([(2.5, "ink"), (4.5, "lit"), (1.5, "ink"), (3, "sunk"), (1.5, "ink"), (2, "lit"), (1.5, "ink")])
    f.edge_line(3.8, HI, 1.4, .95)
    f.inner_shadow(at, 10, .55)
    motif(f, c, t, 10, 8, "bead", 1.5)

    def cap(tf):
        f.shape("M1.5 1.5H30L26 14C20 15 15 20 14 26L1.5 30z", f.lin(BRASS, 0, 0, 28, 28), INK, 2, False, tf)
        f.line("M5 24V5H24", "#fffbe2", 1.5, .95, tf)
        f.rivet(11, 11, 4.6, TEAL, tf)

    corner(f, cap)
    f.write()


def tile(name, on):
    """A troop tile: a stitched leather tag; chosen, a glowing gold rim."""
    c, t = 34, 32
    f = Frame(name, 2 * c + t)
    if on:
        at = f.bars([(2, "ink"), (6, "#f7cf62"), (2, "ink"), (2, "lit"), (1.5, "ink")])
        f.edge_line(3.4, ("#fffbe2",) * 4, 1.8, .95)
        s = f.w
        for k in range(4):
            g = f.alpha("#ffcf5a", 0, at, 0, at + 24, .5, 0)
            f.fill(poly([(at, at), (s - at, at), (s - at - 24, at + 24), (at + 24, at + 24)]), g, 1, f.side(k))
    else:
        at = f.bars([(2, "ink"), (3, "low"), (2, "ink")])
        f.edge_line(2.8, HI, 1, .8)
        f.inner_shadow(at, 14, .6)

    def tip(tf):
        f.shape("M1.5 1.5H24C23 11 17 12 14 14C12 17 11 23 1.5 24z", f.lin(GOLD if on else BRASS, 0, 0, 24, 24), INK, 1.9, False, tf)
        f.line("M4.6 19V4.6H19", "#fffbe2", 1.3, .95, tf)
        f.rivet(9, 9, 3.6, GOLD, tf)

    corner(f, tip)
    f.write()


def pill():
    """A rounded leather chip with its own fill: costs, times, counts (96 x 80, nine-slice 38)."""
    f = Frame("pill", 96, 80)
    f.fill(rect(0, 0, 96, 80, 38), INK)
    f.shape(rect(2, 2, 92, 76, 37), f.lin(["#e9c571", "#a9772f", "#5e3b14"], 0, 2, 0, 78), "", 0, False)
    f.fill(rect(5.5, 5.5, 85, 69, 34), INK)
    f.shape(rect(7, 7, 82, 66, 32), f.lin(["#160d07", "#2a1b10", "#3a2616"], 0, 7, 0, 73), "", 0, False)
    f.line("M40 4H56", "#fffbe2", 1.4, .8)
    for x in (22, 74):
        f.rivet(x, 8, 0.1)
    f.line("M39 70H57", "#b08a52", 1.2, .5)
    f.write()


def cell():
    """A resource cell in the header: a shallow brass-rimmed tray (nine-slice 28)."""
    c, t = 28, 32
    f = Frame("frame_cell", 2 * c + t)
    s = f.w
    f.fill(rect(0, 0, s, s, 24), INK)
    f.shape(rect(1.5, 1.5, s - 3, s - 3, 23), f.lin(["#f0cd7a", "#a9772f", "#5e3b14"], 0, 0, 0, s), "", 0, False)
    f.fill(rect(5, 5, s - 10, s - 10, 20), INK)
    f.shape(rect(6.5, 6.5, s - 13, s - 13, 19), f.lin(["#130b06", "#23160d", "#352215"], 0, 6, 0, s - 6), "", 0, False)
    f.line(f"M28 3.4H{s - 28}", "#fffbe2", 1.5, .85)
    f.write()


def tag():
    """The small rounded plate of a name over the painting (nine-slice 18)."""
    s = 56
    f = Frame("tag", s)
    f.fill(rect(0, 0, s, s, 14), INK)
    f.shape(rect(1.5, 1.5, s - 3, s - 3, 13), f.lin(["#fff0b8", "#c9974a", "#5e3b14"], 0, 0, 0, s), "", 0, False)
    f.fill(rect(4.5, 4.5, s - 9, s - 9, 10.5), INK)
    f.shape(rect(5.5, 5.5, s - 11, s - 11, 10), f.lin(["#180e07", "#2c1c10", "#3b2717"], 0, 5, 0, s - 5), "", 0, False)
    f.line(f"M16 3H{s - 16}", "#fffbe2", 1.2, .85)
    f.write()


def round_face(name, big):
    """A round button: an engraved brass ring round a leather face."""
    s = 384 if big else 256
    f = Frame(name, s)
    cx = s / 2
    k = s / 256
    f.fill(circ(cx, cx, 127 * k), INK)
    f.shape(circ(cx, cx, 123 * k), f.lin(BRASS, cx - 70 * k, 10 * k, cx + 60 * k, s - 8 * k), "", 0, False)
    f.line(circ(cx, cx, 120 * k), "#fff6d0", 2 * k, .55)
    if big:
        # An outer row of beads and a ring of leaves.
        for i in range(60):
            x, y = pol(cx, cx, 115.5 * k, i * 6)
            f.shape(circ(x, y, 4 * k), f.rad(GOLD, x - 1.3 * k, y - 1.5 * k, 6 * k), LINE, 1, False)
        f.line(circ(cx, cx, 109 * k), INK, 2.4 * k)
        for i in range(36):
            tf = f"rotate({i * 10} {cx} {cx})"
            y = cx - 100 * k
            f.shape(f"M{cx - 8 * k:.1f} {y + 4 * k:.1f}C{cx - 5 * k:.1f} {y - 7 * k:.1f} {cx + 5 * k:.1f} {y - 7 * k:.1f} {cx + 8 * k:.1f} {y + 4 * k:.1f}C{cx + 3 * k:.1f} {y + 1 * k:.1f} {cx - 3 * k:.1f} {y + 1 * k:.1f} {cx - 8 * k:.1f} {y + 4 * k:.1f}z", f.lin(GOLD[:3], cx - 6 * k, y - 4 * k, cx + 6 * k, y + 4 * k), LINE, 1, False, tf)
    else:
        for i in range(48):
            tf = f"rotate({i * 7.5} {cx} {cx})"
            f.line(f"M{cx} {cx - 117}V{cx - 109}", "#5e3b14", 2.2, .8, tf)
            f.line(f"M{cx + 1.8} {cx - 117}V{cx - 109}", "#fff3c4", 1.2, .7, tf)
        f.line(circ(cx, cx, 106), INK, 2.4)
        for i in range(8):
            f.rivet(*pol(cx, cx, 98.5, i * 45 + 22.5), 5.6, GOLD)
    r = (91 if big else 91) * k
    f.fill(circ(cx, cx, r + 3 * k), INK)
    f.shape(circ(cx, cx, r), f.lin(["#5e3b14", "#b98538", "#fff0bd"], cx, cx - r, cx, cx + r), "", 0, False)
    f.fill(circ(cx, cx, r - 4.5 * k), INK)
    # The face: dark leather, a pool of light from above, stitches round it.
    f.shape(circ(cx, cx, r - 6 * k), f.rad(["#5a3a22", "#3a2414", "#21140a", "#120a05"], cx, cx - 30 * k, 118 * k), "", 0, False)
    cl = f.clip(circ(cx, cx, r - 6 * k))
    for _ in range(420):
        a, rr = f.rng.uniform(0, 360), math.sqrt(f.rng.random()) * (r - 8 * k)
        x, y = pol(cx, cx, rr, a)
        f.line(f"M{x:.1f} {y:.1f}q{2 * k:.1f} {-2 * k:.1f} {4 * k:.1f} 0", f.rng.choice(["#0c0603", "#7a5434"]), 1.1 * k, .4, "", cl)
    n = 30
    for i in range(n):
        tf = f"rotate({i * 360 / n} {cx} {cx})"
        y = cx - r + 14 * k
        f.line(f"M{cx - 4.6 * k:.1f} {y + 1.2 * k:.1f}H{cx + 4.6 * k:.1f}", "#0a0502", 3.6 * k, .8, tf)
        f.line(f"M{cx - 4.6 * k:.1f} {y:.1f}H{cx + 4.6 * k:.1f}", "#b98d55", 2.2 * k, .95, tf)
    f.fill(circ(cx, cx, r - 6 * k), f.alpha("#000000", cx, cx - r, cx, cx - r + 34 * k, .55, 0))
    f.line(f"M{cx - 84 * k:.1f} {cx - 84 * k:.1f}A{119 * k:.1f} {119 * k:.1f} 0 0 1 {cx + 30 * k:.1f} {cx - 115 * k:.1f}", "#ffffff", 3 * k, .5)
    f.write()


def segment(name, on):
    """A segment or toggle (nine-slice 26): olive enamel when on, dark leather when off."""
    s = 84
    f = Frame(name, s)
    f.fill(rect(0, 0, s, s, 20), INK)
    f.shape(rect(2, 2, s - 4, s - 4, 19), f.lin(["#fff0b8", "#d9a648", "#7a5220"] if on else ["#b98d4e", "#7a5626", "#3f290f"], 0, 0, 0, s), "", 0, False)
    f.fill(rect(6, 6, s - 12, s - 12, 15), INK)
    f.shape(rect(7.5, 7.5, s - 15, s - 15, 14), f.lin(["#6f7d3c", "#525f29", "#3b471b"] if on else ["#160d07", "#24170d", "#332114"], 0, 7, 0, s - 7), "", 0, False)
    if on:
        f.line(f"M24 11H{s - 24}", "#e8efb4", 2, .6)
    f.line(f"M22 4H{s - 22}", "#fffbe2", 1.5, .85 if on else .5)
    f.write()


def progress():
    """The bar's gold fill (nine-slice 8, tiled across): a ribbed gold rod."""
    f = Frame("progress_fill", 48, 32)
    f.shape(rect(0, 0, 48, 32, 4), f.lin(["#fff8d2", "#fbd765", "#d8962a", "#8a5212"], 0, 0, 0, 32), "", 0, False)
    for x in range(4, 48, 8):
        f.line(f"M{x} 28L{x + 5} 4", "#8a5212", 1.6, .45)
        f.line(f"M{x + 2} 28L{x + 7} 4", "#fffbe2", 1.2, .5)
    f.fill(rect(0, 3, 48, 5, 2), "#ffffff", .45)
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
    band(); sheet(); card(); plate("frame_plate"); plate("frame_plate_gold", True); button(); gold_button(); inset(); portrait()
    tile("frame_tile", False); tile("frame_tile_on", True); pill(); cell(); tag(); round_face("round", False); round_face("round_big", True)
    segment("segment", False); segment("segment_on", True); progress(); engraving()
    print(f"{len(list(OUT.glob('*.svg')))} frames, {sum(p.stat().st_size for p in OUT.glob('*.svg')) // 1024} KB")


if __name__ == "__main__":
    main()
