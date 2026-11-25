"""Look test: the command post and its patch of cliff as full 3D models, drawn in the painting's style.

Run from apps/godot:  blender -b -P tools/blender/camp_render.py -- <level 1|4> <out.png> [render px per painting px] [shrink] [x,y,w,h]
The camera is the painting's (30 degrees up, 45 round, 1 unit = 1 painting px), so the picture lines up with the painting's crop.
"""

import math
import os
import sys
import tempfile
import time

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import camp_ink  # noqa: E402
from camp_kit import *  # noqa: E402,F403
import camp_kit as ck  # noqa: E402

CROP = (200, 0, 1000, 700)  # x, y, w, h on the painting
CORNER = (695.0, 380.0)  # the house's front bottom corner on the painting
TURN = -10.0
SUN = Vector((0.66, -0.30, 0.69))


def spots(k, points, z=0.0):
    return [k.ground(x, y, z) for x, y in points]


def terrain(k):
    top = [(0, 425), (55, 402), (110, 428), (235, 452), (330, 446), (410, 438), (520, 452), (615, 440), (700, 412), (780, 378), (815, 352),
           (835, 345), (900, 330), (1010, 285), (1010, 120), (760, 40), (400, 120), (250, 150), (110, 210), (40, 280), (10, 360)]
    k.prism([(p.x, p.y) for p in spots(k, top)], -420, 0, ck.ROCK, None, 0.9, top=ck.SAND)
    # Front cliff: columns under the rim, then shorter ones in front of them.
    rim = [(-20, 430), (55, 410), (110, 432), (235, 456), (330, 452), (410, 444), (520, 458), (615, 446), (700, 420), (770, 392)]
    line = spots(k, rim)
    out = Vector((S45, -S45, 0))
    d, total = 0.0, ck._length(line)
    while d < total:
        w = k.rng.uniform(55, 150)
        p, turn = ck._along(line, min(d + w / 2, total))
        h = k.rng.choice((k.rng.uniform(110, 170), k.rng.uniform(240, 380)))
        k.rock(p + out * k.rng.uniform(-14, 6) + Vector((0, 0, -h * 0.37 - k.rng.uniform(4, 18))), (w * 1.25, w * 1.0, h), upright=0.85)
        d += w * 0.8
    for row, (drop, push, lo, hi) in enumerate(((-70, 30, 60, 120), (-135, 62, 80, 150), (-205, 110, 90, 190), (-290, 165, 110, 190))):
        d = k.rng.uniform(0, 60)
        while d < total:
            w = k.rng.uniform(lo, hi)
            p, _ = ck._along(line, d)
            if k.rng.random() < 0.78:
                k.rock(p + out * (push + k.rng.uniform(-25, 25)) + Vector((0, 0, drop - 110 + k.rng.uniform(-35, 25))),
                       (w * 1.2, w, k.rng.uniform(200, 280)), col=ck.ROCK if row else ck.ROCK_TOP, upright=0.75)
            d += w * 0.9
    # Back cliff, upper right, and the boulders round the terrace's left and back.
    for x, y, w, h in ((1010, 170, 230, 420), (930, 120, 210, 420), (840, 95, 210, 380), (760, 75, 190, 330), (680, 55, 190, 240), (600, 70, 170, 170),
                       (530, 92, 130, 105)):
        k.rock(k.ground(x, y) + Vector((-60, 60, h * 0.2)), (w, w, h), upright=0.85)
    for x, y, w, h in ((395, 118, 110, 70), (300, 150, 120, 85), (215, 172, 130, 90), (125, 215, 110, 66), (55, 275, 100, 70), (20, 340, 90, 60),
                       (460, 108, 100, 80)):
        k.rock(k.ground(x, y) + Vector((-20, 20, h * 0.05)), (w, w * 0.9, h), upright=0.4, col=ck.ROCK_TOP)
    # Stairs down to the lower path, and the path.
    for i in range(8):
        t = i / 7
        z = -13.0 * i
        a = k.ground(778 + 60 * t, 372 + 98 * t, z)
        b = k.ground(846 + 64 * t, 345 + 90 * t, z)
        depth = (b - a).normalized().cross(Vector((0, 0, 1))).normalized() * 30
        k.prism([(q.x, q.y) for q in (a - depth * .3, b - depth * .3, b + depth, a + depth)], z - 30, z, k.shade(ck.STONE, 0.06), None, 0.8, top=ck.QUOIN)
    low = [(835, 478), (915, 440), (1010, 395), (1010, 470), (960, 500), (900, 520)]
    k.prism([(q.x, q.y) for q in spots(k, low, -105.0)], -420, -105, ck.ROCK, None, 0.9, top=ck.SAND)
    for x, y, w, h in ((800, 520, 120, 200), (865, 545, 130, 160), (950, 520, 130, 160), (1000, 490, 110, 120), (760, 470, 90, 170)):
        k.rock(k.ground(x, y, -180), (w, w, h), upright=0.75)
    for x, y, w, h in ((850, 600, 120, 170), (910, 575, 130, 190), (975, 560, 120, 190), (1010, 600, 130, 160), (900, 640, 130, 120), (800, 610, 110, 170)):
        k.rock(k.ground(x, y, -240), (w, w, h), upright=0.7, col=ck.ROCK_TOP)
    for x, y, w, h in ((850, 500, 90, 170), (890, 525, 110, 150), (935, 512, 100, 180), (985, 498, 110, 160)):
        k.rock(k.ground(x, y, -105) + Vector((0, 0, -h * 0.4)), (w, w, h), upright=0.8)
    for x, y in ((925, 405), (970, 385), (1000, 360), (890, 385)):
        k.rock(k.ground(x, y, -60), (80, 70, 110), upright=0.4)
    # Trees and small plants.
    for x, y, h in ((765, 152, 175), (868, 205, 250), (940, 215, 215), (985, 190, 150)):
        k.pine(k.ground(x, y), h, h * 0.27)
    k.pine(k.ground(328, 598, -215), 150, 40)
    for x, y, z, r in ((640, 520, -70, 42), (575, 512, -70, 26), (722, 560, -95, 40), (82, 440, -6, 26), (900, 225, 0, 22), (820, 190, 0, 20)):
        k.bush(k.ground(x, y, z), r)
    for x, y in ((120, 400), (225, 345), (258, 338), (330, 330), (770, 300), (815, 310), (720, 300), (450, 438), (610, 262), (655, 270), (180, 300)):
        k.tuft(k.ground(x, y))


