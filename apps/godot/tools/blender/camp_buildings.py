"""Blocks for the six buildings in the camp painting, exported as art/camp/models/<id>.glb.

Only the shapes come from here: the painting is projected onto them in Godot (shaders/camp_projection.gdshader), so the blocks
need to be roughly right, not exact. Units are painting px (the 1536 px wide art/camp/algeria_camp.webp), measured on the
painting. Each model's origin is its front bottom corner, the one nearest the viewer. In Blender the left-hand face runs along
-X and the right-hand face along +Y; Godot places and turns each model (scripts/dev/camp_models.gd).

Also saves tools/blender/camp_buildings.blend (outside the Godot import) for hand edits; re-running this script overwrites it.

Run from apps/godot:  blender -b -P tools/blender/camp_buildings.py
"""

import os

import bpy
import bmesh

OUT_DIR = os.path.join(os.getcwd(), "art", "camp", "models")

# w: left face, l: right face, h: walls. A gabled house has its ridge along +Y; a lean-to (awning) sticks out of the right face.
BUILDINGS = {
    "barracks": [
        ("house", dict(w=176, l=240, h=110, ridge=62, eave=18)),
        ("leanto", dict(d=70, l=200, front=80, back=100)),
    ],
    "hq": [("house", dict(w=155, l=235, h=121, ridge=45, eave=16))],
    "farm": [
        ("house", dict(w=237, l=280, h=147, ridge=80, eave=18)),
        ("leanto", dict(d=80, l=250, front=110, back=135)),
    ],
    "armory": [("block", dict(w=185, l=190, h=121))],
    "treasury": [("block", dict(w=106, l=185, h=139))],
    # Open on all sides: four posts under a hipped canvas roof, so the painted floor and benches stay on the ground.
    "hero_hall": [("pavilion", dict(w=235, l=355, h=173, rise=60, eave=15, post=10))],
}


def faces(bm, points, polys):
    v = [bm.verts.new(p) for p in points]
    for f in polys:
        bm.faces.new([v[i] for i in f])


def box(bm, x0, x1, y0, y1, z0, z1):
    faces(bm, [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
          [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])


def house(bm, w, l, h, ridge, eave):
    box(bm, -w, 0.0, 0.0, l, 0.0, h)
    for y in (0.0, l):
        faces(bm, [(-w, y, h), (0.0, y, h), (-w / 2, y, h + ridge)], [(0, 1, 2)])
    low = h - eave * ridge / (w / 2)
    top = [(-w / 2, -eave, h + ridge), (-w / 2, l + eave, h + ridge)]
    for x in (-w - eave, eave):
        faces(bm, [(x, -eave, low), (x, l + eave, low), top[1], top[0]], [(0, 1, 2, 3)])


def leanto(bm, d, l, front, back):
    faces(bm, [(0.0, 0.0, 0.0), (d, 0.0, 0.0), (d, l, 0.0), (0.0, l, 0.0), (0.0, 0.0, back), (d, 0.0, front), (d, l, front),
               (0.0, l, back)],
          [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6)])


def block(bm, w, l, h):
    box(bm, -w, 0.0, 0.0, l, 0.0, h)


def pavilion(bm, w, l, h, rise, eave, post):
    for x in (-w, -post):
        for y in (0.0, l - post):
            box(bm, x, x + post, y, y + post, 0.0, h)
    x0, x1, y0, y1 = -w - eave, eave, -eave, l + eave
    ridge = [(-w / 2, y0 + w / 2, h + rise), (-w / 2, y1 - w / 2, h + rise)]
    faces(bm, [(x0, y0, h), (x1, y0, h), (x1, y1, h), (x0, y1, h), ridge[0], ridge[1]],
          [(0, 1, 4), (1, 2, 5, 4), (2, 3, 5), (3, 0, 4, 5)])


PARTS = {"house": house, "leanto": leanto, "block": block, "pavilion": pavilion}


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, parts in BUILDINGS.items():
        mesh = bpy.data.meshes.new(name)
        bm = bmesh.new()
        for kind, size in parts:
            PARTS[kind](bm, **{k: float(v) for k, v in size.items()})
        bm.to_mesh(mesh)
        bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT_DIR, name + ".glb"), export_format="GLB",
                                  export_materials="NONE", export_yup=True, use_selection=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), "camp_buildings.blend"))


main()
