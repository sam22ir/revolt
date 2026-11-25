# The camp's pictures

All rendered from our own Blender models by `apps/godot/tools/blender/` (plan and how it fits together: `docs/camp-3d-plan.md`). Change the scripts, not the pictures. From `apps/godot`, one at a time:

```
blender -b -P tools/blender/camp_render.py -- ground again     ground/<col>_<row>.webp, 3 x 4 tiles, 1.5 px per painting px
blender -b -P tools/blender/camp_render.py -- looks [id:look]  buildings/ (body, shade, scaffold), cards/, data/camp-art.json
blender -b -P tools/blender/camp_render.py -- figures [kind]   life/, 8 directions by 6 steps
blender -b -P tools/blender/camp_render.py -- pieces [name]    art/map/, data/map-art.json
blender -b -P tools/blender/camp_render.py -- nature [atlas]   art/terrain/props-*.webp, in the manifest's frames
```

`DRAFT=1` in the environment is about four times quicker and rougher. Render the looks after the ground, since each look's shade is the difference from it. After new files, import, then set `mipmaps/generate=true` and `compress/mode=1` (quality 0.92) in their `.import` files: the pictures show smaller than they are.

The game draws them with `scripts/base/camp_picture.gd`; places and outlines come from `data/camp-art.json`, names and routes from `scripts/base/camp_layout.gd`.