def yard(k, level):
    k.dry_wall(spots(k, [(236, 428), (275, 428), (335, 419), (405, 411), (432, 428), (475, 438), (555, 436), (630, 406), (700, 381), (755, 362)]))
    k.dry_wall(spots(k, [(140, 390), (105, 370), (78, 335), (74, 300), (105, 262), (180, 233), (262, 208), (370, 178)]), courses=4)
    k.dry_wall(spots(k, [(842, 330), (900, 308), (1010, 264)]))
    k.parapet(spots(k, [(436, 376), (480, 386), (530, 389), (585, 382), (640, 368), (700, 351), (753, 334)]), 48)
    k.parapet(spots(k, [(702, 205), (780, 243), (858, 284), (850, 290)]), 52)
    k.parapet(spots(k, [(858, 287), (790, 313)]), 52)
    for x, y in ((160, 393), (228, 422)):
        k.obox(k.ground(x, y), (26, 26, 78), TURN, ck.PLASTER, None, 0.8)
        k.obox(k.ground(x, y) + Vector((0, 0, 78)), (30, 30, 6), TURN, ck.PLASTER, None, 0.8)
    foot = k.ground(246, 334)
    high = 432.0
    k.rod(foot, foot + Vector((0, 0, high)), 5.5, 3.2)
    for z in (0.62, 0.78, 0.9):
        k.rod(foot + Vector((-9, 9, high * z)), foot + Vector((9, -9, high * z)), 2.0, 2.0, ck.IRON)
    for x, y in ((136, 296), (200, 268), (184, 326), (350, 182), (392, 165)):
        k.rod(k.ground(x, y), foot + Vector((0, 0, high * 0.93)), 0.8, 0.8, ck.DARK, ck.THIN, sides=5)
        k.rod(k.ground(x, y), k.ground(x, y) + Vector((0, 0, 14)), 2.4, 2.4)


