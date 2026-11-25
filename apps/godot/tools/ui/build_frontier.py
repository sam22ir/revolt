#!/usr/bin/env python3
"""Draws the map's frontier (art/frontier/*.svg): the iron fence (repeats along x) and the watchtower, in the icons' style.

Run: python3 apps/godot/tools/ui/build_frontier.py, then `godot --headless --import`. Scenery only: no flags, signs, text or emblems.
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "icons"))
from build_icons import INK, IRON, LINE, STEEL, TERRA, WHITE, WOOD, DARKWOOD, Icon, circ, ell, poly, rect  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "art" / "frontier"
RUST = ["#b8794a", "#8f5430", "#63351c", "#3c1f10"]


def write(ic, w, h):
    back = f'<g fill="{INK}" stroke="{INK}" stroke-linejoin="round" stroke-linecap="round">{"".join(ic.backs)}</g>'
    (OUT / f"{ic.name}.svg").write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{"".join(ic.defs)}</defs>{back}{"".join(ic.body)}</svg>\n')


def fence():
    ic = Icon("fence")
    w, h = 512, 320
    # Wire mesh, then three barbed strands.
    for k in range(-8, 34):
        x = k * 16
        ic.line(f"M{x} 84L{x + 104} 188", "#2a2723", 2.4, .8)
        ic.line(f"M{x + 104} 84L{x} 188", "#2a2723", 2.4, .8)
        ic.line(f"M{x} 82L{x + 104} 186", "#a39d90", .9, .7)
    for y in (84, 118, 152):
        ic.line(f"M0 {y}Q64 {y + 7} 128 {y}T256 {y}T384 {y}T512 {y}", INK, 5.5)
        ic.line(f"M0 {y - 1}Q64 {y + 6} 128 {y - 1}T256 {y - 1}T384 {y - 1}T512 {y - 1}", "#b7b2a6", 2)
        for k in range(16):
            x = k * 32 + 16
            ic.line(f"M{x - 6} {y - 3}l12 13M{x + 6} {y - 4}l-11 14", INK, 4)
            ic.line(f"M{x - 5} {y - 3}l10 11M{x + 5} {y - 4}l-9 12", "#d6d1c4", 1.5)
    # Sheet-iron panels, corrugated and rust-streaked.
    ic.fill(rect(0, 182, w, 128), INK)
    for k in range(32):
        x = k * 16
        c = ["#7d776c", "#5d574d", "#403b34"] if (k // 8) % 2 else ["#74695a", "#574c3f", "#3b332a"]
        ic.shape(rect(x, 190, 16, 108), ic.lin([c[2], c[0], c[1], c[2]], x, 0, x + 16, 0), "", 0, False)
        ic.line(f"M{x + 5} 194V294", "#c9c2b2", 1.6, .45)
    for k in range(46):
        x = (k * 37 + ic.rng.uniform(0, 20)) % w
        y = ic.rng.choice([192, 192, 226, 252])
        l = ic.rng.uniform(12, 46)
        ic.fill(f"M{x - 4:.1f} {y}H{x + 4:.1f}L{x + 1:.1f} {y + l:.1f}z", RUST[ic.rng.randrange(0, 3)], .6)
    for k in range(26):
        x, y, r = ic.rng.uniform(8, w - 8), ic.rng.uniform(200, 292), ic.rng.uniform(3, 8)
        ic.fill(ell(x, y, r, r * .7), RUST[ic.rng.randrange(1, 4)], .5)
    # Rails.
    for y in (180, 292):
        ic.fill(rect(0, y - 3, w, 22), INK)
        ic.shape(rect(0, y, w, 16), ic.lin(["#a7a296", "#6d685f", "#3a3731"], 0, y, 0, y + 16), "", 0, False)
        ic.line(f"M0 {y + 2}H{w}", "#e2ddcf", 1.8, .7)
        for k in range(16):
            ic.rivet(k * 32 + 16, y + 8, 4, IRON)
    # Concertina along the top, drawn behind the posts' arms.
    for k in range(-1, 17):
        x = k * 32 + 16
        ic.line(ell(x, 44, 27, 30), INK, 6)
    for k in range(-1, 17):
        x = k * 32 + 16
        ic.line(ell(x, 44, 27, 30), "#9d978a", 2.4)
        ic.line(f"M{x - 25} 36A27 30 0 0 1 {x + 4} 15", "#efeadd", 1.4, .8)
        for a in (20, 80, 140, 200, 260, 320):
            px, py = x + 27 * math.cos(math.radians(a)), 44 + 30 * math.sin(math.radians(a))
            ic.line(f"M{px - 4:.1f} {py - 4:.1f}l8 8M{px + 4:.1f} {py - 4:.1f}l-8 8", INK, 3)
            ic.line(f"M{px - 3:.1f} {py - 3:.1f}l6 6", "#e6e1d3", 1.1)
    # I-beam posts with cranked arms and concrete feet.
    for x in (64, 192, 320, 448):
        for s in (-1, 1):
            ic.line(f"M{x} 92L{x + s * 30} 30", INK, 14)
            ic.line(f"M{x} 92L{x + s * 30} 30", "#6a655c", 7.5)
            ic.line(f"M{x - 2} 90L{x + s * 30 - 2} 30", "#c2bcae", 1.8, .8)
        ic.fill(rect(x - 15, 66, 30, 250, 3), INK)
        ic.shape(rect(x - 11, 70, 22, 244), ic.lin(["#3a3731", "#a7a296", "#6d685f", "#8c867a", "#35322c"], x - 11, 0, x + 11, 0), "", 0, False)
        ic.line(f"M{x - 4} 72V312M{x + 5} 72V312", "#2a2722", 2, .9)
        for y in (84, 120, 156, 206, 244, 278):
            ic.rivet(x, y, 4.2, RUST if y % 3 else IRON)
        ic.fill(f"M{x - 11} 214H{x + 11}L{x + 5} 262L{x - 3} 244z", RUST[1], .45)
        ic.fill(f"M{x - 26} 320L{x - 20} 300H{x + 20}L{x + 26} 320z", INK)
        ic.shape(f"M{x - 22} 320L{x - 17} 304H{x + 17}L{x + 22} 320z", ic.lin(["#cfc6b2", "#948a75"], 0, 304, 0, 320), "", 0, False)
    write(ic, w, h)


def tower():
    ic = Icon("tower")
    w, h = 240, 440
    # Lattice legs.
    for a, b in (((62, 190), (28, 428)), ((178, 190), (212, 428)), ((96, 190), (78, 418)), ((144, 190), (162, 418))):
        ic.line(f"M{a[0]} {a[1]}L{b[0]} {b[1]}", "#6a655c", 11, 1, "", None, True, 9)
        ic.line(f"M{a[0] - 3} {a[1]}L{b[0] - 3} {b[1]}", "#c2bcae", 2.2, .8)
    for y0, y1 in ((200, 268), (268, 340), (340, 412)):
        l0, r0 = 62 - (y0 - 190) * .143, 178 + (y0 - 190) * .143
        l1, r1 = 62 - (y1 - 190) * .143, 178 + (y1 - 190) * .143
        ic.line(f"M{l0:.0f} {y0}L{r1:.0f} {y1}M{r0:.0f} {y0}L{l1:.0f} {y1}", "#57524a", 5.5, 1, "", None, True, 7)
        ic.line(f"M{l1:.0f} {y1}H{r1:.0f}", "#7b756a", 7, 1, "", None, True, 7)
        for x in (l1, r1):
            ic.rivet(x, y1, 5, RUST)
    # Ladder.
    ic.line("M108 196V424M132 196V424", "#8a5f36", 5, 1, "", None, True, 6)
    for y in range(206, 424, 15):
        ic.line(f"M108 {y}H132", "#b98a55", 4)
    # Platform and plank cabin with a slit.
    ic.shape(rect(26, 178, 188, 18, 3), ic.lin(WOOD, 0, 178, 0, 196), LINE, 2.5)
    cabin = rect(44, 92, 152, 88)
    ic.shape(cabin, ic.lin(WOOD, 44, 92, 196, 180), LINE, 3)
    c = ic.clip(cabin)
    for k in range(10):
        x = 44 + k * 15.2
        ic.line(f"M{x:.1f} 92V180", "#2b1508", 2.4, .9, "", c)
    ic.grain(46, 94, 194, 178, 60, "#4a2812", .5, c, "", 2, False)
    ic.shape(rect(60, 106, 120, 34, 2), "#0f0905", LINE, 3, False)
    ic.fill(rect(64, 110, 112, 26), "#241a10")
    ic.line("M60 143H180", "#e3b987", 3, .7)
    for x in (100, 140):
        ic.line(f"M{x} 106V140", "#6b4423", 5)
    # Sandbags on the platform.
    for x in range(34, 206, 24):
        ic.shape(rect(x, 162, 26, 18, 8), ic.lin(["#d9c496", "#a58a58", "#6f5a35"], 0, 162, 0, 180), LINE, 2)
        ic.line(f"M{x + 5} 166Q{x + 13} 163 {x + 21} 167", "#f4e6c2", 1.6, .8)
    # Corrugated roof.
    ic.shape("M22 94L58 44H182L218 94z", ic.lin(["#8c867a", "#5d574d", "#3a362f"], 0, 44, 0, 94), LINE, 3)
    for k in range(12):
        x0, x1 = 60 + k * 11, 26 + k * 17.2
        ic.line(f"M{x0:.0f} 46L{x1:.0f} 92", "#2e2b26", 2.4, .8)
        ic.line(f"M{x0 + 3:.0f} 46L{x1 + 4:.0f} 92", "#c9c2b2", 1.4, .5)
    for x, y, r in ((80, 76, 9), (150, 66, 8), (190, 84, 7), (112, 58, 6)):
        ic.fill(ell(x, y, r, r * .6), RUST[1], .6)
    ic.shape(rect(52, 36, 136, 12, 4), ic.lin(IRON, 0, 36, 0, 48), INK, 2.5)
    # Searchlight.
    ic.shape(rect(112, 14, 10, 24), ic.lin(IRON, 112, 0, 122, 0), INK, 2)
    ic.shape("M98 2H140L148 10V26L140 34H98z", ic.lin(STEEL, 98, 2, 98, 34), INK, 2.5)
    ic.shape(ell(98, 18, 9, 17), ic.rad(["#fffbe0", "#ffe9a0", "#c9962f"], 95, 14, 18), INK, 2.2)
    # Concrete feet.
    for x in (24, 76, 164, 216):
        ic.shape(rect(x - 14, 420, 28, 18, 3), ic.lin(["#cfc6b2", "#948a75"], 0, 420, 0, 438), LINE, 2.5)
    write(ic, w, h)


if __name__ == "__main__":
    fence()
    tower()
