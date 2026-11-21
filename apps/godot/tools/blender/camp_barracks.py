"""Blocks for the barracks in the camp painting, exported as art/camp/models/barracks.glb.

Only the shape comes from here: the painting is projected onto it in Godot (shaders/camp_projection.gdshader), so the blocks need
to be roughly right, not exact. Units are painting px (the 1536 px wide art/camp/algeria_camp.webp). The origin is the house's
front bottom corner, where the gable end (the white wall with the door) meets the long side under the awning. In Blender the
gable end runs along -X and the long side along +Y; Godot places and turns the model (scripts/dev/camp_3d_test.gd).

Also saves tools/blender/barracks.blend (outside the Godot import) for hand edits; re-running this script overwrites it.

Run from apps/godot:  blender -b -P tools/blender/camp_barracks.py
"""

import os

import bpy
import bmesh

OUT = os.path.join(os.getcwd(), "art", "camp", "models", "barracks.glb")

# Measured on the painting (see the test scene's notes): elevation 30 degrees, gable end 176 px, long side about 240 px.
HOUSE_W = 176.0  # gable end
HOUSE_L = 240.0  # long side
WALL_H = 110.0
RIDGE_H = 62.0  # ridge above the eaves
EAVE = 18.0  # roof overhang on every side
LEANTO_D = 70.0  # awning depth out from the long side
LEANTO_L = 200.0
LEANTO_FRONT_H = 80.0
LEANTO_BACK_H = 100.0


def box(bm, x0, x1, y0, y1, z0, z1):
    v = [bm.verts.new(p) for p in [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]]
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]:
        bm.faces.new([v[i] for i in f])


def house(bm):
    w, l, h, r, e = HOUSE_W, HOUSE_L, WALL_H, RIDGE_H, EAVE
    box(bm, -w, 0.0, 0.0, l, 0.0, h)
    # Gable triangles on both ends, then the two roof slopes with their overhang.
    for y in (0.0, l):
        tri = [bm.verts.new(p) for p in [(-w, y, h), (0.0, y, h), (-w / 2, y, h + r)]]
        bm.faces.new(tri if y else list(reversed(tri)))
    slope = r / (w / 2)
    low = h - e * slope
    ridge = [(-w / 2, -e, h + r), (-w / 2, l + e, h + r)]
    for edge_x in (-w - e, e):
        eaves = [(edge_x, -e, low), (edge_x, l + e, low)]
        quad = [bm.verts.new(p) for p in [eaves[0], eaves[1], ridge[1], ridge[0]]]
        bm.faces.new(quad if edge_x > 0 else list(reversed(quad)))


def leanto(bm):
    d, l, fh, bh = LEANTO_D, LEANTO_L, LEANTO_FRONT_H, LEANTO_BACK_H
    v = [bm.verts.new(p) for p in [
        (0.0, 0.0, 0.0), (d, 0.0, 0.0), (d, l, 0.0), (0.0, l, 0.0),
        (0.0, 0.0, bh), (d, 0.0, fh), (d, l, fh), (0.0, l, bh),
    ]]
    for f in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6)]:
        bm.faces.new([v[i] for i in f])


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new("barracks")
    bm = bmesh.new()
    house(bm)
    leanto(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("barracks", mesh)
    bpy.context.scene.collection.objects.link(obj)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(os.path.dirname(__file__), "barracks.blend"))
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_materials="NONE", export_yup=True)


main()
