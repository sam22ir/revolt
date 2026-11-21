"""Writes art/camp/dev/ground_no_barracks.webp: the camp painting with the barracks smudged out, for the ground under the 3D
barracks in the test scene (scripts/dev/camp_3d_test.gd). It only shows in slivers when the camera turns, so a rough fill does.

Run from apps/godot:  python3 tools/camp_fill_barracks.py
"""

import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

SRC = "art/camp/algeria_camp.webp"
OUT = "art/camp/dev/ground_no_barracks.webp"
# Painting px, a little inside the painted house and awning so nothing outside the 3D blocks is filled.
HOUSE = [(280, 782), (352, 755), (490, 698), (526, 706), (560, 800), (586, 835), (586, 930), (470, 972), (414, 955),
         (295, 915), (285, 795)]
PASSES = 40


def main():
    img = Image.open(SRC).convert("RGB")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(HOUSE, fill=255)
    # Start the hole at the mean colour of a ring around it, so none of the house bleeds in.
    ring = ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(31)), mask)
    mean = tuple(int(c) for c in ImageStat.Stat(img, ring).mean)
    img.paste(mean, mask=mask)
    # Spread the colours around the hole into it: blur, keep the blur only inside the hole, repeat.
    for _ in range(PASSES):
        img = Image.composite(img.filter(ImageFilter.GaussianBlur(12)), img, mask)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, quality=88)


main()
