"""Renders the camp's pictures from the models, in the painted look. Run from apps/godot:

  blender -b -P tools/blender/camp_render.py -- preview <out.png> <x,y,w,h> [scale] [id:look,...]   a look at part of the camp
  blender -b -P tools/blender/camp_render.py -- ground                                             art/camp/ground/<col>_<row>.webp
  blender -b -P tools/blender/camp_render.py -- looks [id:look ...]                                art/camp/buildings/, cards/, data/camp-art.json
  ... -- figures [kind ...] | stills [name ...] | pieces [name ...] | nature [atlas ...]   art/camp/life/, art/camp/still/, art/map/, art/terrain/

The camera is fixed: 30 degrees up, 45 round, 1 unit = 1 painting px, and the world's origin shows at the painting's centre.
"""

import json
import math
import os
import sys
import tempfile
import time

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import camp_ink  # noqa: E402
import camp_kit as ck  # noqa: E402

SIZE = (1536, 2752)
SUN = Vector(camp_ink.SUN)
# Final pictures: rendered at FINE px per painting px, then averaged down to OUT.
# DRAFT=1 in the environment skips the averaging: about four times quicker, rougher edges.
FINE, SHRINK = (1.5, 1) if os.environ.get("DRAFT") else (3, 2)
OUT = FINE / SHRINK
# Extra px round each render, so ink lines and soft shadows at its edges are right.
MARGIN = 12
ART = os.path.join(os.getcwd(), "art", "camp")


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

    def cloud(scale, stretch, detail):
        mapping = n.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = [scale * s for s in stretch]
        link.new(pos, mapping.inputs["Vector"])
        tex = n.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 1.0
        tex.inputs["Detail"].default_value = detail
        link.new(mapping.outputs[0], tex.inputs["Vector"])
        return tex.outputs[0]

    # Uneven brushwork: broad patches and fine, upright strokes.
    total = None
    for scale, weight, stretch in ((0.016, 0.34, (1, 1, 1)), (0.06, 0.26, (1, 1, 0.35)), (0.22, 0.16, (1, 1, 0.5))):
        part = math_("MULTIPLY", math_("SUBTRACT", cloud(scale, stretch, 2.0), 0.5), weight * 2)
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
    # Crack lines: stretched noise (its borders are drawn) and where to keep them; only full-strength texture, rock and leaves, has any.
    keep = math_("MULTIPLY", cloud(0.017, (1, 1, 1), 1.5), math_("GREATER_THAN", attr("tex").outputs["Fac"], 0.95))
    pair = n.new("ShaderNodeCombineXYZ")
    link.new(cloud(0.024, (1, 1, 0.3), 1.5), pair.inputs[0])
    link.new(keep, pair.inputs[1])
    aov = n.new("ShaderNodeOutputAOV")
    aov.aov_name = "crack"
    link.new(pair.outputs[0], aov.inputs["Color"])
    return mat


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = 8
    s.cycles.use_adaptive_sampling = False
    s.cycles.use_denoising = False
    s.cycles.max_bounces = 0
    s.cycles.pixel_filter_type = "BOX"
    s.cycles.filter_width = 0.01
    s.render.use_persistent_data = True
    s.render.film_transparent = True
    s.render.image_settings.media_type = "MULTI_LAYER_IMAGE"
    s.render.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    s.render.image_settings.color_depth = "32"
    layer = s.view_layers[0]
    layer.use_pass_z = layer.use_pass_normal = layer.use_pass_diffuse_color = True
    layer.use_pass_diffuse_direct = layer.use_pass_ambient_occlusion = True
    for name, kind in (("ink", "VALUE"), ("crack", "COLOR")):
        aov = layer.aovs.add()
        aov.name, aov.type = name, kind
    s.world = bpy.data.worlds.new("w")
    s.world.color = (0, 0, 0)
    s.world.light_settings.distance = 60.0
    light = bpy.data.lights.new("sun", "SUN")
    light.energy, light.angle = 3.0, math.radians(1.5)
    sun = bpy.data.objects.new("sun", light)
    sun.rotation_euler = SUN.to_track_quat("Z", "Y").to_euler()
    s.collection.objects.link(sun)
    cam = bpy.data.cameras.new("cam")
    cam.type, cam.clip_end = "ORTHO", 30000
    obj = bpy.data.objects.new("cam", cam)
    obj.rotation_euler = (math.radians(60), 0, math.radians(45))
    s.collection.objects.link(obj)
    s.camera = obj
    return s


