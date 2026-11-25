"""What the world map shows: camps, colonial posts, resource sites, alliance halls, and its trees, rocks and peaks.

A piece is modelled in map units (1 unit = 1 world px; a tile is 96 x 48 on screen, so its side is TILE on the ground) round its
footprint's centre. Colonial posts are an army's works: no flags, no insignia, no people, no vehicles (GDD §6).
"""

import math

from mathutils import Matrix, Vector, noise

import camp_kit as ck
import camp_houses as houses
import camp_terrain as land

TILE = 96 * ck.S45
KHAKI, CONCRETE, WIRE = ck.rgb("9a9068"), ck.rgb("a39d92"), ck.rgb("57524c")


def at(k, x, y, scale=1.0, turn=0.0):
    k.frame = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(math.radians(turn), 4, "Z") @ Matrix.Scale(scale, 4)


IRON = ck.rgb("5d5650")


def frontier_tower(k):
    """A steel lookout of the frontier: a braced lattice, a plank cabin, a sheet roof."""
    k.frame = Matrix.Scale(0.62, 4)
    h, w = 210.0, 56.0
    legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for x, y in legs:
        k.rod((x * w * .62, y * w * .62, 0), (x * w * .42, y * w * .42, h), 3.6, 3.0, IRON, None, 6)
        k.obox((x * w * .62, y * w * .62, 0), (14, 14, 6), 0, ck.rgb("a39d92"))
    for i in range(4):
        z0, z1 = h * i / 4 + 6, h * (i + 1) / 4
        for (ax, ay), (bx, by) in zip(legs, legs[1:] + legs[:1]):
            r0, r1 = w * (.62 - .2 * z0 / h), w * (.62 - .2 * z1 / h)
            k.rod((ax * r0, ay * r0, z0), (bx * r1, by * r1, z1), 1.6, 1.6, IRON, None, 5)
            k.rod((bx * r0, by * r0, z0), (ax * r1, ay * r1, z1), 1.6, 1.6, IRON, None, 5)
            k.rod((ax * r1, ay * r1, z1), (bx * r1, by * r1, z1), 1.8, 1.8, IRON, None, 5)
    k.box(-34, 34, -34, 34, h, h + 5, ck.WOOD)
    for x0, x1, y0, y1 in ((-34, 34, -34, -30), (30, 34, -34, 34), (-34, 34, 30, 34), (-34, -30, -34, 34)):
        k.box(x0, x1, y0, y1, h + 5, h + 34, k.shade(ck.rgb("8a8178"), .06), None, .7)
    for x, y in legs:
        k.rod((x * 31, y * 31, h), (x * 31, y * 31, h + 62), 2.6, 2.4, IRON, None, 5)
    k.box(-40, 40, -40, 40, h + 62, h + 66, ck.rgb("6e6a64"), None, .5)
    k.lathe((20, -20, h + 66), [(6, 0, None), (6, 8, IRON), (8, 10, IRON), (0.1, 12, IRON)], IRON, sides=10)
    k.frame = Matrix.Identity(4)