def barrels(k, places):
    for x, y in places:
        k.barrel(k.ground(x, y))


def awning(k, left, right, wall_r, wall_l, heights):
    posts = []
    for (x, y), h in zip((left, right), heights):
        g = k.ground(x, y)
        k.rod(g, g + Vector((0, 0, h + 4)), 3.4, 2.8)
        k.rod(g + Vector((0, 0, h)), k.ground(x - 38, y + 4), 0.8, 0.8, ck.DARK, ck.THIN, sides=5)
        posts.append(g + Vector((0, 0, h)))
    k.canvas([posts[0], posts[1], wall_r, wall_l], sag=12)


def level_1(k, house):
    k.frame = house
    k.gable_house(188, 238, 120, 52)
    k.window("right", 55, 52)
    k.window("right", 205, 56)
    k.window("front", -118, 78, 18, 24)
    k.door(132)
    for y in (100, 168):
        k.rod((34, y, 0), (36, y, 86), 2.4, 2.0)
    k.canvas([(40, 94, 82), (40, 172, 82), (2, 168, 106), (2, 98, 106)], sag=5)
    for x, sx, z in ((-60, 30, 0), (-92, 30, 0), (-124, 30, 0), (-78, 26, 24)):
        k.crate((x, -22, z), (sx, 24, 23), 2)
    k.crate((22, 28, 0), (26, 44, 24), 4)
    k.crate((20, 78, 0), (28, 36, 28), -6)
    k.frame = Matrix.Identity(4)
    awning(k, (312, 303), (398, 342), house @ Vector((-18, -2, 108)), house @ Vector((-176, -2, 112)), (86, 86))
    barrels(k, ((645, 260), (692, 240), (717, 238), (700, 228), (796, 258), (543, 362)))


def level_4(k, house):
    k.frame = house
    # A tower behind, a longer house, and a low stone store on its left.
    k.frame = house @ Matrix.Translation((-170, 120, 0))
    k.box(-120, 0, 0, 120, 0, 182, ck.PLASTER, None, 0.8)
    for x, y in ((0.0, 0.0), (0.0, 120.0), (-120.0, 0.0)):
        k.quoins(x, y, 182)
    k.box(-128, 8, -8, 128, 182, 192, ck.QUOIN, None, 0.8)
    for a in range(5):
        k.box(-126 + a * 28, -126 + a * 28 + 17, -7, 7, 192, 211, k.shade(ck.PLASTER, 0.05), None, 0.8)
        k.box(-8, 7, -6 + a * 28, 11 + a * 28, 192, 211, k.shade(ck.PLASTER, 0.05), None, 0.8)
    k.window("right", 60, 118, 26, 38)
    k.window("front", -60, 118, 26, 38)
    for x, y in ((-105, 12), (-10, 12), (-105, 110), (-10, 110)):
        k.rod((x, y, 192), (x, y, 244), 3.6, 3.2)
    k.canvas([(-120, 0, 244), (4, 0, 244), (4, 122, 244), (-120, 122, 244)], sag=-14)
    k.frame = house
    k.gable_house(204, 270, 138, 60)
    k.window("right", 48, 62)
    k.window("right", 215, 62)
    k.window("front", -52, 62, 22, 32)
    k.window("front", -150, 62, 22, 32)
    k.door(135, 42, 80)
    for y in (92, 180):
        k.rod((44, y, 0), (44, y, 88), 3.2, 2.8)
    k.canvas([(52, 84, 88), (52, 188, 88), (2, 184, 118), (2, 88, 118)], sag=6)
    k.sandbags([Vector((62, 74, 0)), Vector((62, 18, 0)), Vector((40, -6, 0))], 4)
    k.sandbags([Vector((62, 262, 0)), Vector((62, 200, 0))], 4)
    for x, z in ((-70, 0), (-104, 0), (-138, 0), (-87, 25), (-121, 25)):
        k.crate((x, -20, z), (31, 26, 24), 2)
    k.frame = Matrix.Identity(4)
    awning(k, (262, 285), (372, 338), house @ Vector((-18, -2, 118)), house @ Vector((-190, -2, 122)), (92, 92))
    k.sandbags(spots(k, [(262, 385), (300, 372), (345, 372), (380, 388)]), 4)
    k.sandbags(spots(k, [(590, 330), (640, 322), (690, 302)]), 3)
    barrels(k, ((728, 252), (752, 262), (740, 240), (820, 280), (543, 362), (215, 300)))
    k.crate(k.ground(330, 395), (34, 30, 22), 20)


