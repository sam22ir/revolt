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


def corner(f, draw):
    """Draws the top-left corner, then its mirror images in the other three (flipped, not rotated, so the light stays above)."""
    s = f.w
    for tf in ("", f"translate({s} 0) scale(-1 1)", f"translate(0 {s}) scale(1 -1)", f"translate({s} {s}) scale(-1 -1)"):
        draw(tf)


# ------------------------------------------------------------------ frames
# Simple on purpose: rough camp poles lashed with rope round the big panels; everything else has the buttons' shape (round corners, a fat
# outline, a lit top edge, a lip along the foot). No gold, no ornament.

POLE = ["#b98a58", "#946539", "#6b4423", "#3d2412"]
ROPE = ["#f0dfb4", "#cdb381", "#94794a", "#5c4726"]


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


def path_round(l, t, rr, b, r):
    r = max(0.0, r)
    return f"M{l + r:.2f} {t:.2f}H{rr - r:.2f}A{r:.2f} {r:.2f} 0 0 1 {rr:.2f} {t + r:.2f}V{b - r:.2f}A{r:.2f} {r:.2f} 0 0 1 {rr - r:.2f} {b:.2f}H{l + r:.2f}A{r:.2f} {r:.2f} 0 0 1 {l:.2f} {b - r:.2f}V{t + r:.2f}A{r:.2f} {r:.2f} 0 0 1 {l + r:.2f} {t:.2f}z"


def shell(f, outer, inner, colour):
    """The space between two rounded boxes (left, top, right, bottom, radius)."""
    f.body.append(f'<path fill-rule="evenodd" d="{path_round(*outer)}{path_round(*inner)}" fill="{colour}"/>')


def panel_frame(name, c, t, radius, rim, lip, colours, ink=3.5, shade=.4):
    """A rounded border in the buttons' shape: a fat outline, a flat rim with a lit top edge, a lip along the foot and a dark inner line.
    `colours` is (rim, lit, lip). Flat colours, so its edges repeat cleanly. The fill under it must stay inside the rim."""
    f = Frame(name, 2 * c + t)
    s = f.w
    face, lit, low = colours
    box = lambda o, foot=0.0: (o, o, s - o, s - o - foot, radius - o)  # noqa: E731
    inner = ink + rim
    shell(f, box(0), box(inner + 2.5, lip), INK)
    shell(f, box(ink), box(inner, lip), low)
    shell(f, box(ink, lip) if lip else box(ink), box(inner, lip), face)
    if lip:
        shell(f, (ink, ink, s - ink, s - ink - lip + 2.2, radius - ink), (ink, ink, s - ink, s - ink - lip, radius - ink), INK)
        f.line(f"M{radius} {s - ink - 2.2}H{s - radius}", lit, 1.2, .3)
    o = ink + 1.5
    f.line(f"M{o} {radius + 4}V{radius}A{radius - o} {radius - o} 0 0 1 {radius} {o}H{s - radius}A{radius - o} {radius - o} 0 0 1 {s - o} {radius}V{radius + 4}", lit, 2.4, .85)
    at = inner + 2.5
    for k, a in ((0, shade), (1, shade * .35), (3, shade * .35)):
        g = f.alpha("#000000", 0, at, 0, at + 15, a, 0)
        f.fill(poly([(at + 4, at), (s - at - 4, at), (s - at - 15, at + 15), (at + 15, at + 15)]), g, 1, f.side(k))
    return f


def band():
    """The HUD header and nav bar: a wooden rim with a lip."""
    c, t = 40, 96
    f = panel_frame("frame_band", c, t, 16, 9, 9, ("#7a5836", "#c69a66", "#24160c"), shade=.5)
    f.fill(rect(c, 5, t, 1.6), "#ffe6bf", .18)
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
    """A section: a soft wooden edge and a lip."""
    c, t = 48, 48
    f = panel_frame("frame_card", c, t, 24, 6, 7, ("#6b4a2e", "#b58a5a", "#1f130a"))
    f.write()