def fence(k, length, along):
    """One repeat of the frontier's iron fence, `length` units along the ground direction `along` (unit X or Y)."""
    a = Vector(along)
    side = a.cross(Vector((0, 0, 1)))
    h = 40.0
    for i in range(3):
        p = a * (length * i / 2)
        k.rod(p, p + Vector((0, 0, h)), 1.7, 1.5, IRON, None, 5)
        k.rod(p + Vector((0, 0, h)), p + Vector((0, 0, h + 7)) + side * 4, 1.2, 1.2, IRON, None, 4)
        k.obox(p, (5, 5, 3), 0, ck.rgb("a39d92"))
    for z in (5, 12, 19, 26, 33, 40):
        k.rod(Vector((0, 0, z)) - a * 2, a * (length + 2) + Vector((0, 0, z)), .45, .45, IRON, ck.THIN, 4)
    # Wire mesh between the strands, and a coil along the top.
    for i in range(int(length / 9.0) + 1):
        x = length * i / int(length / 9.0)
        k.rod(a * x + Vector((0, 0, 2)), a * (x + 6) + Vector((0, 0, 40)), .3, .3, IRON, ck.THIN, 3)
        k.rod(a * (x + 6) + Vector((0, 0, 2)), a * x + Vector((0, 0, 40)), .3, .3, IRON, ck.THIN, 3)
    turns = int(length / 3.0)
    prev = None
    for i in range(turns * 8 + 1):
        ang = math.tau * i / 8
        p = a * (length * i / (turns * 8)) + side * (2 + math.cos(ang) * 3.4) + Vector((0, 0, 44 + 3.4 * math.sin(ang)))
        if prev is not None:
            k.rod(prev, p, .35, .35, IRON, ck.THIN, 3)
        prev = p


def tent(k, w, l, h, col=ck.CANVAS):
    """A ridge tent, its door in the front (-Y) end."""
    n = 10
    ink = k.ink()
    for side in (-1, 1):
        for i in range(n):
            y0, y1 = -l / 2 + l * i / n, -l / 2 + l * (i + 1) / n
            f = 1.0 - 0.14 * (i % 3 == 0) - 0.05 * math.sin(i * 2.1)
            c = tuple(x * f for x in col)
            k.mesh([(side * w / 2, y0, 0), (side * w / 2, y1, 0), (side * w * .22, y1, h * .62), (side * w * .22, y0, h * .62)], [[0, 1, 2, 3]], c, ink, 0.6)
            k.mesh([(side * w * .22, y0, h * .62), (side * w * .22, y1, h * .62), (0, y1, h), (0, y0, h)], [[0, 1, 2, 3]], c, ink, 0.6)
    k.mesh([(-w / 2, -l / 2, 0), (w / 2, -l / 2, 0), (w * .22, -l / 2, h * .62), (0, -l / 2, h), (-w * .22, -l / 2, h * .62)], [[0, 1, 2, 3, 4]], tuple(x * .92 for x in col), None, 0.6)
    k.mesh([(-w * .12, -l / 2 - .6, 0), (w * .12, -l / 2 - .6, 0), (0, -l / 2 - .6, h * .8)], [[0, 1, 2]], ck.DARK, None, 0.2)
    k.rod((0, -l / 2 - 1, 0), (0, -l / 2 - 1, h + 3), 0.9, 0.8)
    for x in (-1, 1):
        for y in (-.5, 0, .5):
            k.rod((x * w * .3, y * l, h * .45), (x * w * .72, y * l, 0), 0.35, 0.35, ck.DARK, ck.THIN, 4)


def ring_wall(k, pts, courses=3, size=0.42):
    k.dry_wall([Vector(p) for p in pts], courses, 11.5 * size, 22 * size, 30 * size)


def crate(k, x, y, s=8.0, z=0.0):
    k.obox((x, y, z), (s, s * .9, s * .8), k.rng.uniform(-12, 12), k.shade(ck.WOOD, .08), None, .6)
    k.obox((x, y, z + s * .7), (s + 1, s * .9 + 1, s * .12), 0, ck.rgb("7d583c"), None, .6)


def campfire(k, x, y):
    for i in range(8):
        t = math.tau * i / 8
        k.stone((x + math.cos(t) * 5, y + math.sin(t) * 5, 1.2), (3.4, 2.8, 2.8), math.degrees(t), ck.STONE)
    for t in (0.3, 1.4, 2.5):
        k.rod((x - math.cos(t) * 4, y - math.sin(t) * 4, 1), (x + math.cos(t) * 4, y + math.sin(t) * 4, 3), 0.9, 0.9, ck.DARK)
    k.mesh([(x - 2, y, 2), (x + 2, y, 2), (x, y, 9)], [[0, 1, 2]], ck.rgb("e8a23c"), None, 0)


