# World map step 1: clean ground and landmarks

Goal: make the world map read like the reference MMOs (mostly open ground, decoration in clusters, a few big landmarks, no visible grid), so markers stand out. Ground only: markers, HUD, tap menu and search are later steps.

This carries out the "World map" section of `docs/art-direction-v2.md` (quiet ground, loud objects; sparse large props: lake, dune ridges, rock outcrops, olive clusters). GDD §7 still says "dense small props"; PR 1a updates that line to match the art direction.

Scope is client-only. `terrainAt`, `fertilityAt` and `geographyOf` stay unchanged because the server uses terrain for placement and liberation (mountain tiles are blocked). New landmarks are cosmetic and derived from the map seed on the client.

## Problems today

- `propsFor` (`apps/client/src/scene/terrain-props.ts`) makes a separate coin flip per tile on a white-noise hash. Plain tiles get 14% scrub + 6% rocks, mid-fertility ground ~20%, so props land evenly everywhere.
- Region borders (`region-layer.ts`) are thin dark lines (`0x3a2a1e`, alpha 0.55) on every region edge. They read as cracks.
- No tile grid is actually drawn: `GRID_ZOOM` (0.45) only affects the flat renderer, which runs below zoom 0.3, so the flag is dead. The lines in the screenshots are region borders.
- Only 3 oases on a 64×64 map, drawn as small ellipses. No dunes, fields or other large features.

## Plan

Two PRs, each checked at phone size in `en` and `ar` with map screenshots at far, mid and close zoom.

### PR 1a: declutter and cluster

1. **Cluster mask.** Add `clusterAt(seed, x, y, kind)` in a new `apps/client/src/scene/decor-clusters.ts`. It uses `valueNoise` from rules with a coarse cell (~5–7 tiles) and a per-kind salt, thresholded so ~25% of open ground is inside a cluster. Pure and seeded. `GroundLayer.onSnapshot` computes it once per seed into a `Uint8Array` next to the terrain and geo flags, and `propsFor` reads it through `PropContext`, so repaints on pan cost nothing extra.
2. **Rewrite the open-ground branches of `propsFor`.**
   - Plain/hills outside a cluster: ≤3% dressed (single scrub, rare small rock).
   - Inside a rock cluster: 2–3 rocks per tile, larger near the cluster centre. These become outcrops like in the desert reference.
   - Inside a scrub/grove cluster: tight olive or scrub patches, density rising with `fertility`.
   - Forest terrain: keep, but thin the outer edge harder (interior < 0.45 → ~10%) so forests are compact groves with clean edges.
   - Mountains, wadis, oasis ring, banks: unchanged.
3. **Remove the dead grid flag** (`GRID_ZOOM`, `paint.grid`). The selection outline lives in `object-layer.ts` and is not affected.
4. **Softer region borders.** Replace the thin dark line with a wider, low-alpha band (alpha ~0.18, a new warm theme constant such as `theme.region.seam`) so it reads as a seam, not a crack. Keep the strong border and wash only for the region the player is liberating, as today. At far zoom (< 0.3), keep a faint line so regions are still readable on the overview.
5. **Ground variation.** Add a second, large low-frequency drift cell (~16 tiles) in `ground-tint.ts` so empty sand has gentle light/dark sweeps. Leave `DRIFT_RANGE` as is: more per-tile contrast would show the diamond mosaic.

Before any edit: take baseline screenshots with `client-mock` + `server-mock`, fixed seed, fixed camera spots (far, mid, close), in `en` and `ar`, so before and after line up.

Tests (`apps/client/test/terrain-props.test.ts`, new `decor-clusters.test.ts`, `ground-tint.test.ts` updated for the new drift cell):
- `clusterAt` is deterministic, in range, and differs by seed and kind.
- Over a 64×64 seed sample: share of dressed plain tiles outside clusters ≤ 4%; total dressed plain tiles between 10% and 30%.
- Clustering metric: P(neighbour dressed | tile dressed) ≥ 2.5 × P(tile dressed).
- Existing invariants keep passing (roads/oases clear, wadi pebbles only, no trees on mountains, offsets within ±0.4).

### PR 1b: landmarks

