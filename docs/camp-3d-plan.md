# The camp and map art, modelled in Blender

Decided 25 Nov 2026: assets are modelled in Blender (scripts only, our own art), drawn in the current inked style, seen from one fixed camera (30° up, 45° round), and shown in Godot as 2D layers the player can zoom.

| Step | Done when |
|---|---|
| 1. Style: cliffs, trees, canvas, light | The whole camp renders and reads as one picture next to the old painting |
| 2. In the game: layers and pinch zoom | Ground tiles, building layers and figures draw in order; pinch, wheel and pan work and are tested; checked on a phone by the user |
| 3. All six buildings, the ground, four looks each and scaffolding | Every building at every level 1-10 resolves to files that load (GUT) |
| 4. People and mules, then map pieces | Walk cycles in 8 directions; the map draws bases, sites, posts and columns with the new art |

## How it fits together

- `apps/godot/tools/blender/`: `camp_kit.py` (parts), `camp_terrain.py`, `camp_houses.py`, `camp_figures.py`, `map_pieces.py` (models), `camp_ink.py` (the painted look), `camp_render.py` (renders).
- One Blender unit is one painting px (1536 x 2752); the world's origin shows at the painting's centre. Positions are painting px plus a height.
- The ground is rendered without buildings, in tiles at 1.5 px per painting px. A building look is two images: its body, and the shade it adds to the ground (the difference between the ground with it and without it).
- Looks: 1 from level 1, 2 from level 3, 3 from level 6, 4 from level 9. The mapping is art data in Godot, not a rule.

## Looks (for the user to review)

Plain mountain-farm building that grows; no flags, insignia, faces, vehicles or weapons as decoration. Nothing here claims a real place.

| Building | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| hq | tiled house, awning, mast | longer, sandbags | square lookout with a canvas roof | second wing, bigger yard canvas |
| barracks | tiled house with a canvas lean-to | longer, bunk canvas | upper storey | second house |
| armory | flat stone store | bigger, workbench awning | second store | forge chimney, upper room |
| hero_hall | open canvas pavilion | stone half walls | tiled roof | side room and taller roof |
| treasury | stone strong room | taller, iron door | second room | outer wall and stores |
| farm | tiled farmhouse, hay | bigger lean-to | round granary | barn |