def base(k):
    """A player's camp on two tiles by two."""
    s = TILE * 0.92
    k.frame = Matrix.Identity(4)
    g = [(s * math.cos(t) * r, s * math.sin(t) * r) for t, r in ((math.tau * i / 26, 0.98 + 0.06 * math.sin(i * 2.3)) for i in range(26))]
    k.prism(g, -2, 0.6, ck.rgb("c39a68"), None, 0.7, top=ck.rgb("c9a273"))
    e = s * 0.80
    ring_wall(k, [(-e, e * .1, 0), (-e, -e, 0), (-e * .25, -e * 1.02, 0)])
    ring_wall(k, [(e * .28, -e * 1.02, 0), (e, -e, 0), (e, e * .95, 0), (-e * .2, e, 0)])
    at(k, -4, 26, 0.23)
    k.gable_house(190, 220, 118, 56)
    k.window("right", 50, 52)
    k.window("right", 180, 52)
    houses.plank_door(k, "front", -95, 42, 76)
    at(k, -34, -22, 1, 8)
    tent(k, 26, 34, 21)
    at(k, 0, -40, 1, -6)
    tent(k, 22, 28, 18)
    at(k, 36, -36, 1, 4)
    tent(k, 24, 30, 19, ck.rgb("b9a47c"))
    k.frame = Matrix.Identity(4)
    campfire(k, 16, -12)
    for x, y, z in ((40, 2, 0), (48, 8, 0), (44, 4, 6.5), (40, 16, 0), (-46, 18, 0), (-40, 24, 0)):
        crate(k, x, y, 8, z)
    at(k, 48, 38, 0.32)
    land_tower(k)
    k.frame = Matrix.Identity(4)
    for x, y, r in ((-52, 46, 9), (58, -52, 7), (-58, -48, 8)):
        k.bush((x, y, 0), r)
    at(k, 30, 44, 0.3)
    k.barrel((0, 0, 0))
    k.barrel((30, 10, 0))
    k.frame = Matrix.Identity(4)


def land_tower(k):
    keep = k.frame
    h, w = 190.0, 60.0
    legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for x, y in legs:
        k.rod((x * w * .6, y * w * .6, 0), (x * w * .4, y * w * .4, h), 5, 4.4)
    for i in range(2):
        z0, z1 = h * i / 2 + 8, h * (i + 1) / 2
        for (ax, ay), (bx, by) in zip(legs, legs[1:] + legs[:1]):
            r0, r1 = w * (.6 - .2 * z0 / h), w * (.6 - .2 * z1 / h)
            k.rod((ax * r0, ay * r0, z0), (bx * r1, by * r1, z1), 3, 3)
    k.box(-36, 36, -36, 36, h, h + 6, ck.WOOD)
    for x0, x1, y0, y1 in ((-36, 36, -36, -32), (32, 36, -36, 36), (-36, 36, 32, 36), (-36, -32, -36, 36)):
        k.box(x0, x1, y0, y1, h + 6, h + 36, k.shade(ck.rgb("7a573c"), .1), None, .7)
    for x, y in legs:
        k.rod((x * 32, y * 32, h), (x * 32, y * 32, h + 74), 3.4, 3.2)
    top = (0, 0, h + 112)
    for (ax, ay), (bx, by) in zip(legs, legs[1:] + legs[:1]):
        k.mesh([(ax * 46, ay * 46, h + 70), (bx * 46, by * 46, h + 70), top], [[0, 1, 2]], k.shade(ck.rgb("84644a"), .1), None, .8)
    k.frame = keep


def bags(k, pts, n=2, size=0.4):
    """Sandbags at map size."""
    line = [Vector(p) for p in pts]
    for course in range(n):
        d = 4.0 + (course % 2) * 6
        while d < ck._length(line):
            p, turn = ck._along(line, d)
            k.stone(p + Vector((0, 0, 4.6 * (course + .5))), (13, 8.5, 5.6), turn + k.rng.uniform(-5, 5), ck.SACK, jitter=.09, round_=.95, tex=.3)
            d += 11.6


