"""The eight buildings, each in four looks, and the scaffolding shown while one is upgraded. The looks are listed in
docs/camp-3d-plan.md. A house stands in its own frame: front corner at the origin, one face along -X ("front", lit), the other
along +Y ("right")."""

import math

from mathutils import Matrix, Vector

import camp_kit as ck
import camp_terrain as land

# The front corner on the painting (px), the ground it stands on and its turn in degrees.
PLACES = {
    "hq": ((695, 380), land.HQ, -10),
    "barracks": ((412, 970), land.YARD, 5),
    "armory": ((1190, 985), land.YARD, 3),
    "hero_hall": ((250, 1590), land.ROAD, 0),
    "treasury": ((1350, 1735), land.FARM, 0),
    "farm": ((1093, 1985), land.FARM, 3),
    # The lookout terrace's tower (it was part of the ground until the watchtower became a building).
    "watchtower": ((1440, 545), land.MID, 0),
    # Open ground on the farm terrace, between the farm and the walled field.
    "infirmary": ((820, 2194), land.FARM, 4),
    # The middle of the barracks yard: where the lessons villages teach are studied.
    "academy": ((930, 1190), land.YARD, 2),
}
# How big the scaffolding round each is: along the front, along the right, height.
SCAFFOLD = {"hq": (190, 240, 150), "barracks": (185, 245, 140), "armory": (190, 195, 140), "hero_hall": (240, 355, 190), "treasury": (115, 190, 160),
            "farm": (240, 285, 165), "watchtower": (110, 110, 250), "infirmary": (160, 140, 120), "academy": (110, 90, 115)}


def frame(name):
    (x, y), z, turn = PLACES[name]
    p = ck.Kit(1).ground(x, y, z)
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(turn), 4, "Z")


def kit(name, look):
    k = ck.Kit(sum(map(ord, name)) * 10 + look, ck.BODY)
    k.frame = frame(name)
    BUILD[name](k, look)
    return k


