"""The map ground's seamless materials, modelled in map units (1 unit = 1 world px): things scattered on flat ground, repeated at
the edges so each picture tiles. The map's shader (shaders/map_ground.gdshader) lays them on the land."""

import math

from mathutils import Vector

import camp_kit as ck

# Map units one picture covers, each way on the screen.
PERIOD = 512

COLOURS = {
    "sand": ck.rgb("cda478"), "steppe": ck.rgb("ba9464"), "meadow": ck.rgb("978b58"), "forest": ck.rgb("7d7049"), "gravel": ck.rgb("b8926c"), "rock": ck.rgb("b0845c"),
}


class Scatter:
    """Puts things down at px of the tile, and again wherever they reach over its edge."""

    def __init__(self, kit):
        self.k = kit

    def each(self, reach=40):
        x, y = self.k.rng.uniform(0, PERIOD), self.k.rng.uniform(0, PERIOD)
        return self.at(x, y, reach)

    def at(self, x, y, reach=40):
        out = []
        for dx in (-PERIOD, 0, PERIOD):
            for dy in (-PERIOD, 0, PERIOD):
                if -reach < x + dx < PERIOD + reach and -reach < y + dy < PERIOD + reach:
                    out.append((x + dx, y + dy))
        return out


def repeat(k, spots, make):
    """Makes the same thing at every spot (the same random numbers each time)."""
    state = k.rng.getstate()
    end = state
    for x, y in spots:
        k.rng.setstate(state)
        make(k.ground(x, y))
        end = k.rng.getstate()
    k.rng.setstate(end)
    k.rng.random()


def pebble(k, s, lo, hi, col):
    size = k.rng.uniform(lo, hi)
    repeat(k, s.each(), lambda p: k.rock(p + Vector((0, 0, size * 0.16)), (size * 1.35, size, size * 0.8), col, upright=0.25, cuts=6))


def blades(k, s, col, n, lo, hi, spread=3.0, wide=0.7):
    def make(p):
        ink = ck.THIN
        for _ in range(n):
            t = k.rng.uniform(0, math.tau)
            d = Vector((math.cos(t), math.sin(t), 0))
            b = p + d * k.rng.uniform(0, spread)
            h = k.rng.uniform(lo, hi)
            tip = b + d * h * 0.4 + Vector((0, 0, h))
            side = Vector((ck.S45, ck.S45, 0)) * wide
            k.mesh([b - side, b + side, tip], [[0, 1, 2]], k.shade(tone(col, 1.5), 0.2), ink, 0.0)
    repeat(k, s.each(), make)


def stroke(k, s, col, length, sag, r=0.35):
    """A thin curved mark on the ground: a wind ripple or a crack."""
    turn = k.rng.gauss(0.15, 0.25)
    bend = k.rng.uniform(-sag, sag)
    size = length * k.rng.uniform(0.5, 1.2)

    def make(p):
        pts = []
        for i in range(9):
            f = i / 8 - 0.5
            dx, dy = f * size, bend * (1 - 4 * f * f) + f * size * math.tan(turn) * 0.5
            pts.append(p + Vector((dx * ck.S45 + dy * 2 * ck.S45, dx * ck.S45 - dy * 2 * ck.S45, 0.2)))
        for a, b in zip(pts, pts[1:]):
            k.rod(a, b, r, r, col, ck.THIN, 4, 0.0)
    repeat(k, s.each(size), make)


def patch(k, s, col, lo, hi):
    """A flat patch of another tone, with no line round it."""
    rx = k.rng.uniform(lo, hi)
    a, b = k.rng.uniform(0, 6), k.rng.uniform(0, 6)
    z = k.rng.uniform(0.05, 0.4)

    def make(p):
        pts = []
        for i in range(24):
            t = math.tau * i / 24
            r = rx * (1 + 0.2 * math.sin(3 * t + a) + 0.13 * math.sin(5 * t + b))
            dx, dy = r * math.cos(t), r * 0.5 * math.sin(t)
            pts.append(p + Vector((dx * ck.S45 + dy * 2 * ck.S45, dx * ck.S45 - dy * 2 * ck.S45, z)))
        k.land(pts[::-1], col, 0.0)
    repeat(k, s.each(hi * 1.5), make)


def tone(col, f):
    return tuple(c * f for c in col)