def wire(k, a, b):
    """A coil of wire on stakes."""
    a, b = Vector(a), Vector(b)
    n = max(2, int((b - a).length / 9))
    for i in range(n + 1):
        p = a.lerp(b, i / n)
        k.rod(p, p + Vector((0, 0, 9)), 0.8, 0.7, WIRE, None, 5)
    t = (b - a).normalized()
    side = t.cross(Vector((0, 0, 1)))
    turns = int((b - a).length / 3.2)
    prev = None
    for i in range(turns * 8 + 1):
        ang = math.tau * i / 8
        p = a.lerp(b, i / (turns * 8)) + side * math.cos(ang) * 3.6 + Vector((0, 0, 4.2 + 3.6 * math.sin(ang)))
        if prev is not None:
            k.rod(prev, p, 0.4, 0.4, WIRE, ck.THIN, 4)
        prev = p


def patrol(k):
    """A patrol's bivouac: two khaki tents in a ring of bags."""
    at(k, -13, 8, 1, 6)
    tent(k, 22, 30, 17, KHAKI)
    at(k, 14, 12, 1, -8)
    tent(k, 20, 26, 15, KHAKI)
    k.frame = Matrix.Identity(4)
    bags(k, [(-34, -14, 0), (-12, -32, 0), (10, -34, 0)])
    bags(k, [(30, -22, 0), (36, 0, 0), (34, 16, 0)])
    campfire(k, 8, -16)
    for x, y in ((-24, -14), (-18, -20), (26, -8)):
        crate(k, x, y, 7)


def convoy(k):
    """A supply halt: stacked crates and sacks under tarpaulins."""
    k.frame = Matrix.Identity(4)
    for x, y, w, l in ((-16, 12, 24, 30), (16, 4, 22, 34)):
        for i in range(3):
            for j in range(2):
                crate(k, x - w * .3 + j * w * .6, y - l * .32 + i * l * .32, 10)
        z = 9.0
        k.canvas([(x - w * .62, y - l * .56, z - 1), (x + w * .62, y - l * .56, z - 1), (x + w * .62, y + l * .56, z - 1), (x - w * .62, y + l * .56, z - 1)], sag=-2.2, col=KHAKI)
    for x, y in ((-30, -16), (-22, -22), (-26, -20), (30, -22)):
        k.stone((x, y, 3), (10, 8, 7), k.rng.uniform(0, 90), ck.SACK, round_=1.0, tex=.3)
    for x, y in ((0, -26), (6, -22), (0, 28)):
        at(k, x, y, 0.32)
        k.barrel((0, 0, 0))
    k.frame = Matrix.Identity(4)
    bags(k, [(-36, 2, 0), (-38, 24, 0), (-18, 36, 0)])
    bags(k, [(36, -14, 0), (40, 10, 0)])
    crate(k, 20, -26, 8)
    crate(k, 12, -32, 8)


def outpost(k):
    """A small post: a square blockhouse, a timber lookout, bags and wire."""
    at(k, 12, -6, 0.27)
    houses.flat_block(k, 130, 130, 96, col=CONCRETE, course=20)
    houses.plank_door(k, "front", -65, 40, 70)
    k.window("right", 66, 48, 44, 14)
    at(k, -22, 20, 0.30)
    land_tower(k)
    k.frame = Matrix.Identity(4)
    bags(k, [(-36, -8, 0), (-28, -32, 0), (0, -36, 0), (18, -34, 0)])
    bags(k, [(34, -28, 0), (38, 0, 0), (34, 30, 0)], 3)
    wire(k, (-40, -20, 0), (-34, -42, 0))
    wire(k, (-34, -42, 0), (14, -44, 0))
    crate(k, 24, -20, 8)
    crate(k, 30, -14, 7)


