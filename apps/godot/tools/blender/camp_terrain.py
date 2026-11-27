"""The camp's ground: terraces, cliffs, roads and everything on them that never changes. Positions are painting px with a height;
the buildings (camp_houses.py) stand on the same terraces."""

import math

from mathutils import Vector

import camp_kit as ck

# Terrace heights.
HQ, MID, YARD, ROAD, FARM, SHELF, LOW = 305.0, 262.0, 0.0, -120.0, -350.0, 190.0, -600.0
ROAD_TINT, PATH, GRASS = ck.rgb("bd9060"), ck.rgb("d8b07c"), ck.rgb("9c8b58")


def line(k, points, z=0.0):
    """World points from (px, py) or (px, py, z)."""
    return [k.ground(p[0], p[1], p[2] if len(p) > 2 else z) for p in points]


def strip(k, points, width, col, z):
    """A worn band on the ground along `points`, `width` painting px wide on the ground."""
    pts = line(k, points, z)
    left, right = [], []
    for i, p in enumerate(pts):
        t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        n = Vector((-t.y, t.x, 0)).normalized() * (width / 2 * k.rng.uniform(0.75, 1.25))
        left.append(p + n)
        right.append(p - n)
    for i in range(len(pts) - 1):
        k.land([left[i], right[i], right[i + 1], left[i + 1]], col)


def smoothed(points, rounds=2):
    """Chaikin's corner cutting, keeping the ends."""
    for _ in range(rounds):
        out = [points[0]]
        for a, b in zip(points, points[1:]):
            out.append(tuple(x * 0.75 + y * 0.25 for x, y in zip(a, b)))
            out.append(tuple(x * 0.25 + y * 0.75 for x, y in zip(a, b)))
        points = out + [points[-1]]
    return points


def terrace(k, rim, z, back, drop, col=ck.SAND, **cliff):
    """Level ground whose visible edge is `rim` (left to right), closed behind by `back`, with a rock face under the rim."""
    edge = smoothed(rim)
    k.land(line(k, edge + list(back), z), col)
    k.cliff(line(k, edge, z), drop, **cliff)


def blotch(k, x, y, rx, ry, z, col):
    """A patch of other ground with a soft, uneven outline (in px, flat on height z)."""
    n = 22
    a, b = k.rng.uniform(0, 6), k.rng.uniform(0, 6)
    pts = []
    for i in range(n):
        t = math.tau * i / n
        r = 1 + 0.16 * math.sin(3 * t + a) + 0.1 * math.sin(5 * t + b) + k.rng.uniform(-.04, .04)
        pts.append(k.ground(x + rx * r * math.cos(t), y + ry * r * math.sin(t), z))
    k.land(pts[::-1], col, 0.9)


def boulders(k, spots, z, col=ck.ROCK_TOP):
    for x, y, w, h in spots:
        k.rock(k.ground(x, y, z) + Vector((0, 0, h * 0.22)), (w, w * 0.85, h), upright=0.35, col=col, cuts=9)


def pebbles(k, box, z, n):
    for _ in range(n):
        x, y = k.rng.uniform(box[0], box[2]), k.rng.uniform(box[1], box[3])
        s = k.rng.uniform(5, 12)
        k.rock(k.ground(x, y, z) + Vector((0, 0, s * 0.2)), (s * 1.5, s, s), upright=0.3, col=ck.ROCK_TOP, cuts=5)


def stairs(k, top, bottom, z0, z1, width, n):
    """Steps from px `top` (z0) down to px `bottom` (z1); `width` is the step's px vector along its edge."""
    for i in range(n):
        t = i / (n - 1)
        z = z0 + (z1 - z0) * t
        x, y = top[0] + (bottom[0] - top[0]) * t, top[1] + (bottom[1] - top[1]) * t
        a, b = k.ground(x, y, z), k.ground(x + width[0], y + width[1], z)
        run = (k.ground(bottom[0], bottom[1], z1) - k.ground(top[0], top[1], z0)) / (n - 1)
        out = Vector((run.x, run.y, 0)) * 0.62
        k.prism([(q.x, q.y) for q in (a - out, b - out, b + out, a + out)], z - 60, z, k.shade(ck.STONE, 0.06), None, 0.8, top=ck.QUOIN)


def fence(k, points, z, h=34.0):
    pts = line(k, points, z)
    for a, b in zip(pts, pts[1:]):
        n = max(1, int((b - a).length / 48))
        for i in range(n + 1):
            p = a.lerp(b, i / n)
            k.rod(p, p + Vector((k.rng.uniform(-2, 2), k.rng.uniform(-2, 2), h)), 3.2, 2.6)
        for f in (0.45, 0.85):
            k.rod(a + Vector((0, 0, h * f)), b + Vector((0, 0, h * f + k.rng.uniform(-3, 3))), 2.2, 2.0)


