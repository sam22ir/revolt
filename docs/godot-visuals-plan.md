# Godot visuals plan (draft for agreement)

Written 25 Oct 2026, branch `godot-client`, after marches chunk M5. Migration slices 5 to 7 (Google link, Android export, removing Phaser) are on hold; this comes first.

The art direction (`docs/art-direction-v2.md`) stays: Algerian palette, quiet ground, loud objects, calm HUD, Arabic first. What changes is the execution of the **ground** and the **HUD**. The base (buildings and slab) is fine and stays.

## Where we are

Looked at 375×812 against the mock server:

- **HUD:** plain text chips with cap bars, a plain builders line, language buttons on the HUD, a flat text nav. The generated UI kit PNGs (`art/raw/ui`: bronze frames, nav medallions, top bar) were used in the Phaser restyle, but they are not liked, so **they are not ported**.
- **Ground:** beige with heavy dark-brown blotches and orange patches, so it looks muddy and dirty rather than sunlit. The props (trees, rocks, scrub) vary a lot in scale and darkness. Region seams are dark grey lines. Hiding the wash and detail layers (`?hide=wash,detail`) barely changed it, so the blotches seem to come from the painted decals themselves (to confirm with `?hide=decals`).
- **Map objects:** flat coloured diamonds with a number badge. The biggest gap.

## Suggested direction

### HUD: drawn in code, not painted frames

- Godot `StyleBoxFlat` panels: warm dark earth (around `#2a211a`, 85–90% opaque), rounded corners (10–12 px), one thin brass hairline border (around `#b08d57`), a soft shadow. No nine-slice textures.
- Why: sharp at every phone density, no art to generate or license, mirrors cleanly in Arabic, and a palette change touches one Theme file.
- Accents from the palette: terracotta (`#b5532f`) for the primary action and alerts, olive (`#6b7a3a`) for "ready" and "done", sand (`#e8d5b0`) for text.
- Top bar: four compact resource cells (icon, amount in bold, `+rate/h` small). The cap shows only as a colour change near full, not as a bar.
- Bottom nav: four simple flat icons with labels and an active highlight.
- Icons: a single set of simple flat icons (resources, nav, troops), drawn once as SVG so they stay sharp. Keep the painted resource icons only if they read well at 20 px.
- One `Theme` resource for all panels and sheets, so the reports, alliance, heroes and training screens change with it.

### Ground: lighter, calmer, fewer things

- Base colour: a light warm sand with two or three large soft tints only (pale ochre steppe, dusty olive near water and wadis). No small dark patches.
- Decals: remove or lighten the dark ones (their alpha or kinds), keep only light texture (pebbles, faint cracks, dry grass). This breaks the "decals are fixture-exact" rule from slice 1b on purpose: that rule was about matching Phaser, and Phaser is no longer the target.
- Props: fewer, larger, one scale family, in clusters (olive groves, rock outcrops); lighter outlines so they sit on the ground instead of punching holes in it.
- Roads and wadis: keep, slightly lighter and thinner.
- Region borders: a thin light dashed line (sand-white, low alpha), not dark grey.
- Edge of the map: fade into the background colour, not a hard dark edge.
- Try it cheaply first: most of this is colour and alpha constants, so do it as tuning in Godot, compared with screenshots, before making any new art.

## Chunks

Each chunk ends with en and ar screenshots in the built-in browser at phone size (map screenshots whenever the map can change), GUT tests for any pure logic, and a commit.

1. **V1. Look test (no merge):** two or three ground variants and one HUD mock built as tunable constants, with screenshots side by side for you to pick. Nothing else is built until you choose.
2. **V2. Theme, HUD and navigation:** the chosen HUD as a Godot `Theme`; the resource bar on Base and Map only; the context strip; the bottom bar with the Base/Map button; Reports, Alliance and Settings as full pages with back; the Settings page with account and language; the icons.
3. **V3. Ground restyle:** the chosen ground (colours, decals, props, borders, edge).
4. **V4. Map objects:** sprites for camps, NPC kinds (`camp`, `outpost_*`, `marker_convoy`, copied from `apps/client/public/art/map/`), HQs and march markers; nameplates in the new HUD style; a selection ring. Batched, nameplates only above a zoom level, draw calls checked with `?debug=fps`.
5. **V5. Sheets and panels:** check every sheet in en and ar with the new theme, add troop and hero-rarity art.

