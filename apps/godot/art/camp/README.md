# Camp painting

`algeria_camp.webp` is the whole Algerian base as one painting: terrain, the six buildings and their props. Generated in Google Flow (Nano Banana 2.1) on 3 Nov 2026 and upscaled to 2K there, so everything in it matches. People, animals, vehicles, flags and smoke are left out, because they are drawn on top.

Tap outlines and name positions are traced on a 768 x 1376 grid in `scripts/base/camp_layout.gd`. A new export of this same painting needs no retracing; a repaint does.

The base shows the painting in 3D (`scripts/base/camp_scene.gd`): the six buildings are rough blocks (`models/<id>.glb`, built by `tools/blender/camp_buildings.py` and placed in `scripts/base/camp_models.gd`), and the painting is projected onto them and the ground from the camera it was painted from. At rest that is the painting itself, so the traced outlines still fit; the people walk among the blocks and are hidden behind them. A repaint means re-measuring each building's corner, turn and size.

`dev/ground_no_buildings.webp` is the painting with the buildings smudged out, only for the look test (`?scene=camp3d`), where the camera turns: run `godot --headless -s tools/camp_silhouettes.gd`, then `python3 tools/camp_fill_buildings.py`, after the blocks change.

Known limits: upgrades don't change a building's look until each level has its own painting, and new buildings need a repaint and a block. Plan a full repaint with all planned buildings before launch.