def rack(k, at, turn_px, n=7):
    """A drying rack of poles leaning on a rail."""
    a, b = at, at + turn_px
    k.rod(a + Vector((0, 0, 62)), b + Vector((0, 0, 62)), 2.6, 2.4)
    side = (b - a).normalized().cross(Vector((0, 0, 1))) * 26
    for i in range(n):
        p = a.lerp(b, i / (n - 1))
        k.rod(p + side, p - side * 0.2 + Vector((0, 0, k.rng.uniform(68, 80))), 2.0, 1.6, k.shade(ck.WOOD, 0.15))
        k.rod(p - side, p + side * 0.2 + Vector((0, 0, k.rng.uniform(66, 76))), 2.0, 1.6, k.shade(ck.WOOD, 0.15))


def logs(k, at, along, n=3, r=8.0):
    t = along.normalized()
    side = t.cross(Vector((0, 0, 1)))
    for row in range(n):
        for i in range(n - row):
            p = at + side * ((i + row * 0.5) * r * 2) + Vector((0, 0, r + row * r * 1.75))
            j = t * k.rng.uniform(-6, 6)
            k.rod(p + j, p + along + j, r, r, k.shade(ck.rgb("8a6647"), 0.12), None, 10)


def table(k, at, size, turn, things=True):
    k.frame, keep = k.frame, k.frame
    c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (size[0] / 2 - 4), sy * (size[1] / 2 - 4)
            k.obox(at + Vector((c * x - s * y, s * x + c * y, 0)), (4, 4, size[2]), turn, ck.WOOD)
    k.obox(at + Vector((0, 0, size[2])), (size[0], size[1], 4), turn, k.shade(ck.rgb("7d583c"), 0.08), None, 0.8)
    if things:
        for _ in range(4):
            p = at + Vector((k.rng.uniform(-.35, .35) * size[0] * c, k.rng.uniform(-.35, .35) * size[0] * s, size[2] + 4))
            k.obox(p, (k.rng.uniform(6, 12), k.rng.uniform(5, 9), k.rng.uniform(3, 8)), turn + k.rng.uniform(-20, 20), k.shade(ck.IRON, 0.2))
    k.frame = keep


def watchtower(k, at, h=230.0, w=64.0):
    """An open timber lookout with a plank cabin and roof."""
    t = 12.0
    k.frame = k.frame @ __import__("mathutils").Matrix.Translation(at)
    legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for x, y in legs:
        k.rod((x * (w / 2 + t), y * (w / 2 + t), 0), (x * w / 2 * .8, y * w / 2 * .8, h), 4.6, 4.0)
    for i in range(3):
        z0, z1 = h * i / 3 + 10, h * (i + 1) / 3 - 4
        for (ax, ay), (bx, by) in zip(legs, legs[1:] + legs[:1]):
            r0, r1 = w / 2 + t * (1 - z0 / h), w / 2 * .8 + t * (1 - z1 / h)
            k.rod((ax * r0, ay * r0, z0), (bx * r1, by * r1, z1), 2.4, 2.2)
            k.rod((ax * r0, ay * r0, z0), (bx * r0, by * r0, z0), 2.6, 2.4)
    d = w * 0.62
    k.box(-d, d, -d, d, h, h + 6, k.shade(ck.WOOD, 0.05))
    for i in range(9):
        a = -d + i * d * 2 / 9
        for x0, x1, y0, y1 in ((a, a + d * 2 / 9 - .8, -d, -d + 3), (d - 3, d, a, a + d * 2 / 9 - .8), (a, a + d * 2 / 9 - .8, d - 3, d), (-d, -d + 3, a, a + d * 2 / 9 - .8)):
            k.box(x0, x1, y0, y1, h + 6, h + 40, k.shade(ck.rgb("7a573c"), 0.12), None, 0.8)
    for x, y in legs:
        k.rod((x * d * .9, y * d * .9, h), (x * d * .9, y * d * .9, h + 86), 3.2, 3.0)
    e, top = d * 1.25, h + 112
    for side in (1, -1):
        for i in range(8):
            y0 = -e + i * e * 2 / 8
            k.mesh([(side * e, y0, h + 80), (side * e, y0 + e / 4 - 1, h + 80), (0, y0 + e / 4 - 1, top), (0, y0, top)], [[0, 1, 2, 3]],
                   k.shade(ck.rgb("84644a"), 0.12), None, 0.8)
    for y in (-e, e):
        k.mesh([(-e, y, h + 80), (e, y, h + 80), (0, y, top)], [[0, 1, 2]], k.shade(ck.WOOD, 0.05), None, 0.8)
    k.rod((-12, -w / 2 - t - 10, 0), (-8, -d, h + 4), 2.2, 2.2)
    k.rod((12, -w / 2 - t - 10, 0), (8, -d, h + 4), 2.2, 2.2)
    for i in range(14):
        f = (i + 1) / 15
        y = (-w / 2 - t - 10) * (1 - f) + -d * f
        k.rod((-12 + 4 * f, y, (h + 4) * f), (12 - 4 * f, y, (h + 4) * f), 1.6, 1.6)
    k.frame = __import__("mathutils").Matrix.Identity(4)