def shoot(s, rect, scale, weight=1.0):
    """The painted picture of `rect` (painting px) at `scale`, and its ink ids; renders a margin round it and cuts it off."""
    x, y, w, h = rect
    pad = MARGIN
    x, y, w, h = x - pad, y - pad, w + 2 * pad, h + 2 * pad
    s.render.resolution_x, s.render.resolution_y = int(w * scale), int(h * scale)
    s.camera.data.ortho_scale = max(w, h)
    right, up = Vector((ck.S45, ck.S45, 0)), Vector((-ck.S45 * 0.5, ck.S45 * 0.5, ck.UP))
    back = Vector((ck.S45 * ck.UP, -ck.S45 * ck.UP, 0.5))
    s.camera.location = right * (x + w / 2 - ck.CENTRE[0]) + up * (ck.CENTRE[1] - (y + h / 2)) + back * 8000
    with tempfile.TemporaryDirectory() as folder:
        s.render.filepath = os.path.join(folder, "passes.exr")
        bpy.ops.render.render(write_still=True)
        img, ids = camp_ink.paint(s.render.filepath, scale, (int(y * scale), int(x * scale)), weight=weight)
    m = int(pad * scale)
    cut = (slice(m, m + int(rect[3] * scale)), slice(m, m + int(rect[2] * scale)))
    return img[cut], ids[cut]


def add(name, kit, mat):
    obj = kit.build(name)
    obj.data.materials.append(mat)
    return obj


def ground(mat):
    import camp_terrain
    k = ck.Kit(7)
    camp_terrain.build(k)
    return add("ground", k, mat)


def sky(rect, scale):
    """The sky and the far hills behind the camp, as an opaque picture of `rect`."""
    x0, y0, w, h = rect
    sh, sw = int(h * scale), int(w * scale)
    py = (np.arange(sh) / scale + y0)[:, None].repeat(sw, 1).astype(np.float32)
    px = (np.arange(sw) / scale + x0)[None, :].repeat(sh, 0).astype(np.float32)
    at = (int(y0 * scale), int(x0 * scale))
    top, low = np.array([0.62, 0.78, 0.88]), np.array([0.83, 0.90, 0.90])
    f = np.clip(py / 260, 0, 1)[..., None]
    img = top * (1 - f) + low * f
    cloud = camp_ink.noise2((sh, sw), 160 * scale, 91, at) * 0.5 + camp_ink.noise2((sh, sw), 60 * scale, 92, at) * 0.3
    img = img + np.clip(cloud - 0.1, 0, 1)[..., None] * 0.14
    for i, (base, amp, col) in enumerate(((95, 34, (0.62, 0.69, 0.72)), (150, 44, (0.55, 0.60, 0.60)), (235, 60, (0.53, 0.55, 0.49)), (340, 60, (0.58, 0.53, 0.41)))):
        wave = sum(np.interp(px[0], np.arange(-400, 2400, s), np.random.default_rng(300 + i * 7 + j).uniform(-1, 1, len(np.arange(-400, 2400, s)))) * a
                   for j, (s, a) in enumerate(((190, 1.0), (70, 0.35), (24, 0.1))))
        ridge = (base + amp * wave)[None, :]
        inside = py > ridge
        depth = np.clip((py - ridge) / 160, 0, 1)
        shade = 1 + camp_ink.noise2((sh, sw), 46 * scale, 120 + i, at) * 0.05 + depth * 0.07
        img = np.where(inside[..., None], np.array(col) * shade[..., None], img)
        edge = np.abs(py - ridge) < 0.8
        img = np.where(edge[..., None], img * 0.55 + np.array([0.25, 0.27, 0.30]) * 0.45, img)
    return np.dstack([np.clip(img, 0, 1), np.ones((sh, sw))]).astype(np.float32)


