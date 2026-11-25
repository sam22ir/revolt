"""Parts for the camp's full 3D models: walls, tiled roofs, stones, rocks, canvas, barrels, trees.

A Kit collects plain faces and turns them into one Blender mesh. Units are painting px. Every face carries a colour, an ink id (the
ink pass in camp_ink.py draws a line where ids differ) and a texture strength. Everything random comes from the Kit's seed, so a
rebuild gives the same picture.
"""

import math
import random

import bpy
from mathutils import Matrix, Vector, noise

S45 = math.sqrt(0.5)
UP = math.cos(math.radians(30.0))


def rgb(code):
    """An sRGB hex colour as the linear values Blender wants."""
    out = []
    for i in (0, 2, 4):
        c = int(code[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


PLASTER, STONE, QUOIN, SAND = rgb("ded8cf"), rgb("a08872"), rgb("c9bda9"), rgb("cda474")
TILE, ROCK, ROCK_TOP, WOOD = rgb("a4573f"), rgb("ab8059"), rgb("c09a6c"), rgb("6b4a33")
CANVAS, DARK, LEAF, PINE = rgb("c4ad84"), rgb("2c211c"), rgb("74764a"), rgb("626a47")
IRON, SACK, SHADE = rgb("504842"), rgb("b59a6c"), rgb("5e4a38")


THIN = 0.005  # the ink id of things too thin to outline


class Kit:
    def __init__(self, seed=1):
        self.rng = random.Random(seed)
        self.verts, self.faces, self.cols, self.inks, self.texs = [], [], [], [], []
        self.frame = Matrix.Identity(4)
        self.origin = (0.0, 0.0)

    # Placing things.

    def ground(self, px, py, z=0.0):
        """The point at height z that shows at (px, py), px to the right and down on the picture; origin is world (0, 0, 0)'s px."""
        right, up = px - self.origin[0], self.origin[1] - py
        back = (up - z * UP) * 2.0
        return Vector((right * S45 - back * S45, right * S45 + back * S45, z))

    def shade(self, col, spread=0.12):
        f = 1.0 + self.rng.uniform(-spread, spread)
        w = self.rng.uniform(-0.03, 0.03)
        return (col[0] * f * (1 + w), col[1] * f, col[2] * f * (1 - w))

    def ink(self):
        return self.rng.uniform(0.02, 1.0)

    def mesh(self, points, faces, col, ink=None, tex=0.5):
        base = len(self.verts)
        ink = self.ink() if ink is None else ink
        self.verts += [self.frame @ Vector(p) for p in points]
        for f in faces:
            self.faces.append([base + i for i in f])
            self.cols.append(col)
            self.inks.append(ink)
            self.texs.append(tex)
        return ink

    # Plain solids.

    def prism(self, poly, z0, z1, col, ink=None, tex=0.5, top=None):
        n = len(poly)
        pts = [(p[0], p[1], z0) for p in poly] + [(p[0], p[1], z1) for p in poly]
        if sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n)) < 0:
            side = [[(i + 1) % n, i, n + i, n + (i + 1) % n] for i in range(n)]
            cap = list(range(2 * n - 1, n - 1, -1))
        else:
            side = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
            cap = list(range(n, 2 * n))
        ink = self.mesh(pts, side, col, ink, tex)
        self.mesh(pts, [cap], top or col, ink, tex)

    def box(self, x0, x1, y0, y1, z0, z1, col, ink=None, tex=0.5):
        self.prism([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], z0, z1, col, ink, tex)

    def obox(self, at, size, turn, col, ink=None, tex=0.5):
        """A box standing on `at`, turned `turn` degrees."""
        c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
        poly = [(at[0] + c * x - s * y, at[1] + s * x + c * y) for x, y in
                ((-size[0] / 2, -size[1] / 2), (size[0] / 2, -size[1] / 2), (size[0] / 2, size[1] / 2), (-size[0] / 2, size[1] / 2))]
        self.prism(poly, at[2], at[2] + size[2], col, ink, tex)

    def rod(self, a, b, r0, r1=None, col=WOOD, ink=None, sides=8, tex=0.5):
        a, b = Vector(a), Vector(b)
        r1 = r0 if r1 is None else r1
        axis = (b - a).normalized()
        u = axis.orthogonal().normalized()
        v = axis.cross(u)
        pts = []
        for p, r in ((a, r0), (b, r1)):
            pts += [p + (u * math.cos(t) + v * math.sin(t)) * r for t in (math.tau * i / sides for i in range(sides))]
        faces = [[i, (i + 1) % sides, sides + (i + 1) % sides, sides + i] for i in range(sides)]
        self.mesh(pts, faces + [list(range(sides, 2 * sides)), list(range(sides - 1, -1, -1))], col, ink, tex)

    def lathe(self, at, profile, col, ink=None, sides=16, tex=0.5):
        """A turned shape: profile is (radius, height, colour or None) from bottom to top."""
        ink = self.ink() if ink is None else ink
        for (r0, z0, _), (r1, z1, c) in zip(profile, profile[1:]):
            pts = []
            for r, z in ((r0, z0), (r1, z1)):
                pts += [(at[0] + math.cos(t) * r, at[1] + math.sin(t) * r, at[2] + z) for t in
                        (math.tau * i / sides for i in range(sides))]
            self.mesh(pts, [[i, (i + 1) % sides, sides + (i + 1) % sides, sides + i] for i in range(sides)], c or col, ink, tex)

    # Stones and rocks.

    def stone(self, at, size, turn, col, jitter=0.12, roll=0.0, round_=0.35, tex=0.7):
        """A rounded, slightly crooked block centred on `at`."""
        rot = Matrix.Rotation(math.radians(turn), 3, "Z") @ Matrix.Rotation(math.radians(roll), 3, "Y")
        pts, index = [], {}
        steps = (-1.0, -0.6, 0.6, 1.0)
        for i in range(4):
            for j in range(4):
                for k in range(4):
                    if 0 < i < 3 and 0 < j < 3 and 0 < k < 3:
                        continue
                    p = Vector((steps[i], steps[j], steps[k]))
                    outer = sum(abs(c) == 1.0 for c in p)
                    p *= 1.0 - round_ * (0.0, 0.0, 0.16, 0.34)[outer]
                    index[i, j, k] = len(pts)
                    pts.append(p)
        skew = [Vector([self.rng.uniform(-jitter, jitter) for _ in range(3)]) for _ in range(8)]
        for n, p in enumerate(pts):
            d = Vector()
            for m in range(8):
                w = 1.0
                for a in range(3):
                    w *= (0.5 + 0.5 * p[a]) if (m >> a) & 1 else (0.5 - 0.5 * p[a])
                d += skew[m] * w
            p = p + d
            pts[n] = Vector(at) + rot @ Vector((p.x * size[0] / 2, p.y * size[1] / 2, p.z * size[2] / 2))
        faces = []
        for a in range(3):
            for side in (0, 3):
                for u in range(3):
                    for v in range(3):
                        quad = []
                        for du, dv in ((0, 0), (1, 0), (1, 1), (0, 1)):
                            key = [0, 0, 0]
                            key[a], key[(a + 1) % 3], key[(a + 2) % 3] = side, u + du, v + dv
                            quad.append(index[tuple(key)])
                        faces.append(quad if side else quad[::-1])
        self.mesh(pts, faces, self.shade(col), None, tex)

    def rock(self, at, size, col=ROCK, upright=0.7, cuts=11, turn=None):
        """A boulder or cliff column centred on `at`: a ball with flat cuts, most of them upright."""
        bm = _ball()
        planes = []
        for i in range(cuts):
            t = self.rng.uniform(0, math.tau)
            lean = self.rng.uniform(-0.25, 0.25) if self.rng.random() < upright else self.rng.uniform(-1, 1)
            planes.append((Vector((math.cos(t), math.sin(t), lean)).normalized(), self.rng.uniform(0.6, 0.86)))
        planes.append((Vector((self.rng.uniform(-0.12, 0.12), self.rng.uniform(-0.12, 0.12), 1.0)).normalized(), self.rng.uniform(0.72, 0.8)))
        rot = Matrix.Rotation(self.rng.uniform(0, math.tau) if turn is None else math.radians(turn), 3, "Z")
        off = Vector([self.rng.uniform(-50, 50) for _ in range(3)])
        pts = []
        for p in bm[0]:
            # A fuller body than a ball, so columns keep their width to the top.
            p = Vector([math.copysign(abs(c) ** 0.7, c) for c in p])
            for n, d in planes:
                over = p.dot(n) - d
                if over > 0.0:
                    p = p - n * over * 0.94
            p = p * (1.0 + 0.05 * noise.noise(p * 2.2 + off))
            q = Vector((p.x * size[0] / 2, p.y * size[1] / 2, 0.0))
            q = rot @ q
            pts.append((at[0] + q.x, at[1] + q.y, at[2] + p.z * size[2] / 2))
        # Lower rock stands in less light.
        deep = max(0.62, 1.0 + (at[2] + size[2] * 0.3) / 520.0) if at[2] < 0 else 1.0
        self.mesh(pts, bm[1], self.shade(tuple(c * deep for c in col), 0.1), None, 1.0)

    def dry_wall(self, line, courses=4, height=11.5, depth=22.0, length=28.0, col=STONE):
        """A dry-stone wall along the world points `line`."""
        for course in range(courses):
            d = self.rng.uniform(0.2, 0.9) * length
            total = _length(line)
            missing = 0.12 if course == courses - 1 else 0.0
            while d < total:
                size = length * self.rng.uniform(0.75, 1.2)
                p, turn = _along(line, min(d, total))
                if self.rng.random() >= missing:
                    at = p + Vector((self.rng.uniform(-1.5, 1.5), self.rng.uniform(-1.5, 1.5), height * (course + 0.5)))
                    self.stone(at, (size + 1.0, depth * self.rng.uniform(0.9, 1.1), height * 1.06), turn, col, jitter=0.16,
                               roll=self.rng.uniform(-4, 4))
                d += size

    def sandbags(self, line, courses=3):
        for course in range(courses):
            d = 10.0 + (course % 2) * 15.0
            while d < _length(line) - 6.0:
                p, turn = _along(line, d)
                self.stone(p + Vector((0, 0, 11.0 * (course + 0.5))), (33, 21, 13.5), turn + self.rng.uniform(-5, 5), SACK,
                           jitter=0.09, roll=self.rng.uniform(-4, 4), round_=0.95, tex=0.4)
                d += 29.0

    def parapet(self, line, height, depth=18.0, col=PLASTER):
        """A plastered wall along `line`, one solid."""
        left, right = [], []
        for i, p in enumerate(line):
            a = line[max(i - 1, 0)]
            b = line[min(i + 1, len(line) - 1)]
            n = Vector((b.y - a.y, a.x - b.x, 0)).normalized() * depth / 2
            left.append(p + n)
            right.append(p - n)
        base = line[0].z
        self.prism([(p.x, p.y) for p in left + right[::-1]], base, base + height, col, None, 0.8, top=tuple(min(1, c * 1.1) for c in col))

    # Building parts. House parts are in the frame: front corner at the origin, left face along -X, right face along +Y.

    def gable_house(self, w, l, h, ridge, eave=16.0, quoins=True, tile=17.0):
        ink = self.ink()
        self.box(-w, 0, 0, l, 0, h, PLASTER, ink, 0.8)
        for y in (0.0, l):
            face = [0, 1, 2] if y == 0.0 else [2, 1, 0]
            self.mesh([(-w, y, h), (0, y, h), (-w / 2, y, h + ridge)], [face], PLASTER, ink, 0.8)
        if quoins:
            self.quoins(0.0, 0.0, h)
            self.quoins(0.0, l, h)
            self.quoins(-w, 0.0, h)
        self.tiled_slope((0, -eave, h), (0, l + eave, h), (-w / 2, -eave, h + ridge), eave, tile)
        self.tiled_slope((-w, l + eave, h), (-w, -eave, h), (-w / 2, l + eave, h + ridge), eave, tile)
        # Ridge tiles.
        n = int((l + 2 * eave) / 22)
        step = (l + 2 * eave) / n
        for i in range(n):
            y = -eave + i * step
            self.rod((-w / 2, y - 2, h + ridge + 1), (-w / 2, y + step, h + ridge + 3), 8.5, 7.5, self.shade(TILE, 0.15), None, 10, 0.6)
        # Barge boards under the front gable's tiles.
        low = h - eave * ridge / (w / 2)
        for side in (1, -1):
            x = eave if side == 1 else -w - eave
            self.rod((x, -eave + 3, low - 3), (-w / 2, -eave + 3, h + ridge - 3), 4.0, 4.0, WOOD, None, 6)

    def quoins(self, x, y, h):
        z, i = 4.0, 0
        while z < h - 8:
            long = i % 2 == 0
            a, b = (20, 12) if long else (12, 20)
            t = self.rng.uniform(13, 17)
            sx = -1 if x == 0.0 else 1
            x0, x1 = (x - a, x + 1.6) if sx < 0 else (x - 1.6, x + a)
            y0, y1 = (y - 1.6, y + b) if y == 0.0 else (y - b, y + 1.6)
            if self.rng.random() > 0.2:
                self.box(x0, x1, y0, y1, z, z + t - 1.5, self.shade(QUOIN, 0.08), None, 0.8)
            z += t
            i += 1

    def tiled_slope(self, low_a, low_b, top_a, eave, tile):
        """Rows of barrel tiles from the wall line low_a..low_b up to the ridge that starts at top_a, over the eave."""
        a, b, t = Vector(low_a), Vector(low_b), Vector(top_a)
        along = (b - a).normalized()
        down = (a - t)
        slope = down.normalized()
        run = down.length * (1.0 + eave / Vector((down.x, down.y, 0)).length)
        normal = along.cross(-slope).normalized()
        if normal.z < 0:
            normal = -normal
        cols = int((b - a).length / tile)
        width = (b - a).length / cols
        rows = max(3, int(run / 24.0))
        step = run / rows
        deck = [t - normal * 3, t + along * (b - a).length - normal * 3, t + along * (b - a).length + slope * run - normal * 3, t + slope * run - normal * 3]
        self.mesh(deck, [[0, 1, 2, 3]], SHADE, None, 0.3)
        for c in range(cols):
            for r in range(rows):
                col = self.shade(TILE, 0.2)
                if self.rng.random() < 0.07:
                    col = self.shade(rgb("8c4632"), 0.1)
                x = (c + 0.5) * width + self.rng.uniform(-0.7, 0.7)
                head = t + along * x + slope * (r * step - 1.0)
                foot = t + along * x + slope * ((r + 1) * step + 3.0 + self.rng.uniform(-1.5, 1.5)) + normal * 2.2
                self._barrel_tile(head, foot, along, normal, width * 0.44, width * 0.54, col)

    def _barrel_tile(self, head, foot, along, normal, r0, r1, col):
        pts, n = [], 6
        for p, r in ((head, r0), (foot, r1)):
            pts += [p + along * math.cos(math.pi * i / n) * r + normal * math.sin(math.pi * i / n) * r * 0.8 for i in range(n + 1)]
        faces = [[i, n + 1 + i, n + 2 + i, i + 1] for i in range(n)]
        faces.append([n + 1 + i for i in range(n + 1)])
        self.mesh(pts, faces, col, None, 0.8)

    def window(self, face, at, z, w=24.0, h=34.0):
        """A barred window; face "right" (on x = 0) or "front" (on y = 0), `at` along that wall."""
        def part(a0, a1, z0, z1, d0, d1, col):
            if face == "right":
                self.box(d0, d1, a0, a1, z0, z1, col, None, 0.5)
            else:
                self.box(a0, a1, -d1, -d0, z0, z1, col, None, 0.5)
        part(at - w / 2, at + w / 2, z, z + h, -1, 1.0, DARK)
        for a0, a1 in ((at - w / 2 - 4, at - w / 2), (at + w / 2, at + w / 2 + 4)):
            part(a0, a1, z - 2, z + h + 2, -1, 3.5, WOOD)
        part(at - w / 2 - 5, at + w / 2 + 5, z + h, z + h + 5, -1, 4.5, WOOD)
        part(at - w / 2 - 7, at + w / 2 + 7, z - 6, z, -1, 6.5, QUOIN)
        for i in (1, 2):
            a = at - w / 2 + w * i / 3
            part(a - 1.2, a + 1.2, z, z + h, 0, 3, IRON)

    def door(self, at, w=36.0, h=70.0):
        self.box(-1, 1.5, at - w / 2, at + w / 2, 0, h, DARK, None, 0.4)
        for i in range(4):
            a = at - w / 2 + w * i / 4
            self.box(0, 3.0, a + 0.4, a + w / 4 - 0.4, 2, h - 2, self.shade(WOOD, 0.1), None, 0.8)
        for a in (at - w / 2 - 5, at + w / 2):
            self.box(-1, 5, a, a + 5, 0, h + 4, self.shade(WOOD, 0.08), None, 0.8)
        self.box(-1, 5.5, at - w / 2 - 7, at + w / 2 + 7, h, h + 7, self.shade(WOOD, 0.08), None, 0.8)

    # Props.

    def crate(self, at, size, turn=0.0):
        self.obox(at, size, turn, self.shade(WOOD, 0.08), None, 0.8)
        c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
        for z in (0.08, 0.5, 0.92):
            self.obox((at[0], at[1], at[2] + size[2] * z - 2.0), (size[0] + 3, size[1] + 3, 4.0), turn, self.shade(rgb("7d583c"), 0.08), None, 0.7)
        for sx in (-1, 1):
            for sy in (-1, 1):
                x, y = sx * size[0] / 2, sy * size[1] / 2
                self.obox((at[0] + c * x - s * y, at[1] + s * x + c * y, at[2]), (5, 5, size[2] + 1), turn, self.shade(rgb("7d583c"), 0.08), None, 0.7)

    def barrel(self, at, r=13.0, h=32.0):
        hoop = IRON
        c = self.shade(rgb("75523a"), 0.1)
        self.lathe(at, [(r * .82, 0, None), (r * .9, h * .18, c), (r * .93, h * .18, hoop), (r * .97, h * .28, hoop), (r, h * .5, c),
                        (r * .97, h * .72, c), (r * .99, h * .72, hoop), (r * .93, h * .82, hoop), (r * .82, h, c), (r * .72, h, hoop),
                        (r * .7, h - 3, c), (0.1, h - 3, rgb("5c4230"))], c)

    def canvas(self, corners, sag=14.0, col=CANVAS, n=14, peak=0.0):
        """Cloth hung from four world points, with scalloped edges."""
        a, b, c, d = [Vector(p) for p in corners]
        pts = []
        for i in range(n + 1):
            for j in range(n + 1):
                u, v = i / n, j / n
                p = a.lerp(b, u).lerp(d.lerp(c, u), v)
                p.z -= sag * 4 * (u * (1 - u) + v * (1 - v)) * 0.5
                # Folds running down from the ropes.
                p.z += 3.4 * math.sin(u * 19.0 + 4.0 * v) * (1 - abs(2 * v - 1)) + 1.6 * math.sin(v * 23.0 + u * 7.0) * (1 - abs(2 * u - 1))
                p.z += peak * (1 - abs(2 * u - 1)) * (1 - abs(2 * v - 1))
                edge = 0.12 * 4
                mid = (a + b + c + d) / 4
                pull = edge * max(u * (1 - u) if j in (0, n) else 0.0, v * (1 - v) if i in (0, n) else 0.0)
                pts.append(p.lerp(mid, pull))
        faces = [[i * (n + 1) + j, i * (n + 1) + j + 1, (i + 1) * (n + 1) + j + 1, (i + 1) * (n + 1) + j] for i in range(n) for j in range(n)]
        self.mesh(pts, faces, col, None, 0.8)

    def pine(self, at, h=150.0, r=44.0):
        at = Vector(at)
        self.rod(at, at + Vector((0, 0, h * 0.4)), r * 0.16, r * 0.1, SHADE)
        tiers = 9
        for i in range(tiers):
            t = i / (tiers - 1)
            z = h * (0.14 + 0.76 * t)
            radius = r * (1.0 - t) ** 0.85 + 4.0
            drop = h * 0.13
            spikes = 13
            twist = self.rng.uniform(0, math.tau)
            pts = [at + Vector((0, 0, z + drop * 1.1))]
            for k in range(spikes * 2):
                a = twist + math.tau * k / (spikes * 2)
                rr = radius * (self.rng.uniform(0.92, 1.12) if k % 2 == 0 else 0.7)
                pts.append(at + Vector((math.cos(a) * rr, math.sin(a) * rr, z - (drop * 0.35 if k % 2 == 0 else 0.0) + self.rng.uniform(-3, 3))))
            n = spikes * 2
            self.mesh(pts, [[0, 1 + k, 1 + (k + 1) % n] for k in range(n)], self.shade(tuple(c * (0.8 + 0.4 * t) for c in PINE), 0.08), None, 0.9)

    def bush(self, at, r=26.0, col=LEAF):
        at = Vector(at)
        for _ in range(16):
            t, e = self.rng.uniform(0, math.tau), self.rng.uniform(0.0, 1.0)
            p = at + Vector((math.cos(t) * r * 0.75 * (1 - e * 0.6), math.sin(t) * r * 0.75 * (1 - e * 0.6), r * 0.25 + r * 0.6 * e))
            s = r * self.rng.uniform(0.34, 0.5)
            pts = [p + Vector(v) * s * (1.0 + 0.45 * noise.noise(Vector(v) * 3.1 + p)) for v in _ball()[0]]
            self.mesh(pts, _ball()[1], self.shade(col, 0.14), None, 0.9)

    def tuft(self, at, h=10.0):
        at = Vector(at)
        ink = THIN
        for _ in range(6):
            t = self.rng.uniform(0, math.tau)
            d = Vector((math.cos(t), math.sin(t), 0))
            tip = at + d * h * 0.5 + Vector((0, 0, h * self.rng.uniform(0.7, 1.1)))
            s = d.cross(Vector((0, 0, 1))) * 1.3
            self.mesh([at - s + d * 2, at + s + d * 2, tip], [[0, 1, 2]], self.shade(rgb("8a7a3f"), 0.15), ink, 0.3)

    def build(self, name):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        col = mesh.attributes.new("col", "FLOAT_COLOR", "FACE")
        col.data.foreach_set("color", [c for k in self.cols for c in (*k, 1.0)])
        for key, values in (("ink", self.inks), ("tex", self.texs)):
            mesh.attributes.new(key, "FLOAT", "FACE").data.foreach_set("value", values)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj


_BALL = None


def _ball():
    global _BALL
    if _BALL is None:
        import bmesh
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
        _BALL = ([v.co.copy() for v in bm.verts], [[v.index for v in f.verts] for f in bm.faces])
        bm.free()
    return _BALL


def _length(line):
    return sum((b - a).length for a, b in zip(line, line[1:]))


def _along(line, d):
    for a, b in zip(line, line[1:]):
        seg = (b - a).length
        if d <= seg or b is line[-1]:
            t = b - a
            return a.lerp(b, min(1.0, d / seg)), math.degrees(math.atan2(t.y, t.x))
        d -= seg
    return line[-1], 0.0
