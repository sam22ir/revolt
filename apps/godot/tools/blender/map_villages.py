"""Villages on the world map (docs/villages-plan.md), one piece per kind: a few stone houses of the mountains (flat roofs as in the
Aures, one tiled roof), olive and fig trees, dry-stone walls, and the village's own trade in front. Villages are places to help,
never targets: nothing here is fortified or burning. Built round the map piece's centre, in map units (two tiles across)."""

import math

from mathutils import Matrix, Vector

import camp_houses as houses
import camp_kit as ck
import map_pieces as mp

EARTH = ck.rgb("c7a274")
STONE_HOUSE = ck.rgb("bba684")
WOOL = ck.rgb("e9e1cf")
HERB = ck.rgb("7f8a4e")
DYES = (ck.rgb("a8432f"), ck.rgb("c98d3a"), ck.rgb("3f5578"), ck.rgb("e2d6bd"))
EMBER = ck.rgb("e8913a")


def ground(k, r=58.0):
    """The village's trodden ground: a soft round patch."""
    k.frame = Matrix.Identity(4)
    g = [(r * math.cos(t) * (1 + 0.07 * math.sin(3 * t + 1)), r * math.sin(t) * (1 + 0.07 * math.cos(2 * t))) for t in (math.tau * i / 28 for i in range(28))]
    k.prism(g, -2, 0.6, ck.rgb("c09a6c"), None, 0.7, top=EARTH)


def flat_house(k, x, y, w, l, h, turn=0.0):
    """A small flat-roofed house of dressed stone, its door on the front."""
    mp.at(k, x, y, 0.2, turn)
    houses.flat_block(k, w, l, h, deck=False, col=k.shade(STONE_HOUSE, 0.05))
    houses.plank_door(k, "front", -w * 0.5, 34, 62)
    k.window("right", l * 0.5, h * 0.55, 18, 22)
    k.frame = Matrix.Identity(4)


def tiled_house(k, x, y, turn=0.0):
    mp.at(k, x, y, 0.19, turn)
    k.gable_house(150, 170, 96, 44)
    k.window("right", 60, 46)
    houses.plank_door(k, "front", -75, 36, 66)
    k.frame = Matrix.Identity(4)


def core(k, houses_at, trees_at):
    """The houses, a few olive trees and a wall: what every village shares. The second house has a tiled roof."""
    ground(k)
    for i, (x, y) in enumerate(houses_at):
        if i == 1:
            tiled_house(k, x, y, k.rng.uniform(-6, 6))
        else:
            flat_house(k, x, y, k.rng.uniform(110, 140), k.rng.uniform(120, 150), k.rng.uniform(78, 92), k.rng.uniform(-8, 8))
    for x, y in trees_at:
        mp.olive(k, Vector((x, y, 0)), k.rng.uniform(24, 30))
    k.dry_wall([Vector((-58, -6, 0)), Vector((-52, -30, 0)), Vector((-34, -50, 0))], courses=2, height=4.0, depth=6.0, length=9.0)


def shepherds(k):
    core(k, [(-26, 36), (8, 44), (-44, 8)], [(46, 30), (-52, -14)])
    # A round stone fold, the flock inside.
    mp.ring_wall(k, [(18 + 17 * math.cos(t), -18 + 13 * math.sin(t), 0) for t in (math.tau * i / 14 for i in range(15))], courses=2, size=0.34)
    for _ in range(8):
        p = Vector((18 + k.rng.uniform(-10, 10), -18 + k.rng.uniform(-7, 7), 4.0))
        turn = k.rng.uniform(0, 360)
        k.stone(p, (10, 6.5, 7), turn, k.shade(WOOL, 0.04), jitter=0.06, round_=1.0, tex=0.4)
        head = Vector((math.cos(math.radians(turn)) * 5.5, math.sin(math.radians(turn)) * 5.5, 2.2))
        k.stone(p + head, (3.2, 2.6, 3.2), turn, ck.rgb("4a3b31"), jitter=0.05, round_=1.0, tex=0.2)
    k.rod((-6, -30, 0), (-4, -28, 14), 0.8, 0.6)


def smiths(k):
    core(k, [(-12, 42), (20, 46), (-46, 20)], [(-50, -12), (48, 18)])
    # An open forge: four posts under a flat roof, the hearth with its chimney, an anvil and the iron waiting.
    for x, y in ((6, -30), (32, -30), (6, -10), (32, -10)):
        k.rod((x, y, 0), (x, y, 18), 1.1, 1.0)
    k.box(4, 34, -32, -8, 18, 20, k.shade(ck.WOOD, 0.08), None, 0.8)
    k.box(10, 22, -26, -16, 0, 8, ck.STONE, None, 0.8)
    k.stone(Vector((16, -21, 9)), (6, 5, 2.5), 0, EMBER, jitter=0.1, round_=1.0, tex=0.1)
    k.box(13, 19, -24, -18, 8, 34, k.shade(ck.STONE, 0.06), None, 0.8)
    k.box(24, 30, -18, -15, 0, 6, ck.IRON, None, 0.5)
    k.box(22, 32, -19, -14, 6, 8.5, ck.IRON, None, 0.5)
    for i in range(4):
        k.rod((-8 + i * 2.5, -26, 0.8), (-8 + i * 2.5, -10, 0.8), 0.7, 0.7, ck.IRON)