def over(top, under):
    a = top[..., 3:4]
    return np.dstack([top[..., :3] * a + under[..., :3] * (1 - a), np.ones(a.shape[:2])]).astype(np.float32)


def preview(args):
    out, rect = args[0], [int(v) for v in args[1].split(",")]
    scale = float(args[2]) if len(args) > 2 else 1.0
    s, mat = setup(), material()
    ground(mat)
    if len(args) > 3:
        import camp_houses
        for item in args[3].split(","):
            name, look_ = item.split(":")
            add(name, camp_houses.kit(name, int(look_)), mat)
    img, _ = shoot(s, rect, scale)
    camp_ink.write(out, over(img, sky(rect, scale))[..., :3])


def webp(path, img, quality=92):
    import OpenImageIO as oiio
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = np.rint(np.clip(img, 0, 1) * 255).astype(np.uint8)
    spec = oiio.ImageSpec(data.shape[1], data.shape[0], data.shape[2], "uint8")
    spec.attribute("Compression", "webp:%d" % quality)
    spec.attribute("oiio:UnassociatedAlpha", 1)
    out = oiio.ImageOutput.create(path)
    if not out.open(path, spec):
        raise IOError(out.geterror())
    out.write_image(np.ascontiguousarray(data))
    out.close()


def load(path):
    import OpenImageIO as oiio
    f = oiio.ImageInput.open(path)
    data = np.asarray(f.read_image("float")).reshape(f.spec().height, f.spec().width, f.spec().nchannels)
    f.close()
    return data