def slabs(k, size, col):
    """Cracked rock: flat plates of a wrapped Voronoi pattern, each a little higher or lower."""
    n = int(PERIOD / size)
    # Cells in ground px, squashed as the ground is seen.
    rows = n * 2
    seeds = {}
    for i in range(n):
        for j in range(rows):
            seeds[i, j] = ((i + k.rng.uniform(.02, .98)) * PERIOD / n, (j + k.rng.uniform(.02, .98)) * PERIOD / rows, k.rng.uniform(0, 5), k.ink(), k.rng.uniform(.9, 1.08))
    for i in range(-1, n + 1):
        for j in range(-1, rows + 1):
            sx, sy, z, ink, f = seeds[i % n, j % rows]
            sx, sy = sx + (i // n) * PERIOD, sy + (j // rows) * PERIOD
            poly = [(sx - 200, sy - 100), (sx + 200, sy - 100), (sx + 200, sy + 100), (sx - 200, sy + 100)]
            for di in range(-2, 3):
                for dj in range(-3, 4):
                    if di == 0 and dj == 0:
                        continue
                    a, b = i + di, j + dj
                    tx, ty, _, _, _ = seeds[a % n, b % rows]
                    tx, ty = tx + (a // n) * PERIOD, ty + (b // rows) * PERIOD
                    poly = clip(poly, sx, sy, tx, ty, 0.6)
            if len(poly) > 2:
                pts = [k.ground(x, y) for x, y in poly]
                k.prism([(p.x, p.y) for p in pts], -6, z, tone(col, f * 0.8), ink, 0.0, top=tone(col, f))


def clip(poly, sx, sy, tx, ty, gap):
    """Keeps the side of the line between two seeds that is nearer the first (y counts double: the ground is squashed)."""
    nx, ny = tx - sx, (ty - sy) * 4
    mx, my = (sx + tx) / 2, (sy + ty) / 2
    limit = nx * mx + ny * my - gap * math.hypot(nx, ny)
    out = []
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        da, db = nx * ax + ny * ay - limit, nx * bx + ny * by - limit
        if da <= 0:
            out.append((ax, ay))
        if (da < 0) != (db < 0):
            t = da / (da - db)
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    return out


def material(k, name):
    s = Scatter(k)
    col = COLOURS[name]
    far = 700
    k.land([k.ground(x, y) for x, y in ((-far, PERIOD + far), (PERIOD + far, PERIOD + far), (PERIOD + far, -far), (-far, -far))], col, 0.0)
    line = tone(col, 0.55)
    if name == "sand":
        for _ in range(16):
            patch(k, s, tone(col, k.rng.choice((0.95, 1.05))), 30, 80)
        for _ in range(26):
            stroke(k, s, line, 46, 5)
        for _ in range(34):
            pebble(k, s, 2.5, 6, ck.ROCK_TOP)
        for _ in range(9):
            blades(k, s, ck.rgb("a8915a"), 7, 4, 8)
    elif name == "steppe":
        for _ in range(26):
            patch(k, s, tone(col, k.rng.choice((0.93, 1.06))), 24, 60)
        for _ in range(150):
            blades(k, s, k.rng.choice((ck.rgb("a58f4e"), ck.rgb("8e8a4a"), ck.rgb("c2a760"))), 7, 4, 9)
        for _ in range(14):
            stroke(k, s, line, 22, 3)
        for _ in range(18):
            pebble(k, s, 2.5, 5, ck.ROCK_TOP)
    elif name == "meadow":
        for _ in range(30):
            patch(k, s, tone(col, k.rng.choice((0.92, 1.07))), 24, 64)
        for _ in range(230):
            blades(k, s, k.rng.choice((ck.rgb("7d8248"), ck.rgb("8c8f50"), ck.rgb("a7a05c"))), 7, 4, 9, 4)
        for _ in range(22):
            stroke(k, s, line, 16, 3)
    elif name == "forest":
        for _ in range(30):
            patch(k, s, tone(col, k.rng.choice((0.9, 1.08))), 20, 56)
        for _ in range(150):
            blades(k, s, k.rng.choice((ck.rgb("65683a"), ck.rgb("767a42"), ck.rgb("8a7e48"))), 8, 4, 10, 4)
        for _ in range(90):
            t = k.rng.uniform(0, math.tau)
            leaf = k.shade(k.rng.choice((ck.rgb("8f6b3c"), ck.rgb("a1824a"), ck.rgb("6e6a3c"))), 0.15)

            def drop(p, t=t, leaf=leaf):
                d, e = Vector((math.cos(t), math.sin(t), 0)) * 3.2, Vector((-math.sin(t), math.cos(t), 0)) * 1.5
                k.mesh([p - d, p - e, p + d, p + e], [[0, 1, 2, 3]], leaf, ck.THIN, 0.0)
            repeat(k, s.each(), drop)
        for _ in range(10):
            pebble(k, s, 3, 7, ck.rgb("8f8268"))
    elif name == "gravel":
        for _ in range(20):
            patch(k, s, tone(col, k.rng.choice((0.93, 1.06))), 24, 60)
        for _ in range(190):
            pebble(k, s, 2.5, 8, k.rng.choice((ck.ROCK_TOP, ck.rgb("a79781"), ck.rgb("b58a62"))))
        for _ in range(14):
            pebble(k, s, 9, 15, ck.rgb("a98f72"))
        for _ in range(16):
            blades(k, s, ck.rgb("94854e"), 6, 4, 8)
    elif name == "rock":
        slabs(k, 74, col)
        for _ in range(40):
            pebble(k, s, 2.5, 6, ck.ROCK_TOP)
        for _ in range(14):
            blades(k, s, ck.rgb("8c8350"), 6, 4, 8)


def cliff(k, width, height):
    """A straight rock face along the bottom of a `width` px strip, seen square on."""
    z = height / ck.UP
    rim = [k.ground(x, 0.0) + Vector((0, 0, 0.0)) for x in range(-60, width + 61, 40)]
    k.cliff(rim, z * 1.5, col=ck.rgb("a67c57"), flare=0.0, cell=(44.0, 90.0), rough=7.0, step=2.2, deep=0.12)
