> **Superseded (3 Nov 2026)** by docs/design/design-system.md (daylight camp and bronze). Kept for history.

# Art direction v2 (draft for agreement)

Status: brainstorm notes, not yet agreed. Nothing here changes `docs/GDD.md` §7 until we confirm. Written 21 Oct 2026.

## Why

The buildings, bronze UI and icons are good. The problems are around them:

- The cold dark-green background (`#3d4a3a` on the base, `#26332a` on the world map) clashes with the Algerian palette (sand, terracotta, whitewash, olive, rock brown).
- The base is a small island (about 45% of the screen height) in an empty field.
- The world map ends in a flat void with a hard diagonal edge.
- The world ground is many small diamond tiles with visible repetition and brightness patchwork. Some terrain reads as the wrong country: bright terraces look like Vietnam or Bali, snowy dark rock looks like the Alps.
- The HUD is plain dark pills; the bronze look exists only in the small resource icons.

## Principles

1. **The grid stays in the logic, not in the picture.** Coordinates, march distance, tap targets and server rules are unchanged. Only the ground art stops being visible diamonds.
2. **The map shows liberation.** Colonial-held land looks cold, drained, paper-and-ink with barbed-wire and watchtower marks. Liberated land gets colour and signs of life (olive groves, villages, lit windows, paths). Progress is visible without opening a menu.
3. **Quiet ground, loud objects.** Mostly calm, low-contrast ground; bases, NPCs and resource sites are big, readable sprites with nameplates (name, level, alliance tag). Empty space is fine.
4. **A calm HUD.** One bottom bar of 4 to 5 actions, resources on top, everything else only when something needs attention (one dot, not ten floating icons).
5. **Arabic first.** Design RTL first and mirror to English. Keep the `en` and `ar` screenshot rule.
6. **Cheap Android.** Seamless ground plus a few large props, not about 900 tile sprites.

## Proposals

### Quick win (not first: the foundation came first, see "Foundation status")
- Replace the green background with a warm dark earth or rock tone.
- Give both scenes real edges: cliff or rock vignette on the base, fog or cliffs on the world map.
- Restyle HUD and buttons with the existing dark metal and bronze UI kit (`art/raw/ui`, plus the UI kit sheet in the Flow export).
- Show map coordinates `X:Y` in a small bar and add a return-to-base button.

### Base screen
- One painted camp scene (hidden mountain camp: terraced walls, paths, cliffs, olive trees) with fixed empty plots; buildings stay separate sprites so levels and upgrades work as now.
- Regenerate the camp painting without baked-in buildings. Small people stay faceless (GDD §7).
- Optional later: the camp grows visually with popular support; day to dusk to night lighting.

### World map
- Seamless low-contrast ground plus sparse, large props (lake, dune ridges, rock outcrops, cedar and olive clusters) from the existing cut-out sets (trees, rocks, scrub, peaks).
- Drop the saturated terraces from Algeria; keep them for Vietnam.
- Fix tile-to-tile brightness; use soft large patches, not per-tile variants.
- Region borders as a thin coloured line on the ground; alliance territory as one soft shared edge.
- Bigger NPC and camp sprites with nameplates; add a target search panel (type, level slider, Search, camera jumps to nearest).
- Open decision: strategic zoom in the hand-inked map style (see below).

### Stylized strategic layer (open)
- Paper texture plus ink stamps (mountains, trees, rocks, villages) placed in code; watercolour washes driven by game state (orange for liberated, green for forest).
- Built from parts, not one painted image, so the world can scroll and regions can change.
- Rule if we adopt it: strategic zoom and menus use the ink-map style; base and close-up use the painted style. Test that the switch feels intentional.

### Other
- Linocut look for story chapters, title and loading screens (not for gameplay).

## Asset review of the Flow export (55 images)

| Group | Verdict |
| --- | --- |
| Buildings (about 25 images; tower, HQ with flag, barracks, hero hall are best) | Keep. Consistent angle, light and palette. |
| UI kit, resource and troop icons, map markers, portrait frames | Keep. Matches GDD §7 and is under-used in the HUD today. |
| Cut-out props: trees (olive, cedar), rocks, scrub, peaks, crates, loaded mule | Keep. Right kind of asset for ground plus props. |
| Ground tile sheets (all small-diamond variants) | Replace with a seamless ground. Smooth orange sand sheets (22 to 25 in the export) are the colour reference. |
| Dark snowy rock tiles, green forest floor, terraces | Wrong for Algeria; drop or keep for Vietnam. |
| Red-brick farmhouse on cream (stray) | Delete. |
| Second camp painting (isometric, buildings baked in) | Reference only; regenerate with empty plots. |

Do not generate more tile sheets, and do not change the building art.

## Decisions needed

- [x] **World map style:** decided 23 Oct: painted everywhere; the same baked ground at every zoom (map ground step 1c, `docs/map-ground-plan.md`). No inked strategic layer.
- [x] **Ground:** decided 22 Oct: soft blended ground plus sparse props, as built in `5c4c465`. One large painted map is out: it cannot scroll or show region changes. Checked in Arabic at phone size: the close zoom reads well. Known gap: zoomed out, the flat renderer shows a checkered grid with hard-edged terrain patches and no region borders, so far zoom is the weak spot; the inked-layer decision below is what fixes it.
- [ ] **Base:** the painted camp scene with empty plots?
- [x] **Order of work:** decided 21 Oct: no quick win first; build the foundation first (below), then the visual changes.
- [ ] If the inked layer is adopted, update GDD §7 (it currently approves only the painted style).

## Not decided / risks

- Mixing two art styles needs one clear rule per screen.
- New art is needed for the camp scene and the map parts; check Flow's commercial-use terms first (see `docs/art.md`, licensing TODO).
- Nothing here has been tried on a real phone.

## Foundation status (branch `art-foundation`)

Built first so later art changes are small and safe. Done:

- [x] One theme module (`src/theme/theme.ts`) read by both CSS and Phaser.
- [x] Art pack (`src/art/pack.ts`): art looked up by mechanical id, with a test that every id has art.
- [x] World scene split into ground, object and march layers; the ground picks a flat or painted renderer by zoom.
- [x] Region geometry in `packages/rules` (`regions.ts`): a pure seeded partition of the map, borders and adjacency. Liberation state is deliberately not built yet (server-owned gameplay).
- [x] Dev-only style gallery (`/gallery.html`) with a seam check per terrain.
- [x] Renderer fallback: Canvas on GPUs where Phaser's WebGL draws sprite transparency as black (`src/render-mode.ts`).
- [x] The Playwright e2e suite was removed (21 Oct); UI is checked by eye in the dev server.

Next: decide the strategic (far-zoom) look, then draw region borders and liberation washes on it.
