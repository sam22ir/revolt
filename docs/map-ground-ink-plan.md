# The map's ground in the ink style

25 Nov 2026. Replaces the colour field, green wash, blotchy decals, detail overlay and flat strokes with inked land that has real height, matching the camp (docs/camp-3d-plan.md). Client only and cosmetic: terrain, geography and all rules stay as they are, and everything comes from the terrain seed.

**Status (25 Nov 2026):** built: shader ground with materials, mesas and hill ledges, riverbeds, roads, pools, dunes, region borders, the raked strip, cloud shadows; the inked fence and towers; palms and lighter trees. Old ground code (colour field, wash, decals, detail overlay, stroke mesh, `?ground=` variants) removed. Open: speed on a real phone, the full-quality render of the materials, field parcels by roads (left out so they are not mistaken for resource sites).

## What is drawn

1. **Land with height.** The terrain noise itself is the height: hills are a low ledge, mountains rise as two- or three-step mesas with inked cliff faces (the camp's rock). One shader walks each pixel's column through the height field. Ground near roads, riverbeds, oases and anything built is flattened, so nothing the player uses stands on or behind a cliff.
2. **Materials.** Seamless pictures rendered from the Blender kit (pebbles, tufts, cracks, slabs): sand, dry steppe, meadow, forest floor, rock, and the cliff face. They meet along ragged, organic edges, never along tiles. A slow colour drift hides the repeats.
3. **Roads, riverbeds, pools.** Strips with inked, hand-wobbled edges: roads with two ruts, dry riverbeds cut below the ground with stone banks and gravel bars, pools with a rim, shallows and ripples.
4. **Stamps.** Rendered pieces on the ground: crescent dunes on bare sand, stone scatters, grass patches, cart tracks, and field parcels on fertile ground by the roads.
5. **The land outside** the frontier is the same land mirrored, duller.
6. **Trees, rocks, peaks**: lighter, with mipmaps, standing on the height they are at; nothing stands where a mesa hides it.

## Limits

Runs on GLES 3 (compatibility): at most 8 texture units in the ground shader, the column walk only where the land is high, no work per frame in script.

## Done when

Far, middle and close shots (seeds 1954 and 12345) read as one picture with the camp; GUT passes (height field, flattening, prop lift, layers); en and ar map shots in the built-in browser.