1. **Bigger-looking oases.** The water stays inside the `GEO_OASIS` tiles: the server only blocks mountains, so growing the water could put a base in a pond. The extra size goes into the art: an irregular shoreline (several overlapping ellipses), a lighter shallow rim and green damp ground on the shore tiles, and a denser orchard ring (no palm sprites yet; orchard frames for now, palms added to the art brief).
2. **Dune fields.** Seeded noise picks 2–4 arid patches (`fertility < ARID`, plain, away from roads and sites). Draw code-made crescent dune ridges (light crest stroke + soft shadow) in a new `dune-layer.ts` at the feature depth. No props inside dune fields.
3. **Field patches.** Near roads on the most fertile plain, draw small code-made field parcels (wheat yellow / green / fallow brown with furrow lines) in 2×3 to 3×4 tile blocks. These give the "Mitidja farmland" look and mark fertile areas.
Placement of dunes and fields is a pure function of the seed (off roads, wadis, oases, mountains and region sites). Bases come from the live snapshot, so the 3×3 ring around bases/NPCs/HQs is masked at paint time with the same occupied set `trackOccupied` builds for props.

Tests: placement is deterministic, stays off roads, wadis, oases and mountains, and counts stay within bounds per map; the paint-time mask skips occupied tiles (tested on its own).

## Not in this step

- Rock ridges along mountain ranges: mountain shapes come from `terrainAt` noise blobs, so a prop mask can't turn them into ridges. Needs a rules change or art; later.
- New sprite art (palms, dune sprites, ksar walls). I'll list them in `docs/terrain-art-brief.md` for later.
- Marker size, name plates, shield/burning states (step 2).
- Any change to `packages/rules` terrain, geography or server data.

## Risks

- Changing `propsFor` reshuffles every map's decoration. That's fine since decoration is cosmetic and not stored.
- Softer borders could make regions hard to see. The far-zoom faint line and the active-liberation border should cover this; check in the screenshots.
- Code-drawn dunes and fields can look flat next to painted props. If they do, keep them subtle (low alpha) and order the art instead.

## Step 1c: painted ground (before 1b)

After 1a the props are clustered, but the ground itself is still far from the references. On `map-perf` every tile is one flat-colour diamond plus three specks, baked into cell textures (`ground-bake.ts` `paintGroundTile`). That gives:

- a checkered diamond mosaic, very visible at mid and far zoom;
- no surface detail: the references have painted sand grain, ripples, cracks, pebbles and dry grass on all the ground, not just on props;
- hard colour steps where terrains or fertility change.

The ground is baked once per cell, so detail costs bake time only, not frame time. All of this stays inside `GroundBake.bakeCell`.

1. **Smooth colour field.** Write the per-tile colours (`plan.colours`, unchanged) into one reused scratch canvas, one pixel per tile, and draw it into the cell with the isometric transform and bilinear smoothing. Colours blend smoothly between tile centres, so the diamonds disappear. Pixel centre (x+0.5, y+0.5) must land on the tile's centre, or the field shifts half a tile against roads and props: the matrix is a pure exported function with unit tests (Vitest has no canvas, so the math is tested, not the drawing). One scratch canvas and one `CanvasTexture` are reused for every cell; per cell it is refreshed, drawn into the cell's DynamicTexture, then the `paintFeatures` graphics go on top. Watch for a double blur with `blendedGround`'s 3×3 blend; drop that blend if the ground goes muddy.
2. **Ground detail texture.** A seamless detail tile (512×512) drawn over the colour field in world space with a soft-light/multiply blend at low strength, so it is continuous across cells: fine grain, sand ripples, small pebbles, faint cracks. Two variants blended by the fertility map: dry (sand, cracks) and green (dry grass, darker soil).
3. **Ground decals.** The painted ground sheets in `art/raw/terrain/ground/` (rippled sand, dry grass, flagstones, cart tracks, scrub ground) are in the props' style and currently unused by `map-perf`. Cut their centres out with a wide feathered edge and stamp them as sparse decals, 2–4 tiles across, baked into the cell, placed by the same cluster masks as 1a plus their own noise: darker damp patches, cracked-earth patches, pebble scatters, dry-grass tufts on fertile ground. They make open ground read as land rather than paint, with no sprites at runtime.
4. **Soft terrain edges.** Forest and mountain ground gets a feathered darker underlay that follows the smooth field, so forests sit on shaded soil and mountains on rock ground instead of on sand.
5. **Far zoom (decision).** The same bake would remove the checkerboard at far zoom too, but `art-direction-v2.md` keeps the far-zoom look open (inked strategic layer vs painted everywhere). Only in scope if the user chooses "painted everywhere".

Source of the grain texture (decision): procedural (code noise, free), cut from the existing painted sheets (free, style match, needs seam blending), or a newly generated seamless painted texture (ask before spending).

Tests: the colour field and decal placement are pure (seeded, deterministic, in range, off roads/water). Bake time per cell is logged in dev builds only and must stay around 4 ms on the phone (two cells bake per frame); otherwise bake one cell per frame.

Checks: screenshots at close, mid and far zoom in `en` and `ar`, same seed and spots as 1a.

Then 1b (landmarks: oases, dunes, fields) goes on top of this ground.
