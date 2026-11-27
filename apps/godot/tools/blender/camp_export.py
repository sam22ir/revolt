"""The camp as real 3D for Godot (a look test, docs/camp-life-plan.md): the ground and the six buildings, exported as one glTF
with each face's colour on its corners (alpha: how much paint texture it gets). Run from apps/godot:

  blender -b -P tools/blender/camp_export.py -- [look] [ground share]   art/camp/3d/buildings.glb, art/camp/3d/ground.glb

The ground is far heavier than the buildings (about 920k faces), so it goes in its own file, cut down to `ground share` of its
faces (default 0.05).

1 unit is 1 painting px and Blender's origin is the painting's centre, as in camp_render.py; glTF turns Z-up into Godot's Y-up.
"""

import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import camp_kit as ck  # noqa: E402

DIR = os.path.join(os.getcwd(), "art", "camp", "3d")


def corner_colours(obj):
    """The kit's face colours and paint amounts copied onto the corners, as the active colour glTF exports."""
    mesh = obj.data
    cols = [0.0] * (len(mesh.polygons) * 4)
    mesh.attributes["col"].data.foreach_get("color", cols)
    texs = [0.0] * len(mesh.polygons)
    mesh.attributes["tex"].data.foreach_get("value", texs)
    out = mesh.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
    data = [0.0] * (len(mesh.loops) * 4)
    for poly in mesh.polygons:
        c = cols[poly.index * 4:poly.index * 4 + 3] + [texs[poly.index]]
        for li in poly.loop_indices:
            data[li * 4:li * 4 + 4] = c
    out.data.foreach_set("color", data)
    mesh.color_attributes.active_color = out
    mesh.color_attributes.render_color_index = mesh.color_attributes.find("Col")
    # Cycles draws both sides of a face, so the kits' normals may point either way; turn them out where a shape is closed.
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    for name in ("col", "tex", "ink"):
        mesh.attributes.remove(mesh.attributes[name])
    mat = bpy.data.materials.get("paint") or bpy.data.materials.new("paint")
    mesh.materials.append(mat)
    print("MESH", obj.name, len(mesh.polygons), "faces", flush=True)


def main():
    import camp_houses
    import camp_terrain
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    look = int(args[0]) if args else 1
    share = float(args[1]) if len(args) > 1 else 0.05
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(DIR, exist_ok=True)
    for name in camp_houses.PLACES:
        corner_colours(camp_houses.kit(name, look).build(name))
    export("buildings")
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj)
    k = ck.Kit(7)
    camp_terrain.build(k)
    ground = k.build("ground")
    corner_colours(ground)
    cut = ground.modifiers.new("cut", "DECIMATE")
    cut.ratio = share
    bpy.context.view_layer.objects.active = ground
    bpy.ops.object.modifier_apply(modifier="cut")
    print("MESH ground cut to", len(ground.data.polygons), "faces", flush=True)
    export("ground")


def export(name):
    path = os.path.join(DIR, name + ".glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", export_vertex_color="ACTIVE", export_normals=True,
                              export_materials="PLACEHOLDER", export_yup=True)
    print("GLB", path, os.path.getsize(path), "bytes", flush=True)


main()