def fortified_line(k):
    """Concrete works joined by bags, behind wire."""
    k.frame = Matrix.Identity(4)

    def pillbox(x, y, r):
        n = 8
        poly = [(x + math.cos(math.tau * (i + .5) / n) * r, y + math.sin(math.tau * (i + .5) / n) * r) for i in range(n)]
        k.prism(poly, 0, 19, CONCRETE, None, .8, top=ck.rgb("b3ada2"))
        k.prism([(x + (px - x) * 1.12, y + (py - y) * 1.12) for px, py in poly], 19, 24, CONCRETE, None, .8, top=ck.rgb("b9b3a8"))
        for i in (5, 6, 7):
            a = math.tau * i / n
            c, t = Vector((x + math.cos(a) * r * .93, y + math.sin(a) * r * .93, 11)), Vector((-math.sin(a), math.cos(a), 0)) * r * .26
            o = Vector((math.cos(a), math.sin(a), 0)) * .5
            k.mesh([c - t + o, c + t + o, c + t + o + Vector((0, 0, 4)), c - t + o + Vector((0, 0, 4))], [[0, 1, 2, 3]], ck.DARK, None, .1)
    pillbox(-30, -14, 16)
    pillbox(22, 18, 18)
    bags(k, [(-16, -28, 0), (6, -24, 0), (22, -8, 0)], 3)
    bags(k, [(38, 6, 0), (48, 24, 0), (44, 40, 0)], 3)
    bags(k, [(-50, -6, 0), (-48, 14, 0)], 3)
    wire(k, (-52, -36, 0), (-6, -46, 0))
    wire(k, (-6, -46, 0), (40, -30, 0))
    wire(k, (40, -30, 0), (56, 4, 0))
    at(k, -12, 30, 0.36)
    land_tower(k)
    k.frame = Matrix.Identity(4)
    for x, y in ((0, -8), (8, -2), (-8, 6)):
        crate(k, x, y, 8)


def alliance_hq(k):
    """An alliance's hall: a long open hall and a ring of stones."""
    at(k, 12, -20, 0.19)
    houses.hero_hall(k, 3)
    k.frame = Matrix.Identity(4)
    ring_wall(k, [(-38, -10, 0), (-30, -36, 0), (0, -40, 0)], 2)
    ring_wall(k, [(30, -32, 0), (40, 0, 0), (32, 32, 0)], 2)
    campfire(k, 28, -12)


def field(k, level):
    """Farmland: furrowed beds, more and fuller with the level."""
    s = TILE * .46
    k.frame = Matrix.Identity(4)
    k.prism([(-s, -s), (s, -s), (s, s), (-s, s)], -2, 1, ck.rgb("8d6846"), None, .9, top=ck.rgb("9c754e"))
    rows = 3 + level
    for r in range(rows):
        x = -s * .8 + s * 1.6 * r / (rows - 1)
        k.prism([(x - 3, -s * .9), (x + 3, -s * .9), (x + 3, s * .9), (x - 3, s * .9)], 1, 3, ck.rgb("7f5b3b"), None, .9)
        for i in range(7):
            y = -s * .8 + s * 1.6 * i / 6
            green = k.shade(ck.rgb("7d8c50") if (r + level) % 3 else ck.rgb("c0a355"), .12)
            k.stone((x, y, 5), (6.5 + level, 6.5 + level, 6 + level * 1.4), k.rng.uniform(0, 90), green, jitter=.25, round_=1.0)
    if level >= 2:
        for a, b in (((-s, -s), (s, -s)), ((s, -s), (s, s))):
            for i in range(6):
                p = Vector((a[0] + (b[0] - a[0]) * i / 5, a[1] + (b[1] - a[1]) * i / 5, 0))
                k.rod(p, p + Vector((0, 0, 9)), .9, .8)
            k.rod((*a, 7), (*b, 7), .7, .7)
    if level == 3:
        at(k, -s * .2, s * .35, .13)
        k.gable_house(150, 150, 100, 50)
        k.frame = Matrix.Identity(4)