def material():
    mat = bpy.data.materials.new("paint")
    mat.use_nodes = True
    n, link = mat.node_tree.nodes, mat.node_tree.links
    n.clear()

    def attr(name):
        a = n.new("ShaderNodeAttribute")
        a.attribute_name = name
        return a

    def math_(op, a, b):
        m = n.new("ShaderNodeMath")
        m.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, float):
                m.inputs[i].default_value = v
            else:
                link.new(v, m.inputs[i])
        return m.outputs[0]

    pos = n.new("ShaderNodeNewGeometry").outputs["Position"]
    # Uneven brushwork: broad patches and fine, upright strokes.
    total = None
    for scale, weight, stretch in ((0.016, 0.34, (1, 1, 1)), (0.06, 0.26, (1, 1, 0.35)), (0.22, 0.16, (1, 1, 0.5))):
        mapping = n.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = [scale * s for s in stretch]
        link.new(pos, mapping.inputs["Vector"])
        tex = n.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 1.0
        tex.inputs["Detail"].default_value = 2.0
        link.new(mapping.outputs[0], tex.inputs["Vector"])
        part = math_("MULTIPLY", math_("SUBTRACT", tex.outputs[0], 0.5), weight * 2)
        total = part if total is None else math_("ADD", total, part)
    factor = math_("ADD", math_("MULTIPLY", total, attr("tex").outputs["Fac"]), 1.0)
    mul = n.new("ShaderNodeVectorMath")
    mul.operation = "SCALE"
    link.new(attr("col").outputs["Color"], mul.inputs[0])
    link.new(factor, mul.inputs["Scale"])
    bsdf = n.new("ShaderNodeBsdfDiffuse")
    link.new(mul.outputs[0], bsdf.inputs["Color"])
    out = n.new("ShaderNodeOutputMaterial")
    link.new(bsdf.outputs[0], out.inputs["Surface"])
    aov = n.new("ShaderNodeOutputAOV")
    aov.aov_name = "ink"
    link.new(attr("ink").outputs["Fac"], aov.inputs["Value"])
    # Crack lines: stretched noise (its borders are drawn) and where to keep them; only full-strength texture, the rock, has any.
    values = []
    for scale, stretch in ((0.024, (1, 1, 0.3)), (0.017, (1, 1, 1))):
        mapping = n.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = [scale * s for s in stretch]
        link.new(pos, mapping.inputs["Vector"])
        tex = n.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 1.0
        tex.inputs["Detail"].default_value = 1.5
        link.new(mapping.outputs[0], tex.inputs["Vector"])
        values.append(tex.outputs[0])
    keep = math_("MULTIPLY", values[1], math_("GREATER_THAN", attr("tex").outputs["Fac"], 0.95))
    pair = n.new("ShaderNodeCombineXYZ")
    link.new(values[0], pair.inputs[0])
    link.new(keep, pair.inputs[1])
    aov = n.new("ShaderNodeOutputAOV")
    aov.aov_name = "crack"
    link.new(pair.outputs[0], aov.inputs["Color"])
    return mat