def crops(k, a, b, along, rows, n, z):
    """Rows of cabbages on low beds: from px a to px b across the rows, each row running `along` px."""
    for r in range(rows):
        f = r / max(1, rows - 1)
        x, y = a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f
        p, q = k.ground(x, y, z), k.ground(x + along[0], y + along[1], z)
        t = (q - p).normalized()
        s = t.cross(Vector((0, 0, 1))) * 24
        k.prism([(v.x, v.y) for v in (p - t * 22 - s, q + t * 22 - s, q + t * 22 + s, p - t * 22 + s)], z, z + 6, ck.rgb("86603f"), None, 0.9)
        for i in range(n):
            c = p.lerp(q, i / (n - 1)) + Vector((k.rng.uniform(-3, 3), k.rng.uniform(-3, 3), 6))
            size = k.rng.uniform(19, 27)
            green = k.shade(ck.rgb("6f8550"), 0.1)
            ink = k.ink()
            for m in range(9):
                ang = math.tau * m / 9 + k.rng.uniform(-.2, .2)
                d = Vector((math.cos(ang), math.sin(ang), 0))
                e = Vector((-d.y, d.x, 0))
                lift = k.rng.uniform(0.35, 0.8)
                k.mesh([c, c + d * size * .6 - e * size * .42 + Vector((0, 0, size * lift * .5)), c + d * size * 1.1 + Vector((0, 0, size * lift)),
                        c + d * size * .6 + e * size * .42 + Vector((0, 0, size * lift * .5))], [[0, 1, 2, 3]], k.shade(green, 0.1), k.ink() if m % 2 else ink, 0.8)
            k.stone(c + Vector((0, 0, size * .4)), (size * 1.1, size * 1.1, size), 0, ck.rgb("84985f"), round_=1.0)