def quarry(k, level):
    """A quarry: cut blocks in front of a rock face."""
    k.frame = Matrix.Identity(4)
    grey = ck.rgb("a59c8d")
    for x, y, w, h in ((-14, 18, 30, 34), (8, 22, 30, 42), (24, 10, 24, 28), (-28, 6, 22, 24))[:2 + level]:
        k.rock((x, y, h * .3), (w, w, h), grey, upright=.8)
    for i in range(3 + level * 3):
        x, y = k.rng.uniform(-26, 24), k.rng.uniform(-28, 2)
        k.stone((x, y, 3.4), (9, 7, 7), k.rng.uniform(0, 90), grey, jitter=.08, round_=.2)
    if level >= 2:
        for x in (-6, 6):
            k.rod((x - 20, -6, 0), (-20, 2, 26), 1.2, 1.1)
        k.rod((-20, 2, 26), (-4, -10, 22), 1.2, 1.0)
        k.rod((-4, -10, 22), (-4, -10, 8), .4, .4, ck.DARK, ck.THIN, 4)
    if level == 3:
        at(k, 20, -22, .5)
        tent(k, 22, 28, 18)
        k.frame = Matrix.Identity(4)


# Nature, at the sizes of the prop atlases' frames: `h` is the frame's height on screen.


def crown(k, c, r, flat, n, col):
    ink = k.ink()
    for m in range(n):
        t = math.tau * m / n * 2.4
        f = math.sqrt((m + .5) / n)
        z = k.rng.uniform(-.5, .8) * r * flat * (1.1 - f * .6)
        p = c + Vector((math.cos(t) * r * f * .78, math.sin(t) * r * f * .78, z))
        s = r * k.rng.uniform(.3, .42)
        if m % 3 == 0:
            ink = k.ink()
        pts = [p + Vector((v.x, v.y, v.z * (.5 + .5 * flat))) * s * (1 + .34 * noise.noise(Vector(v) * 4.5 + p)) for v in ck._ball()[0]]
        k.mesh(pts, ck._ball()[1], tuple(x * (.84 + .3 * (z / (r * flat + 1) + .5)) for x in k.shade(col, .06)), ink, 0.9)


def broadleaf(k, p, h, col=None):
    z = h / ck.UP
    k.rod(p, p + Vector((0, 0, z * .45)), z * .06, z * .045, ck.SHADE)
    for t in (0.4, 2.6, 4.4):
        k.rod(p + Vector((0, 0, z * .3)), p + Vector((math.cos(t) * z * .2, math.sin(t) * z * .2, z * .55)), z * .03, z * .02, ck.SHADE)
    crown(k, p + Vector((0, 0, z * .62)), z * .37, .72, 20, col or ck.rgb("78824f"))


def olive(k, p, h):
    z = h / ck.UP
    for t in (0.2, 2.2, 4.1):
        b = p + Vector((math.cos(t), math.sin(t), 0)) * z * .04
        m = p + Vector((math.cos(t + 1) * z * .08, math.sin(t + 1) * z * .08, z * .28))
        k.rod(b, m, z * .055, z * .045, ck.rgb("7b6654"))
        k.rod(m, p + Vector((math.cos(t) * z * .24, math.sin(t) * z * .24, z * .52)), z * .04, z * .02, ck.rgb("7b6654"))
    crown(k, p + Vector((0, 0, z * .64)), z * .38, .55, 18, ck.rgb("9fa37c"))


