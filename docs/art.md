# Art: assets, processing, licensing

Style and rules: GDD §7. Generated painted-isometric art, Algerian palette, no baked-in text, no readable faces.

## Where things live

| Path | What |
| --- | --- |
| `art/raw/*.jpg`, `art/raw/sheets/` | Generator output as received (single buildings on a plain background, and the contact sheets). Never edited. |
| `art/raw/{buildings,map,ui,units}/*.png` | Cut-out masters (transparent background, full resolution, ~1 MB each). Not shipped. |
| `apps/client/public/art/<group>/<name>.webp` | Phone-sized files the game loads. Generated, committed. |
| `apps/client/src/art/manifest.json` | Generated: size and ground anchors of each sprite. |
| `apps/client/src/art/art.ts` | `artUrl`, `textureKey`, `diamondSpec`, `iconSpec`. |
| `scripts/process-art.mjs` | The processing step. |

## Assets and where they are used

- **buildings/** `hq farm armory treasury barracks`: the five buildings in the rules (`BUILDING_IDS`), drawn by `BaseScene` on one shared plot diamond. `ground_tile` is the base's ground slab. `academy hero_hall infirmary liaison_office storehouse watchtower` are processed but unused until the rules have those buildings. `storehouse_alt` is a spare.
- **map/** `terrain_{plain,terraces,forest,mountain}` are the world tiles (`hills` uses `terraces`). `terrain_river` and `terrain_village` are unused. `outpost_watch` / `outpost_barracks` / `outpost_fort` and `marker_convoy` are the NPC kinds (patrol, outpost, fortified line, convoy). `marker_march` / `marker_return` are marching columns, `marker_battle` flashes at the target on arrival, `marker_rally` is an alliance HQ. Player camps on the map are the `hq` building sprite, scaled.
- **ui/** `resource_{food,materiel,funds,support}` are the HUD, cost and report icons (`ui/icons.ts`). `hud_top_bar` and `hero_frame_*` are processed but unused: the bar has a baked-in avatar circle and four "+" slots that do nothing yet, and it assumes four resources in one row while the HUD is a 2×2 grid; there is no hero screen yet.
- **units/** `troop_{infantry,scouts,heavy,porters}` appear in the training panel and the march dialog.

The world scene's textures load when the map is first opened, not at start-up.

## Add or swap a sprite

1. Put the cut-out PNG (transparent, tightly cropped) in `art/raw/<group>/<name>.png` and the unprocessed original in `art/raw/`.
2. Add a width override in `scripts/process-art.mjs` if the group default is wrong (buildings 512 px, map 288, ui and units 128).
3. `pnpm art:process`, then commit the WebP files and `manifest.json`.
4. To use it: a building is `buildings/<id>.png` for a `BuildingId`; terrain, NPC and marker art are mapped in the tables at the top of `world-scene.ts`; icons are in `ui/icons.ts`.

Placement is measured, not hand-tuned: buildings and terrain are anchored by the centre of their diamond (the left and right corners in the lower part of the alpha mask) and scaled so that diamond is the plot's width. A new sprite must therefore stand on the same kind of plot diamond and be cut out tightly.

## Processing step

`scripts/process-art.mjs` (uses `sharp`, a dev dependency) resizes each master with Lanczos, zeroes the colour of fully transparent pixels (the generator's grey would otherwise bleed into edges), writes lossy WebP (q80, alpha q90) and the manifest. Sizes are chosen for a 2.6× phone: a plot is about 350 device px wide on screen, a terrain tile about 175.

## Licensing TODO (before release)

- Check the generator's (Google Flow / Nano Banana) terms for commercial use of outputs, and whether they require attribution.
- Check Google Play's policy on AI-generated content and its disclosure form.
- Keep the prompts and the style reference used for each batch alongside the raw files.

## GDD §6 review: heroes

The hero frames (common, rare, legendary) each hold a faceless, hooded figure in a dark panel. Before they ship, the silhouette must be reviewed against §6: heroes are "inspired by" real people, never a likeness, and no atrocity imagery. Until then they are not in the build.

## Known rough edges

Seen in the en and ar screenshots (nothing here has been tried on a real phone yet, including pan smoothness at zoom 0.3 with about 900 tile sprites):

- Plain terrain repeats as a busy pattern (half the tiles are mirrored), and the soil edges of tiles show as zigzag seams between terrain types. Below zoom 0.3 the map falls back to flat colours.
- The base fills only about 45% of the screen height; the level badges sit on the front corners of the plots and can crowd a neighbour's roof; the upgrade bar is small and sits on the walls.
- NPC level numbers are small on the tile art.
- Only 5 of the 11 buildings exist in the rules; the others are unused until they do.
- The sprites are not power-of-two sized, so Phaser (which only mipmaps power-of-two textures) draws them with plain linear filtering; heavy minification can shimmer.