def build(k):
    # ---- Far back: the wall behind the command post and the lookout.
    k.wall(line(k, smoothed([(730, 178), (790, 140), (860, 118), (930, 130), (985, 175), (1060, 150), (1150, 165), (1230, 215), (1290, 285), (1360, 330), (1480, 345), (1640, 330)]), HQ), lambda f: 130 + 340 * min(1.0, f * 4.2) ** 0.7, flare=0.1, rough=26)
    boulders(k, ((650, 168, 130, 100), (715, 172, 140, 130), (590, 178, 120, 80), (520, 190, 110, 70), (1270, 250, 130, 150), (1330, 300, 110, 120),
                 (1500, 330, 150, 190), (1440, 260, 130, 160)), HQ - 10)
    # ---- The command post's terrace.
    hq_rim = [(195, 455), (235, 470), (300, 486), (380, 506), (440, 498), (530, 492), (610, 506), (700, 508), (790, 500), (870, 478), (940, 440), (985, 415)]
    hq_back = [(1040, 395), (1120, 385), (1240, 320), (1300, 240), (1200, 90), (900, 60), (640, 160), (500, 195), (360, 240), (270, 310), (205, 400)]
    terrace(k, hq_rim, HQ, hq_back, 350, rough=20)
    k.cliff(line(k, smoothed([(205, 470), (190, 440), (205, 400), (262, 318), (350, 248), (480, 205), (620, 165)][::-1]), HQ), 120, rough=12)
    boulders(k, ((300, 300, 100, 50), (385, 240, 120, 60), (470, 208, 110, 56), (560, 180, 110, 60), (228, 380, 90, 50)), HQ - 12)
    grass = [(905, 215), (1010, 175), (1150, 190), (1230, 280), (1180, 310), (1080, 300), (1000, 262)]
    k.land(line(k, grass, HQ + 0.6), GRASS)
    # ---- The lookout's terrace, and the stairs that reach it.
    mid_rim = [(1085, 560), (1120, 600), (1165, 640), (1215, 672), (1290, 700), (1380, 712), (1470, 700), (1640, 690)]
    mid_back = [(1640, 380), (1400, 380), (1200, 400), (1100, 430), (1040, 520)]
    terrace(k, mid_rim, MID, mid_back, 265, rough=22)
    k.cliff(line(k, smoothed([(985, 418), (1030, 412), (1110, 396), (1220, 350), (1310, 300), (1420, 330), (1640, 330)]), HQ), 100, rough=14)
    stairs(k, (985, 420), (1032, 530), HQ - 2, MID + 4, (66, -30), 8)
    stairs(k, (1120, 566), (1020, 692), MID + 3, MID - 62, (62, 34), 9)
    k.land(line(k, [(1000, 690), (1080, 720), (1030, 760), (940, 740)], MID - 66), ck.ROCK_TOP)
    k.cliff(line(k, [(930, 735), (960, 752), (1030, 762), (1085, 722), (1100, 690)], MID - 66), 200, rough=10)
    stairs(k, (962, 748), (915, 862), 84.0, YARD + 4, (64, 36), 8)
    boulders(k, ((1150, 450, 90, 80), (1200, 462, 80, 70), (1090, 470, 70, 60)), MID)
    k.land(line(k, [(930, 735), (1085, 722), (1130, 620), (1100, 540), (1020, 440), (940, 500)], MID - 70), ck.ROCK)
    boulders(k, ((985, 590, 100, 110), (1010, 530, 90, 100), (965, 650, 90, 100)), MID - 60, col=ck.ROCK)
    # ---- The cave and the rocks between the two terraces.
    cave(k)
    # ---- The yard in the middle: barracks on the left, armory on the right.
    yard_rim = [(255, 1095), (330, 1140), (420, 1170), (480, 1215), (530, 1262), (600, 1285), (690, 1297), (790, 1278), (880, 1240), (990, 1205), (1110, 1155), (1200, 1105), (1290, 1065)]
    yard_back = [(1380, 1030), (1480, 960), (1480, 850), (1200, 760), (900, 700), (600, 720), (240, 760), (215, 980)]
    terrace(k, yard_rim, YARD, yard_back, [105, 108, 112, 116, 118, 120, 120, 118, 116, 112, 104, 96, 80] and 122, rough=11, flare=0.14)
    boulders(k, ((1330, 1010, 100, 100), (1380, 1020, 80, 70), (1425, 1000, 110, 110), (1350, 1050, 60, 46), (1290, 1000, 70, 70), (1480, 1000, 130, 130), (1530, 960, 130, 150), (1440, 960, 120, 120), (1390, 975, 110, 110)), YARD - 20)
    stairs(k, (1182, 1075), (1225, 1140), YARD, ROAD + 10, (72, -42), 5)
    # ---- Left side: the high shelf and the wall behind the barracks and the hall.
    k.land(line(k, [(-80, 470), (90, 500), (180, 540), (205, 620), (205, 760), (225, 850), (235, 930), (-80, 960)], SHELF), ck.ROCK_TOP)
    k.cliff(line(k, smoothed([(-80, 905), (30, 925), (120, 915), (200, 940), (245, 930), (262, 880), (235, 800), (212, 700), (214, 600), (180, 530), (60, 500)]), SHELF),
            [480, 480, 470, 440, 400, 330, 260, 220, 190, 180, 150] and 420, rough=24)
    boulders(k, ((95, 545, 90, 60), (40, 640, 100, 60), (140, 630, 90, 60), (40, 790, 150, 90), (140, 790, 60, 40), (90, 850, 130, 80)), SHELF)
    k.cliff(line(k, smoothed([(225, 1130), (262, 1120), (300, 1150), (380, 1180)]), YARD + 20), 160, rough=12)
    # ---- The road and the hall's ground.
    k.land(line(k, [(-100, 1280), (300, 1150), (700, 1300), (1250, 1080), (1640, 900), (1640, 1250), (1500, 1260), (1400, 1270), (1300, 1290), (1190, 1300),
                    (1080, 1385), (920, 1480), (800, 1545), (700, 1595), (600, 1650), (520, 1700), (495, 1700), (300, 1690), (-100, 1640)], ROAD))
    # The bend: the road runs down to the farm.
    k.land([k.ground(*p) for p in ((-100, 1640, ROAD), (300, 1690, ROAD), (495, 1700, ROAD), (530, 1770, ROAD - 30), (600, 1850, ROAD - 150), (700, 1910, FARM + 8), (790, 1950, FARM),
                                   (740, 2140, FARM), (500, 2150, FARM), (380, 2060, FARM + 40), (280, 1950, ROAD - 130), (120, 1850, ROAD - 60), (-100, 1800, ROAD - 30))])
    # ---- The outcrop under the road, down to the farm, and the treasury's hollow.
    road_rim = [(505, 1715), (560, 1672), (640, 1628), (720, 1585), (830, 1530), (930, 1480)]
    k.cliff(line(k, smoothed(road_rim), ROAD), 240, rough=20, flare=0.45)
    crag_rim = [(920, 1485), (960, 1440), (1040, 1410), (1090, 1400), (1150, 1385), (1200, 1420), (1235, 1470)]
    crag_back = [(1290, 1400), (1400, 1330), (1480, 1270), (1400, 1180), (1200, 1290), (1080, 1380)]
    terrace(k, crag_rim, ROAD + 45, crag_back, 300, col=ck.ROCK_TOP, rough=24, flare=0.25)
    back_rim = [(1225, 1440), (1290, 1400), (1370, 1350), (1440, 1330), (1500, 1350), (1640, 1400)]
    k.cliff(line(k, smoothed(back_rim), ROAD + 45), 290, rough=16, flare=-0.05)
    terrace(k, [(1200, 1400), (1270, 1392), (1340, 1330), (1400, 1300), (1460, 1290), (1520, 1310), (1640, 1380)], ROAD + 110,
            [(1640, 1120), (1500, 1180), (1400, 1200), (1250, 1300)], 85, col=ck.ROCK_TOP, rough=20, flare=-0.1)
    boulders(k, ((1240, 1440, 110, 130), (1510, 1390, 120, 140), (960, 1500, 90, 80), (1030, 1545, 110, 130), (1000, 1480, 110, 90), (1120, 1450, 110, 100)), ROAD - 60)
    boulders(k, ((700, 1830, 110, 80), (800, 1780, 130, 120), (600, 1800, 90, 60), (880, 1690, 120, 120), (960, 1640, 110, 130), (780, 1870, 100, 60), (640, 1870, 80, 50),
                 (1190, 1640, 100, 110), (1160, 1560, 110, 150), (560, 1800, 90, 66), (600, 1850, 100, 70), (655, 1895, 100, 66), (720, 1930, 90, 54), (545, 1765, 80, 50)), FARM + 60, col=ck.ROCK)
    boulders(k, ((950, 1448, 80, 50), (1010, 1412, 90, 50), (1075, 1372, 80, 56), (1140, 1330, 80, 50), (1195, 1292, 90, 60), (1250, 1254, 70, 46), (1310, 1222, 90, 60), (1390, 1192, 90, 56), (1460, 1160, 110, 60), (1215, 1365, 90, 60), (1262, 1312, 80, 56), (1310, 1275, 90, 60), (1356, 1235, 80, 56)), ROAD + 20)
    # ---- The farm's ground and its edge.
    farm_rim = [(400, 2070), (440, 2120), (500, 2170), (560, 2205), (610, 2262), (660, 2310), (730, 2370), (800, 2425), (880, 2445), (950, 2430), (1010, 2440), (1100, 2425),
                (1190, 2440), (1260, 2425), (1340, 2480), (1410, 2475), (1480, 2510), (1640, 2490)]
    farm_back = [(1640, 1380), (1400, 1480), (1200, 1560), (1000, 1700), (700, 1800), (480, 1960)]
    terrace(k, farm_rim, FARM, farm_back, 330, rough=22)
    # ---- The rocks on the left below the bend, with the steps' old wall.
    k.land(line(k, [(-80, 1640), (60, 1650), (150, 1720), (195, 1800), (215, 1860), (150, 1930), (-80, 1960)], ROAD + 25), ck.ROCK_TOP)
    k.cliff(line(k, smoothed([(-80, 1900), (30, 1905), (110, 1890), (180, 1905), (250, 1900), (262, 1850), (205, 1770), (150, 1700), (60, 1645)]), ROAD + 25), 520, rough=26)
    k.cliff(line(k, smoothed([(180, 1950), (262, 1935), (310, 1960), (350, 2040), (410, 2080), (470, 2150)]), ROAD - 40), 330, rough=20)
    k.land(line(k, [(180, 1950), (262, 1935), (310, 1960), (350, 2040), (410, 2080), (330, 1890), (240, 1850)], ROAD - 40), ck.ROCK_TOP)
    boulders(k, ((330, 1905, 90, 70), (380, 1960, 80, 60), (300, 1870, 80, 60), (430, 2030, 70, 50)), ROAD - 60)
    # ---- The bottom: shelves going down.
    terrace(k, [(-80, 2560), (40, 2590), (110, 2610), (220, 2640), (330, 2620), (420, 2600), (520, 2640), (620, 2600), (640, 2540), (740, 2500), (800, 2560)], LOW,
            [(900, 2300), (500, 2200), (200, 2200), (-80, 2300)], 220, col=ck.ROCK_TOP, rough=20)
    terrace(k, [(560, 2700), (700, 2710), (860, 2690), (1000, 2740), (1100, 2800)], LOW - 90, [(1200, 2500), (700, 2500)], 160, col=ck.ROCK_TOP)
    k.land(line(k, [(-80, 2600), (1640, 2600), (1640, 3000), (-80, 3000)], LOW - 190), ck.ROCK)
    boulders(k, ((300, 2370, 260, 120), (420, 2400, 200, 110), (110, 2380, 190, 130), (560, 2420, 230, 130), (460, 2480, 120, 70), (30, 2450, 150, 110),
                 (700, 2520, 160, 90), (510, 2600, 80, 50), (880, 2640, 150, 110), (820, 2660, 60, 40), (940, 2690, 80, 50), (330, 2690, 190, 170), (60, 2680, 150, 110),
                 (1200, 2700, 180, 150), (1330, 2720, 150, 120), (1080, 2690, 130, 110), (1450, 2700, 190, 170)), LOW)
    furnish(k)