def umbrella(k, p, h):
    z = h / ck.UP
    m = p + Vector((z * .03, z * .02, z * .62))
    k.rod(p, m, z * .035, z * .028, ck.rgb("8a5a40"))
    for t in (0.3, 1.7, 3.4, 5.0):
        k.rod(m, m + Vector((math.cos(t) * z * .2, math.sin(t) * z * .2, z * .18)), z * .02, z * .012, ck.rgb("8a5a40"))
    crown(k, m + Vector((0, 0, z * .22)), z * .34, .3, 16, ck.rgb("858d54"))


def palm(k, p, h):
    """A date palm: a leaning, ringed trunk and a head of drooping fronds."""
    z = h / ck.UP
    lean = Vector((k.rng.uniform(-.14, .14), k.rng.uniform(-.14, .14), 1.0)).normalized()
    pts = [p]
    for i in range(1, 7):
        f = i / 6
        pts.append(p + lean * z * .72 * f + Vector((0, 0, 0)) + Vector((lean.x, lean.y, 0)) * z * .1 * f * f)
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        k.rod(a, b, z * (.034 - .01 * i / 6), z * (.03 - .01 * i / 6), ck.rgb("8a6a4a") if i % 2 else ck.rgb("7a5c40"), None, 8)
    top = pts[-1]
    green = ck.rgb("7c8a48")
    for j in range(13):
        t = math.tau * j / 13 + k.rng.uniform(-.2, .2)
        d = Vector((math.cos(t), math.sin(t), 0))
        side = d.cross(Vector((0, 0, 1)))
        length = z * k.rng.uniform(.34, .44)
        prev_l = prev_r = None
        ink = k.ink()
        for s in range(6):
            f = (s + 1) / 6
            c = top + d * length * f + Vector((0, 0, z * (.1 * f - .3 * f * f)))
            w = z * .05 * math.sin(math.pi * min(1, f * 1.2 + .05))
            l, r = c + side * w, c - side * w
            a, b = (top, top) if prev_l is None else (prev_l, prev_r)
            k.mesh([a, b, r, l], [[0, 1, 2, 3]], k.shade(tuple(x * (.85 + .25 * f) for x in green), .08), ink, .5)
            prev_l, prev_r = l, r
    k.stone(top - Vector((0, 0, z * .02)), (z * .07, z * .07, z * .06), 0, ck.rgb("a4703c"), round_=1.0)


def cedar(k, p, h):
    k.pine(p, h / ck.UP * .96, h * .3)


# Frames 1, 5, 13 and 17 stand round pools too (GroundPlan.ORCHARD_FRAMES), so 13 and 17 are palms.
TREES = [[umbrella], [broadleaf], [cedar], [olive], [umbrella] * 2, [broadleaf] * 3, [cedar] * 2, [olive] * 3, [broadleaf] * 2, [umbrella], [broadleaf] * 2, [cedar],
         [olive] * 2, [palm], [umbrella] * 3, [olive], [cedar] * 3, [palm, palm, olive]]


def trees(k, i, p, w, h):
    group = TREES[i]
    for j, make in enumerate(group):
        n = len(group)
        off = 0.0 if n == 1 else (j - (n - 1) / 2) / n * w * .62
        size = h * (.9 if n == 1 else (.74 if j == 0 else .56 - .06 * (j % 2)))
        dy = 0.0 if n == 1 else (j % 2) * -h * .10
        make(k, p + k_px(off, dy), min(size, w * .98 if n == 1 else w * .58))


def k_px(dx, dy):
    """A step on the ground that shows as (dx, dy) px, dy down."""
    return Vector((dx * ck.S45 + dy * 2 * ck.S45, dx * ck.S45 - dy * 2 * ck.S45, 0))