# The ground's tiles, in painting px.
COLS, ROWS = 3, 4
TILE = (SIZE[0] // COLS, SIZE[1] // ROWS)


def tile_path(c, r):
    return os.path.join(ART, "ground", "%d_%d.webp" % (c, r))


def make_ground(args):
    s, mat = setup(), material()
    ground(mat)
    for r in range(ROWS):
        for c in range(COLS):
            if os.path.exists(tile_path(c, r)) and "again" not in args:
                continue
            rect = (c * TILE[0], r * TILE[1], TILE[0], TILE[1])
            img, _ = shoot(s, rect, FINE)
            img = camp_ink.shrink(over(img, sky(rect, FINE)), SHRINK)
            webp(tile_path(c, r), img[..., :3], 94)
            print("TILE", c, r, flush=True)


def ground_crop(rect):
    """The finished ground under `rect`, from the tiles."""
    x, y, w, h = [int(v * OUT) for v in rect]
    tw, th = int(TILE[0] * OUT), int(TILE[1] * OUT)
    out = np.zeros((h, w, 3), np.float32)
    for r in range(ROWS):
        for c in range(COLS):
            x0, y0, x1, y1 = max(x, c * tw), max(y, r * th), min(x + w, (c + 1) * tw), min(y + h, (r + 1) * th)
            if x0 < x1 and y0 < y1:
                t = load(tile_path(c, r))
                out[y0 - y:y1 - y, x0 - x:x1 - x] = t[y0 - r * th:y1 - r * th, x0 - c * tw:x1 - c * tw, :3]
    return out


def painting_px(p):
    return (ck.CENTRE[0] + (p[0] + p[1]) * ck.S45, ck.CENTRE[1] - ((p[1] - p[0]) * ck.S45 * 0.5 + p[2] * ck.UP))


def bounds(kit, pad):
    """The even-numbered px rect round a kit's points, kept on the painting."""
    pts = [painting_px(v) for v in kit.verts]
    x0, x1 = min(p[0] for p in pts) - pad, max(p[0] for p in pts) + pad
    y0, y1 = min(p[1] for p in pts) - pad, max(p[1] for p in pts) + pad
    x0, y0 = max(0, int(x0) // 2 * 2), max(0, int(y0) // 2 * 2)
    x1, y1 = min(SIZE[0], int(x1) // 2 * 2 + 2), min(SIZE[1], int(y1) // 2 * 2 + 2)
    return (x0, y0, x1 - x0, y1 - y0)


def trim(img, rect):
    """Cuts empty edges off, in steps of 2 painting px (3 px of the picture)."""
    full = np.argwhere(img[..., 3] > 0.004)
    (y0, x0), (y1, x1) = full.min(0), full.max(0) + 1
    n = int(2 * OUT)
    x0, y0, x1, y1 = x0 // n, y0 // n, -(-x1 // n), -(-y1 // n)
    return img[y0 * n:y1 * n, x0 * n:x1 * n], [int(v) for v in (rect[0] + x0 * 2, rect[1] + y0 * 2, (x1 - x0) * 2, (y1 - y0) * 2)]


def hull(points):
    """The convex hull of 2D points."""
    pts = sorted(set(map(tuple, points)))

    def half(seq):
        out = []
        for p in seq:
            while len(out) > 1 and (out[-1][0] - out[-2][0]) * (p[1] - out[-2][1]) - (out[-1][1] - out[-2][1]) * (p[0] - out[-2][0]) <= 0:
                out.pop()
            out.append(p)
        return out[:-1]
    return half(pts) + half(pts[::-1])


def manifest(key, value):
    path = os.path.join(os.getcwd(), "data", "camp-art.json")
    data = json.load(open(path)) if os.path.exists(path) else {}
    data[key] = value
    json.dump(data, open(path, "w"), indent=1, sort_keys=True)


def resize(img, w, h):
    import OpenImageIO as oiio
    buf = oiio.ImageBuf(np.ascontiguousarray(img.astype(np.float32)))
    return np.asarray(oiio.ImageBufAlgo.resize(buf, roi=oiio.ROI(0, w, 0, h, 0, 1, 0, img.shape[2])).get_pixels("float"))


def make_looks(args):
    """All looks (or those named "id:look"), then the scaffolds."""
    import camp_houses
    s, mat = setup(), material()
    land = ground(mat)
    wanted = [a.split(":") for a in args if ":" in a] or [(i, str(n)) for i in camp_houses.PLACES for n in (1, 2, 3, 4)]
    for name, n in wanted:
        n = int(n)
        kit = camp_houses.kit(name, n)
        obj = add("look", kit, mat)
        rect = bounds(kit, 46)
        img, ids = shoot(s, rect, FINE)
        bpy.data.objects.remove(obj)
        mask = (ids > 0.5) & (ids < 0.8)
        grown = camp_ink.near(mask, 3) <= 3
        whole = camp_ink.shrink(over(img, sky(rect, FINE)), SHRINK)
        cover = camp_ink.shrink(np.dstack([img[..., :3] * 0 + 1, grown.astype(np.float32)]), SHRINK)[..., 3]
        body, body_rect = trim(np.dstack([whole[..., :3], cover]), rect)
        path = os.path.join(ART, "buildings", "%s_%d" % (name, n))
        webp(path + ".webp", body, 92)
        # What the building does to the ground round it: how much darker each px is than the bare ground.
        bare = ground_crop(rect)
        dark = np.array([0.13, 0.08, 0.07], np.float32)
        a = ((bare - whole[..., :3]) / np.maximum(bare - dark, 0.05)).mean(-1)
        a = np.where(cover > 0.6, 0, np.clip(camp_ink.blur(a.astype(np.float32), 1), 0, 0.85))
        a = a * camp_ink.smooth(0.05, 0.12, a)
        shade, shade_rect = trim(np.dstack([np.broadcast_to(dark, bare.shape), a]), rect)
        webp(path + "_shade.webp", shade, 85)
        # The tap outline: the hull of the body, in painting px.
        pts = np.argwhere(body[::4, ::4, 3] > 0.5)[:, ::-1] * 4 / OUT + np.array(body_rect[:2])
        ring = [[round(float(v), 1) for v in p] for p in hull(pts.tolist())]
        # A square picture of it with its ground, for the cards.
        x0, y0, w, h = body_rect
        side = int(max(w, h) * 1.06) // 2 * 2
        cx, cy = min(max(x0 + w // 2 - side // 2, rect[0]), max(rect[0], rect[0] + rect[2] - side)), min(max(y0 + h // 2 - side // 2, rect[1]), max(rect[1], rect[1] + rect[3] - side))
        o = [int((cx - rect[0]) * OUT), int((cy - rect[1]) * OUT), int(side * OUT)]
        card = whole[o[1]:o[1] + o[2], o[0]:o[0] + o[2], :3]
        m = min(card.shape[:2])
        webp(os.path.join(ART, "cards", "%s_%d.webp" % (name, n)), resize(card[:m, :m], 384, 384), 90)
        f = camp_houses.frame(name)
        w_, l_, _ = camp_houses.SCAFFOLD[name]
        base = [[round(v, 1) for v in painting_px(f @ Vector(p))] for p in ((-w_, 0, 0), (0, 0, 0), (0, l_, 0))]
        manifest("%s_%d" % (name, n), {"body": body_rect, "shade": shade_rect, "outline": ring, "base": base,
                                                **({"chimney": [round(v, 1) for v in painting_px(f @ Vector(camp_houses.chimney(n)))]} if name == "farm" else {})})
        print("LOOK", name, n, body_rect, flush=True)
    if wanted and args and ":" in "".join(args):
        return
    land.hide_render = True
    for name in camp_houses.PLACES:
        kit = camp_houses.scaffold(name)
        obj = add("scaffold", kit, mat)
        rect = bounds(kit, 8)
        img, _ = shoot(s, rect, FINE)
        bpy.data.objects.remove(obj)
        body, body_rect = trim(camp_ink.shrink(img, SHRINK), rect)
        webp(os.path.join(ART, "buildings", name + "_scaffold.webp"), body, 92)
        manifest(name + "_scaffold", {"body": body_rect})
        print("SCAFFOLD", name, flush=True)


def sprite(s, mat, kit, rect, scale, shrink, weight=1.0, fade=False):
    """A kit on its own, with its shade on flat ground, as one picture with alpha."""
    flat = ck.Kit(1)
    x, y, w, h = rect
    flat.land([flat.ground(px, py) for px, py in ((x - 400, y + h + 400), (x + w + 400, y + h + 400), (x + w + 400, y - 400), (x - 400, y - 400))], ck.SAND, 0.0)
    things = [add("flat", flat, mat), add("sprite", kit, mat)]
    img, ids = shoot(s, rect, scale, weight)
    for o in things:
        bpy.data.objects.remove(o)
    mask = (ids > 0.5) & (ids < 0.8)
    cover = (camp_ink.near(mask, 2) <= 2).astype(np.float32)
    bare = np.median(img[~mask][:, :3], axis=0)
    dark = np.array([0.13, 0.08, 0.07], np.float32)
    a = np.clip(((bare - img[..., :3]) / np.maximum(bare - dark, 0.05)).mean(-1), 0, 0.8)
    a = camp_ink.blur(a.astype(np.float32), 2)
    a = a * camp_ink.smooth(0.1, 0.2, a)
    if fade:
        # The shade dies away from the foot, so a tight frame never cuts it.
        yy, xx = np.mgrid[0:a.shape[0], 0:a.shape[1]]
        a = a * (1 - camp_ink.smooth(0.2, 0.46, np.hypot((xx / a.shape[1] - 0.5), (yy / a.shape[0] - 0.92) * 0.8))).astype(np.float32)
    alpha = np.maximum(cover, a * (1 - cover))
    rgb = img[..., :3] * cover[..., None] + dark * (1 - cover[..., None])
    return camp_ink.shrink(np.dstack([rgb, alpha]).astype(np.float32), shrink)


def make_figures(args):
    import camp_figures as cf
    s, mat = setup(), material()
    for kind in args or cf.KINDS:
        kit = cf.build(kind)
        obj = add("figures", kit, mat)
        img, _ = shoot(s, (0, 0, cf.CELL[0] * cf.WAYS, cf.CELL[1] * cf.STEPS), FINE, 0.62)
        bpy.data.objects.remove(obj)
        webp(os.path.join(ART, "life", kind + ".webp"), camp_ink.shrink(img, SHRINK), 92)
        print("FIGURE", kind, flush=True)


def make_stills(args):
    """Tents, piles and the fire, each in its own picture at the figures' scale, its foot at the middle, FOOT of the way down."""
    import camp_still as cs
    s, mat = setup(), material()
    for name in args or cs.STILLS:
        w, h = cs.SIZE[name]
        rect = (ck.CENTRE[0] - w / 2, ck.CENTRE[1] - h * cs.FOOT, w, h)
        img = sprite(s, mat, cs.build(name), rect, FINE, SHRINK)
        webp(os.path.join(ART, "still", name + ".webp"), img, 92)
        print("STILL", name, flush=True)


# Map pieces have 3 px per map unit, and their footprint's centre at this px of the picture.
PIECE = 3


def make_pieces(args):
    import map_pieces as mp
    s, mat = setup(), material()
    for name in args or mp.PIECES:
        kit = ck.Kit(sum(map(ord, name)), ck.BODY)
        mp.PIECES[name](kit)
        kit.frame = None
        rect = bounds(kit, 10)
        img = sprite(s, mat, kit, rect, PIECE * 2, 2, 1.0, name == "frontier_tower")
        full = np.argwhere(img[..., 3] > 0.01)
        (y0, x0), (y1, x1) = full.min(0), full.max(0) + 1
        centre = [(ck.CENTRE[0] - rect[0]) * PIECE - int(x0), (ck.CENTRE[1] - rect[1]) * PIECE - int(y0)]
        webp(os.path.join(os.getcwd(), "art", "map", name + ".webp"), img[y0:y1, x0:x1], 92)
        path = os.path.join(os.getcwd(), "data", "map-art.json")
        data = json.load(open(path)) if os.path.exists(path) else {}
        data[name] = {"centre": centre, "size": [int(x1 - x0), int(y1 - y0)]}
        json.dump(data, open(path, "w"), indent=1, sort_keys=True)
        print("PIECE", name, flush=True)


def make_nature(args):
    """The map's prop atlases, frame by frame, each in the frame and on the anchor the manifest already gives it."""
    import map_pieces as mp
    atlases = json.load(open(os.path.join(os.getcwd(), "art", "terrain-manifest.json")))["props"]
    # The massif has frames of its own, written beside its picture for GroundArt.
    atlases["peaks"] = mp.MASSIF_ATLAS
    s, mat = setup(), material()
    for name in args or mp.NATURE:
        atlas = atlases[name]
        if name == "peaks":
            json.dump(atlas, open(os.path.join(os.getcwd(), "art", "terrain", "props-peaks.json"), "w"), indent=1)
        sheet = np.zeros((atlas["h"], atlas["w"], 4), np.float32)
        for i, f in enumerate(atlas["frames"]):
            kit = ck.Kit(i * 13 + len(name), ck.BODY)
            # The anchor is off the frame's middle in the old art; the thing stands in the middle.
            mp.NATURE[name](kit, i, kit.ground(f["w"] / 2 - f["ax"], -3), f["w"], f["h"])
            rect = (-f["ax"], -f["ay"], f["w"], f["h"])
            img = sprite(s, mat, kit, rect, 2, 2, mp.WEIGHT[name], True)
            img = img[:f["h"], :f["w"]]
            for axis, n in ((0, img.shape[0]), (1, img.shape[1])):
                edge = np.clip((np.minimum(np.arange(n), n - 1 - np.arange(n)) + 0.5) / 5, 0, 1).astype(np.float32)
                img[..., 3] *= edge[:, None] if axis == 0 else edge[None, :]
            sheet[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]] = img
            print("FRAME", name, i, flush=True)
        webp(os.path.join(os.getcwd(), "art", "terrain", "props-%s.webp" % name), sheet, 92)


def make_ground_art(args):
    """The map ground's seamless materials, its cliff face and its noise."""
    import map_ground as mg
    s, mat = setup(), material()
    out = os.path.join(os.getcwd(), "art", "ground")
    fine, shrink = (2, 1) if os.environ.get("DRAFT") else (4, 2)
    for name in args or list(mg.COLOURS) + ["cliff", "noise"]:
        if name == "noise":
            # Four fields that tile, each rough at three sizes.
            camp_ink.PERIOD = 256
            img = np.dstack([sum(camp_ink.noise2((256, 256), size, 700 + c * 10 + i) * a for i, (size, a) in enumerate(((64, .55), (25.6, .3), (9.8, .15)))) for c in range(4)]) * 0.5 + 0.5
            camp_ink.write(os.path.join(out, "noise.png"), img)
        elif name == "cliff":
            camp_ink.PERIOD = None
            kit = ck.Kit(31)
            w, h, blend = 1024, 96, 64
            mg.cliff(kit, w + blend, h)
            obj = add("cliff", kit, mat)
            img, _ = shoot(s, (0, 4, w + blend, h), fine, 0.55)
            bpy.data.objects.remove(obj)
            img = camp_ink.shrink(over(img, np.full(img.shape, 0.4, np.float32)), shrink)[..., :3]
            b = blend * fine // shrink
            f = np.linspace(0, 1, b, dtype=np.float32)[None, :, None]
            img[:, :b] = img[:, -b:] * (1 - f) + img[:, :b] * f
            webp(os.path.join(out, "cliff.webp"), img[:, :-b], 94)
        else:
            camp_ink.PERIOD = mg.PERIOD * fine
            kit = ck.Kit(sum(map(ord, name)))
            mg.material(kit, name)
            obj = add("ground", kit, mat)
            img, _ = shoot(s, (0, 0, mg.PERIOD, mg.PERIOD), fine, 0.6)
            bpy.data.objects.remove(obj)
            img = img[..., :3]
            # Brushed tones with soft edges.
            for i, (size, amount) in enumerate(((90, .030), (34, .022), (11, .012))):
                n = camp_ink.noise2(img.shape[:2], size * fine, 800 + i)
                img = img * (1 + amount * (camp_ink.smooth(-.25, .25, n) * 2 - 1))[..., None]
            # All in one strip, for a texture array: the canvas renderer has few texture units to spare.
            img = camp_ink.shrink(np.dstack([img, np.ones(img.shape[:2], np.float32)]), shrink)[..., :3]
            n, path = img.shape[0], os.path.join(out, "materials.webp")
            names = list(mg.COLOURS)
            strip = load(path)[..., :3] if os.path.exists(path) else np.zeros((n * len(names), n, 3), np.float32)
            at = names.index(name) * n
            strip[at:at + n] = img
            webp(path, strip, 94)
        print("GROUND", name, flush=True)


def make_fence(args):
    """The frontier's fence: one repeat along each of the two edge directions, made upright, so it lies on a slanted quad."""
    import map_pieces as mp
    s, mat = setup(), material()
    length = 2 * mp.TILE
    for name, along, slope in (("fence_down", (1, 0, 0), 0.5), ("fence_up", (0, 1, 0), -0.5)):
        kit = ck.Kit(77, ck.BODY)
        mp.fence(kit, length, along)
        obj = add("fence", kit, mat)
        # The repeat runs 96 px across the screen and 48 px up or down; 60 px of fence stand on it.
        top = -62 - (48 if slope > 0 else 0) + 0
        rect = (ck.CENTRE[0] - (0 if slope > 0 else 0), ck.CENTRE[1] - 62 - (0 if slope > 0 else 48), 96, 62 + 48)
        rect = (int(ck.CENTRE[0]), int(ck.CENTRE[1] - 62 - (0 if slope > 0 else 48)), 96, 62 + 48)
        scale = 4
        img, _ = shoot(s, rect, scale, 0.55)
        bpy.data.objects.remove(obj)
        # Shift each column so the ground line is level at the bottom.
        h, w = img.shape[:2]
        out = np.zeros((int(62 * scale), w, 4), np.float32)
        for x in range(w):
            ground = int(round((62 + (x / scale) * slope + (0 if slope > 0 else 48)) * scale))
            col = img[max(0, ground - out.shape[0]):ground, x]
            out[out.shape[0] - len(col):, x] = col
        webp(os.path.join(os.getcwd(), "art", "frontier", name + ".webp"), camp_ink.shrink(out, 2), 92)
        print("FENCE", name, flush=True)


def main():
    args = sys.argv[sys.argv.index("--") + 1:]
    t = time.time()
    {"preview": preview, "ground": make_ground, "looks": make_looks, "figures": make_figures, "stills": make_stills, "pieces": make_pieces, "nature": make_nature, "ground_art": make_ground_art, "fence": make_fence}[args[0]](args[1:])
    print("DONE %.0fs" % (time.time() - t))


main()
