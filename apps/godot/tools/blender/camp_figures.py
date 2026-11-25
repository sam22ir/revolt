"""People and mules, posed in code: a walk cycle of 6 steps in 8 directions each. No faces: scarves, hoods and hats hide them.

A sheet has a row per step and a column per direction. Direction 0 walks to the right of the screen and they go anticlockwise on
the ground: 2 is away from the viewer, 4 left, 6 towards the viewer.
"""

import math

from mathutils import Matrix, Vector

import camp_kit as ck

STEPS, WAYS = 6, 8
# A cell's size in painting px, and where the feet stand in it.
CELL = (112, 112)
FOOT = (56, 92)
KINDS = ("crate", "pack", "mule", "guard", "farmer")

SKIN, WOOL, LINEN, SCARF = ck.rgb("9c6f50"), ck.rgb("7a6650"), ck.rgb("cbbd9f"), ck.rgb("b9a67f")
DARK_WOOL, OLIVE, BOOT, STRAW = ck.rgb("59493a"), ck.rgb("74704f"), ck.rgb("40322a"), ck.rgb("d0ac6a")
HIDE, MANE = ck.rgb("7c5b41"), ck.rgb("3d2e26")


def limb(k, top, length, swing, bend, r, col, foot_col, ink):
    """A two-part limb from `top`, swinging in the figure's forward (x) plane."""
    a = math.radians(swing)
    mid = top + Vector((math.sin(a), 0, -math.cos(a))) * length * 0.5
    b = math.radians(swing - bend)
    end = mid + Vector((math.sin(b), 0, -math.cos(b))) * length * 0.5
    k.rod(top, mid, r, r * 0.9, col, ink, 10, 0.3)
    k.rod(mid, end, r * 0.9, r * 0.75, col, ink, 10, 0.3)
    k.stone(end + Vector((r * 0.5, 0, 0)), (r * 2.6, r * 1.8, r * 1.5), 0, foot_col, jitter=0.02, round_=1.2, tex=0.2)
    return end


def blob(k, at, size, col, turn=0, roll=0, round_=1.25):
    k.stone(Vector(at), size, turn, col, jitter=0.03, roll=roll, round_=round_, tex=0.3)


def person(k, kind, step, walking=True):
    p = math.tau * step / STEPS
    s = math.sin(p) if walking else 0.0
    bob = 1.2 * abs(math.cos(p)) if walking else 0.0
    hip, shoulder = 33.0 + bob, 56.0 + bob
    trousers, coat = {"crate": (LINEN, WOOL), "pack": (OLIVE, DARK_WOOL), "guard": (OLIVE, ck.rgb("8a7a58")), "farmer": (LINEN, ck.rgb("a08a66"))}[kind]
    for side, phase in ((1, 1), (-1, -1)):
        sw = 30 * s * phase
        knee = max(0.0, -math.cos(p) * phase) * 38 if walking else 0
        limb(k, Vector((0, side * 4.6, hip)), 33, sw, knee, 4.4, trousers, BOOT, k.ink())
    # A long coat over baggy trousers.
    lean = 5.0 if kind in ("crate", "pack") else 1.0
    k.lathe((lean * 0.2, 0, hip - 12), [(10.4, 0, None), (9.2, 10, coat), (8.0, 18, coat), (9.6, 32, coat), (7.6, 37, coat), (0.1, 39, coat)], coat, sides=16, tex=0.5)
    k.lathe((lean * 0.2, 0, hip + 4), [(8.8, 0, None), (8.8, 4, BOOT), (8.2, 5, BOOT)], BOOT, sides=16, tex=0.2)
    head = Vector((lean * 0.6, 0, shoulder + 11))
    blob(k, head, (12, 11.5, 14), SKIN)
    if kind == "farmer":
        k.lathe(head + Vector((0, 0, 2)), [(15, 0, None), (14.5, 1.5, STRAW), (7, 2.5, STRAW), (6, 8, STRAW), (0.1, 9, STRAW)], STRAW, sides=18, tex=0.6)
    else:
        blob(k, head + Vector((-0.6, 0, 3.6)), (14, 13.5, 10), SCARF)
    # The scarf's end covers the lower face and the neck.
    blob(k, head + Vector((1.0, 0, -5.0)), (13.5, 13, 7.5), SCARF if kind != "farmer" else LINEN)
    arm = Vector((lean * 0.3, 0, shoulder - 3))
    if kind == "crate":
        for side in (1, -1):
            limb(k, arm + Vector((0, side * 9.5, 0)), 22, 62, -38, 3.4, coat, SKIN, k.ink())
        at = Vector((21, 0, shoulder - 22))
        k.obox(at, (20, 26, 16), 0, k.shade(ck.WOOD, 0.04), None, 0.7)
        for z in (1, 12):
            k.obox(at + Vector((0, 0, z)), (22, 28, 3), 0, ck.rgb("7d583c"), None, 0.6)
    elif kind == "pack":
        for side in (1, -1):
            limb(k, arm + Vector((0, side * 9.5, 0)), 25, 8, -112, 3.4, coat, SKIN, k.ink())
        blob(k, (-13, 0, shoulder - 8), (18, 22, 27), ck.SACK, round_=0.8)
        blob(k, (-13, 0, shoulder + 9), (14, 27, 10), ck.rgb("8d7c66"), round_=1.2)
        for side in (1, -1):
            k.rod((-6, side * 6, shoulder + 1), (9, side * 6, shoulder - 12), 1.4, 1.4, BOOT, ck.THIN, 6)
    elif kind == "guard":
        limb(k, arm + Vector((0, 9.5, 0)), 25, 10 - 14 * s, -20, 3.4, coat, SKIN, k.ink())
        limb(k, arm + Vector((0, -9.5, 0)), 25, 24, -70, 3.4, coat, SKIN, k.ink())
        # A shepherd's staff, not a weapon.
        k.rod((15, -11, 2), (13, -10, 78), 1.6, 1.5, ck.WOOD, None, 6)
    else:
        limb(k, arm + Vector((0, 9.5, 0)), 25, 18 - 20 * s, -20, 3.4, coat, SKIN, k.ink())
        limb(k, arm + Vector((0, -9.5, 0)), 25, 40, -40, 3.4, coat, SKIN, k.ink())
        k.rod((17, -12, 2), (16, -10, 66), 1.5, 1.4, ck.WOOD, None, 6)
        k.obox(Vector((20, -12, 1)), (12, 8, 3), 0, ck.IRON, None, 0.2)