def cave(k):
    """The cave mouth under the command post: a dark hollow with a roof slab and boulders round it."""
    k.box(0, 0.1, 0, 0.1, 0, 0.1, ck.DARK)
    a, b = k.ground(660, 838, YARD), k.ground(850, 812, YARD)
    h = Vector((0, 0, 135))
    back = Vector((-ck.S45, ck.S45, 0)) * 40
    k.mesh([a + back, b + back, b + back + h, a + back + h], [[0, 1, 2, 3]], ck.rgb("2a1f1a"), None, 0.2)
    for i in range(9):
        f = i / 8
        p = a.lerp(b, f) + Vector((0, 0, 128 + 26 * math.sin(math.pi * f)))
        k.rock(p + Vector((ck.S45, -ck.S45, 0)) * 26, (95, 80, 74), upright=0.4, col=ck.ROCK_TOP)
    for x, y, w, h in ((630, 800, 110, 170), (600, 770, 120, 190), (665, 760, 90, 120), (868, 790, 100, 170), (900, 760, 120, 200), (570, 735, 120, 200), (940, 700, 130, 170),
                       (840, 700, 110, 90), (760, 660, 150, 90), (680, 680, 130, 90), (960, 650, 120, 150), (890, 815, 60, 60), (640, 830, 50, 44)):
        k.rock(k.ground(x, y + 34, YARD) + Vector((-18, 18, h * 0.28)), (w, w * .9, h), upright=0.55, col=ck.ROCK_TOP if h < 150 else ck.ROCK)
    for x in (700, 812):
        p = k.ground(x, 836 - (x - 700) * .12, YARD)
        k.rod(p, p + Vector((0, 0, 112)), 5, 5)
    k.rod(k.ground(690, 837, YARD) + Vector((0, 0, 112)), k.ground(824, 822, YARD) + Vector((0, 0, 112)), 5.5, 5.5)