def scene(scale):
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 10
    s.cycles.use_adaptive_sampling = False
    s.cycles.use_denoising = False
    s.cycles.max_bounces = 0
    s.cycles.pixel_filter_type = "BOX"
    s.cycles.filter_width = 0.01
    s.render.film_transparent = True
    s.render.resolution_x, s.render.resolution_y = int(CROP[2] * scale), int(CROP[3] * scale)
    s.render.image_settings.media_type = "MULTI_LAYER_IMAGE"
    s.render.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    s.render.image_settings.color_depth = "32"
    layer = s.view_layers[0]
    layer.use_pass_z = layer.use_pass_normal = layer.use_pass_diffuse_color = True
    layer.use_pass_diffuse_direct = layer.use_pass_ambient_occlusion = True
    aov = layer.aovs.add()
    aov.name, aov.type = "ink", "VALUE"
    aov = layer.aovs.add()
    aov.name, aov.type = "crack", "COLOR"
    world = bpy.data.worlds.new("w")
    s.world = world
    world.color = (0, 0, 0)
    world.light_settings.distance = 60.0
    light = bpy.data.lights.new("sun", "SUN")
    light.energy, light.angle = 3.0, math.radians(1.5)
    sun = bpy.data.objects.new("sun", light)
    sun.rotation_euler = SUN.to_track_quat("Z", "Y").to_euler()
    s.collection.objects.link(sun)
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = max(CROP[2], CROP[3])
    cam.clip_end = 20000
    obj = bpy.data.objects.new("cam", cam)
    right, up = Vector((S45, S45, 0)), Vector((-S45 * 0.5, S45 * 0.5, UP))
    back = Vector((S45 * UP, -S45 * UP, 0.5))
    dx, dy = CROP[0] + CROP[2] / 2 - CORNER[0], CORNER[1] - (CROP[1] + CROP[3] / 2)
    obj.location = right * dx + up * dy + back * 4000
    obj.rotation_euler = (math.radians(60), 0, math.radians(45))
    s.collection.objects.link(obj)
    s.camera = obj
    return s


def main():
    global CROP
    args = sys.argv[sys.argv.index("--") + 1:]
    level, out = int(args[0]), args[1]
    scale = float(args[2]) if len(args) > 2 else 2.0
    shrink = int(args[3]) if len(args) > 3 else 1
    if len(args) > 4:
        CROP = tuple(int(v) for v in args[4].split(","))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    house = Matrix.Rotation(math.radians(TURN), 4, "Z")
    mat = material()
    for name, seed, make in (("terrain", 7, terrain), ("yard", 11, lambda k: yard(k, level)),
                             ("hq", 5, lambda k: (level_4 if level == 4 else level_1)(k, house))):
        k = Kit(seed)
        k.origin = (CORNER[0] - 200, CORNER[1] - 60)  # positions are traced on the painting cropped at (200, 60)
        make(k)
        k.build(name).data.materials.append(mat)
    s = scene(scale)
    t = time.time()
    with tempfile.TemporaryDirectory() as folder:
        s.render.filepath = os.path.join(folder, "passes.exr")
        bpy.ops.render.render(write_still=True)
        print("RENDER %.0fs" % (time.time() - t))
        img = camp_ink.paint(s.render.filepath, scale)
    if shrink > 1:
        img = camp_ink.shrink(img, shrink)
    camp_ink.write(out, img)
    print("DONE %.0fs %s" % (time.time() - t, out))


main()
