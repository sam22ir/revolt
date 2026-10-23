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
- **map/** The world ground and props are no longer single tiles: see "World terrain" below. `outpost_watch` / `outpost_barracks` / `outpost_fort` and `marker_convoy` are the NPC kinds (patrol, outpost, fortified line, convoy). `marker_march` / `marker_return` are marching columns, `marker_battle` flashes at the target on arrival, `marker_rally` is an alliance HQ. Player camps on the map are `map/camp` (a hidden camp on the outpost slab, Flow batch of 23 Oct; prompts in `art/raw/prompts/`).
- **ui/** `resource_{food,materiel,funds,support}` are the HUD, cost and report icons (`ui/icons.ts`). `frame_*` and `button_round*` are the painted UI kit frames, drawn by CSS border-image and backgrounds through `ui/frame-art.ts`; `nav_*` are the bottom-nav medallions. `hud_top_bar` and `hero_frame_*` are processed but unused: the bar has a baked-in avatar circle and four "+" slots that do nothing yet; there is no hero screen yet.
- **units/** `troop_{infantry,scouts,heavy,porters}` appear in the training panel and the march dialog.

The world scene's textures load when the map is first opened, not at start-up.

## World terrain

The world map's ground is flat painted diamonds (4 terrains, 18 to 20 variants each) with separate cut-out props (trees, rocks, peaks, scrub, terraces). Sheets are in `art/raw/terrain/{ground,props}/` (generated with the brief in `docs/terrain-art-brief.md`; sheets not used are in `art/raw/terrain/unused/`). `pnpm art:terrain` (`scripts/process-terrain.mjs`) cuts them into one WebP atlas per terrain and per prop kind in `apps/client/public/art/terrain/` plus `src/art/terrain-manifest.json`.

- **Ground:** each tile is cropped to its top surface, masked to the exact diamond with a feathered edge, and drawn 25% wider than the tile, so neighbours overlap and blend with no seams, across terrain borders too. A hash of the tile coordinates picks the variant and mirroring, so the map never changes between visits. Under every tile there is a flat colour (also the whole look below zoom 0.3).
- **Props:** chosen per tile by `scene/terrain-props.ts` (pure, tested). Forests get denser and mountains taller toward the middle of a region and thinner at its edge (the share of the eight neighbours with the same terrain), and props overhang neighbouring tiles, so each region reads as one forest or one ridge. Props show from zoom 0.4, never on a tile that has a camp, NPC or alliance HQ.
- **Hills** has 18 ground variants and **mountain** 18 (the sheets with paths and walls crossing the tile were dropped because they break at tile edges); the other terrains keep 20.

## Add or swap a sprite

1. Put the cut-out PNG (transparent, tightly cropped) in `art/raw/<group>/<name>.png` and the unprocessed original in `art/raw/`.
2. Add a width override in `scripts/process-art.mjs` if the group default is wrong (buildings 512 px, map 288, ui and units 128).
3. `pnpm art:process`, then commit the WebP files and `manifest.json`.
4. To use it: a building is `buildings/<id>.png` for a `BuildingId`; terrain, NPC and marker art are mapped in the tables at the top of `world-scene.ts`; icons are in `ui/icons.ts`.

Placement is measured, not hand-tuned: buildings and terrain are anchored by the centre of their diamond (the left and right corners in the lower part of the alpha mask) and scaled so that diamond is the plot's width. A new sprite must therefore stand on the same kind of plot diamond and be cut out tightly.

## Processing step

`scripts/process-art.mjs` (uses `sharp`, a dev dependency) resizes each master with Lanczos, zeroes the colour of fully transparent pixels (the generator's grey would otherwise bleed into edges), writes lossy WebP (q80, alpha q90) and the manifest. Sizes are chosen for a 2.6× phone: a plot is about 350 device px wide on screen, a terrain tile about 175.

## Style gallery (dev only)

A single page that shows the whole look in one place: palette, UI kit sprites, terrain art and the seam check. Open it with:

1. `pnpm --filter @revolt/client dev`
2. go to `/gallery.html` (add `?lang=ar` for right-to-left, or use the buttons on the page)

Sections:

- **Header:** language and direction toggle (sets `lang` and `dir`, writes `?lang=`), and a background toggle (dark, `theme.ground.base`, `theme.ground.world`) to judge sprites on each. Nothing is saved.
- **Palette:** every token in `src/theme/theme.ts`, with its hex value. Terrain pairs are light and dark.
- **Art pack:** every entry of `artPack`, grouped by field, with its id and sprite key.
- **All sprites:** every key in `src/art/manifest.json` by folder, with pixel size. A red "unused" badge marks sprites no pack entry names, so leftover art is easy to spot.
- **Terrain:** every frame of each ground atlas and prop atlas, with the flat light and dark swatches. Prop anchors are marked with a red dot.
- **Seam check:** a 6×6 isometric patch per terrain on the game's tile grid, with the same frame choices and overlap as the world map, fixed so it does not change on reload.

The gallery is dev-only. `gallery.html` is not a build input, so `pnpm --filter @revolt/client build` does not ship it. Its data helpers are tested in `apps/client/test/gallery.test.ts`.

## Licensing TODO (before release)

- Check the generator's (Google Flow / Nano Banana) terms for commercial use of outputs, and whether they require attribution.
- Check Google Play's policy on AI-generated content and its disclosure form.
- Keep the prompts and the style reference used for each batch alongside the raw files.

## GDD §6 review: heroes

The hero frames (common, rare, legendary) each hold a faceless, hooded figure in a dark panel. Before they ship, the silhouette must be reviewed against §6: heroes are "inspired by" real people, never a likeness, and no atrocity imagery. Until then they are not in the build.

## Known rough edges

Seen in the en and ar screenshots (nothing here has been tried on a real phone yet, including pan smoothness at zoom 0.3 with about 900 tile sprites):

- Ground tiles still differ in brightness from tile to tile, which reads as a faint patchwork on plain terrain; below zoom 0.3 the map falls back to flat colours.
- The base fills only about 45% of the screen height; the level badges sit on the front corners of the plots and can crowd a neighbour's roof; the upgrade bar is small and sits on the walls.
- NPC level numbers are small on the tile art.
- Only 5 of the 11 buildings exist in the rules; the others are unused until they do.
- The sprites are not power-of-two sized, so Phaser (which only mipmaps power-of-two textures) draws them with plain linear filtering; heavy minification can shimmer.

## Renderer fallback (old Intel GPUs)

On an Intel HD Graphics 3000 (Sandy Bridge, Mesa) Phaser's WebGL renderer drew the transparent pixels of every sprite as opaque black (black boxes around buildings, black gaps between ground tiles). The textures decode correctly, the blend state is right and a plain WebGL draw with the same settings is fine; Phaser's Canvas renderer draws the scene correctly, and no Phaser option (premultiplied alpha, `maxTextures`, antialiasing) changed it. `src/render-mode.ts` therefore picks the Canvas renderer on GPUs matching that family, and `?renderer=canvas|webgl|auto` overrides the choice for testing.

Known limits of Canvas mode: `setTint` is ignored, so other players' camps on the map lose their cool tone; it is slower with many sprites. Phones have not been checked, and the cause on the old GPU is not understood.