def mule(k, step):
    p = math.tau * step / STEPS
    bob = 1.0 * math.cos(2 * p)
    z = 44.0 + bob
    blob(k, (0, 0, z), (52, 24, 25), HIDE, round_=0.9)
    blob(k, (20, 0, z + 2), (22, 22, 24), HIDE)
    blob(k, (-21, 0, z + 2), (22, 23, 25), HIDE)
    for x, side, ph in ((18, 1, 0), (18, -1, math.pi), (-20, 1, math.pi * 0.5), (-20, -1, math.pi * 1.5)):
        sw = 24 * math.sin(p + ph)
        knee = max(0.0, math.cos(p + ph)) * 30 * (1 if x > 0 else -0.6)
        limb(k, Vector((x, side * 7.5, z - 4)), z - 6, sw, knee, 4.2, HIDE, MANE, k.ink())
    k.rod((24, 0, z + 6), (39, 0, z + 24), 9, 6.5, HIDE, k.ink(), 12, 0.4)
    blob(k, (46, 0, z + 22), (24, 11, 13), HIDE, roll=24, round_=0.9)
    blob(k, (55, 0, z + 16.5), (9, 9.5, 9), ck.rgb("b59a7c"), roll=24)
    for side in (1, -1):
        k.rod((38, side * 4, z + 28), (35, side * 7, z + 43), 2.6, 0.8, HIDE, None, 7)
    k.rod((24, 0, z + 15), (37, 0, z + 32), 2.6, 2.6, MANE, None, 7)
    k.rod((-31, 0, z + 6), (-37, 0, z - 22), 2.2, 2.8, MANE, None, 7)
    # Blanket and load.
    blob(k, (-2, 0, z + 11), (36, 27, 8), ck.rgb("8c4a36"), round_=0.8)
    for side in (1, -1):
        blob(k, (-2, side * 17, z + 2), (30, 15, 25), ck.SACK, round_=0.9)
        k.rod((6, side * 24, z + 10), (6, side * 24, z - 8), 1.1, 1.1, BOOT, ck.THIN, 5)
    blob(k, (-2, 0, z + 20), (32, 20, 14), ck.rgb("9b8a6b"), round_=1.0)


def build(kind):
    """All the cells of a kind as one kit: the cell in column c, row r stands so its feet show at FOOT of that cell."""
    k = ck.Kit(sum(map(ord, kind)), ck.BODY)
    for r in range(STEPS):
        for c in range(WAYS):
            at = k.ground(c * CELL[0] + FOOT[0], r * CELL[1] + FOOT[1], 0.0)
            # Screen right is the ground direction (1, 1): 45 degrees.
            k.frame = Matrix.Translation(at) @ Matrix.Rotation(math.radians(45 + 360 / WAYS * c), 4, "Z") @ Matrix.Scale(0.86 if kind == "mule" else 1.0, 4)
            k.rng.seed(sum(map(ord, kind)))
            if kind == "mule":
                mule(k, r)
            else:
                person(k, kind, r, kind != "guard")
    return k
