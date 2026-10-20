# Terrain art brief (Google Flow batch)

Goal: about 20 ground variants per terrain, plus separate props, that **link**: ground tiles join with no seams, and trees, rocks and peaks overhang tile borders so regions look continuous. Style is the approved one (GDD §7): semi-realistic painted isometric, warm sunlight, Algerian palette, no text, no people. Use the approved base-camp scene and `art/raw/sheets/terrain_tiles.jpg` as the style reference in every generation.

Why this shape: the current tiles are raised blocks with soil sides, so every tile shows an edge. Flat ground has no sides to show, and the world scene can feather each tile's diamond edge into its neighbour, which blends across terrain borders too. Height (trees, peaks, terraces, boulders) comes from props.

## 1. Ground sheets (4 terrains x 3 sheets)

One generation = one sheet of **9 flat diamond ground tiles in a 3 x 3 grid** on a plain mid-grey background (same as the first batch), wide gaps between tiles. Each tile is a flat isometric diamond (2:1 width:height), top surface only: **no soil sides, no slab thickness, no border stones, no shadow outside the diamond**. The ground should run right to the diamond's edges, with no frame, and the same overall colour and light on all nine so they sit next to each other. Vary the detail inside, not the palette. Three sheets give 27, and we keep the best 20.

Prompt (replace `TERRAIN` and the description):

> Sheet of nine flat isometric ground tiles in a 3 by 3 grid on a plain mid-grey background, wide gaps between tiles. Each tile is a perfect 2:1 isometric diamond showing only the flat top surface of TERRAIN: no soil sides, no thickness, no border, no frame, no shadow outside the diamond, ground detail running right up to the edges so tiles can be placed side by side. All nine tiles have the same colour palette and the same warm sunlight from the upper left, but different ground detail. Semi-realistic painted isometric style, same as the reference image. No text, no people, no buildings.

TERRAIN descriptions:

| id | description |
| --- | --- |
| `plain` | dry Algerian steppe: sand and ochre earth, sparse olive-green scrub, small stones, faint tracks |
| `hills` | rolling dry hill pasture: ochre and olive grass, exposed pale rock, goat paths, a few flat terrace walls |
| `forest` | forest floor under pines and holm oaks: needle litter, moss, roots, dappled shade (the trees themselves are props) |
| `mountain` | bare mountain rock: dark brown and grey rubble, scree, thin snow patches, no cliffs standing up |

Folder: `art/raw/terrain/ground/<id>-<n>.jpg` (n = 1 to 3 per sheet).

## 2. Prop sheets (cut-outs)

One generation = a 3 x 3 sheet of separate objects on a plain mid-grey background, each object standing alone with space around it, lit from the upper left, with a soft contact shadow directly under it (no cast shadow onto the background). They are drawn on top of the ground and may overhang neighbouring tiles, so they should not look like they belong to a diamond.

| sheet | contents | sheets |
| --- | --- | --- |
| `trees` | pine, holm oak, cedar and olive trees as single trees and groups of 2 to 3, various heights | 2 |
| `rocks` | boulders and rock clusters, sandstone and grey limestone, small to large | 1 |
| `peaks` | mountain peaks and ridges, 1 to 3 peaks per object, some with snow, wider than tall | 2 |
| `scrub` | bushes, dry grass tufts, small olive trees, cactus-free | 1 |
| `terraces` | short terraced field steps and low stone walls, flat-topped, 1 to 2 tiles wide | 1 |

Prompt:

> Sheet of nine separate TYPE objects in a 3 by 3 grid on a plain mid-grey background, each object standing alone with generous space around it, not touching each other or the edges. Lit from the upper left with a soft contact shadow directly underneath each object, no shadow cast onto the background. Semi-realistic painted isometric style, same as the reference image, viewed from the same isometric angle. No ground slab, no soil block, no text, no people, no buildings.

Folder: `art/raw/terrain/props/<sheet>-<n>.jpg`.

## 3. Checks before sending

- Ground: no soil sides or thickness anywhere, no grey background inside the tile, no baked border, nine similar-looking tiles per sheet.
- Props: every object fully on grey, none cut off, no ground block under it.
- No text and no recognisable faces. Anything with a face gets regenerated.

## 4. What happens next (so you know what to send)

Send the downloaded Flow project (or just the two folders above). Then, in this order:

1. `scripts/process-terrain.mjs` finds each tile or object on its sheet, removes the grey, crops it, masks ground tiles to the exact diamond with a feathered edge, and writes WebP plus a manifest (`apps/client/src/art/terrain-manifest.json`).
2. The world scene picks a ground variant per tile from a hash of its coordinates (so it never changes between visits), joins neighbours by overlapping the feathered edges, and places props by terrain and a second hash. Props draw above the ground and over neighbouring tiles. Forest and mountain props get thicker toward the middle of a region and thinner at its border, so regions read as one forest or one ridge.
3. Taps still use `screenToTile`; nothing here is interactive.
4. A few tiles from each terrain go into `docs/art.md`, with the same licensing TODO.

## 5. Budget

Twelve ground sheets and seven prop sheets are 19 generations, plus retries. Nothing here is paid beyond the existing Flow subscription.