def rocks(k, i, p, w, h):
    col = [ck.rgb("b88a60"), ck.rgb("b3a794"), ck.rgb("a58f70")][(0, 1, 2, 0, 0, 1, 0, 1, 2, 0, 1, 0, 0, 1, 0, 1, 0, 1)[i]]
    n = 1 + (i * 7) % 4
    for j in range(n):
        f = 1.0 if j == 0 else k.rng.uniform(.4, .62)
        off = 0 if j == 0 else (w * .26 * (1 if j % 2 else -1))
        z = h * .74 * f / ck.UP
        k.rock(p + k_px(off * .9, -h * .16 + (h * .08 if j else 0)) + Vector((0, 0, z * .3)), (w * .56 * f, w * .46 * f, z), col, upright=.5)


def scrub(k, i, p, w, h):
    kind = ("twig", "bush", "leaf", "grass", "olive", "fern", "twig", "grass", "bush")[i]
    if kind in ("bush", "leaf"):
        k.bush(p + k_px(0, -h * .2), w * .34, ck.rgb("74784d") if kind == "bush" else ck.rgb("7d8a55"))
    elif kind == "olive":
        olive(k, p + k_px(0, -4), h * .92)
    else:
        col = {"twig": ck.rgb("a08a66"), "grass": ck.rgb("d8bd74"), "fern": ck.rgb("93a05c")}[kind]
        ink = ck.THIN
        for _ in range(90):
            t = k.rng.uniform(0, math.tau)
            d = Vector((math.cos(t), math.sin(t), 0))
            s = d.cross(Vector((0, 0, 1))) * (3.2 if kind != "twig" else 1.6)
            reach = w * k.rng.uniform(.12, .34)
            b = p + k_px(0, -h * .12) + d * k.rng.uniform(0, w * .1)
            mid = b + d * reach * .5 + Vector((0, 0, h * k.rng.uniform(.4, .8)))
            tip = b + d * reach + Vector((0, 0, h * k.rng.uniform(.4, .85)))
            k.mesh([b - s, b + s, mid + s * .7, mid - s * .7, tip], [[0, 1, 2, 3], [3, 2, 4]], k.shade(col, .22), ink if _ % 9 else 0.6, .4)


def peaks(k, i, p, w, h):
    """A crag: a few tall shoulders of rock, snow on some tops."""
    snow = i in (3, 7, 11)
    n = 3 + i % 3
    for j in range(n):
        f = 1.0 if j == 0 else k.rng.uniform(.45, .8)
        off = 0.0 if j == 0 else (j - n / 2) * w * .62 / n + k.rng.uniform(-6, 6)
        z = h * .80 * f / ck.UP
        wide = w * k.rng.uniform(.26, .36)
        base = p + k_px(off, -h * (.14 + (.10 if j % 2 else 0.0)))
        k.rock(base + Vector((0, 0, z * .34)), (wide, wide * .9, z * 1.1), ck.rgb("a67c57") if j % 2 else ck.rgb("b48a62"), upright=.85, cuts=13)
        if snow and f > .7:
            k.rock(base + Vector((0, 0, z * .72)), (wide * .66, wide * .6, z * .3), ck.rgb("dcd8cf"), upright=.3, cuts=8)
    for j in range(4):
        s = k.rng.uniform(12, 24)
        k.rock(p + k_px(k.rng.uniform(-.36, .36) * w, -s * .6 - 4) + Vector((0, 0, s * .2)), (s * 1.3, s, s), ck.ROCK_TOP, upright=.3, cuts=8)


NATURE = {"trees": trees, "rocks": rocks, "scrub": scrub, "peaks": peaks}
# Ink is heavier on what the map draws small.
WEIGHT = {"trees": 0.8, "rocks": 1.7, "scrub": 0.8, "peaks": 1.0}

PIECES = {
    "base": base, "frontier_tower": frontier_tower, "patrol": patrol, "convoy": convoy, "outpost": outpost, "fortified_line": fortified_line, "alliance_hq": alliance_hq,
    **{"farmland_%d" % n: (lambda k, n=n: field(k, n)) for n in (1, 2, 3)},
    **{"quarry_%d" % n: (lambda k, n=n: quarry(k, n)) for n in (1, 2, 3)},
}
