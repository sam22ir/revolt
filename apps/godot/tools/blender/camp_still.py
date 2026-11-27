"""Things in the camp that keep still, posed in code: tents, the stock a full producer piles up, the cooking fire.

Each is built round the world origin, so its foot shows at the middle of its picture, FOOT of the way down (CampLife.STILL_FOOT).
"""

import math

from mathutils import Matrix, Vector

import camp_kit as ck

# A picture's size in painting px.
SIZE = {
    "tent": (150, 120),
    "sacks_small": (84, 64), "sacks_big": (90, 76),
    "crates_small": (64, 56), "crates_big": (90, 84),
    "chest_small": (56, 48), "chest_big": (84, 66),
    "fire": (64, 76),
}
FOOT = 0.8
STILLS = tuple(SIZE)

FLAME, EMBER, ASH = ck.rgb("e8a04a"), ck.rgb("f4d27a"), ck.rgb("6d635a")
BAND = ck.rgb("7d583c")


def tent(k):
    """A ridge tent of patched canvas on two poles, guy ropes out to pegs, its open end dark."""
    long, half, ridge = 76.0, 30.0, 46.0
    fr, br = Vector((long / 2, 0, ridge)), Vector((-long / 2, 0, ridge))
    for side in (1, -1):
        fg, bg = Vector((long / 2 + 4, side * half, 0)), Vector((-long / 2 - 4, side * half, 0))
        k.canvas([fr, br, bg, fg], sag=3.0, col=k.shade(ck.CANVAS, 0.05), n=14, folds=0.6)
    k.mesh([(long / 2 + 3, half - 3, 0.5), (long / 2 + 3, -half + 3, 0.5), (long / 2 + 1, 0, ridge - 4)], [[0, 1, 2]], ck.DARK, None, 0.2)
    for end in (fr, br):
        k.rod((end.x, 0, 0), end + Vector((0, 0, 5)), 1.8, 1.6, ck.WOOD, None, 6)
        peg = Vector((end.x + math.copysign(26, end.x), 0, 0))
        k.rod(end + Vector((0, 0, 3)), peg, 0.5, 0.5, ck.SHADE, ck.THIN, 4)
        k.obox(peg, (3, 3, 4), 0, ck.WOOD, None, 0.2)


def sacks(k, big):
    spots = [(0, 0, 0), (-14, 12, 0), (12, -12, 0)]
    if big:
        spots += [(16, 14, 0), (-16, -12, 0), (-2, 2, 15), (4, -14, 14), (-8, 14, 13)]
    for x, y, z in spots:
        k.stone(Vector((x, y, z + 8)), (24, 17, 16), k.rng.uniform(-40, 40), k.shade(ck.SACK, 0.08), jitter=0.06, round_=0.9, tex=0.6)


def crates(k, big):
    spots = [(0, 0, 0, 10), (-6, 24, 0, -8)]
    if big:
        spots += [(24, -4, 0, 4), (2, 6, 20, 14), (-2, -24, 0, -4), (20, 18, 0, 22)]
    for x, y, z, turn in spots:
        at = Vector((x, y, z))
        k.obox(at, (22, 22, 19), turn, k.shade(ck.WOOD, 0.06), None, 0.7)
        for h in (2, 14):
            k.obox(at + Vector((0, 0, h)), (23, 23, 3), turn, BAND, None, 0.5)


def chests(k, big):
    spots = [(0, 0, 12)]
    if big:
        spots += [(-4, 26, -6)]
    for x, y, turn in spots:
        at = Vector((x, y, 0))
        k.obox(at, (30, 20, 16), turn, k.shade(ck.WOOD, 0.05), None, 0.6)
        k.obox(at + Vector((0, 0, 16)), (31, 21, 5), turn, k.shade(BAND, 0.05), None, 0.6)
        c, s = math.cos(math.radians(turn)), math.sin(math.radians(turn))
        for along in (-9, 9):
            k.obox(at + Vector((c * along, s * along, 0)), (3, 22, 21.5), turn, ck.IRON, None, 0.2)
    if big:
        for x, y in ((22, -10), (24, 12)):
            k.stone(Vector((x, y, 6)), (13, 11, 12), k.rng.uniform(0, 90), ck.SACK, jitter=0.05, round_=1.0, tex=0.5)


def fire(k):
    """A cooking fire in a ring of stones, a pot hung from a tripod over it."""
    for i in range(9):
        t = math.tau * i / 9
        k.stone(Vector((math.cos(t) * 15, math.sin(t) * 15, 3)), (8, 7, 6), math.degrees(t), k.shade(ck.STONE, 0.1), jitter=0.1, round_=0.8)
    k.stone(Vector((0, 0, 1)), (24, 24, 2), 0, ASH, jitter=0.05, round_=1.0, tex=0.3)
    for t in (20, 80, 140):
        a = math.radians(t)
        k.rod((math.cos(a) * 11, math.sin(a) * 11, 2), (-math.cos(a) * 9, -math.sin(a) * 9, 6), 2.0, 1.8, ck.WOOD, None, 6)
    for x, y, z, r, col in ((0, 0, 9, 7, FLAME), (3, -2, 15, 5, FLAME), (-2, 2, 17, 3.5, EMBER), (1, 0, 21, 2.5, EMBER)):
        k.stone(Vector((x, y, z)), (r * 2, r * 2, r * 2.6), 0, col, jitter=0.15, round_=1.0, tex=0.1)
    top = Vector((0, 0, 50))
    for t in (0, 120, 240):
        a = math.radians(t + 30)
        k.rod((math.cos(a) * 24, math.sin(a) * 24, 0), top, 1.4, 1.2, ck.WOOD, None, 6)
    k.rod(top, top + Vector((0, 0, -18)), 0.5, 0.5, ck.IRON, ck.THIN, 4)
    k.lathe((0, 0, 22), [(6, 0, None), (9, 3, ck.IRON), (9.5, 8, ck.IRON), (8, 10, ck.IRON), (7, 10.5, ck.DARK)], ck.IRON, sides=14, tex=0.3)


def build(name):
    """One still thing as a kit, its foot on the world origin."""
    k = ck.Kit(sum(map(ord, name)), ck.BODY)
    k.frame = Matrix.Translation(k.ground(*ck.CENTRE))
    if name == "tent":
        tent(k)
    elif name == "fire":
        fire(k)
    else:
        kind, size = name.split("_")
        {"sacks": sacks, "crates": crates, "chest": chests}[kind](k, size == "big")
    return k
