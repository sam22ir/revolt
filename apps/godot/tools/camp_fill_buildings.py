"""Writes art/camp/dev/ground_no_buildings.webp: the camp painting with the six buildings smudged out, for the ground under the 3D
buildings (scripts/dev/camp_models.gd). The holes are exactly where the buildings show from the rest camera, a little shrunk, so
at rest the 3D blocks cover them; they only show in slivers when the camera turns, so a rough fill does.

Run from apps/godot, after the models change:
    godot --headless -s tools/camp_silhouettes.gd
    python3 tools/camp_fill_buildings.py
"""

import json
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

SRC = "art/camp/algeria_camp.webp"
OUT = "art/camp/dev/ground_no_buildings.webp"
SILHOUETTES = "tools/blender/silhouettes.json"
SHRINK = 7  # px, odd: how far inside its silhouette a hole stops
PASSES = 40


def main():
    img = Image.open(SRC).convert("RGB")
    with open(SILHOUETTES) as f:
        shapes = json.load(f)
    for points in shapes.values():
        hole = Image.new("L", img.size, 0)
        draw = ImageDraw.Draw(hole)
        for i in range(0, len(points) - 2, 3):
            draw.polygon([tuple(p) for p in points[i:i + 3]], fill=255)
        hole = hole.filter(ImageFilter.MinFilter(SHRINK))
        # Start the hole at the mean colour of a ring around it, then spread the colours around it inward: blur, keep the blur
        # only inside the hole, repeat.
        ring = ImageChops.subtract(hole.filter(ImageFilter.MaxFilter(31)), hole)
        img.paste(tuple(int(c) for c in ImageStat.Stat(img, ring).mean), mask=hole)
        box = hole.getbbox()
        if box is None:
            continue
        pad = 60
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(img.width, box[2] + pad), min(img.height, box[3] + pad))
        part, part_hole = img.crop(box), hole.crop(box)
        for _ in range(PASSES):
            part = Image.composite(part.filter(ImageFilter.GaussianBlur(12)), part, part_hole)
        img.paste(part, box[:2])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, quality=88)


main()