def healers(k):
    core(k, [(-30, 30), (6, 46), (36, 30)], [(-52, 4), (50, -6), (-42, -30)])
    # Garden beds of herbs, and racks where bunches hang to dry.
    for i in range(3):
        y = -34 + i * 9
        k.prism([(-24, y), (-4, y), (-4, y + 6), (-24, y + 6)], 0, 2, ck.rgb("8a6a48"), None, 0.8)
        for j in range(5):
            k.stone(Vector((-22 + j * 4.2, y + 3, 3.5)), (3.2, 3.2, 3.8), 0, k.shade(HERB, 0.15), jitter=0.2, round_=1.0, tex=0.5)
    for x in (12, 30):
        k.rod((x, -32, 0), (x, -32, 16), 0.9, 0.8)
        k.rod((x, -12, 0), (x, -12, 16), 0.9, 0.8)
        k.rod((x, -32, 15), (x, -12, 15), 0.6, 0.6)
        for j in range(5):
            y = -29 + j * 4
            col = k.shade(HERB if j % 2 else ck.rgb("b39a5a"), 0.12)
            k.stone(Vector((x, y, 11.5)), (2.4, 2.4, 6), 0, col, jitter=0.15, round_=0.9, tex=0.5)
    houses.jar(k, (40, -20, 0), 3.0)


def weavers(k):
    core(k, [(-36, 28), (0, 46), (-50, -4)], [(46, 34), (50, 4)])
    # Two upright looms with striped cloth, and wool hung out to dry.
    for x0, turn in ((-6, 0), (18, 0)):
        for x in (x0, x0 + 14):
            k.rod((x, -24, 0), (x, -24, 20), 0.9, 0.8)
        k.rod((x0, -24, 20), (x0 + 14, -24, 20), 0.7, 0.7)
        k.rod((x0, -24, 2), (x0 + 14, -24, 2), 0.7, 0.7)
        for i in range(6):
            col = DYES[(i + (x0 > 0)) % len(DYES)]
            k.box(x0 + 1, x0 + 13, -24.6, -23.6, 3 + i * 2.8, 5.6 + i * 2.8, col, None, 0.6)
    k.rod((-24, -42, 0), (-24, -42, 15), 0.8, 0.7)
    k.rod((32, -44, 0), (32, -44, 15), 0.8, 0.7)
    k.rod((-24, -42, 14), (32, -44, 14), 0.3, 0.3, ck.DARK, ck.THIN, sides=4)
    for i in range(7):
        x = -20 + i * 7.5
        k.stone(Vector((x, -42.6 - i * 0.03, 10.5)), (3.2, 2, 6.5), 0, DYES[i % len(DYES)], jitter=0.1, round_=1.0, tex=0.4)


def messengers(k):
    core(k, [(-30, 40), (14, 48), (44, 26)], [(-52, 0)])
    # The meeting place under a big tree, a well, and a stable with its hay.
    mp.broadleaf(k, Vector((14, -20, 0)), 64, ck.rgb("6f7c48"))
    for t in (0.5, 2.1, 3.7, 5.3):
        p = Vector((14 + 13 * math.cos(t), -20 + 13 * math.sin(t), 2))
        k.obox(p, (10, 3.5, 4), math.degrees(t) + 90, ck.QUOIN, None, 0.6)
    k.lathe((-18, -26, 0), [(5.5, 0, None), (6.5, 0, ck.STONE), (6.5, 6, ck.STONE), (5, 6.5, ck.DARK)], ck.STONE, sides=14, tex=0.5)
    for x in (-23, -13):
        k.rod((x, -26, 6), (x, -26, 15), 0.6, 0.6)
    k.rod((-24, -26, 15), (-12, -26, 15), 0.6, 0.6)
    for x, y in ((34, -40), (46, -40), (34, -26), (46, -26)):
        k.rod((x, y, 0), (x, y, 14), 0.9, 0.8)
    k.box(32, 48, -42, -24, 14, 15.5, k.shade(ck.WOOD, 0.1), None, 0.8)
    k.stone(Vector((40, -33, 4)), (12, 10, 8), 20, ck.rgb("cdb26a"), jitter=0.12, round_=1.0, tex=0.7)


VILLAGES = {"village_shepherds": shepherds, "village_smiths": smiths, "village_healers": healers, "village_weavers": weavers, "village_messengers": messengers}