def plate(name, warm=False):
    """A small plaque; `warm` has an amber rim, for one that invites a tap."""
    c, t = 26, 32
    colours = ("#c4892f", "#ffe2a4", "#5a380d") if warm else ("#6b4a2e", "#b58a5a", "#1f130a")
    panel_frame(name, c, t, 18, 5, 5, colours, 3, .45).write()


def paper():
    """A sheet of paper: a pale wooden edge and a lip."""
    c, t = 34, 48
    f = panel_frame("frame_paper", c, t, 22, 6, 8, ("#9a7444", "#f0d9a8", "#3d2712"), shade=.18)
    f.write()


def inset():
    """A recess: text fields and progress tracks. Lit along its foot, as a hole is."""
    c, t = 22, 32
    f = panel_frame("frame_inset", c, t, 16, 2.5, 0, ("#4c3320", "#2a1a0d", "#1f130a"), 3, .8)
    s = f.w
    f.line(f"M16 {s - 4.4}H{s - 16}", "#b58a5a", 1.8, .55)
    f.write()


def portrait():
    """A picture frame, drawn over the picture's edge."""
    c, t = 34, 32
    f = panel_frame("frame_portrait", c, t, 20, 7, 5, ("#7a5836", "#c69a66", "#24160c"), shade=.45)
    f.write()


def tile(name, on):
    """A troop tile; chosen, an amber rim and a warm light inside."""
    c, t = 34, 32
    if on:
        f = panel_frame(name, c, t, 22, 7, 7, ("#c4892f", "#ffe9b4", "#5a380d"), shade=.1)
        s = f.w
        for k in (0, 1, 3):
            g = f.alpha("#ffd98a", 0, 13, 0, 38, .34, 0)
            f.fill(poly([(17, 13), (s - 17, 13), (s - 34, 34), (34, 34)]), g, 1, f.side(k))
    else:
        f = panel_frame(name, c, t, 22, 5, 7, ("#6b4a2e", "#b58a5a", "#1f130a"))
    f.write()


def rounded(name, w, h, r, rim, fill, lip=5):
    """A rounded piece with its own fill, in the buttons' shape: outline, rim, lip and a sunk dark face."""
    f = Frame(name, w, h)
    face, lit, low = rim
    f.fill(rect(0, 0, w, h, r), INK)
    f.shape(rect(3, 3, w - 6, h - 6, r - 3), low, "", 0, False)
    f.fill(rect(3, 3, w - 6, h - 6 - lip, r - 3), INK)
    f.shape(rect(3, 3, w - 6, h - 7.5 - lip, r - 3), face, "", 0, False)
    f.line(f"M4.4 {r}A{r - 4.4:.1f} {r - 4.4:.1f} 0 0 1 {r} 4.4H{w - r}A{r - 4.4:.1f} {r - 4.4:.1f} 0 0 1 {w - 4.4} {r}", lit, 1.8, .8)
    f.fill(rect(6.5, 6.5, w - 13, h - 14.5 - lip, r - 6), INK)
    f.shape(rect(8, 8, w - 16, h - 17.5 - lip, r - 7.5), f.lin(fill, 0, 8, 0, h - lip - 9), "", 0, False)
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


def main():
    for old in OUT.glob("*.svg"):
        old.unlink()
    band(); sheet(); card(); plate("frame_plate"); plate("frame_plate_warm", True); paper(); inset(); portrait()
    tile("frame_tile", False); tile("frame_tile_on", True)
    dark = ["#150c06", "#241810", "#302015"]
    rim = ("#6b4a2e", "#b58a5a", "#1f130a")
    rounded("pill", 96, 84, 38, rim, dark)
    rounded("frame_cell", 88, 88, 22, rim, dark, 4)
    rounded("tag", 64, 60, 17, rim, dark, 4)
    for kind in KINDS:
        for down in (False, True):
            button(kind, down)
    for down in (False, True):
        round_button("round", "wood", down)
        round_button("round_big", "green", down, 384)
        round_button("round_red", "red", down)
    progress()
    print(f"{len(list(OUT.glob('*.svg')))} pieces, {sum(p.stat().st_size for p in OUT.glob('*.svg')) // 1024} KB")


if __name__ == "__main__":
    main()