## Seen in the Phaser build, not built in Godot (feature work, separate)

Minimap and target search. (The Account screen is now in scope as the Settings page, and return-to-base is part of the map chrome above.)

## Deferred

- Painted base camp with empty plots (undecided, needs new art).
- Liberation washes (need server-owned state).
- Any new generated art until the licensing TODO in `docs/art.md` is closed.

## Navigation and screens (decided 25 Oct)

- **Base/Map is one button**, highlighted, large and round, **in the bottom corner at the end edge** (bottom right in English, bottom left in Arabic), as in the reference (a war-MMO screenshot the user shared, 25 Oct: "My base" round button in the bottom-right corner). It shows where you will go (map icon on the base, base icon on the map). The other buttons sit in a row beside it.
- **Reports, Alliance and Settings are buttons that open full pages.** Each page has a title bar and a back button at the start edge (mirrors in Arabic); the Android back button closes it.
- **Settings page** holds the account (guest id, Google link later in slice 5) and the settings, **including the language**. The language buttons leave the HUD.
- **The resource bar shows only where it makes sense:** Base and Map. Not on Reports, Alliance or Settings.

Suggested on top (not decided):

- Bottom row from the start edge: Heroes · Alliance · Reports, then the **Base/Map corner button**. Settings opens from the player chip (top start), as the reference does with its avatar, so the row stays short.
- From the reference, take: round icon buttons with a label under each; the avatar with name and power in the top-start corner; the resource bar along the top; nameplates on the map with alliance tag and level.
- From the reference, leave out: the column of event and offer icons down the side, the chat strip across the bottom, the many floating numbers on the map. That is the clutter "a calm HUD" (art direction principle 4) avoids; at most one slot for events later.
- Where you spend, show only what is relevant: a building, training or recruit sheet shows its own cost against what you have, so a page without the bar never hides what you need.
- Context strip under the resource bar: builders on the base, marches in flight on the map.
- Map-only chrome: coordinates pill and return-to-base button (search later).
- Attention as one dot, not counts: Reports (unread), Alliance (help asked, rally open).
- Player chip at the top start of the base (name, level), tapping it opens Settings at the account section.
- Settings sections: account, language, sound and music (when there is audio), notifications (later), help and about (version, terms, privacy).
- One short transition (about 150 ms fade or slide) for pages; respect the phone's safe areas (notch, gesture bar).

## Decisions needed

- [x] Start with the look test (V1) before building: yes (25 Oct).
- [x] Language switcher: in the Settings page (25 Oct).
- [x] HUD drawn in code (flat panels, brass hairline) instead of painted frames: the mockup shown on 26 Oct (base, map, settings, Arabic base) was approved as is. Its values are the starting point for the look test: panel `rgba(38,29,22,0.9)`, brass border `#b08d57`, radius 10 px, text `#e8d5b0`, secondary text `#bfa77c`, terracotta `#b5532f` with a `#e2c07a` ring for the Base/Map switch (66 px), round buttons 44 px with labels, alert dot `#d9462b`, "full" in gold `#f0c060`, olive `#6b7a3a` for on and ready, map ground `#dcc69c` with soft ochre and olive patches and a dashed light region border.
- [x] Resource icons: simple flat icons, as in the mockup (26 Oct). One flat set for resources, nav and troops, drawn as SVG.
- [x] Ground: lighter and calmer, allowed to depart from the Phaser ground (26 Oct).
- [x] Settings opens from the player chip (26 Oct).
- [x] Base/Map switch: a round button in a bottom corner (25 Oct, from the reference).

The look test (V1) includes the bottom bar, the resource bar, and one page (Settings) so the navigation is judged together with the style.

## Risks

- Phone fill rate on the map (noted in slice 1b).
- The built-in browser pane runs Godot at about 1 fps: good for look and language, not for performance.