def furnish(k):
    """Walls, plants and gear that stay whatever the buildings' levels."""
    # Command post.
    k.dry_wall(line(k, [(436, 488), (475, 488), (535, 479), (605, 471), (632, 488), (675, 498), (755, 496), (830, 466), (900, 441), (955, 422)], HQ))
    k.dry_wall(line(k, [(340, 450), (305, 430), (278, 395), (274, 360), (305, 322), (380, 293), (462, 268), (570, 238)], HQ), courses=4)
    k.dry_wall(line(k, [(1042, 390), (1100, 368), (1235, 312)], HQ))
    k.parapet(line(k, [(636, 436), (680, 446), (730, 449), (785, 442), (840, 428), (900, 411), (953, 394)], HQ), 48)
    k.parapet(line(k, [(915, 270), (980, 303), (1058, 344), (1050, 350)], HQ), 52)
    k.parapet(line(k, [(1058, 347), (990, 373)], HQ), 52)
    for x, y in ((360, 453), (428, 482)):
        p = k.ground(x, y, HQ)
        k.obox(p, (26, 26, 78), -10, ck.PLASTER, None, 0.8)
        k.obox(p + Vector((0, 0, 78)), (30, 30, 6), -10, ck.PLASTER, None, 0.8)
    foot = k.ground(446, 394, HQ)
    k.rod(foot, foot + Vector((0, 0, 360)), 5.5, 3.4)
    k.rod(foot + Vector((0, 0, 360)), foot + Vector((0, 0, 425)), 2.2, 1.6, ck.IRON)
    for z, w in ((0.62, 8), (0.78, 9), (0.9, 10), (1.02, 12)):
        for side in ((ck.S45, ck.S45), (ck.S45, -ck.S45)):
            v = Vector((side[0] * w, side[1] * w, 0))
            k.rod(foot - v + Vector((0, 0, 360 * z)), foot + v + Vector((0, 0, 360 * z)), 1.7, 1.7, ck.IRON)
    for z in range(5):
        k.rod(foot + Vector((0, 0, 60 + z * 58)), foot + Vector((9, 9, 60 + z * 58)), 1.4, 1.4, ck.IRON)
    for x, y in ((336, 356), (400, 328), (384, 386), (550, 242), (592, 225)):
        g = k.ground(x, y, HQ)
        k.rod(g, foot + Vector((0, 0, 345)), 0.8, 0.8, ck.DARK, ck.THIN, sides=5)
        k.rod(g, g + Vector((0, 0, 14)), 2.4, 2.4)
    for x, y, h in ((965, 225, 165), (1075, 280, 240), (1142, 300, 205), (1010, 190, 130)):
        k.pine(k.ground(x, y, HQ), h, h * 0.24)
    for x, y, r in ((1010, 262, 20), (1200, 290, 22), (905, 230, 16)):
        k.bush(k.ground(x, y, HQ), r)
    # Lookout terrace. Its tower is the watchtower building (camp_houses.py), drawn with the buildings.
    for x, y, h in ((1270, 440, 230), (1345, 470, 190)):
        k.pine(k.ground(x, y, MID), h, h * 0.25)
    k.barrel(k.ground(1238, 488, MID))
    k.dry_wall(line(k, [(1215, 575), (1290, 615), (1370, 650), (1450, 680), (1500, 660)], MID), courses=3)
    logs(k, k.ground(1462, 560, MID), k.ground(1530, 520, MID) - k.ground(1462, 560, MID))
    # Yard.
    rack(k, k.ground(585, 1040, YARD), k.ground(650, 1010, YARD) - k.ground(585, 1040, YARD))
    rack(k, k.ground(690, 985, YARD), k.ground(740, 965, YARD) - k.ground(690, 985, YARD), 5)
    logs(k, k.ground(500, 1185, YARD), k.ground(560, 1175, YARD) - k.ground(500, 1185, YARD), 3, 6)
    k.sandbags(line(k, [(590, 1235), (640, 1245), (715, 1258)], YARD), 2)
    for x, y in ((820, 1225), (885, 1200)):
        k.crate(k.ground(x, y, YARD), (64, 30, 30), 50)
    k.sandbags(line(k, [(1005, 1170), (1070, 1140), (1150, 1105)], YARD), 3)
    table(k, k.ground(1000, 1130, YARD), (70, 26, 26), 45)
    k.crate(k.ground(1085, 1085, YARD), (52, 24, 22), 45)
    k.sandbags(line(k, [(1105, 1030), (1050, 1010), (990, 985), (940, 945), (950, 915), (1010, 895)], YARD), 3)
    k.barrel(k.ground(1052, 935, YARD))
    for x, y, w, h in ((955, 1170, 40, 26), (740, 1150, 26, 16), (870, 1010, 22, 12)):
        k.rock(k.ground(x, y, YARD), (w, w, h), upright=0.3, col=ck.ROCK_TOP)
    k.pine(k.ground(525, 745, YARD), 205, 50)
    # Hall and road.
    logs(k, k.ground(105, 1650, ROAD), k.ground(175, 1690, ROAD) - k.ground(105, 1650, ROAD), 4, 6)
    k.crate(k.ground(45, 1540, ROAD), (44, 24, 24), 30)
    k.agave(k.ground(100, 1600, ROAD), 32)
    k.dry_wall(line(k, smoothed([(905, 1500), (820, 1535), (720, 1580), (640, 1625), (560, 1672), (515, 1712), (500, 1745), (510, 1790), (560, 1830)], 1), ROAD + 2), courses=3)
    k.dry_wall(line(k, [(512, 1795, ROAD - 30), (590, 1862, ROAD - 125), (690, 1918, FARM + 12), (722, 1990, FARM + 4), (742, 2070, FARM)]), courses=2)
    for z, col, w, pts in ((1.0, ROAD_TINT, 40, [(1600, 985), (1400, 1080), (1200, 1190), (1000, 1300), (800, 1400), (600, 1500), (440, 1590), (370, 1680)]),
                           (1.0, ROAD_TINT, 40, [(1600, 1030), (1420, 1120), (1230, 1225), (1030, 1335), (830, 1440), (640, 1540), (500, 1640), (440, 1720)]),
                           (1.4, PATH, 26, [(1600, 1008), (1400, 1105), (1200, 1212), (1000, 1320), (800, 1425), (610, 1525), (460, 1620), (405, 1700)])):
        strip(k, smoothed(pts, 2), w, col, ROAD + z)
    for x, y, rx, ry, z, col in ((700, 2080, 130, 46, FARM, ROAD_TINT), (900, 2180, 190, 50, FARM, PATH), (1120, 2230, 120, 40, FARM, ROAD_TINT), (620, 2190, 80, 30, FARM, GRASS),
                                 (1300, 2400, 130, 26, FARM, GRASS), (1480, 1720, 70, 34, FARM, PATH), (860, 1960, 110, 40, FARM, PATH), (560, 2120, 60, 22, FARM, PATH),
                                 (640, 1120, 130, 44, YARD, PATH), (900, 1060, 120, 36, YARD, ROAD_TINT), (480, 1120, 90, 26, YARD, GRASS), (770, 930, 100, 30, YARD, PATH),
                                 (560, 420, 90, 26, HQ, PATH), (840, 420, 90, 18, HQ, ROAD_TINT), (1330, 600, 90, 24, MID, PATH), (1180, 520, 50, 18, MID, GRASS), (120, 1420, 120, 40, ROAD, PATH),
                                 (520, 1420, 120, 30, ROAD, GRASS), (330, 1640, 80, 30, ROAD, PATH), (80, 700, 60, 40, SHELF, GRASS), (350, 2540, 140, 36, LOW, GRASS), (200, 1180, 60, 20, ROAD, GRASS)):
        blotch(k, x, y, rx, ry, z + k.rng.uniform(0.5, 1.5), col)
    # Farm.
    fence(k, [(1465, 2010), (1540, 1975), (1640, 1920)], FARM)
    fence(k, [(1465, 2010), (1520, 2045), (1640, 2110)], FARM)
    crops(k, (1235, 2190), (1430, 2330), (175, -95), 4, 5, FARM)
    k.dry_wall(line(k, [(400, 2100), (460, 2130), (520, 2168), (585, 2205)], FARM), courses=3)
    k.dry_wall(line(k, [(670, 2235), (740, 2275), (820, 2320), (900, 2360), (960, 2325), (1030, 2290), (1100, 2250), (1160, 2270), (1230, 2300), (1170, 2340), (1095, 2375), (1035, 2350)], FARM), courses=4)
    k.bush(k.ground(1085, 2320, FARM), 24)
    k.bush(k.ground(715, 1880, FARM + 40), 40)
    k.dry_wall(line(k, [(1395, 1835), (1470, 1862), (1540, 1895), (1640, 1930)], FARM), courses=4)
    k.agave(k.ground(1450, 1900, FARM), 34)
    for x, y, z, h in ((30, 2400, LOW + 20, 290), (112, 2410, LOW + 20, 310), (195, 2400, LOW + 20, 270)):
        k.pine(k.ground(x, y, z), h, h * 0.21)
    for x, y, z, r in ((350, 2300, LOW + 80, 62), (430, 2310, LOW + 60, 46), (270, 2450, LOW + 30, 58), (160, 2480, LOW + 20, 44), (40, 720, SHELF, 40), (130, 660, SHELF, 34), (20, 620, SHELF, 30),
                       (160, 520, SHELF, 24), (60, 515, SHELF, 22), (840, 600, YARD + 130, 44), (780, 590, YARD + 130, 24), (930, 620, YARD + 110, 36), (270, 495, HQ - 10, 26)):
        k.bush(k.ground(x, y, z), r)
    for x, y, z, r in ((170, 2590, LOW, 26), (465, 2580, LOW, 24), (30, 830, SHELF, 34), (330, 1070, YARD, 24)):
        k.agave(k.ground(x, y, z), r)
    for x, y, h in ((88, 500, 190), (0, 505, 160)):
        k.pine(k.ground(x, y, SHELF), h, h * 0.26)
    for box, z, n in (((250, 340, 1000, 440), HQ, 10), ((700, 820, 1000, 1180), YARD, 16), ((300, 1400, 1200, 1500), ROAD, 12), ((600, 2000, 1200, 2400), FARM, 26),
                      ((1200, 2360, 1500, 2440), FARM, 10), ((1120, 500, 1500, 620), MID, 8), ((100, 2480, 700, 2580), LOW, 10), ((20, 560, 190, 840), SHELF, 8), ((250, 1500, 500, 1750), ROAD, 8)):
        pebbles(k, box, z, n)
        for _ in range(n // 2):
            k.tuft(k.ground(k.rng.uniform(box[0], box[2]), k.rng.uniform(box[1], box[3]), z), k.rng.uniform(8, 14))