def scaffold(name):
    k = ck.Kit(sum(map(ord, name)), ck.SCAFFOLD)
    k.frame = frame(name)
    w, l, h = SCAFFOLD[name]
    out = 26.0
    run = [(-w - 10, -out), (out, -out), (out, l + 10)]
    pole = ck.rgb("8f6b49")
    for (ax, ay), (bx, by) in zip(run, run[1:]):
        a, b = Vector((ax, ay, 0)), Vector((bx, by, 0))
        n = max(2, round((b - a).length / 62))
        side = (b - a).normalized().cross(Vector((0, 0, 1)))
        for i in range(n + 1):
            p = a.lerp(b, i / n)
            k.rod(p, p + Vector((k.rng.uniform(-2, 2), k.rng.uniform(-2, 2), h + k.rng.uniform(4, 26))), 3.0, 2.6, k.shade(pole, 0.12))
        for z in (h * 0.36, h * 0.72):
            k.rod(a + Vector((0, 0, z)), b + Vector((0, 0, z)), 2.4, 2.4, k.shade(pole, 0.12))
            m = max(2, n - 1)
            for i in range(n):
                if k.rng.random() < 0.82:
                    p, q = a.lerp(b, i / n), a.lerp(b, (i + 1) / n)
                    s = side * 14
                    k.prism([(v.x, v.y) for v in (p + s, q + s, q - s * 0.3, p - s * 0.3)], z + 2, z + 6, k.shade(ck.rgb("a17c55"), 0.1), None, 0.8)
        for i in range(0, n, 2):
            p, q = a.lerp(b, i / n), a.lerp(b, (i + 1) / n)
            k.rod(p + Vector((0, 0, 6)), q + Vector((0, 0, h * 0.7)), 2.2, 2.0, k.shade(pole, 0.12))
    k.rod((out + 14, l * 0.4, 0), (out + 2, l * 0.4 + 6, h * 0.74), 2.2, 2.2, pole)
    k.rod((out + 14, l * 0.4 + 18, 0), (out + 2, l * 0.4 + 22, h * 0.74), 2.2, 2.2, pole)
    for i in range(8):
        f = (i + 1) / 9
        k.rod((out + 14 - 12 * f, l * 0.4 + 6 * f, h * 0.74 * f), (out + 14 - 12 * f, l * 0.4 + 18 + 4 * f, h * 0.74 * f), 1.6, 1.6, pole)
    for i in range(5):
        k.stone((out + 34 + k.rng.uniform(-10, 10), l * 0.72 + k.rng.uniform(-24, 24), 8 + (i // 3) * 12), (24, 18, 14), k.rng.uniform(0, 90), ck.QUOIN)
    return k


# Shared pieces.


def awning(k, a, b, wall_b, wall_a, sag=9, peak=0, ropes=True, **cloth):
    """Canvas from two posts a and b (tops) to two points on a wall."""
    for p, q in ((a, (-14, -30)), (b, (14, -30))):
        k.rod((p[0], p[1], 0), (p[0], p[1], p[2] + 4), 3.2, 2.7)
        if ropes:
            k.rod(p, (p[0] + q[0], p[1] + q[1], 0), 0.8, 0.8, ck.DARK, ck.THIN, sides=5)
    k.canvas([a, b, wall_b, wall_a], sag=sag, peak=peak, **cloth)


def leanto(k, d, y0, y1, front, back, torn=True):
    """A timber porch with a canvas roof along the right wall."""
    n = max(2, round((y1 - y0) / 70))
    for i in range(n + 1):
        y = y0 + (y1 - y0) * i / n
        k.rod((d, y, 0), (d, y, front), 4.0, 3.6)
        k.rod((d, y, front), (0, y, back), 2.8, 2.8)
    k.rod((d, y0 - 6, front), (d, y1 + 6, front), 3.4, 3.4)
    for i in range(n):
        a, b = y0 + (y1 - y0) * i / n, y0 + (y1 - y0) * (i + 1) / n
        k.canvas([(d + 8, a - 3, front - 2), (d + 8, b + 3, front - 2), (1, b + 3, back + 3), (1, a - 3, back + 3)], sag=7)


def hang(k, d, y0, y1, top, low):
    """A curtain of canvas."""
    k.canvas([(d, y0, low), (d, y1, low), (d, y1, top), (d, y0, top)], sag=0, n=16)


def lookout(k, at, w, h, roof="canvas"):
    """A plain square lookout: plastered, quoins, an open top with a low wall, shaded by canvas or a timber roof."""
    keep = k.frame
    k.frame = k.frame @ Matrix.Translation(at)
    k.box(-w, 0, 0, w, 0, h, ck.PLASTER, None, 0.8)
    for x, y in ((0.0, 0.0), (0.0, w), (-w, 0.0)):
        k.quoins(x, y, h)
    k.box(-w - 5, 5, -5, w + 5, h, h + 7, ck.QUOIN, None, 0.8)
    for x0, x1, y0, y1 in ((-w - 3, 3, -3, 5), (-5, 3, -3, w + 3), (-w - 3, 3, w - 5, w + 3), (-w - 3, -w + 5, -3, w + 3)):
        k.box(x0, x1, y0, y1, h + 7, h + 26, ck.PLASTER, None, 0.8)
    k.window("right", w * 0.5, h - 62, 20, 32)
    k.window("front", -w * 0.5, h - 62, 20, 32)
    for x, y in ((-w + 6, 6), (-6, 6), (-w + 6, w - 6), (-6, w - 6)):
        k.rod((x, y, h), (x, y, h + 74), 3.2, 2.8)
    if roof == "canvas":
        k.canvas([(-w - 8, -8, h + 74), (8, -8, h + 74), (8, w + 8, h + 74), (-w - 8, w + 8, h + 74)], sag=3, peak=20)
    else:
        e = 10.0
        top = (-w / 2, w / 2, h + 110)
        for a, b in (((-w - e, -e), (e, -e)), ((e, -e), (e, w + e)), ((e, w + e), (-w - e, w + e)), ((-w - e, w + e), (-w - e, -e))):
            for i in range(6):
                p = [a[j] + (b[j] - a[j]) * i / 6 for j in (0, 1)]
                q = [a[j] + (b[j] - a[j]) * (i + 1) / 6 for j in (0, 1)]
                k.mesh([(p[0], p[1], h + 70), (q[0], q[1], h + 70), top], [[0, 1, 2]], k.shade(ck.rgb("84644a"), 0.1), None, 0.8)
    k.frame = keep


def flat_block(k, w, l, h, deck=True, col=None, course=15.0):
    """A dressed-stone store with a parapet round a plank deck."""
    col = col or ck.rgb("b3a795")
    k.box(-w, 0, 0, l, 0, h, col, None, 0.8)
    rows = int(h / course)
    for r in range(rows):
        for face, span in (("right", l), ("front", w)):
            d = -k.rng.uniform(0, 30)
            while d < span:
                s = k.rng.uniform(24, 44)
                a, b = max(d, 0), min(d + s - 1.2, span)
                if b - a > 5:
                    z0, z1 = r * h / rows, (r + 1) * h / rows - 1.2
                    out = k.rng.uniform(0.6, 2.0)
                    c = k.shade(col, 0.09)
                    if face == "right":
                        k.box(-1, out, a, b, z0, z1, c, None, 0.9)
                    else:
                        k.box(-b, -a, -out, 1, z0, z1, c, None, 0.9)
                d += s
    t = 13.0
    for x0, x1, y0, y1 in ((-w - 2, 2, -2, t), (-t, 2, t, l + 2), (-w - 2, -t, l - t, l + 2), (-w - 2, -w + t, t, l - t)):
        k.box(x0, x1, y0, y1, h, h + 13, k.shade(col, 0.05), None, 0.9)
    if deck:
        n = int(w / 15)
        for i in range(n):
            x = -w + t + (w - 2 * t) * i / n
            k.box(x, x + (w - 2 * t) / n - 1, t, l - t, h - 2, h + 2, k.shade(ck.rgb("87664a"), 0.1), None, 0.8)


def grille(k, face, at, z, w=44.0, h=48.0):
    k.window(face, at, z, w, h)


def plank_door(k, face, at, w, h, col=None):
    col = col or ck.WOOD
    if face == "right":
        k.door(at, w, h)
        return
    k.box(at - w / 2, at + w / 2, -1.5, 1, 0, h, ck.DARK, None, 0.4)
    for i in range(4):
        a = at - w / 2 + w * i / 4
        k.box(a + 0.4, a + w / 4 - 0.4, -3, 0, 2, h - 2, k.shade(col, 0.1), None, 0.8)
    for a in (at - w / 2 - 5, at + w / 2):
        k.box(a, a + 5, -5, 1, 0, h + 4, k.shade(ck.WOOD, 0.08), None, 0.8)
    k.box(at - w / 2 - 7, at + w / 2 + 7, -5.5, 1, h, h + 7, k.shade(ck.WOOD, 0.08), None, 0.8)


def jar(k, at, r=9.0):
    c = k.shade(ck.rgb("a5583c"), 0.1)
    k.lathe(at, [(r * .5, 0, None), (r, r * .9, c), (r * .95, r * 1.4, c), (r * .5, r * 2.0, c), (r * .62, r * 2.3, c), (0.1, r * 2.2, ck.DARK)], c)


def sack_pile(k, at, n=5):
    for i in range(n):
        k.stone((at[0] + k.rng.uniform(-16, 16), at[1] + k.rng.uniform(-14, 14), at[2] + 8 + (i // 3) * 13), (26, 19, 17), k.rng.uniform(0, 180), ck.SACK, round_=1.0, tex=0.4)


def shed_roof(k, x0, x1, y0, y1, low, high):
    """A single tiled slope falling to the right, over x0..x1."""
    k.tiled_slope((x1, y0 - 8, low), (x1, y1 + 8, low), (x0, y0 - 8, high), 12, 17.0)


def hip_roof(k, w, l, h, rise, eave=14.0, tile=17.0):
    """A tiled roof with sloping ends, over a w x l plan (slopes seen: right and front)."""
    k.tiled_slope((0, -eave, h), (0, l + eave, h), (-w / 2, -eave, h + rise), eave, tile)
    k.tiled_slope((-w, l + eave, h), (-w, -eave, h), (-w / 2, l + eave, h + rise), eave, tile)
    n = int((l + 2 * eave) / 22)
    for i in range(n):
        y = -eave + i * (l + 2 * eave) / n
        k.rod((-w / 2, y - 2, h + rise + 1), (-w / 2, y + (l + 2 * eave) / n, h + rise + 3), 8.5, 7.5, k.shade(ck.TILE, 0.15), None, 10, 0.6)
    k.mesh([(-w, 0, h), (0, 0, h), (-w / 2, 0, h + rise)], [[0, 1, 2]], ck.PLASTER, None, 0.8)


# The buildings.


def hq(k, look):
    w, l, h, ridge = ((168, 205, 112, 48), (188, 238, 120, 54), (192, 244, 126, 56), (200, 262, 138, 60))[look - 1]
    if look >= 3:
        lookout(k, (-96, l - 46, 0), 90, 150 if look == 3 else 172, "canvas" if look == 3 else "timber")
    if look == 4:
        keep = k.frame
        k.frame = k.frame @ Matrix.Translation((-w + 8, 120, 0))
        k.gable_house(90, 120, 96, 34, 12)
        k.frame = keep
    k.gable_house(w, l, h, ridge)
    k.window("right", l * 0.2, 50)
    k.window("right", l * 0.86, 52)
    k.window("front", -w * 0.62, h - 46, 18, 24)
    k.window("front", -w * 0.2, 46, 20, 28)
    k.worn("right", l * 0.4, 14)
    k.worn("front", -w * 0.42, 12)
    k.door(l * 0.54, 38, 72)
    k.canvas([(38, l * 0.40, 80), (38, l * 0.72, 80), (1, l * 0.70, 106), (1, l * 0.42, 106)], sag=5)
    for y in (l * 0.42, l * 0.70):
        k.rod((4, y, 42), (37, y, 80), 2.2, 2.0)
    for x, z in ((-40, 0), (-72, 0), (-104, 0), (-56, 24)):
        k.crate((x, -24, z), (30, 24, 23), 2)
    k.crate((24, 24, 0), (26, 44, 22), 4)
    k.crate((22, 66, 0), (28, 34, 28), -6)
    span = 1.0 + 0.12 * look
    awning(k, (-150 * span, -118, 84), (-34, -108, 84), (-14, -2, h - 8), (-w + 12, -2, h - 4), sag=10, peak=10 if look > 1 else 4)
    for x, y in ((20, l - 22), (44, l - 8), (40, l - 40)):
        k.barrel((x, y, 0))
    if look >= 2:
        k.sandbags([Vector((64, 88, 0)), Vector((70, 30, 0)), Vector((50, -14, 0))], 3 if look == 2 else 4)
    if look >= 3:
        k.sandbags([Vector((76, l - 4, 0)), Vector((76, l - 70, 0))], 4)
    if look == 4:
        k.sandbags([Vector((-210, -60, 0)), Vector((-190, -120, 0)), Vector((-130, -150, 0))], 4)
        sack_pile(k, (-176, -56, 0))


def barracks(k, look):
    w, l, h, ridge = ((150, 196, 100, 54), (176, 232, 108, 62), (176, 240, 150, 62), (180, 240, 152, 64))[look - 1]
    if look == 4:
        keep = k.frame
        k.frame = k.frame @ Matrix.Translation((-w - 10, 96, 0))
        k.gable_house(96, 150, 92, 40, 13)
        k.window("front", -48, 40, 20, 28)
        k.frame = keep
    k.gable_house(w, l, h, ridge)
    plank_door(k, "front", -w * 0.5, 38, 72)
    k.window("front", -w * 0.2, 38, 20, 28)
    k.window("front", -w * 0.82, 40, 20, 28)
    k.window("front", -w * 0.5, h + 8, 16, 20)
    if look >= 3:
        for y in (0.2, 0.5, 0.8):
            k.window("right", l * y, 108, 20, 26)
        k.window("front", -w * 0.2, 104, 20, 26)
        k.window("front", -w * 0.8, 104, 20, 26)
    k.worn("front", -w * 0.68, 10)
    d = 62 + look * 6
    leanto(k, d, 12, l - 12, 76, 94)
    hang(k, d + 2, 14, 46, 74, 6)
    for i in range(1 + look):
        y = 62 + i * 34
        if y < l - 20:
            k.box(10, 50, y, y + 22, 14, 18, k.shade(ck.WOOD, 0.1), None, 0.7)
            k.stone((30, y + 11, 22), (40, 20, 9), 0, (ck.rgb("7d7a66"), ck.rgb("8c7a5e"), ck.rgb("6f6f68"))[i % 3], round_=0.9, tex=0.4)
            for x in (12, 48):
                k.rod((x, y + 2, 0), (x, y + 2, 16), 2, 2)
    for x, y, z in ((14, -34, 0), (48, -30, 0), (30, -32, 26), (84, 4, 0)):
        k.crate((x, y, z), (30, 28, 25), k.rng.uniform(-8, 8))
    jar(k, (-14, -18, 0))
    jar(k, (2, -14, 0), 7)
    k.barrel((-w + 14, -26, 0))
    if look >= 2:
        k.barrel((-w + 42, -30, 0))
        sack_pile(k, (d + 26, l - 40, 0))
    if look >= 3:
        k.sandbags([Vector((d + 40, 20, 0)), Vector((d + 44, 90, 0))], 3)
    if look == 4:
        awning(k, (-w - 96, 36, 78), (-w - 8, 30, 78), (-w - 10, 94, 92), (-w - 100, 94, 92), sag=8)


def armory(k, look):
    w, l, h = ((160, 165, 100), (185, 190, 116), (185, 194, 120), (190, 200, 128))[look - 1]
    if look >= 3:
        keep = k.frame
        k.frame = k.frame @ Matrix.Translation((-w + 6, 84, 0))
        flat_block(k, 92, 104, 88)
        k.frame = keep
    flat_block(k, w, l, h)
    plank_door(k, "front", -w * 0.5, 46, 78)
    grille(k, "front", -w * 0.16, 42, 26, 34)
    grille(k, "right", l * 0.42, 46, 34, 34)
    if look >= 2:
        grille(k, "right", l * 0.82, 46, 26, 34)
    for i, (x, y) in enumerate(((-w * .3, l * .55), (-w * .3 + 34, l * .62), (-w * .55, l * .7))[:1 + look]):
        k.crate((x, y, h + 2), (28, 28, 22), i * 8)
    k.barrel((-w + 8, -24, 0))
    k.barrel((24, l - 12, 0))
    for y in (34, 100):
        for x in (10, 34):
            for dy in (0, 50):
                k.rod((x, y + dy, 0), (x, y + dy, 26), 2.2, 2.2)
        k.box(6, 38, y - 5, y + 56, 26, 31, k.shade(ck.rgb("7d583c"), 0.08), None, 0.8)
        for j in range(4):
            k.box(12, 30, y + j * 13, y + j * 13 + 8, 31, 31 + k.rng.uniform(3, 9), k.shade(ck.IRON, 0.25), None, 0.4)
    if look >= 2:
        awning(k, (58, 22, 84), (58, l - 30, 84), (2, l - 30, 104), (2, 22, 104), sag=7, ropes=False)
    if look >= 3:
        k.sandbags([Vector((-w - 8, -40, 0)), Vector((-w * 0.8, -56, 0))], 3)
    if look == 4:
        keep = k.frame
        k.frame = k.frame @ Matrix.Translation((-20, 70, h))
        k.gable_house(112, 100, 58, 34, 10)
        k.window("right", 50, 18, 22, 26)
        k.window("front", -56, 18, 22, 26)
        k.frame = keep
        k.box(-w + 10, -w + 42, l - 46, l - 14, 0, h + 92, ck.rgb("a39682"), None, 0.9)
        k.box(-w + 6, -w + 46, l - 50, l - 10, h + 92, h + 100, ck.QUOIN, None, 0.9)


def hero_hall(k, look):
    w, l, h = ((210, 310, 150), (235, 350, 158), (235, 355, 164), (240, 360, 176))[look - 1]
    post = 6.0
    k.box(-w, 0, 0, l, 0, 5, ck.rgb("a98a66"), None, 0.9)
    n = 3 if look == 1 else 4
    for i in range(n + 1):
        y = l * i / n
        for x in (-w, 0.0):
            if look >= 3:
                k.box(x - 9, x + 9, y - 9, y + 9, 0, h, k.shade(ck.QUOIN, 0.04), None, 0.9)
            else:
                k.rod((x, y, 0), (x, y, h), post, post * .9)
            k.rod((x, y, h - 34), (x, y + (24 if i < n else -24), h), 2.6, 2.6)
    k.rod((-w / 2, 0, 0), (-w / 2, 0, h + 40), 4.4, 4.0)
    for x in (-w, 0.0):
        k.rod((x, -8, h), (x, l + 8, h), 4.4, 4.4)
    for y in (0.0, l):
        k.rod((-w - 6, y, h), (6, y, h), 4.2, 4.2)
    if look == 1:
        for x0, x1, y in ((-w, 0, 0.0),):
            for i in range(14):
                a = x0 + (x1 - x0) * i / 14
                k.box(a, a + w / 14 - 1, -2, 2, 4, 46, k.shade(ck.rgb("7a573c"), 0.1), None, 0.8)
    else:
        k.dry_wall([Vector((-w, 0, 2)), Vector((-8, 0, 2))], 4, 12, 18)
        k.dry_wall([Vector((-w, l, 2)), Vector((0, l, 2))], 4, 12, 18)
    for i in range(16):
        y = l * .52 + l * .48 * i / 16
        k.box(-2, 2, y, y + l * .03 - 1, 4, 44, k.shade(ck.rgb("7a573c"), 0.1), None, 0.8)
    # Long tables and benches.
    for y0, y1, x in ((60, l - 80, -w * .5),):
        k.box(x - 26, x + 26, y0, y1, 38, 43, k.shade(ck.rgb("86623f"), 0.06), None, 0.8)
        for y in (y0 + 10, y1 - 10):
            k.box(x - 18, x + 18, y - 3, y + 3, 0, 38, ck.WOOD)
        for bx in (x - 56, x + 56):
            k.box(bx - 10, bx + 10, y0, y1, 22, 26, k.shade(ck.rgb("86623f"), 0.08), None, 0.8)
            for y in (y0 + 14, y1 - 14):
                k.box(bx - 7, bx + 7, y - 2, y + 2, 0, 22, ck.WOOD)
    k.box(26, 44, 60, 160, 20, 24, k.shade(ck.rgb("86623f"), 0.08), None, 0.8)
    for y in (70, 150):
        k.box(28, 42, y - 2, y + 2, 0, 20, ck.WOOD)
    if look <= 2:
        mid, rise = -w / 2, 46
        for i in range(n):
            a, b = l * i / n - (10 if i == 0 else 0), l * (i + 1) / n + (10 if i == n - 1 else 0)
            k.canvas([(16, a, h + 2), (16, b, h + 2), (mid, b, h + rise), (mid, a, h + rise)], sag=9)
            k.canvas([(-w - 16, b, h + 2), (-w - 16, a, h + 2), (mid, a, h + rise), (mid, b, h + rise)], sag=9)
    else:
        hip_roof(k, w, l, h, 66 if look == 3 else 78)
    if look == 4:
        keep = k.frame
        k.frame = k.frame @ Matrix.Translation((-w * .2, l + 22, 0))
        k.gable_house(130, 90, 120, 44, 12)
        k.frame = keep
        hang(k, 3, 20, 80, h - 4, 34)
        hang(k, 3, l * .28, l * .28 + 50, h - 4, 40)
    jar(k, (18, l * .52, 0), 10)
    sack_pile(k, (26, l * .7, 0), 3 + look)
    k.barrel((-w - 2, -26, 0))


def treasury(k, look):
    w, l, h = ((104, 160, 116), (112, 182, 136), (114, 186, 140), (118, 190, 150))[look - 1]
    grey = ck.rgb("a1978a")
    if look >= 3:
        keep = k.frame
        k.frame = k.frame @ Matrix.Translation((-10, l - 4, 0))
        flat_block(k, w - 16, 84, 104 if look == 3 else 170, col=grey)
        grille(k, "right", 42, 44 if look == 3 else 112, 28, 34)
        k.frame = keep
    flat_block(k, w, l, h, deck=False, col=grey)
    k.box(-w + 12, -12, 12, l - 12, h - 3, h + 1, k.shade(grey, 0.04), None, 0.9)
    grille(k, "front", -w * .5, 44, 44, 44)
    grille(k, "right", l * .34, 46, 48, 44)
    if look >= 2:
        k.box(-1, 5, l * .64, l * .64 + 44, 0, 78, ck.IRON, None, 0.5)
        for z in (14, 40, 66):
            k.box(4, 7, l * .64 + 1, l * .64 + 43, z, z + 5, k.shade(ck.rgb("6b6258"), 0.1), None, 0.4)
        k.box(-1, 7, l * .64 - 8, l * .64 + 52, 78, 86, ck.QUOIN, None, 0.9)
    k.crate((34, l * .28, 0), (34, 36, 34), 0)
    if look >= 2:
        k.crate((42, l * .5, 0), (28, 30, 26), 8)
    if look >= 3:
        sack_pile(k, (44, -8, 0), 6)
        k.crate((36, l * .28, 34), (28, 28, 22), 10)
    if look == 4:
        k.dry_wall([Vector((26, -30, 0)), Vector((66, -34, 0)), Vector((92, 0, 0))], 4)
        k.barrel((70, 30, 0))
        k.barrel((66, 62, 0))


FARM = ((190, 225, 122, 62), (222, 262, 140, 74), (232, 272, 144, 78), (237, 280, 150, 80))


def chimney(look):
    """The top of the farm's chimney, in the house's frame."""
    w, l, h, ridge = FARM[look - 1]
    return (-w * .62 + 14, l * .5 + 14, h + ridge + 62)


def farm(k, look):
    w, l, h, ridge = FARM[look - 1]
    slab = [(-w - 60, -110), (100, -110), (100, l + 20), (-w - 60, l + 20)]
    k.prism(slab, -14, 3, ck.rgb("8f8377"), None, 0.8, top=ck.rgb("c39a68"))
    if look >= 3:
        k.lathe((-w - 22, l * .55, 0), [(52, 0, None), (54, 60, ck.rgb("bcae98")), (52, 128, ck.rgb("bcae98")), (64, 126, ck.SHADE), (30, 168, ck.rgb("b08a4e")), (0.1, 186, ck.rgb("b08a4e"))],
                ck.rgb("bcae98"), sides=28, tex=0.9)
    if look == 4:
        keep = k.frame
        k.frame = k.frame @ Matrix.Translation((-w - 6, l + 16, 0))
        k.gable_house(130, 92, 112, 48, 13)
        k.frame = keep
    k.gable_house(w, l, h, ridge)
    k.box(-w * .62, -w * .62 + 28, l * .5, l * .5 + 28, h, h + ridge + 52, ck.PLASTER, None, 0.8)
    k.box(-w * .62 - 3, -w * .62 + 31, l * .5 - 3, l * .5 + 31, h + ridge + 52, h + ridge + 60, ck.QUOIN, None, 0.8)
    plank_door(k, "front", -w * .42, 42, 80)
    k.window("front", -w * .78, 48, 24, 34)
    k.window("front", -w * .14, 50, 24, 34)
    k.window("front", -w * .5, h + 14, 18, 24)
    k.worn("front", -w * .62, 20, 8)
    k.worn("front", -w * .1, 96, 6)
    k.worn("front", -w * .9, 100, 5)
    d = 70 + look * 4
    leanto(k, d, 10, l - 10, 96, 118)
    hang(k, d + 2, 12, 62, 94, 6)
    if look >= 2:
        hang(k, d + 2, l - 60, l - 14, 94, 30)
    jar(k, (-6, -22, 3), 11)
    jar(k, (16, -14, 3), 9)
    jar(k, (d + 6, 4, 3), 9)
    k.crate((-34, -36, 3), (40, 34, 34), -4)
    k.barrel((-62, -40, 3), 11, 24)
    k.barrel((-w - 24, -20, 3))
    k.barrel((-w + 6, -34, 3))
    k.barrel((-w - 34, 12, 3))
    k.crate((-w + 40, -50, 3), (44, 26, 22), 4)
    sack_pile(k, (30, l * .45, 3), 3 + look)
    k.crate((34, 60, 3), (30, 34, 24), 6)
    # Hay.
    for i in range(1 if look < 3 else 2):
        at = (36 - i * 78, -78 - i * 6, 3)
        hay = ck.rgb("d3a95a")
        k.lathe(at, [(46, 0, None), (44, 18, hay), (34, 40, hay), (18, 58, hay), (0.1, 66, hay)], hay, sides=22, tex=1.0)
        ink = k.ink()
        for _ in range(90):
            t, f = k.rng.uniform(0, math.tau), k.rng.random()
            r0, z0 = 46 * (1 - f * .85), 60 * f
            a = Vector(at) + Vector((math.cos(t) * r0, math.sin(t) * r0, z0 + 4))
            k.mesh([a + Vector((-1.5, 0, 0)), a + Vector((1.5, 0, 0)), a + Vector((math.cos(t) * 9, math.sin(t) * 9, -10))], [[0, 1, 2]], k.shade(hay, 0.16), ink, 0.3)
    k.parapet([Vector((96, l - 100, 3)), Vector((98, l - 40, 3)), Vector((96, l + 16, 3))], 40)


WHITE = ck.rgb("e7dfcd")


def cot(k, at, turn=0.0, long=62.0, wide=22.0):
    """A field stretcher on short legs: two poles, canvas between."""
    keep = k.frame
    k.frame = k.frame @ Matrix.Translation(at) @ Matrix.Rotation(math.radians(turn), 4, "Z")
    for y in (-wide / 2, wide / 2):
        k.rod((-long / 2 - 6, y, 12), (long / 2 + 6, y, 12), 1.8, 1.8)
        for x in (-long / 2 + 4, long / 2 - 4):
            k.rod((x, y, 0), (x, y, 12), 1.5, 1.5)
    k.canvas([(-long / 2, -wide / 2, 12.5), (long / 2, -wide / 2, 12.5), (long / 2, wide / 2, 12.5), (-long / 2, wide / 2, 12.5)], sag=2.5, col=k.shade(WHITE, 0.04), n=8)
    k.frame = keep


def washing(k, a, b, n=4):
    """Two poles and a line between them, with cloths hung out to dry."""
    h = 54.0
    for p in (a, b):
        k.rod((p[0], p[1], 0), (p[0], p[1], h + 4), 2.0, 1.8)
    k.rod((a[0], a[1], h), (b[0], b[1], h), 0.5, 0.5, ck.DARK, ck.THIN, sides=4)
    for i in range(n):
        t0, t1 = (i + 0.3) / (n + 0.4), (i + 0.95) / (n + 0.4)
        p0 = [a[j] + (b[j] - a[j]) * t0 for j in (0, 1)]
        p1 = [a[j] + (b[j] - a[j]) * t1 for j in (0, 1)]
        drop = k.rng.uniform(16, 24)
        k.canvas([(p0[0], p0[1], h - 1), (p1[0], p1[1], h - 1), (p1[0], p1[1], h - drop), (p0[0], p0[1], h - drop)], sag=0, col=k.shade(WHITE, 0.05), n=6, folds=0.4)


def ridge_tent(k, at, turn=0.0, scale=1.0):
    """The camp's ridge tent (camp_still.tent), set down at `at`."""
    import camp_still
    keep = k.frame
    k.frame = k.frame @ Matrix.Translation(at) @ Matrix.Rotation(math.radians(turn), 4, "Z") @ Matrix.Scale(scale, 4)
    camp_still.tent(k)
    k.frame = keep


def watchtower(k, look):
    """A timber lookout that grows: a bare frame, a cabin on top, a stone footing, then a plastered tower with a timber roof."""
    w = (52.0, 60.0, 64.0, 70.0)[look - 1]
    mid = Vector((-55, 55, 0))
    if look <= 3:
        h = (175.0, 215.0, 235.0)[look - 1]
        keep = k.frame
        foot = 0.0
        if look == 3:
            k.box(-100, -10, 10, 100, 0, 34, k.shade(ck.STONE, 0.08), None, 0.8)
            for x, y in ((-10.0, 10.0), (-10.0, 100.0), (-100.0, 10.0)):
                k.quoins(x, y, 34)
            foot = 34.0
        land.watchtower(k, mid + Vector((0, 0, foot)), h, w)
        k.frame = keep
        # A ladder up the front face.
        for i in range(int(h / 22)):
            z = foot + 12 + i * 22
            k.rod((-55 - 10, 55 - w / 2 - 16, z), (-55 + 10, 55 - w / 2 - 16, z), 1.4, 1.4)
        for x in (-65, -45):
            k.rod((x, 55 - w / 2 - 18, foot), (x, 55 - w / 2 - 10, foot + h), 2.0, 2.0)
    else:
        lookout(k, (-14, 14, 0), 82, 205, "timber")
    k.crate((14, 20, 0), (26, 24, 22), 6)
    if look >= 2:
        k.barrel((-112, 18, 0))
        k.sandbags([Vector((-120, -14, 0)), Vector((-60, -30, 0)), Vector((4, -22, 0))], 2 if look == 2 else 3)
    if look >= 3:
        k.sandbags([Vector((26, 10, 0)), Vector((30, 80, 0))], 3)


def infirmary(k, look):
    """Where the wounded are nursed: a tent with stretchers, then two tents and an awning, then a small stone house, then a bigger
    house with a porch. No emblem on any of it."""
    if look == 1:
        ridge_tent(k, (-72, 72, 0), -45, 1.45)
        cot(k, (-30, -22, 0), 8)
        cot(k, (-92, -16, 0), -6)
        cot(k, (-140, 20, 0), 84)
        jar(k, (12, 30, 0))
        washing(k, (14, 52), (16, 120), 3)
    elif look == 2:
        ridge_tent(k, (-118, 92, 0), -45, 1.4)
        ridge_tent(k, (-30, 104, 0), -45, 1.3)
        awning(k, (-130, -40, 70), (-20, -40, 70), (-20, 20, 84), (-130, 20, 84), sag=8)
        for x in (-110, -75, -40):
            cot(k, (x, -12, 0), 90)
        jar(k, (12, 20, 0))
        jar(k, (18, 40, 0), 7)
        washing(k, (20, 60), (22, 140), 4)
    else:
        w, l, h, ridge = ((126, 118, 88, 36), (156, 136, 96, 42))[look - 3]
        k.gable_house(w, l, h, ridge)
        k.door(l * 0.5, 36, 68)
        k.window("front", -w * 0.3, 44, 20, 26)
        k.window("front", -w * 0.75, 44, 20, 26)
        k.window("right", l * 0.18, 46, 18, 24)
        k.worn("front", -w * 0.52, 12)
        d = 56.0
        leanto(k, d, 10, l - 10, 66, 82)
        for y in (24, 66) if look == 3 else (20, 56, 92):
            cot(k, (d * 0.5, y, 0), 90, 50, 20)
        jar(k, (-w + 10, -18, 0))
        jar(k, (-w + 30, -24, 0), 7)
        k.barrel((-w * 0.5, -26, 0))
        if look == 4:
            ridge_tent(k, (-w - 46, 70, 0), -45, 0.95)
            awning(k, (-w + 10, -70, 70), (-30, -70, 70), (-30, -4, h - 10), (-w + 10, -4, h - 10), sag=9)
            for x in (-w + 30, -64):
                cot(k, (x, -40, 0), 0, 56, 20)
        washing(k, (d + 20, l + 10), (-40, l + 30), 4)


BOARD = ck.rgb("39443a")


def bench(k, a, b, h=14.0):
    """A plank bench on two short legs."""
    for p in (a, b):
        k.rod((p[0], p[1], 0), (p[0], p[1], h), 1.6, 1.4)
    k.box(min(a[0], b[0]) - 3, max(a[0], b[0]) + 3, min(a[1], b[1]) - 4, max(a[1], b[1]) + 4, h, h + 3, k.shade(ck.WOOD, 0.08), None, 0.8)


def chalkboard(k, at, w=40.0, z=20.0, h=26.0):
    """A dark board on two posts, facing the front."""
    x, y = at
    for dx in (-w / 2, w / 2):
        k.rod((x + dx, y, 0), (x + dx, y, z + h + 4), 1.6, 1.4)
    k.box(x - w / 2, x + w / 2, y - 1.5, y + 1.5, z, z + h, BOARD, None, 0.3)
    k.box(x - w / 2 - 2, x + w / 2 + 2, y - 2.5, y + 2.5, z - 2, z, k.shade(ck.WOOD, 0.05), None, 0.8)


def books(k, at, n=3):
    """A crate of books: stacked covers in a few faded colours."""
    k.crate(at, (24, 20, 14), 4)
    for i in range(n):
        col = (ck.rgb("8c3b2e"), ck.rgb("3f5578"), ck.rgb("5d6b3d"), ck.rgb("b48a3c"))[i % 4]
        k.box(at[0] - 9, at[0] + 9, at[1] - 7 + i * 4.5, at[1] - 3 + i * 4.5, 14, 22 + i % 2 * 3, col, None, 0.4)


def academy(k, look):
    """Where the lessons villages teach are studied: an open-air class under canvas, then a schoolroom that grows a porch, a book
    shed and a courtyard wall."""
    if look == 1:
        awning(k, (-104, -6, 78), (-8, -6, 78), (-8, 84, 78), (-104, 84, 78), sag=8)
        chalkboard(k, (-56, 80))
        for y in (16, 38, 60):
            bench(k, (-88, y), (-26, y))
        books(k, (12, 26, 0))
        jar(k, (10, 58, 0))
        return
    w, l, h, ridge = ((100, 84, 84, 36), (108, 88, 90, 40), (112, 90, 96, 42))[look - 2]
    k.gable_house(w, l, h, ridge)
    k.door(l * 0.5, 34, 66)
    for at in (0.2, 0.8):
        k.window("right", l * at, 46, 22, 30)
    k.window("front", -w * 0.3, 46, 22, 30)
    k.window("front", -w * 0.72, 46, 22, 30)
    k.worn("front", -w * 0.5, 12)
    for y in (16, l - 16):
        bench(k, (26, y - 10), (26, y + 10))
    books(k, (-w * 0.5, -22, 0))
    if look >= 3:
        leanto(k, 44, 8, l - 8, 60, 76)
        chalkboard(k, (52, l * 0.5), 26, 18, 20)
    if look == 4:
        k.sandbags([Vector((-w + 6, -36, 0)), Vector((-20, -40, 0))], 2)
        books(k, (-w * 0.5 + 34, -24, 0), 4)


BUILD = {"hq": hq, "barracks": barracks, "armory": armory, "hero_hall": hero_hall, "treasury": treasury, "farm": farm, "watchtower": watchtower, "infirmary": infirmary, "academy": academy}
